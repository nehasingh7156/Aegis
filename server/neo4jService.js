require("dotenv").config();
const neo4j = require("neo4j-driver");

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME,
    process.env.NEO4J_PASSWORD
  )
);

function mapSchemaQuery(query) {
  if (typeof query !== "string") return query;
  let mappedQuery = query;
  mappedQuery = mappedQuery.replace(/\bAdmission\b/g, "HospitalAdmission");
  mappedQuery = mappedQuery.replace(/\bWaterReport\b/g, "WaterQualityReport");
  mappedQuery = mappedQuery.replace(/\bPrediction\b/g, "OutbreakPrediction");
  return mappedQuery;
}

// Wrap session creator centrally for backward compatibility
const originalSession = driver.session.bind(driver);
driver.session = function(options) {
  const session = originalSession(options);
  const originalRun = session.run.bind(session);
  session.run = function(query, params) {
    return originalRun(mapSchemaQuery(query), params);
  };
  return session;
};


// Run a session query helper
async function runQuery(query, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(mapSchemaQuery(query), params);
    return result.records;
  } catch (err) {
    console.error("Neo4j Query Error:", err);
    throw err;
  } finally {
    await session.close();
  }
}

// Recursively convert Neo4j BigInts and Integers to Javascript Numbers
function convertNeo4jTypes(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (neo4j.isInt(obj)) {
    return obj.toNumber();
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertNeo4jTypes);
  }
  
  if (typeof obj === 'object') {
    if ('low' in obj && 'high' in obj && typeof obj.low === 'number' && typeof obj.high === 'number') {
      return neo4j.int(obj).toNumber();
    }
    const res = {};
    for (const key of Object.keys(obj)) {
      res[key] = convertNeo4jTypes(obj[key]);
    }
    return res;
  }
  
  return obj;
}

// Initialize Constraints and Indexes
async function initConstraints() {
  const session = driver.session();
  try {
    console.log("Setting up Neo4j constraints and indexes...");
    await session.run("CREATE CONSTRAINT FOR (d:District) REQUIRE d.key IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (s:State) REQUIRE s.name IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (dis:Disease) REQUIRE dis.name IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (h:Hospital) REQUIRE h.hospital_id IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (w:WaterSource) REQUIRE w.key IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (cal:CalendarDate) REQUIRE cal.date IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (wp:WeatherPattern) REQUIRE wp.key IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (r:WaterQualityReport) REQUIRE r.id IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (p:OutbreakPrediction) REQUIRE p.id IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (al:Alert) REQUIRE al.id IS UNIQUE").catch(() => {});
    await session.run("CREATE CONSTRAINT FOR (a:HospitalAdmission) REQUIRE a.id IS UNIQUE").catch(() => {});
    
    await session.run("CREATE INDEX FOR (d:District) ON (d.name)").catch(() => {});
    await session.run("CREATE INDEX FOR (d:District) ON (d.state)").catch(() => {});
    await session.run("CREATE INDEX FOR (s:State) ON (s.name)").catch(() => {});
    await session.run("CREATE INDEX FOR (a:HospitalAdmission) ON (a.date_reported)").catch(() => {});
    await session.run("CREATE INDEX FOR (a:HospitalAdmission) ON (a.disease)").catch(() => {});
    await session.run("CREATE INDEX FOR (a:HospitalAdmission) ON (a.district)").catch(() => {});
    await session.run("CREATE INDEX FOR (r:WaterQualityReport) ON (r.date_sampled)").catch(() => {});
    await session.run("CREATE INDEX FOR (r:WaterQualityReport) ON (r.district)").catch(() => {});
    await session.run("CREATE INDEX FOR (p:OutbreakPrediction) ON (p.prediction_date)").catch(() => {});
    await session.run("CREATE INDEX FOR (p:OutbreakPrediction) ON (p.district)").catch(() => {});
    await session.run("CREATE INDEX FOR (p:OutbreakPrediction) ON (p.disease)").catch(() => {});
    await session.run("CREATE INDEX FOR (p:OutbreakPrediction) ON (p.risk_level)").catch(() => {});
    await session.run("CREATE INDEX FOR (al:Alert) ON (al.created_date)").catch(() => {});
    await session.run("CREATE INDEX FOR (al:Alert) ON (al.district)").catch(() => {});
    await session.run("CREATE INDEX FOR (al:Alert) ON (al.disease)").catch(() => {});
    await session.run("CREATE INDEX FOR (wp:WeatherPattern) ON (wp.date)").catch(() => {});
    await session.run("CREATE INDEX FOR (wp:WeatherPattern) ON (wp.key)").catch(() => {});
    await session.run("CREATE INDEX FOR (l:ValidationLog) ON (l.timestamp)").catch(() => {});
    console.log("Neo4j database indexes configured.");
  } catch (err) {
    console.warn("Neo4j constraints initialization warning:", err.message);
  } finally {
    await session.close();
  }
}

// HELPERS TO GET KEYS
const getDistrictKey = (name, state) => `${state.toLowerCase().trim()}_${name.toLowerCase().trim()}`;
const getHospitalKey = (name, district, state) => `${state.toLowerCase().trim()}_${district.toLowerCase().trim()}_${name.toLowerCase().trim()}`;
const getWaterSourceKey = (name, district, state) => `${state.toLowerCase().trim()}_${district.toLowerCase().trim()}_${name.toLowerCase().trim()}`;

// DISTRICT SEEDING / SYNCHRONIZATION
async function saveDistrict(dist) {
  const districtKey = getDistrictKey(dist.name, dist.state);
  const query = `
    MERGE (s:State {name: $state})
    MERGE (d:District {key: $districtKey})
    MERGE (s)-[:CONTAINS]->(d)
    SET d.name = $name,
        d.state = $state,
        d.district_name = $district_name,
        d.state_name = $state_name,
        d.latitude = toFloat($latitude),
        d.longitude = toFloat($longitude),
        d.population = toInteger($population),
        d.population_density = toInteger($population_density),
        d.area_sqkm = toFloat($area_sqkm),
        d.district_vulnerability_score = toFloat($district_vulnerability_score)
    RETURN d
  `;
  const params = {
    districtKey,
    name: dist.name,
    state: dist.state,
    district_name: dist.district_name || dist.name,
    state_name: dist.state_name || dist.state,
    latitude: dist.latitude,
    longitude: dist.longitude,
    population: dist.population,
    population_density: dist.population_density || 400,
    area_sqkm: dist.area_sqkm || dist.area || 1500, // default if missing
    district_vulnerability_score: dist.district_vulnerability_score || 35.0 // default
  };
  const records = await runQuery(query, params);
  return convertNeo4jTypes(records[0]?.get("d").properties);
}

