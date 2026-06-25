require("dotenv").config({ path: ".env" });
const neo4j = require("neo4j-driver");
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

async function test() {
  const session = driver.session();
  try {
    // Test the proposed fix: anchor to max(date_reported) instead of today
    const r1 = await session.run(`
      MATCH (a:HospitalAdmission)
      WITH max(a.date_reported) AS latestDate
      MATCH (a2:HospitalAdmission)
      WHERE a2.date_reported = latestDate
      RETURN latestDate, count(a2) AS admission_nodes, COALESCE(sum(a2.case_count), 0) AS case_sum
    `);
    const rec = r1.records[0];
    console.log("Proposed fix (anchor to latest date = latest reporting date):");
    console.log("  latestDate:", rec.get("latestDate"));
    console.log("  admission_nodes:", rec.get("admission_nodes").toNumber());
    console.log("  case_sum (new total_admissions):", rec.get("case_sum").toNumber());
  } finally {
    await session.close();
    await driver.close();
  }
}
test().catch(e => { console.error(e.message); process.exit(1); });
