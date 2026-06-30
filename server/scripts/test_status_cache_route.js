/**
 * Script to test the /api/system/status cache using a live express setup.
 * Run: node scripts/test_status_cache_route.js
 */
require("dotenv").config({ path: ".env" });
const { app, server } = require("../server");
const http = require("http");

function makeRequest() {
  return new Promise((resolve, reject) => {
    http.get("http://localhost:5000/api/system/status", (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function main() {
  console.log("==========================================");
  console.log("  Testing Status Route Cache & Telemetry");
  console.log("==========================================\n");

  try {
    // Wait a brief moment to ensure startup finishes
    await new Promise(r => setTimeout(r, 1000));

    console.log("--- CALL 1 (Cold) ---");
    const r1 = await makeRequest();
    console.log("R1 admissions:", r1.neo4j?.total_admissions);
    console.log("R1 hits:", r1.redis?.cache_hits, "misses:", r1.redis?.cache_misses);
    console.log("R1 neo4j_status:", r1.neo4j?.neo4j_status);

    console.log("\n--- CALL 2 (Warm - should be hit) ---");
    const r2 = await makeRequest();
    console.log("R2 admissions:", r2.neo4j?.total_admissions);
    console.log("R2 hits:", r2.redis?.cache_hits, "misses:", r2.redis?.cache_misses);

    console.log("\n--- CALL 3 (Warm - should be hit) ---");
    const r3 = await makeRequest();
    console.log("R3 admissions:", r3.neo4j?.total_admissions);
    console.log("R3 hits:", r3.redis?.cache_hits, "misses:", r3.redis?.cache_misses);

  } catch (err) {
    console.error(err);
  } finally {
    server.close();
    const neo4jService = require("../neo4jService");
    await neo4jService.driver.close();
  }
}

main();
