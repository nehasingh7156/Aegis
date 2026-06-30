/**
 * Instrument and measure individual subqueries inside getSystemMetrics.
 * Run: node scripts/diagnose_telemetry_bottleneck.js
 */
require("dotenv").config({ path: ".env" });
const neo4jService = require("../neo4jService");

async function main() {
  const session = neo4jService.driver.session();
  try {
    console.log("==========================================");
    console.log("  Timing getSystemMetrics subqueries...");
    console.log("==========================================\n");

    const runTimedQuery = async (label, query) => {
      const t0 = Date.now();
      const res = await session.run(query);
      const elapsed = Date.now() - t0;
      console.log(`[getSystemMetrics] ${label}: ${elapsed}ms`);
      return { elapsed, record: res.records[0] };
    };

    await runTimedQuery("districts", "MATCH (d:District) RETURN count(d) AS districts");
    await runTimedQuery("states", "MATCH (s:State) RETURN count(s) AS states");
    
    await runTimedQuery("admissions (latest filter)", `
      MATCH (a:HospitalAdmission)
      WITH max(a.date_reported) AS latestAdmDate
      MATCH (a2:HospitalAdmission)
      WHERE a2.date_reported = latestAdmDate
      RETURN COALESCE(sum(a2.case_count), 0) AS admissions
    `);
    
    await runTimedQuery("predictions & activeHighRiskDistricts", `
      MATCH (p:OutbreakPrediction)
      WITH max(p.prediction_date) AS latestPredDate
      MATCH (p2:OutbreakPrediction {prediction_date: latestPredDate})
      RETURN count(p2) AS predictions, sum(CASE WHEN p2.risk_level IN ['high', 'critical'] THEN 1 ELSE 0 END) AS activeHighRiskDistricts
    `);

    await runTimedQuery("weather", `
      MATCH (w:WeatherPattern)
      WHERE datetime(COALESCE(w.observation_timestamp, w.date)) >= datetime() - duration({hours: 24})
      RETURN count(w) AS weather
    `);

    await runTimedQuery("water", `
      MATCH (w:WaterQualityReport)
      WITH max(COALESCE(w.timestamp, w.report_date, w.date_sampled)) AS latestWaterDate
      MATCH (w2:WaterQualityReport)
      WHERE COALESCE(w2.timestamp, w2.report_date, w2.date_sampled) = latestWaterDate
      RETURN count(w2) AS water
    `);

    await runTimedQuery("valLogs", "MATCH (l:ValidationLog) RETURN count(l) AS valLogs");
    await runTimedQuery("max_adm", "MATCH (a:HospitalAdmission) RETURN max(a.date_reported) AS max_adm");
    await runTimedQuery("max_pred", "MATCH (p:OutbreakPrediction) RETURN max(p.prediction_date) AS max_pred");
    await runTimedQuery("max_wea", "MATCH (w:WeatherPattern) RETURN max(COALESCE(w.observation_timestamp, w.date)) AS max_wea");
    await runTimedQuery("max_wat", "MATCH (wt:WaterQualityReport) RETURN max(COALESCE(wt.timestamp, wt.report_date, wt.date_sampled)) AS max_wat");

  } finally {
    await session.close();
    await neo4jService.driver.close();
  }
}

main().catch(err => console.error(err));