async function saveDistrictsBatch(batch) {
  const query = `
    UNWIND $batch AS dItem
    MERGE (s:State {name: dItem.state})
    MERGE (d:District {key: dItem.districtKey})
    MERGE (s)-[:CONTAINS]->(d)
    SET d.name = dItem.name,
        d.state = dItem.state,
        d.district_name = dItem.district_name,
        d.state_name = dItem.state_name,
        d.latitude = toFloat(dItem.latitude),
        d.longitude = toFloat(dItem.longitude),
        d.population = toInteger(dItem.population),
        d.population_density = toInteger(dItem.population_density),
        d.area_sqkm = toFloat(dItem.area_sqkm),
        d.district_vulnerability_score = toFloat(dItem.district_vulnerability_score)
  `;
  const formatted = batch.map(d => ({
    districtKey: getDistrictKey(d.name, d.state),
    name: d.name,
    state: d.state,
    district_name: d.district_name || d.name,
    state_name: d.state_name || d.state,
    latitude: d.latitude,
    longitude: d.longitude,
    population: d.population,
    population_density: d.population_density || 400,
    area_sqkm: d.area_sqkm || d.area || 1500,
    district_vulnerability_score: d.district_vulnerability_score || 35.0
  }));
  await runQuery(query, { batch: formatted });
}

// HOSPITAL ADMISSIONS
async function saveAdmission(admission) {
  const districtKey = getDistrictKey(admission.district, admission.state);
  const hospitalKey = getHospitalKey(admission.hospital_name, admission.district, admission.state);
  const id = admission.id || `adm_${deterministicHash(hospitalKey + "_" + admission.disease + "_" + admission.date_reported)}`;
  const hospitalId = admission.hospital_id || `hosp_gen_${deterministicHash(hospitalKey)}`;

  // Calculate population normalized rate
  const population = admission.population || 1000000;
  const casesPer100k = Number(((Number(admission.case_count) / population) * 100000).toFixed(4));

  const query = `
    MERGE (d:District {key: $districtKey})
    ON CREATE SET d.name = $district, d.state = $state, d.latitude = $latitude, d.longitude = $longitude
    ON MATCH SET d.latitude = COALESCE(d.latitude, $latitude), d.longitude = COALESCE(d.longitude, $longitude)

    MERGE (h:Hospital {hospital_id: $hospitalId})
    SET h.name = $hospital_name,
        h.district = $district,
        h.state = $state,
        h.key = $hospitalKey,
        h.latitude = COALESCE(h.latitude, $latitude),
        h.longitude = COALESCE(h.longitude, $longitude),
        h.ownership_type = COALESCE(h.ownership_type, "public"),
        h.bed_capacity = COALESCE(h.bed_capacity, 50)

    MERGE (dis:Disease {name: $disease})
    MERGE (d)-[:HAS_HOSPITAL]->(h)

    MERGE (a:HospitalAdmission {id: $id})
    SET a.hospital_name = $hospital_name,
        a.state = $state,
        a.district = $district,
        a.disease = $disease,
        a.case_count = toInteger($case_count),
        a.cases_per_100k = toFloat($cases_per_100k),
        a.severity = $severity,
        a.date_reported = $date_reported,
        a.latitude = toFloat($latitude),
        a.longitude = toFloat($longitude),
        a.notes = $notes
    
    MERGE (a)-[:REPORTED_BY]->(h)
    MERGE (a)-[:FOR_DISEASE]->(dis)
    MERGE (a)-[:IN_DISTRICT]->(d)
    
    RETURN a
  `;
  
  const params = {
    id,
    districtKey,
    hospitalKey,
    hospitalId,
    hospital_name: admission.hospital_name,
    state: admission.state,
    district: admission.district,
    disease: admission.disease,
    case_count: admission.case_count,
    cases_per_100k: casesPer100k,
    severity: admission.severity || "moderate",
    date_reported: admission.date_reported,
    latitude: admission.latitude ? parseFloat(admission.latitude) : null,
    longitude: admission.longitude ? parseFloat(admission.longitude) : null,
    notes: admission.notes || ""
  };
  
  const records = await runQuery(query, params);
  const props = records[0]?.get("a").properties;
  return convertNeo4jTypes(props);
}

async function saveAdmissionsBatch(batch) {
  const query = `
    UNWIND $batch AS adm
    MERGE (d:District {key: adm.districtKey})
    ON CREATE SET d.name = adm.district, d.state = adm.state, d.latitude = adm.latitude, d.longitude = adm.longitude
    ON MATCH SET d.latitude = COALESCE(d.latitude, adm.latitude), d.longitude = COALESCE(d.longitude, adm.longitude)

    MERGE (h:Hospital {hospital_id: adm.hospitalId})
    SET h.name = adm.hospital_name,
        h.district = adm.district,
        h.state = adm.state,
        h.key = adm.hospitalKey,
        h.latitude = COALESCE(h.latitude, adm.latitude),
        h.longitude = COALESCE(h.longitude, adm.longitude),
        h.ownership_type = COALESCE(h.ownership_type, "public"),
        h.bed_capacity = COALESCE(h.bed_capacity, 50)

    MERGE (dis:Disease {name: adm.disease})
    MERGE (d)-[:HAS_HOSPITAL]->(h)

    MERGE (a:HospitalAdmission {id: adm.id})
    SET a.hospital_name = adm.hospital_name,
        a.state = adm.state,
        a.district = adm.district,
        a.disease = adm.disease,
        a.case_count = toInteger(adm.case_count),
        a.cases_per_100k = toFloat(adm.cases_per_100k),
        a.severity = adm.severity,
        a.date_reported = adm.date_reported,
        a.latitude = toFloat(adm.latitude),
        a.longitude = toFloat(adm.longitude),
        a.notes = adm.notes
    
    MERGE (a)-[:REPORTED_BY]->(h)
    MERGE (a)-[:FOR_DISEASE]->(dis)
    MERGE (a)-[:IN_DISTRICT]->(d)
  `;
  const formattedBatch = batch.map(adm => {
    const hospitalKey = getHospitalKey(adm.hospital_name, adm.district, adm.state);
    const population = adm.population || 1000000;
    const casesPer100k = Number(((Number(adm.case_count) / population) * 100000).toFixed(4));
    return {
      id: adm.id || `adm_${deterministicHash(hospitalKey + "_" + adm.disease + "_" + adm.date_reported)}`,
      districtKey: getDistrictKey(adm.district, adm.state),
      hospitalKey,
      hospitalId: adm.hospital_id || `hosp_gen_${deterministicHash(hospitalKey)}`,
      hospital_name: adm.hospital_name,
      state: adm.state,
      district: adm.district,
      disease: adm.disease,
      case_count: Number(adm.case_count),
      cases_per_100k: casesPer100k,
      severity: adm.severity || "moderate",
      date_reported: adm.date_reported,
      latitude: adm.latitude ? parseFloat(adm.latitude) : null,
      longitude: adm.longitude ? parseFloat(adm.longitude) : null,
      notes: adm.notes || ""
    };
  });
  
  await runQuery(query, { batch: formattedBatch });
}

