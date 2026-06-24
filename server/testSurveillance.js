// Aegis Platform Integration Test Verification
require("dotenv").config();
const districtService = require("./districtService");
const weatherService = require("./weatherService");
const hospitalService = require("./hospitalService");
const waterStationService = require("./waterStationService");
const neo4jService = require("./neo4jService");
const { runPredictionPipeline } = require("./mlPipeline");

async function runTests() {
  console.log("=== AEGIS BACKEND INTEGRATION TEST SUITE ===");
  
  // 1. Test District Service
  console.log("\n1. Testing District Service...");
  const districts = districtService.getDistricts();
  console.log(`- Loaded ${districts.length} districts.`);
  if (districts.length < 50) throw new Error("District dataset has too few elements");
  
  const gtown = districtService.getDistrictByName("Gurugram");
  console.log(`- Gurugram Coordinates: Lat ${gtown.latitude}, Lon ${gtown.longitude}, Pop ${gtown.population}`);
  if (!gtown || gtown.population !== 1514085) throw new Error("District lookup error");

  const neighbors = districtService.getNearestNeighbors("Gurugram", 150);
  console.log(`- Gurugram Neighbors within 150km: ${neighbors.map(n => `${n.district.name} (${n.distanceKm.toFixed(1)}km)`).join(", ")}`);
  if (neighbors.length === 0) throw new Error("Neighbor calculation failed");

  // 2. Test Caching & Weather Service
  console.log("\n2. Testing Weather Service (Open-Meteo & Fallbacks)...");
  const weather = await weatherService.fetchWeatherForCoordinates(gtown.latitude, gtown.longitude);
  console.log(`- Weather Result: TempMax ${weather.tempMax}°C, Rain ${weather.rainSum}mm, Humidity ${weather.humidity}%, Source: ${weather.source}`);
  if (typeof weather.tempMax !== 'number' || isNaN(weather.tempMax)) throw new Error("Weather fetching error");

  // 3. Test OSM Hospital Service
  console.log("\n3. Testing Hospital Discovery (OSM Overpass & Fallbacks)...");
  const hospitals = await hospitalService.discoverHospitals("Gurugram", gtown.latitude, gtown.longitude);
  console.log(`- Discovered ${hospitals.length} hospitals: ${hospitals.slice(0, 3).map(h => `${h.name} (${h.source})`).join(", ")}...`);
  if (hospitals.length === 0) throw new Error("Hospital discovery failed");

  // 4. Test OSM Water Facility Service
  console.log("\n4. Testing Water Facility Discovery (OSM Overpass & Fallbacks)...");
  const stations = await waterStationService.discoverWaterStations("Gurugram", gtown.latitude, gtown.longitude);
  console.log(`- Discovered ${stations.length} water stations: ${stations.slice(0, 3).map(s => `${s.name} (${s.source})`).join(", ")}...`);
  if (stations.length === 0) throw new Error("Water station discovery failed");

  // 5. Test ML Pipeline (advanced rolling calculations)
  console.log("\n5. Testing Advanced ML Outbreak Predictions...");
  // Mock rolling history (last 14 days)
  const mockRollingHistory = [
    { date: "2026-06-22", cases: 28 }, { date: "2026-06-21", cases: 24 },
    { date: "2026-06-20", cases: 18 }, { date: "2026-06-19", cases: 15 },
    { date: "2026-06-18", cases: 12 }, { date: "2026-06-17", cases: 8 },
    { date: "2026-06-16", cases: 5 },  { date: "2026-06-15", cases: 3 },
    { date: "2026-06-14", cases: 2 },  { date: "2026-06-13", cases: 1 },
    { date: "2026-06-12", cases: 1 },  { date: "2026-06-11", cases: 0 },
    { date: "2026-06-10", cases: 0 },  { date: "2026-06-09", cases: 0 }
  ];
  
  const mockAdmissions = [
    { hospital_name: "Gurugram Civil Hospital", state: "Haryana", district: "Gurugram", disease: "cholera", case_count: 28, date_reported: "2026-06-22" }
  ];
  const mockWaterReports = [
    { station_name: "Basai Water Treatment", state: "Haryana", district: "Gurugram", ph_level: 6.0, turbidity_ntu: 10.5, coliform_count: 850, e_coli_count: 85, dissolved_oxygen: 4.5, chemical_contaminants: 30, date_sampled: "2026-06-22", status: "contaminated" }
  ];

  const neighborCases = 65; // High caseload spillover
  
  const { prediction, alert } = runPredictionPipeline(
    mockAdmissions,
    mockWaterReports,
    weather,
    mockRollingHistory,
    neighborCases,
    "Gurugram",
    "Haryana",
    "cholera",
    gtown.population
  );
  
  console.log(`- Prediction Outcome: Risk ${prediction.risk_level.toUpperCase()}, Forecast ${prediction.predicted_cases} cases, Anomaly Score ${prediction.anomaly_score}`);
  console.log(`- Causal Reasoning: ${prediction.reasoning}`);
  if (alert) {
    console.log(`- Alert Triggered: ${alert.title} - ${alert.message}`);
  }
  if (!prediction || !["high", "critical"].includes(prediction.risk_level)) {
    throw new Error("ML Pipeline risk classification calibration failed");
  }

  // 6. Test Neo4j Connection
  console.log("\n6. Testing Neo4j DB connectivity...");
  const session = neo4jService.driver.session();
  try {
    const result = await session.run("RETURN 'Connected' AS msg");
    console.log(`- Neo4j Status: ${result.records[0].get("msg")}`);
  } catch (err) {
    throw new Error(`Neo4j connection error: ${err.message}`);
  } finally {
    await session.close();
  }

  console.log("\n=== ALL AEGIS INTEGRATION TESTS PASSED SUCCESSFULLY ===");
}

runTests()
  .then(async () => {
    await neo4jService.driver.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\nTEST SUITE CRASHED:", err.message);
    try {
      await neo4jService.driver.close();
    } catch (e) {}
    process.exit(1);
  });

