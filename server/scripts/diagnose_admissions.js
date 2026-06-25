/**
 * Admissions Diagnostic Script
 * Run: node scripts/diagnose_admissions.js
 *
 * Inspects actual date_reported values in AuraDB to root-cause
 * why total_admissions in /api/system/status may be wrong.
 */
require("dotenv").config({ path: ".env" });
const neo4j = require("neo4j-driver");

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

async function main() {
  const session = driver.session();
  try {
    console.log("=================================================");
    console.log("  AEGIS Admissions Telemetry Diagnostic");
    console.log("=================================================\n");

    // 1. Total admission node count
    const totalRes = await session.run(
      "MATCH (a:HospitalAdmission) RETURN count(a) AS total, sum(a.case_count) AS totalCases"
    );
    const total = totalRes.records[0];
    console.log("1. Total HospitalAdmission nodes:", total.get("total").toNumber());
    console.log("   Sum of all case_count:         ", total.get("totalCases").toNumber());

    // 2. Sample of actual date_reported values — show first 10
    const sampleRes = await session.run(
      "MATCH (a:HospitalAdmission) RETURN a.date_reported AS dr, a.case_count AS cc ORDER BY a.date_reported DESC LIMIT 15"
    );
    console.log("\n2. Sample date_reported values (top 15 by DESC order):");
    sampleRes.records.forEach(r => {
      const dr = r.get("dr");
      const cc = r.get("cc");
      console.log(`   date_reported="${dr}"  case_count=${cc}  type=${typeof dr}`);
    });

    // 3. What getSystemMetrics() actually computes — the 24h rolling window
    const metricsQuery = `
      MATCH (a:HospitalAdmission)
      WHERE date(a.date_reported) >= date() - duration({days: 1})
      RETURN count(a) AS admission_nodes, COALESCE(sum(a.case_count), 0) AS case_sum
    `;
    const metRes = await session.run(metricsQuery);
    const metRecord = metRes.records[0];
    console.log("\n3. Current getSystemMetrics() total_admissions query:");
    console.log("   WHERE date(a.date_reported) >= date() - duration({days:1})");
    console.log("   Matching admission nodes:", metRecord.get("admission_nodes").toNumber());
    console.log("   Sum of case_count (total_admissions value):", metRecord.get("case_sum").toNumber());

    // 4. Distribution of date_reported by date — find what dates exist
    const distRes = await session.run(`
      MATCH (a:HospitalAdmission)
      WITH
        CASE
          WHEN a.date_reported IS NULL THEN 'NULL'
          WHEN size(a.date_reported) >= 10 THEN left(a.date_reported, 10)
          ELSE a.date_reported
        END AS d,
        sum(a.case_count) AS cases,
        count(a) AS nodes
      RETURN d, nodes, cases
      ORDER BY d DESC
      LIMIT 20
    `);
    console.log("\n4. Date distribution of HospitalAdmission nodes (top 20 dates):");
    console.log("   DATE              | NODES | CASE_SUM");
    console.log("   ------------------+-------+---------");
    distRes.records.forEach(r => {
      const d = r.get("d");
      const n = r.get("nodes").toNumber();
      const c = r.get("cases").toNumber();
      console.log(`   ${String(d).padEnd(17)} | ${String(n).padStart(5)} | ${c}`);
    });

    // 5. Check today's date from Neo4j's perspective
    const dateRes = await session.run("RETURN date() AS today, datetime() AS now");
    const todayNeo4j = dateRes.records[0].get("today");
    const nowNeo4j = dateRes.records[0].get("now");
    console.log("\n5. Neo4j server date/time:");
    console.log("   date()    =", todayNeo4j.toString());
    console.log("   datetime()=", nowNeo4j.toString());

    // 6. Check what date() - duration({days:1}) resolves to
    const windowRes = await session.run("RETURN date() - duration({days:1}) AS window_start");
    console.log("   Window start (date()-1d):", windowRes.records[0].get("window_start").toString());

    // 7. Null check on date_reported
    const nullRes = await session.run(`
      MATCH (a:HospitalAdmission)
      RETURN
        sum(CASE WHEN a.date_reported IS NULL THEN 1 ELSE 0 END) AS null_count,
        sum(CASE WHEN a.date_reported IS NOT NULL THEN 1 ELSE 0 END) AS non_null_count
    `);
    const nr = nullRes.records[0];
    console.log("\n6. NULL check on date_reported:");
    console.log("   Null date_reported:     ", nr.get("null_count").toNumber());
    console.log("   Non-null date_reported: ", nr.get("non_null_count").toNumber());

    // 8. Check if date_reported is a Neo4j Date type or string
    const typeRes = await session.run(`
      MATCH (a:HospitalAdmission)
      WHERE a.date_reported IS NOT NULL
      RETURN a.date_reported AS dr
      LIMIT 1
    `);
    if (typeRes.records.length > 0) {
      const rawVal = typeRes.records[0].get("dr");
      console.log("\n7. Raw type of date_reported in driver:", Object.prototype.toString.call(rawVal));
      console.log("   Value:", rawVal);
      if (rawVal && typeof rawVal === 'object' && rawVal.year !== undefined) {
        console.log("   => Stored as Neo4j Date type (not a string)");
      } else {
        console.log("   => Stored as string: \"" + rawVal + "\"");
      }
    }

    // 9. Run the EXACT getSystemMetrics() CALL subquery in isolation
    const isolatedRes = await session.run(`
      MATCH (a:HospitalAdmission)
      WHERE date(a.date_reported) >= date() - duration({days: 1})
      RETURN COALESCE(sum(a.case_count), 0) AS admissions
    `);
    console.log("\n8. Isolated getSystemMetrics admissions subquery result:");
    console.log("   total_admissions =", isolatedRes.records[0].get("admissions").toNumber());

    console.log("\n=================================================");
    console.log("  DIAGNOSIS COMPLETE");
    console.log("=================================================");

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => { console.error("Diagnostic failed:", err.message); process.exit(1); });
