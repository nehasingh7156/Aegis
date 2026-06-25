/**
 * Neo4j Index Creation + Benchmark Script
 * Usage: node scripts/create_indexes.js  (from within server/ directory)
 *
 * Creates indexes on all hot query fields used by getSystemMetrics() CALL{} subqueries.
 * Measures query latency before index creation, after, and verifies index states.
 */
require("dotenv").config({ path: ".env" });
const neo4j = require("neo4j-driver");

const URI  = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USERNAME;
const PASS = process.env.NEO4J_PASSWORD;

if (!URI || !USER || !PASS) {
  console.error("Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in .env");
  process.exit(1);
}

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));

// ── The exact same CALL{} query used by getSystemMetrics() ──────────────────
const METRICS_QUERY = `
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
  RETURN districts, states, admissions, predictions, activeHighRiskDistricts,
         weather, water, valLogs, max_adm, max_pred, max_wea, max_wat
`;

// ── Indexes to create ────────────────────────────────────────────────────────
const INDEXES = [
  {
    name: "idx_admission_date_reported",
    cypher: "CREATE INDEX idx_admission_date_reported IF NOT EXISTS FOR (a:HospitalAdmission) ON (a.date_reported)"
  },
  {
    name: "idx_prediction_date",
    cypher: "CREATE INDEX idx_prediction_date IF NOT EXISTS FOR (p:OutbreakPrediction) ON (p.prediction_date)"
  },
  {
    name: "idx_prediction_date_risk",
    cypher: "CREATE INDEX idx_prediction_date_risk IF NOT EXISTS FOR (p:OutbreakPrediction) ON (p.prediction_date, p.risk_level)"
  },
  {
    name: "idx_weather_observation_ts",
    cypher: "CREATE INDEX idx_weather_observation_ts IF NOT EXISTS FOR (w:WeatherPattern) ON (w.observation_timestamp)"
  },
  {
    name: "idx_weather_date",
    cypher: "CREATE INDEX idx_weather_date IF NOT EXISTS FOR (w:WeatherPattern) ON (w.date)"
  },
  {
    name: "idx_water_ts",
    cypher: "CREATE INDEX idx_water_ts IF NOT EXISTS FOR (w:WaterQualityReport) ON (w.timestamp)"
  },
  {
    name: "idx_water_report_date",
    cypher: "CREATE INDEX idx_water_report_date IF NOT EXISTS FOR (w:WaterQualityReport) ON (w.report_date)"
  },
  {
    name: "idx_water_date_sampled",
    cypher: "CREATE INDEX idx_water_date_sampled IF NOT EXISTS FOR (w:WaterQualityReport) ON (w.date_sampled)"
  },
  {
    name: "idx_alert_status",
    cypher: "CREATE INDEX idx_alert_status IF NOT EXISTS FOR (a:Alert) ON (a.status)"
  }
];

async function benchmarkQuery(session, label, runs = 3) {
  const latencies = [];
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    await session.run(METRICS_QUERY);
    latencies.push(Date.now() - t0);
  }
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  console.log(`  [${label}] avg=${avg}ms  min=${min}ms  max=${max}ms  (${runs} runs)`);
  return { avg, min, max };
}

async function main() {
  const session = driver.session();
  try {
    console.log("=================================================");
    console.log("  AEGIS Neo4j Index Creation + Benchmark");
    console.log("=================================================\n");

    // BEFORE benchmark (warm connection, no indexes)
    console.log("BEFORE index creation (3 warm runs):");
    const before = await benchmarkQuery(session, "BEFORE");

    // Create indexes
    console.log("\nCreating indexes...");
    for (const idx of INDEXES) {
      try {
        await session.run(idx.cypher);
        console.log(`  [OK] ${idx.name}`);
      } catch (err) {
        console.warn(`  [WARN] ${idx.name}: ${err.message}`);
      }
    }

    // Wait for indexes to come ONLINE
    console.log("\nWaiting for indexes to reach ONLINE state...");
    let attempts = 0;
    while (attempts < 20) {
      const result = await session.run(`
        SHOW INDEXES YIELD name, state
        WHERE name STARTS WITH 'idx_'
        RETURN name, state
      `);
      const pending = result.records.filter(r => r.get("state") !== "ONLINE");
      if (pending.length === 0) {
        console.log("  All indexes ONLINE.\n");
        break;
      }
      console.log(`  Still populating: ${pending.map(r => r.get("name")).join(", ")}`);
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
    }

    // List index inventory
    const idxResult = await session.run(`
      SHOW INDEXES YIELD name, type, state, labelsOrTypes, properties
      WHERE name STARTS WITH 'idx_'
      RETURN name, type, state, labelsOrTypes, properties
      ORDER BY labelsOrTypes, properties
    `);
    console.log("Index inventory:");
    idxResult.records.forEach(r => {
      const label  = (r.get("labelsOrTypes") || []).join(", ");
      const props  = (r.get("properties") || []).join(", ");
      const state  = r.get("state");
      const tick   = state === "ONLINE" ? "[OK]" : "[POPULATING]";
      console.log(`  ${tick} ${label} (${props}) - ${state}`);
    });

    // AFTER benchmark
    console.log("\nAFTER index creation (3 warm runs):");
    const after = await benchmarkQuery(session, "AFTER ");

    // Summary
    const improvement = Math.round((1 - after.avg / before.avg) * 100);
    console.log("\n=================================================");
    console.log("  BENCHMARK SUMMARY");
    console.log("=================================================");
    console.log(`  Before avg: ${before.avg}ms`);
    console.log(`  After  avg: ${after.avg}ms`);
    console.log(`  Improvement: ${improvement >= 0 ? improvement + "%" : "No improvement (indexes may have pre-existed)"}`);
    console.log("=================================================");

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