async function getAdmissions(params = {}) {
  const limit = (params.limit !== undefined && params.limit !== null) ? Number(params.limit) : null;
  const offset = (params.offset !== undefined && params.offset !== null) ? Number(params.offset) : null;
  const search = params.search || "";
  const state = params.state || "";
  const disease = params.disease || "";

  let matchClause = "MATCH (a:HospitalAdmission)";
  let whereClauses = [];
  const queryParams = {};

  if (state) {
    whereClauses.push("a.state = $state");
    queryParams.state = state;
  }
  if (disease) {
    whereClauses.push("a.disease = $disease");
    queryParams.disease = disease;
  }
  if (search) {
    whereClauses.push("(toLower(a.hospital_name) CONTAINS toLower($search) OR toLower(a.district) CONTAINS toLower($search) OR toLower(a.state) CONTAINS toLower($search))");
    queryParams.search = search;
  }

  const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
  
  let query = `
    ${matchClause}
    ${whereStr}
    RETURN a ORDER BY a.date_reported DESC, a.id DESC
  `;

  if (offset !== null) {
    query += " SKIP toInteger($offset)";
    queryParams.offset = offset;
  }
  if (limit !== null) {
    query += " LIMIT toInteger($limit)";
    queryParams.limit = limit;
  }

  const records = await runQuery(query, queryParams);
  return convertNeo4jTypes(records.map(r => r.get("a").properties));
}

async function deleteAdmission(id) {
  const query = `
    MATCH (a:HospitalAdmission {id: $id})
    DETACH DELETE a
  `;
  await runQuery(query, { id });
  return { success: true };
}

// HOSPITALS REGISTRY
async function saveHospital(hosp) {
  const districtKey = getDistrictKey(hosp.district, hosp.state);
  const hospitalKey = getHospitalKey(hosp.name, hosp.district, hosp.state);
  const query = `
    MERGE (d:District {key: $districtKey})
    MERGE (h:Hospital {hospital_id: $hospital_id})
    SET h.name = $name,
        h.state = $state,
        h.district = $district,
        h.latitude = toFloat($latitude),
        h.longitude = toFloat($longitude),
        h.ownership_type = $ownership_type,
        h.bed_capacity = toInteger($bed_capacity),
        h.key = $hospitalKey
    MERGE (d)-[:HAS_HOSPITAL]->(h)
    RETURN h
  `;
  const params = {
    districtKey,
    hospitalKey,
    hospital_id: hosp.hospital_id,
    name: hosp.name,
    state: hosp.state,
    district: hosp.district,
    latitude: hosp.latitude,
    longitude: hosp.longitude,
    ownership_type: hosp.ownership_type || "public",
    bed_capacity: hosp.bed_capacity || 50
  };
  const records = await runQuery(query, params);
  return convertNeo4jTypes(records[0]?.get("h").properties);
}

async function saveHospitalsBatch(batch) {
  const query = `
    UNWIND $batch AS hosp
    MERGE (d:District {key: hosp.districtKey})
    MERGE (h:Hospital {hospital_id: hosp.hospital_id})
    SET hosp.name = hosp.name,
        h.name = hosp.name,
        h.state = hosp.state,
        h.district = hosp.district,
        h.latitude = toFloat(hosp.latitude),
        h.longitude = toFloat(hosp.longitude),
        h.ownership_type = hosp.ownership_type,
        h.bed_capacity = toInteger(hosp.bed_capacity),
        h.key = hosp.hospitalKey
    MERGE (d)-[:HAS_HOSPITAL]->(h)
  `;
  const formatted = batch.map(h => ({
    districtKey: getDistrictKey(h.district, h.state),
    hospitalKey: getHospitalKey(h.name, h.district, h.state),
    hospital_id: h.hospital_id,
    name: h.name,
    state: h.state,
    district: h.district,
    latitude: h.latitude,
    longitude: h.longitude,
    ownership_type: h.ownership_type || "public",
    bed_capacity: h.bed_capacity || 50
  }));
  await runQuery(query, { batch: formatted });
}

// WATER QUALITY REPORTS
async function saveWaterQualityReport(report) {
  const districtKey = getDistrictKey(report.district, report.state);
  const waterSourceKey = getWaterSourceKey(report.station_name, report.district, report.state);
  const id = report.id || `wqr_${deterministicHash(waterSourceKey + "_" + report.date_sampled)}`;
  
  const query = `
    MERGE (d:District {key: $districtKey})
    ON CREATE SET d.name = $district, d.state = $state, d.latitude = $latitude, d.longitude = $longitude
    ON MATCH SET d.latitude = COALESCE(d.latitude, $latitude), d.longitude = COALESCE(d.longitude, $longitude)

    MERGE (ws:WaterSource {key: $waterSourceKey})
    SET ws.name = $station_name, 
        ws.latitude = COALESCE(ws.latitude, $latitude), 
        ws.longitude = COALESCE(ws.longitude, $longitude)

    MERGE (d)-[:HAS_WATER_STATION]->(ws)

    MERGE (r:WaterQualityReport {id: $id})
    SET r.station_name = $station_name,
        r.state = $state,
        r.district = $district,
        r.ph_level = toFloat($ph_level),
        r.turbidity = toFloat($turbidity),
        r.turbidity_ntu = toFloat($turbidity), // legacy field mapping
        r.dissolved_oxygen = toFloat($dissolved_oxygen),
        r.bod = toFloat($bod),
        r.cod = toFloat($cod),
        r.coliform_count = toInteger($coliform_count),
        r.e_coli_count = toInteger($e_coli_count),
        r.contamination_index = toInteger($contamination_index),
        r.date_sampled = $date_sampled,
        r.latitude = toFloat($latitude),
        r.longitude = toFloat($longitude),
        r.status = $status,
        r.source = $source,
        r.confidence_score = toInteger($confidence_score),
        r.freshness_hours = toInteger($freshness_hours),
        r.timestamp = $timestamp

    MERGE (r)-[:MEASURED_AT]->(ws)
    MERGE (r)-[:IN_DISTRICT]->(d)

    RETURN r
  `;
  
  const params = {
    id,
    districtKey,
    waterSourceKey,
    station_name: report.station_name,
    state: report.state,
    district: report.district,
    ph_level: report.ph_level,
    turbidity: report.turbidity || report.turbidity_ntu || 0.0,
    dissolved_oxygen: report.dissolved_oxygen !== undefined ? report.dissolved_oxygen : 7.0,
    bod: report.bod !== undefined ? report.bod : 1.5,
    cod: report.cod !== undefined ? report.cod : 5.0,
    coliform_count: report.coliform_count || 0,
    e_coli_count: report.e_coli_count || 0,
    contamination_index: report.contamination_index || 0,
    date_sampled: report.date_sampled,
    latitude: report.latitude ? parseFloat(report.latitude) : null,
    longitude: report.longitude ? parseFloat(report.longitude) : null,
    status: report.status || "safe",
    source: report.source || "CPCB",
    confidence_score: report.confidence_score || 90,
    freshness_hours: report.freshness_hours || 24,
    timestamp: report.timestamp || new Date().toISOString()
  };
  
  const records = await runQuery(query, params);
  const props = records[0]?.get("r").properties;
  return convertNeo4jTypes(props);
}

