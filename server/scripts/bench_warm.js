require("dotenv").config({ path: "../.env" });
const s = require("../neo4jService");

async function bench() {
  // First call warms the TCP connection
  await s.getSystemMetrics();
  // Second call is on warm connection — this is what the statusCache will serve
  const m = await s.getSystemMetrics();
  console.log("total_admissions:          ", m.total_admissions);
  console.log("total_predictions:         ", m.total_predictions);
  console.log("total_water:               ", m.total_water);
  console.log("total_weather:             ", m.total_weather);
  console.log("total_states:              ", m.total_states);
  console.log("total_districts:           ", m.total_districts);
  console.log("active_high_risk_districts:", m.active_high_risk_districts);
  console.log("last_data_refresh:         ", m.last_data_refresh);
  console.log("neo4j_latency_ms (warm):   ", m.neo4j_latency_ms);
  console.log("neo4j_status:              ", m.neo4j_status);
  await s.driver.close();
}

bench().catch(e => { console.error(e.message); process.exit(1); });
