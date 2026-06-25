/**
 * Pre-warm timing diagnostic.
 * Measures each query individually AND simulates the Promise.all to find bottleneck.
 * Run: node scripts/diagnose_prewarm.js
 */
require("dotenv").config({ path: "../.env" });
const neo4jService = require("../neo4jService");

async function timeIt(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  const count = Array.isArray(result) ? result.length : "n/a";
  console.log(`  [${ms.toString().padStart(5)}ms] ${label} — returned ${count} records`);
  return { ms, count, result };
}

async function main() {
  console.log("=================================================");
  console.log("  Pre-warm Timing Diagnostic");
  console.log("=================================================\n");

  // --- 1. Sequential timings (baseline) ---
  console.log("SEQUENTIAL (one at a time):");
  const seqStart = Date.now();
  await timeIt("getAdmissions()   (no limit = ALL records)", () => neo4jService.getAdmissions());
  await timeIt("getWaterReports()", () => neo4jService.getWaterReports());
  await timeIt("getPredictions()", () => neo4jService.getPredictions());
  await timeIt("getAlerts()", () => neo4jService.getAlerts());
  console.log(`  Total sequential: ${Date.now() - seqStart}ms\n`);

  // --- 2. Parallel timings ---
  console.log("PARALLEL (Promise.all):");
  const parStart = Date.now();
  const [a, w, p, al] = await Promise.all([
    timeIt("getAdmissions()   (parallel)", () => neo4jService.getAdmissions()),
    timeIt("getWaterReports() (parallel)", () => neo4jService.getWaterReports()),
    timeIt("getPredictions()  (parallel)", () => neo4jService.getPredictions()),
    timeIt("getAlerts()       (parallel)", () => neo4jService.getAlerts()),
  ]);
  console.log(`  Total parallel wall time: ${Date.now() - parStart}ms\n`);

  // --- 3. Admissions with limit=20 (what the Overview page actually requests) ---
  console.log("PAGINATED (limit=20, what Overview page actually fetches):");
  await timeIt("getAdmissions({ limit: 20 })", () => neo4jService.getAdmissions({ limit: 20 }));

  // --- 4. Cache key what the route generates vs what prewarm stores ---
  console.log("\nCACHE KEY ANALYSIS:");
  const limit = null;
  const offset = null;
  const search = "";
  const state = "";
  const disease = "";
  const routeKey = `admissions_${limit || "all"}_${offset || "0"}_${search}_${state}_${disease}`;
  console.log("  Route generates key:  ", JSON.stringify(routeKey));
  console.log("  Pre-warm stores key:  ", JSON.stringify("admissions_all_0____"));
  console.log("  Keys match:           ", routeKey === "admissions_all_0____");

  await neo4jService.driver.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