async function saveWaterQualityReportsBatch(batch) {
  const query = `
    UNWIND $batch AS rpt
    MERGE (d:District {key: rpt.districtKey})
    ON CREATE SET d.name = rpt.district, d.state = rpt.state, d.latitude = rpt.latitude, d.longitude = rpt.longitude
    ON MATCH SET d.latitude = COALESCE(d.latitude, rpt.latitude), d.longitude = COALESCE(d.longitude, rpt.longitude)

    MERGE (ws:WaterSource {key: rpt.waterSourceKey})
    SET ws.name = rpt.station_name, 
        ws.latitude = COALESCE(ws.latitude, rpt.latitude), 
        ws.longitude = COALESCE(ws.longitude, rpt.longitude)

    MERGE (d)-[:HAS_WATER_STATION]->(ws)

    MERGE (r:WaterQualityReport {id: rpt.id})
    SET r.station_name = rpt.station_name,
        r.state = rpt.state,
        r.district = rpt.district,
        r.ph_level = toFloat(rpt.ph_level),
        r.turbidity = toFloat(rpt.turbidity),
        r.turbidity_ntu = toFloat(rpt.turbidity_ntu), // legacy mapping
        r.dissolved_oxygen = toFloat(rpt.dissolved_oxygen),
        r.bod = toFloat(rpt.bod),
        r.cod = toFloat(rpt.cod),
        r.coliform_count = toInteger(rpt.coliform_count),
        r.e_coli_count = toInteger(rpt.e_coli_count),
        r.contamination_index = toInteger(rpt.contamination_index),
        r.date_sampled = rpt.date_sampled,
        r.latitude = toFloat(rpt.latitude),
        r.longitude = toFloat(rpt.longitude),
        r.status = rpt.status,
        r.source = rpt.source,
        r.confidence_score = toInteger(rpt.confidence_score),
        r.freshness_hours = toInteger(rpt.freshness_hours),
        r.timestamp = rpt.timestamp

    MERGE (r)-[:MEASURED_AT]->(ws)
    MERGE (r)-[:IN_DISTRICT]->(d)
  `;
  
  const formattedBatch = batch.map(rpt => {
    const districtKey = getDistrictKey(rpt.district, rpt.state);
    const waterSourceKey = getWaterSourceKey(rpt.station_name, rpt.district, rpt.state);
    return {
      id: rpt.id || `wqr_${deterministicHash(waterSourceKey + "_" + rpt.date_sampled)}`,
      districtKey,
      waterSourceKey,
      station_name: rpt.station_name,
      state: rpt.state,
      district: rpt.district,
      ph_level: Number(rpt.ph_level),
      turbidity: Number(rpt.turbidity || rpt.turbidity_ntu || 0.0),
      turbidity_ntu: Number(rpt.turbidity || rpt.turbidity_ntu || 0.0),
      dissolved_oxygen: Number(rpt.dissolved_oxygen !== undefined ? rpt.dissolved_oxygen : 7.0),
      bod: Number(rpt.bod !== undefined ? rpt.bod : 1.5),
      cod: Number(rpt.cod !== undefined ? rpt.cod : 5.0),
      coliform_count: Number(rpt.coliform_count || 0),
      e_coli_count: Number(rpt.e_coli_count || 0),
      contamination_index: Number(rpt.contamination_index || 0),
      date_sampled: rpt.date_sampled,
      latitude: rpt.latitude ? parseFloat(rpt.latitude) : null,
      longitude: rpt.longitude ? parseFloat(rpt.longitude) : null,
      status: rpt.status || "safe",
      source: rpt.source || "CPCB",
      confidence_score: rpt.confidence_score || 90,
      freshness_hours: rpt.freshness_hours || 24,
      timestamp: rpt.timestamp || new Date().toISOString()
    };
  });

  await runQuery(query, { batch: formattedBatch });
}

async function getWaterReports() {
  const query = `
    MATCH (r:WaterQualityReport)
    RETURN r ORDER BY r.date_sampled DESC, r.id DESC
  `;
  const records = await runQuery(query);
  return convertNeo4jTypes(records.map(r => r.get("r").properties));
}

async function deleteWaterQualityReport(id) {
  const query = `
    MATCH (r:WaterQualityReport {id: $id})
    DETACH DELETE r
  `;
  await runQuery(query, { id });
  return { success: true };
}

// WEATHER PATTERNS
async function saveWeatherPattern(district, state, weather) {
  const districtKey = getDistrictKey(district, state);
  const key = `${districtKey}_${weather.date}`;
  const query = `
    MERGE (d:District {key: $districtKey})
    ON CREATE SET d.name = $district, d.state = $state
    
    MERGE (wp:WeatherPattern {key: $key})
    SET wp.tempMax = toFloat($tempMax),
        wp.tempMin = toFloat($tempMin),
        wp.temperature = toFloat($temperature), // current temperature
        wp.rainSum = toFloat($rainSum),
        wp.humidity = toFloat($humidity),
        wp.wind = toFloat($wind),
        wp.date = $date,
        wp.source = $source,
        wp.observation_timestamp = $observation_timestamp,
        wp.data_age = toFloat($data_age)
    
    MERGE (d)-[:EXPERIENCES]->(wp)
    RETURN wp
  `;
  
  const params = {
    districtKey,
    key,
    district,
    state,
    tempMax: weather.tempMax !== undefined ? weather.tempMax : (weather.temperature || 30.0),
    tempMin: weather.tempMin !== undefined ? weather.tempMin : (weather.temperature ? weather.temperature - 6.0 : 22.0),
    temperature: weather.temperature !== undefined ? weather.temperature : (weather.tempMax || 30.0),
    rainSum: weather.rainSum || 0.0,
    humidity: weather.humidity || 65.0,
    wind: weather.wind || weather.windspeed || 10.0,
    date: weather.date,
    source: weather.source || "open-meteo",
    observation_timestamp: weather.observation_timestamp || new Date().toISOString(),
    data_age: weather.data_age !== undefined ? weather.data_age : 0.0
  };
  
  const records = await runQuery(query, params);
  const props = records[0]?.get("wp").properties;
  return convertNeo4jTypes(props);
}

async function saveWeatherPatternsBatch(batch) {
  const query = `
    UNWIND $batch AS wt
    MERGE (d:District {key: wt.districtKey})
    ON CREATE SET d.name = wt.district, d.state = wt.state
    
    MERGE (wp:WeatherPattern {key: wt.key})
    SET wp.tempMax = toFloat(wt.tempMax),
        wp.tempMin = toFloat(wt.tempMin),
        wp.temperature = toFloat(wt.temperature),
        wp.rainSum = toFloat(wt.rainSum),
        wp.humidity = toFloat(wt.humidity),
        wp.wind = toFloat(wt.wind),
        wp.date = wt.date,
        wp.source = wt.source,
        wp.observation_timestamp = wt.observation_timestamp,
        wp.data_age = toFloat(wt.data_age)
    
    MERGE (d)-[:EXPERIENCES]->(wp)
  `;
  const formattedBatch = batch.map(wt => {
    const districtKey = getDistrictKey(wt.district, wt.state);
    return {
      districtKey,
      key: `${districtKey}_${wt.date}`,
      district: wt.district,
      state: wt.state,
      tempMax: Number(wt.tempMax),
      tempMin: Number(wt.tempMin),
      temperature: Number(wt.temperature !== undefined ? wt.temperature : wt.tempMax),
      rainSum: Number(wt.rainSum),
      humidity: Number(wt.humidity),
      wind: Number(wt.wind || wt.windspeed || 10.0),
      date: wt.date,
      source: wt.source || "open-meteo",
      observation_timestamp: wt.observation_timestamp || new Date().toISOString(),
      data_age: wt.data_age !== undefined ? wt.data_age : 0.0
    };
  });
  await runQuery(query, { batch: formattedBatch });
}

