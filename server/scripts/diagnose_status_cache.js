/**
 * Status cache diagnostic script.
 * Simulates exactly what the /api/system/status route does and instruments every step.
 * Run: node scripts/diagnose_status_cache.js
 */
require("dotenv").config({ path: "../.env" });
const neo4jService = require("../neo4jService");

// ── Replicate the EXACT statusCache from server.js ──────────────────────────
const statusCache = {
  neo4j: null,
  etl: null,
  lastFetched: 0,
  ttlMs: 30_000,
  refreshing: false
};

const jobHealth = {
  weather_etl: { status: "unknown" },
  water_etl: { status: "unknown" },
  hospital_etl: { status: "unknown" },
  prediction_etl: { status: "unknown" }
};

let activeRefreshPromise = null;

async function refreshStatusCache() {
  if (activeRefreshPromise) {
    console.log("    [refreshStatusCache] GUARD HIT: returning activeRefreshPromise.");
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    console.log("    [refreshStatusCache] Starting refresh...");
    const tRefresh = Date.now();
    try {
      const metrics = await neo4jService.getSystemMetrics();
      statusCache.neo4j = metrics;
      statusCache.etl = {
        weather_etl: jobHealth.weather_etl,
        water_etl: jobHealth.water_etl,
        hospital_etl: jobHealth.hospital_etl,
        prediction_etl: jobHealth.prediction_etl
      };
      statusCache.lastFetched = Date.now();
      console.log(`    [refreshStatusCache] COMPLETED in ${Date.now() - tRefresh}ms. neo4j_latency_ms=${metrics.neo4j_latency_ms}`);
      console.log(`    [refreshStatusCache] lastFetched=${statusCache.lastFetched}`);
    } catch (err) {
      console.warn("    [refreshStatusCache] ERROR:", err.message);
    } finally {
      statusCache.refreshing = false;
      activeRefreshPromise = null;
    }
  })();

  statusCache.refreshing = true;
  return activeRefreshPromise;
}

async function simulateStatusRequest(requestNumber) {
  const t0 = Date.now();
  const age = Date.now() - statusCache.lastFetched;
  const cacheExpired = !statusCache.neo4j || age >= statusCache.ttlMs;

  console.log(`\n  Request #${requestNumber}:`);
  console.log(`    statusCache.neo4j: ${statusCache.neo4j ? "POPULATED" : "NULL"}`);
  console.log(`    statusCache.lastFetched: ${statusCache.lastFetched} (${statusCache.lastFetched > 0 ? age + "ms ago" : "never set"})`);
  console.log(`    statusCache.ttlMs: ${statusCache.ttlMs}`);
  console.log(`    cacheExpired: ${cacheExpired} (!neo4j=${!statusCache.neo4j} || age>=ttl=${age >= statusCache.ttlMs})`);
  console.log(`    statusCache.refreshing: ${statusCache.refreshing}`);

  if (cacheExpired) {
    console.log(`    => CACHE MISS — calling refreshStatusCache()`);
    await refreshStatusCache();
    // After refreshStatusCache returns, check if neo4j was populated
    console.log(`    After refresh: statusCache.neo4j is ${statusCache.neo4j ? "POPULATED" : "NULL"}`);
  } else {
    console.log(`    => CACHE HIT — serving from memory`);
  }

  const neo4j = statusCache.neo4j || { neo4j_status: "starting" };
  const responseMs = Date.now() - t0;
  console.log(`    Response time: ${responseMs}ms | total_admissions: ${neo4j.total_admissions ?? "N/A"}`);
  return responseMs;
}

async function main() {
  console.log("=================================================");
  console.log("  Status Cache Diagnostic");
  console.log("=================================================");

  // Test 1: Simulate single cold request (what happens on first request to Railway)
  console.log("\n[TEST 1] Cold request — cache is empty:");
  await simulateStatusRequest(1);

  // Test 2: Immediate warm request (should hit cache)
  console.log("\n[TEST 2] Immediate warm request (should be cache hit):");
  await simulateStatusRequest(2);

  // Test 3: Simulate race condition — two concurrent requests on cold start
  console.log("\n[TEST 3] Race condition — two CONCURRENT requests on cold cache:");
  // Reset cache
  statusCache.neo4j = null;
  statusCache.lastFetched = 0;
  statusCache.refreshing = false;
  console.log("  (Cache reset to simulate cold start)");

  const [r1, r2] = await Promise.all([
    simulateStatusRequest("3a"),
    simulateStatusRequest("3b"),
  ]);

  // Test 4: After 31 seconds (TTL expiry) — what happens
  console.log("\n[TEST 4] Simulated TTL expiry (age > 30s):");
  const fakeOldFetch = Date.now() - 31_000;
  statusCache.lastFetched = fakeOldFetch;
  console.log(`  Forcing lastFetched to simulate 31s ago = ${fakeOldFetch}`);
  await simulateStatusRequest(4);

  // Test 5: Summary
  console.log("\n=================================================");
  console.log("  DIAGNOSTIC COMPLETE");
  console.log("  Final statusCache state:");
  console.log("    neo4j populated:", !!statusCache.neo4j);
  console.log("    lastFetched:", statusCache.lastFetched);
  console.log("    refreshing:", statusCache.refreshing);
  console.log("=================================================");

  await neo4jService.driver.close();
}

main().catch(e => { console.error("Diagnostic failed:", e.message); process.exit(1); });