// OUTBREAK PREDICTIONS & DAILY HISTORICAL SNAPSHOTS
async function savePrediction(prediction) {
  const districtKey = getDistrictKey(prediction.district, prediction.state);
  const id = prediction.id || `pred_${deterministicHash(districtKey + "_" + prediction.disease + "_" + prediction.prediction_date)}`;
  
  const query = `
    MERGE (d:District {key: $districtKey})
    SET d.name = $district,
        d.state = $state,
        d.district_vulnerability_score = toFloat($district_vulnerability_score)
    
    MERGE (dis:Disease {name: $disease})
    MERGE (dt:CalendarDate {date: $prediction_date})
    
    MERGE (p:OutbreakPrediction {id: $id})
    SET p.state = $state,
        p.district = $district,
        p.disease = $disease,
        p.risk_level = $risk_level,
        p.confidence_score = toInteger($confidence_score),
        p.risk_probability = toFloat($risk_probability),
        p.anomaly_score = toInteger($anomaly_score),
        p.predicted_cases = toInteger($predicted_cases), // legacy field mapped to 48h
        p.forecast_24h = toInteger($forecast_24h),
        p.forecast_48h = toInteger($forecast_48h),
        p.forecast_7d = toInteger($forecast_7d),
        p.forecast_14d = toInteger($forecast_14d),
        p.forecast_30d = toInteger($forecast_30d),
        p.prediction_date = $prediction_date,
        p.contributing_factors = $contributing_factors,
        p.reasoning = $reasoning,
        p.environmental_triggers = $environmental_triggers,
        p.neighbor_influence = $neighbor_influence,
        p.recommended_actions = $recommended_actions,
        p.latitude = toFloat($latitude),
        p.longitude = toFloat($longitude),
        p.cases_per_100k = toFloat($cases_per_100k),
        p.admissions_per_100k = toFloat($admissions_per_100k),
        p.alerts_per_100k = toFloat($alerts_per_100k),
        p.hotspot_status = $hotspot_status,
        p.district_vulnerability_score = toFloat($district_vulnerability_score),
        p.neighbor_risk = toFloat($neighbor_risk),
        p.spread_pressure = toFloat($spread_pressure),
        p.outbreak_propagation_score = toFloat($outbreak_propagation_score)
        
    MERGE (d)-[:HAS_PREDICTION]->(p)
    MERGE (p)-[:PREDICTED_IN]->(d)
    MERGE (p)-[:PREDICTS_DISEASE]->(dis)
    MERGE (p)-[:ON_DATE]->(dt)
    
    RETURN p
  `;
  
  const params = {
    id,
    districtKey,
    district: prediction.district,
    state: prediction.state,
    disease: prediction.disease,
    risk_level: prediction.risk_level,
    confidence_score: prediction.confidence_score,
    risk_probability: prediction.risk_probability || 0.5,
    anomaly_score: prediction.anomaly_score,
    predicted_cases: prediction.predicted_cases || prediction.forecast_48h || 0,
    forecast_24h: prediction.forecast_24h || 0,
    forecast_48h: prediction.forecast_48h || prediction.predicted_cases || 0,
    forecast_7d: prediction.forecast_7d || 0,
    forecast_14d: prediction.forecast_14d || 0,
    forecast_30d: prediction.forecast_30d || 0,
    prediction_date: prediction.prediction_date,
    contributing_factors: prediction.contributing_factors || "",
    reasoning: prediction.reasoning || "",
    environmental_triggers: prediction.environmental_triggers || "",
    neighbor_influence: prediction.neighbor_influence || "",
    recommended_actions: prediction.recommended_actions || "",
    latitude: prediction.latitude ? parseFloat(prediction.latitude) : null,
    longitude: prediction.longitude ? parseFloat(prediction.longitude) : null,
    cases_per_100k: prediction.cases_per_100k || 0.0,
    admissions_per_100k: prediction.admissions_per_100k || 0.0,
    alerts_per_100k: prediction.alerts_per_100k || 0.0,
    hotspot_status: prediction.hotspot_status || "Stable",
    district_vulnerability_score: prediction.district_vulnerability_score || 35.0,
    neighbor_risk: prediction.neighbor_risk || 0.0,
    spread_pressure: prediction.spread_pressure || 0.0,
    outbreak_propagation_score: prediction.outbreak_propagation_score || 0.0
  };
  
  const records = await runQuery(query, params);
  const props = records[0]?.get("p").properties;
  return convertNeo4jTypes(props);
}

async function savePredictionsBatch(batch) {
  const query = `
    UNWIND $batch AS pred
    MERGE (d:District {key: pred.districtKey})
    SET d.name = pred.district,
        d.state = pred.state,
        d.district_vulnerability_score = toFloat(pred.district_vulnerability_score)
    
    MERGE (dis:Disease {name: pred.disease})
    MERGE (dt:CalendarDate {date: pred.prediction_date})
    
    MERGE (p:OutbreakPrediction {id: pred.id})
    SET p.state = pred.state,
        p.district = pred.district,
        p.disease = pred.disease,
        p.risk_level = pred.risk_level,
        p.confidence_score = toInteger(pred.confidence_score),
        p.risk_probability = toFloat(pred.risk_probability),
        p.anomaly_score = toInteger(pred.anomaly_score),
        p.predicted_cases = toInteger(pred.predicted_cases),
        p.forecast_24h = toInteger(pred.forecast_24h),
        p.forecast_48h = toInteger(pred.forecast_48h),
        p.forecast_7d = toInteger(pred.forecast_7d),
        p.forecast_14d = toInteger(pred.forecast_14d),
        p.forecast_30d = toInteger(pred.forecast_30d),
        p.prediction_date = pred.prediction_date,
        p.contributing_factors = pred.contributing_factors,
        p.reasoning = pred.reasoning,
        p.environmental_triggers = pred.environmental_triggers,
        p.neighbor_influence = pred.neighbor_influence,
        p.recommended_actions = pred.recommended_actions,
        p.latitude = toFloat(pred.latitude),
        p.longitude = toFloat(pred.longitude),
        p.cases_per_100k = toFloat(pred.cases_per_100k),
        p.admissions_per_100k = toFloat(pred.admissions_per_100k),
        p.alerts_per_100k = toFloat(pred.alerts_per_100k),
        p.hotspot_status = pred.hotspot_status,
        p.district_vulnerability_score = toFloat(pred.district_vulnerability_score),
        p.neighbor_risk = toFloat(pred.neighbor_risk),
        p.spread_pressure = toFloat(pred.spread_pressure),
        p.outbreak_propagation_score = toFloat(pred.outbreak_propagation_score)
        
    MERGE (d)-[:HAS_PREDICTION]->(p)
    MERGE (p)-[:PREDICTED_IN]->(d)
    MERGE (p)-[:PREDICTS_DISEASE]->(dis)
    MERGE (p)-[:ON_DATE]->(dt)
  `;
  const formattedBatch = batch.map(pred => {
    const districtKey = getDistrictKey(pred.district, pred.state);
    return {
      id: pred.id || `pred_${deterministicHash(districtKey + "_" + pred.disease + "_" + pred.prediction_date)}`,
      districtKey,
      district: pred.district,
      state: pred.state,
      disease: pred.disease,
      risk_level: pred.risk_level,
      confidence_score: Number(pred.confidence_score),
      risk_probability: Number(pred.risk_probability || 0.5),
      anomaly_score: Number(pred.anomaly_score),
      predicted_cases: Number(pred.predicted_cases || pred.forecast_48h || 0),
      forecast_24h: Number(pred.forecast_24h || 0),
      forecast_48h: Number(pred.forecast_48h || pred.predicted_cases || 0),
      forecast_7d: Number(pred.forecast_7d || 0),
      forecast_14d: Number(pred.forecast_14d || 0),
      forecast_30d: Number(pred.forecast_30d || 0),
      prediction_date: pred.prediction_date,
      contributing_factors: pred.contributing_factors || "",
      reasoning: pred.reasoning || "",
      environmental_triggers: pred.environmental_triggers || "",
      neighbor_influence: pred.neighbor_influence || "",
      recommended_actions: pred.recommended_actions || "",
      latitude: pred.latitude ? parseFloat(pred.latitude) : null,
      longitude: pred.longitude ? parseFloat(pred.longitude) : null,
      cases_per_100k: pred.cases_per_100k || 0.0,
      admissions_per_100k: pred.admissions_per_100k || 0.0,
      alerts_per_100k: pred.alerts_per_100k || 0.0,
      hotspot_status: pred.hotspot_status || "Stable",
      district_vulnerability_score: pred.district_vulnerability_score || 35.0,
      neighbor_risk: pred.neighbor_risk || 0.0,
      spread_pressure: pred.spread_pressure || 0.0,
      outbreak_propagation_score: pred.outbreak_propagation_score || 0.0
    };
  });
  await runQuery(query, { batch: formattedBatch });
}

async function getPredictions() {
  const query = `
    MATCH (p:OutbreakPrediction)
    RETURN p ORDER BY p.prediction_date DESC, p.id DESC
  `;
  const records = await runQuery(query);
  return convertNeo4jTypes(records.map(r => r.get("p").properties));
}

// ALERTS
async function saveAlert(alert) {
  const districtKey = getDistrictKey(alert.district, alert.state);
  const id = alert.id || `alt_${deterministicHash(districtKey + "_" + alert.disease + "_" + (alert.created_date || new Date().toISOString().slice(0, 10)))}`;
  
  const query = `
    MERGE (d:District {key: $districtKey})
    ON CREATE SET d.name = $district, d.state = $state
    
    MERGE (alt:Alert {id: $id})
    SET alt.title = $title,
        alt.state = $state,
        alt.district = $district,
        alt.disease = $disease,
        alt.severity = $severity,
        alt.risk_level = $risk_level,
        alt.message = $message,
        alt.status = $status,
        alt.created_date = $created_date,
        alt.created_at = $created_at,
        alt.prediction_date = $prediction_date
    
    MERGE (d)-[:HAS_ALERT]->(alt)
    MERGE (alt)-[:TRIGGERED_IN]->(d)
    RETURN alt
  `;
  
  const params = {
    id,
    districtKey,
    district: alert.district,
    state: alert.state,
    title: alert.title,
    disease: alert.disease,
    severity: alert.severity || "warning",
    risk_level: alert.risk_level || (alert.severity === "critical" ? "critical" : "high"),
    message: alert.message,
    status: alert.status || "active",
    created_date: alert.created_date || new Date().toISOString().slice(0, 10),
    created_at: alert.created_at || new Date().toISOString(),
    prediction_date: alert.prediction_date || alert.created_date || new Date().toISOString().slice(0, 10)
  };
  
  const records = await runQuery(query, params);
  const props = records[0]?.get("alt").properties;
  return convertNeo4jTypes(props);
}

async function saveAlertsBatch(batch) {
  const query = `
    UNWIND $batch AS al
    MERGE (d:District {key: al.districtKey})
    ON CREATE SET d.name = al.district, d.state = al.state
    
    MERGE (alt:Alert {id: al.id})
    SET alt.title = al.title,
        alt.state = al.state,
        alt.district = al.district,
        alt.disease = al.disease,
        alt.severity = al.severity,
        alt.risk_level = al.risk_level,
        alt.message = al.message,
        alt.status = al.status,
        alt.created_date = al.created_date,
        alt.created_at = al.created_at,
        alt.prediction_date = al.prediction_date
        
    MERGE (d)-[:HAS_ALERT]->(alt)
    MERGE (alt)-[:TRIGGERED_IN]->(d)
  `;
  const formattedBatch = batch.map(al => {
    const districtKey = getDistrictKey(al.district, al.state);
    return {
      id: al.id || `alt_${deterministicHash(districtKey + "_" + al.disease + "_" + (al.created_date || new Date().toISOString().slice(0, 10)))}`,
      districtKey,
      district: al.district,
      state: al.state,
      title: al.title,
      disease: al.disease,
      severity: al.severity || "warning",
      risk_level: al.risk_level || (al.severity === "critical" ? "critical" : "high"),
      message: al.message,
      status: al.status || "active",
      created_date: al.created_date || new Date().toISOString().slice(0, 10),
      created_at: al.created_at || new Date().toISOString(),
      prediction_date: al.prediction_date || al.created_date || new Date().toISOString().slice(0, 10)
    };
  });
  await runQuery(query, { batch: formattedBatch });
}

async function getAlerts() {
  const query = `
    MATCH (al:Alert)
    RETURN al ORDER BY al.created_date DESC, al.id DESC
  `;
  const records = await runQuery(query);
  return convertNeo4jTypes(records.map(r => r.get("al").properties));
}

async function updateAlert(id, data) {
  let setClause = [];
  const params = { id };
  
  Object.keys(data).forEach((key) => {
    setClause.push(`al.${key} = $${key}`);
    params[key] = data[key];
  });
  
  const query = `
    MATCH (al:Alert {id: $id})
    SET ${setClause.join(", ")}
    RETURN al
  `;
  const records = await runQuery(query, params);
  const props = records[0]?.get("al").properties;
  return convertNeo4jTypes(props);
}

async function deleteAlert(id) {
  const query = `
    MATCH (al:Alert {id: $id})
    DETACH DELETE al
  `;
  await runQuery(query, { id });
  return { success: true };
}

// SPATIAL DISTRICT BORDERS ADJACENCY GRAPH
async function createAdjacencyGraph(maxDistanceKm = 100) {
  console.log(`Calculating geographic border adjacency (dist < ${maxDistanceKm}km)...`);
  const query = `
    MATCH (d1:District), (d2:District)
    WHERE d1.key < d2.key
    WITH d1, d2, point.distance(
      point({latitude: toFloat(d1.latitude), longitude: toFloat(d1.longitude)}),
      point({latitude: toFloat(d2.latitude), longitude: toFloat(d2.longitude)})
    ) AS dist
    WHERE dist < ($maxDistanceKm * 1000)
    MERGE (d1)-[r:BORDERS]-(d2)
    SET r.distanceKm = dist / 1000.0
    MERGE (d1)-[:NEIGHBOR_OF]-(d2)
    RETURN count(r) AS relCreated
  `;
  const records = await runQuery(query, { maxDistanceKm });
  console.log(`Graph Border Adjacency relationships mapped: ${records[0]?.get("relCreated")}`);
}

// FETCH ROLLING CASE DATA FROM GRAPH
async function getRollingAverages(district, disease, date, daysBack = 14) {
  const query = `
    MATCH (d:District {name: $district})<-[:IN_DISTRICT]-(a:HospitalAdmission {disease: $disease})
    WHERE a.date_reported <= $date
    RETURN a.date_reported AS date, sum(a.case_count) AS daily_cases
    ORDER BY a.date_reported DESC
    LIMIT toInteger($daysBack)
  `;
  const records = await runQuery(query, { district, disease, date, daysBack });
  return convertNeo4jTypes(records.map(r => ({
    date: r.get("date"),
    cases: r.get("daily_cases")
  })));
}

// FETCH TOTAL OUTBREAKS IN NEIGHBORING DISTRICTS (VIA BORDERS)
async function getNeighborOutbreakSum(district, disease, date) {
  const query = `
    MATCH (d:District {name: $district})-[:NEIGHBOR_OF]-(n:District)
    MATCH (n)<-[:IN_DISTRICT]-(a:HospitalAdmission {disease: $disease})
    WHERE a.date_reported = $date
    RETURN sum(a.case_count) AS neighborCases
  `;
  const records = await runQuery(query, { district, disease, date });
  const count = records[0]?.get("neighborCases");
  return count ? convertNeo4jTypes(count) : 0;
}

// DATA QUALITY VALIDATION LOGS
async function saveValidationLog(log) {
  const id = `val_log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const query = `
    CREATE (l:ValidationLog {
      id: $id,
      timestamp: $timestamp,
      entityType: $entityType,
      rejectedData: $rejectedData,
      reason: $reason
    })
    RETURN l
  `;
  const params = {
    id,
    timestamp: log.timestamp || new Date().toISOString(),
    entityType: log.entityType,
    rejectedData: JSON.stringify(log.rejectedData),
    reason: log.reason
  };
  await runQuery(query, params);
}

// OBSERVABILITY TELEMETRY QUERIES
async function getSystemMetrics() {
  const session = driver.session();
  try {
    // Single round-trip: measure latency of the real metrics query itself.
    // Previously two sequential round-trips were made (RETURN 1 ping + metrics query),
    // each adding ~600-700ms of AuraDB network latency. Now one round-trip serves both.
    const t0 = Date.now();

    const metricsRes = await session.run(`
      CALL {
        MATCH (d:District)
        RETURN count(d) AS districts
      }
      CALL {
        MATCH (s:State)
        RETURN count(s) AS states
      }
      CALL {
        MATCH (a:HospitalAdmission)
        WHERE date(a.date_reported) >= date() - duration({days: 1})
        RETURN COALESCE(sum(a.case_count), 0) AS admissions
      }
      CALL {
        // Single scan resolves latestPredDate and derives both prediction count
        // and active high-risk district count — eliminates the duplicate full-table scan.
        MATCH (p:OutbreakPrediction)
        WITH max(p.prediction_date) AS latestPredDate
        MATCH (p2:OutbreakPrediction {prediction_date: latestPredDate})
        RETURN
          count(p2) AS predictions,
          sum(CASE WHEN p2.risk_level IN ['high', 'critical'] THEN 1 ELSE 0 END) AS activeHighRiskDistricts
      }
      CALL {
        MATCH (w:WeatherPattern)
        WHERE datetime(COALESCE(w.observation_timestamp, w.date)) >= datetime() - duration({hours: 24})
        RETURN count(w) AS weather
      }
      CALL {
        MATCH (w:WaterQualityReport)
        WITH max(COALESCE(w.timestamp, w.report_date, w.date_sampled)) AS latestWaterDate
        MATCH (w2:WaterQualityReport)
        WHERE COALESCE(w2.timestamp, w2.report_date, w2.date_sampled) = latestWaterDate
        RETURN count(w2) AS water
      }
      CALL {
        MATCH (l:ValidationLog)
        RETURN count(l) AS valLogs
      }
      CALL {
        MATCH (a:HospitalAdmission)
        RETURN max(a.date_reported) AS max_adm
      }
      CALL {
        MATCH (p:OutbreakPrediction)
        RETURN max(p.prediction_date) AS max_pred
      }
      CALL {
        MATCH (w:WeatherPattern)
        RETURN max(COALESCE(w.observation_timestamp, w.date)) AS max_wea
      }
      CALL {
        MATCH (wt:WaterQualityReport)
        RETURN max(COALESCE(wt.timestamp, wt.report_date, wt.date_sampled)) AS max_wat
      }
      RETURN districts, states, admissions, predictions, activeHighRiskDistricts, weather, water, valLogs, max_adm, max_pred, max_wea, max_wat
    `);

    const neo4jLatencyMs = Date.now() - t0;
    const record = metricsRes.records[0];

    const parseToDate = (str) => {
      if (!str) return null;
      let formatted = str;
      if (formatted.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
        formatted = `${formatted}T00:00:00.000Z`;
      } else if (formatted.includes("T") && !formatted.endsWith("Z") && !formatted.includes("+") && !formatted.includes("-")) {
        formatted = `${formatted}Z`;
      }
      const d = new Date(formatted);
      return isNaN(d.getTime()) ? null : d;
    };

    let last_data_refresh = null;
    if (record) {
      const max_adm = record.get("max_adm");
      const max_pred = record.get("max_pred");
      const max_wea = record.get("max_wea");
      const max_wat = record.get("max_wat");

      const dates = [
        parseToDate(max_adm),
        parseToDate(max_pred),
        parseToDate(max_wea),
        parseToDate(max_wat)
      ].filter(Boolean);

      if (dates.length > 0) {
        last_data_refresh = new Date(Math.max(...dates.map(d => d.getTime()))).toISOString();
      }
    }

    return {
      neo4j_status: "connected",
      neo4j_latency_ms: neo4jLatencyMs,
      total_districts: record ? convertNeo4jTypes(record.get("districts")) : 0,
      total_states: record ? convertNeo4jTypes(record.get("states")) : 0,
      total_admissions: record ? convertNeo4jTypes(record.get("admissions")) : 0,
      total_predictions: record ? convertNeo4jTypes(record.get("predictions")) : 0,
      total_weather: record ? convertNeo4jTypes(record.get("weather")) : 0,
      total_water: record ? convertNeo4jTypes(record.get("water")) : 0,
      total_validation_errors: record ? convertNeo4jTypes(record.get("valLogs")) : 0,
      active_high_risk_districts: record ? convertNeo4jTypes(record.get("activeHighRiskDistricts")) : 0,
      last_data_refresh
    };
  } catch (err) {
    return {
      neo4j_status: "disconnected",
      neo4j_error: err.message
    };
  } finally {
    await session.close();
  }
}


// SEED FLUSH FOR RE-SEEDING
async function clearDatabase() {
  console.log("Clearing all data in Neo4j database...");
  await runQuery("MATCH (n) DETACH DELETE n");
}

function deterministicHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// FETCH ALL BORDER RELATIONSHIPS AT ONCE FOR MEMORY CACHING
async function getAllBorders() {
  const query = `
    MATCH (d1:District)-[:NEIGHBOR_OF]-(d2:District)
    RETURN d1.name AS d1, d2.name AS d2
  `;
  const records = await runQuery(query);
  return records.map(r => ({
    d1: r.get("d1"),
    d2: r.get("d2")
  }));
}

async function getHospitalsByDistrict(district) {
  const query = `
    MATCH (d:District)-[:HAS_HOSPITAL]->(h:Hospital)
    WHERE toLower(d.name) = toLower($district) OR toLower(d.district_name) = toLower($district)
    RETURN h
  `;
  const records = await runQuery(query, { district });
  return convertNeo4jTypes(records.map(r => r.get("h").properties));
}

async function getWaterStationsByDistrict(district) {
  const query = `
    MATCH (d:District)-[:HAS_WATER_STATION]->(ws:WaterSource)
    WHERE toLower(d.name) = toLower($district) OR toLower(d.district_name) = toLower($district)
    RETURN ws
  `;
  const records = await runQuery(query, { district });
  return convertNeo4jTypes(records.map(r => r.get("ws").properties));
}

async function getWeatherHistory(district, daysBack = 30) {
  const query = `
    MATCH (d:District)-[:EXPERIENCES]->(wp:WeatherPattern)
    WHERE toLower(d.name) = toLower($district) OR toLower(d.district_name) = toLower($district)
    RETURN wp ORDER BY wp.date DESC LIMIT toInteger($daysBack)
  `;
  const records = await runQuery(query, { district, daysBack });
  return convertNeo4jTypes(records.map(r => r.get("wp").properties));
}

async function getLatestHotspots() {
  const session = driver.session();
  try {
    const dateRes = await session.run("MATCH (p:OutbreakPrediction) RETURN max(p.prediction_date) AS maxDate");
    const maxDate = dateRes.records[0]?.get("maxDate");
    if (!maxDate) return [];

    const res = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      WHERE p.hotspot_status IN ["Critical Hotspot", "Growing Hotspot", "Emerging Hotspot", "Recovering", "Resolved"]
      RETURN p ORDER BY p.predicted_cases DESC
    `, { maxDate });
    return res.records.map(r => convertNeo4jTypes(r.get("p").properties));
  } finally {
    await session.close();
  }
}

async function getNationalRankings() {
  const session = driver.session();
  try {
    const dateRes = await session.run("MATCH (p:OutbreakPrediction) RETURN max(p.prediction_date) AS maxDate");
    const maxDate = dateRes.records[0]?.get("maxDate");
    if (!maxDate) {
      return { 
        topRiskDistricts: [], 
        diseaseHotspots: [], 
        emergingOutbreaks: [], 
        stateRankings: [],
        topHighRiskDistricts: [],
        topCriticalDistricts: [],
        fastestGrowingHotspots: [],
        diseaseRankings: []
      };
    }

    const distRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      RETURN p ORDER BY p.risk_probability DESC, p.predicted_cases DESC LIMIT 15
    `, { maxDate });
    const topRiskDistricts = distRes.records.map(r => convertNeo4jTypes(r.get("p").properties));
    const topHighRiskDistricts = topRiskDistricts;

    const hotspotRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      WHERE p.hotspot_status IN ["Critical Hotspot", "Growing Hotspot", "Emerging Hotspot"]
      RETURN p ORDER BY p.predicted_cases DESC
    `, { maxDate });
    const diseaseHotspots = hotspotRes.records.map(r => convertNeo4jTypes(r.get("p").properties));

    const emergingRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      WHERE p.hotspot_status = "Emerging Hotspot"
      RETURN p ORDER BY p.risk_probability DESC
    `, { maxDate });
    const emergingOutbreaks = emergingRes.records.map(r => convertNeo4jTypes(r.get("p").properties));

    const criticalRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      WHERE p.risk_level = "critical"
      RETURN p ORDER BY p.predicted_cases DESC
    `, { maxDate });
    const topCriticalDistricts = criticalRes.records.map(r => convertNeo4jTypes(r.get("p").properties));

    const growthRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      WHERE p.hotspot_status IN ["Growing Hotspot", "Critical Hotspot"]
      RETURN p ORDER BY p.predicted_cases DESC
    `, { maxDate });
    const fastestGrowingHotspots = growthRes.records.map(r => convertNeo4jTypes(r.get("p").properties));

    const diseaseRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      RETURN p.disease AS disease, count(p) AS total_predictions, sum(CASE WHEN p.risk_level = 'critical' THEN 1 ELSE 0 END) AS critical_count, sum(CASE WHEN p.risk_level = 'high' THEN 1 ELSE 0 END) AS high_count
      ORDER BY total_predictions DESC
    `, { maxDate });
    const diseaseRankings = diseaseRes.records.map(r => ({
      disease: r.get("disease"),
      total_predictions: convertNeo4jTypes(r.get("total_predictions")),
      critical_count: convertNeo4jTypes(r.get("critical_count")),
      high_count: convertNeo4jTypes(r.get("high_count"))
    }));

    const stateRes = await session.run(`
      MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
      RETURN p.state AS state, sum(p.predicted_cases) AS total_predicted_cases, avg(p.risk_probability) AS avg_risk_probability
      ORDER BY total_predicted_cases DESC
    `, { maxDate });
    const stateRankings = stateRes.records.map(r => ({
      state: r.get("state"),
      total_predicted_cases: convertNeo4jTypes(r.get("total_predicted_cases")),
      avg_risk_probability: Number(Number(r.get("avg_risk_probability")).toFixed(4))
    }));

    return { 
      topRiskDistricts, 
      diseaseHotspots, 
      emergingOutbreaks, 
      stateRankings,
      topHighRiskDistricts,
      topCriticalDistricts,
      fastestGrowingHotspots,
      diseaseRankings
    };
  } finally {
    await session.close();
  }
}

module.exports = {
  driver,
  initConstraints,
  saveDistrict,
  saveDistrictsBatch,
  saveAdmission,
  saveAdmissionsBatch,
  getAdmissions,
  deleteAdmission,
  saveHospital,
  saveHospitalsBatch,
  saveWaterQualityReport,
  saveWaterQualityReportsBatch,
  getWaterReports,
  deleteWaterQualityReport,
  saveWeatherPattern,
  saveWeatherPatternsBatch,
  savePrediction,
  savePredictionsBatch,
  getPredictions,
  saveAlert,
  saveAlertsBatch,
  getAlerts,
  updateAlert,
  deleteAlert,
  createAdjacencyGraph,
  getRollingAverages,
  getNeighborOutbreakSum,
  getAllBorders,
  saveValidationLog,
  getSystemMetrics,
  clearDatabase,
  getHospitalsByDistrict,
  getWaterStationsByDistrict,
  getWeatherHistory,
  getLatestHotspots,
  getNationalRankings
};
