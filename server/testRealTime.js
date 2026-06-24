// Aegis Platform Real-Time Epidemiological Surveillance Integration Tests - V3.0
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const cron = require("node-cron");

// Set PORT to 5001 to avoid conflicts with running dev servers
process.env.PORT = 5001;

const districtService = require("./districtService");
const validationPipeline = require("./validationPipeline");
const neo4jService = require("./neo4jService");
const hospitalAdapter = require("./adapters/hospitalAdapter");
const csvAdapter = require("./adapters/csvAdapter");
const cache = require("./cachingService");
const mlPipeline = require("./mlPipeline");

async function runTests() {
  console.log("====================================================================");
  console.log("      AEGIS REAL-TIME SURVEILLANCE SYSTEM - INTEGRATION TESTS V3.0");
  console.log("====================================================================\n");

  // Clear previous validation logs to have a clean start
  if (fs.existsSync(validationPipeline.LOG_FILE)) {
    fs.writeFileSync(validationPipeline.LOG_FILE, "[]", "utf8");
    console.log("- Cleared existing validation logs.");
  }

  // ==========================================
  // 1. Cache GET/SET and Redis Fallback Verification
  // ==========================================
  console.log("\n[TEST 1] Verifying Caching Layer GET/SET...");
  await cache.set("test_key_realtime", { verified: true, ts: Date.now() }, 10);
  const cacheVal = await cache.get("test_key_realtime");
  assert.ok(cacheVal, "Cache retrieval failed");
  assert.strictEqual(cacheVal.verified, true);
  console.log(`- Caching OK. Redis active state: ${cache.isRedisConnected()}`);
  console.log("=> TEST 1 PASSED: Cache operations functioning properly.");

  // ==========================================
  // 2. Dynamic District Loading Verification
  // ==========================================
  console.log("\n[TEST 2] Verifying Dynamic States & Districts Loading...");
  const districts = await districtService.loadDistricts();
  console.log(`- Loaded ${districts.length} master districts dynamically.`);
  
  assert.ok(districts.length > 700, `Expected >700 districts in India, got ${districts.length}`);
  
  const newDelhi = districts.find(d => d.name.toLowerCase() === "new delhi");
  assert.ok(newDelhi, "New Delhi should exist in the loaded master list");
  console.log(`- New Delhi loaded: Lat=${newDelhi.latitude}, Lon=${newDelhi.longitude}, Pop=${newDelhi.population}`);
  assert.ok(newDelhi.state === "Delhi" || newDelhi.state === "Delhi (NCT)");
  assert.strictEqual(newDelhi.latitude, 28.6139);
  assert.strictEqual(newDelhi.longitude, 77.2090);
  console.log("=> TEST 2 PASSED: Dynamic district resolver loaded successfully.");

  // ==========================================
  // 3. Validation Pipeline Checks
  // ==========================================
  console.log("\n[TEST 3] Verifying Validation Pipeline Logic...");
  const validAdm = {
    hospital_name: "Max Hospital",
    state: "Delhi",
    district: "New Delhi",
    disease: "cholera",
    case_count: 5,
    severity: "mild",
    date_reported: new Date().toISOString().slice(0, 10),
    latitude: 28.6139,
    longitude: 77.2090
  };
  const validRes = validationPipeline.validateAdmission(validAdm);
  assert.ok(validRes.isValid, `Expected valid admission: ${validRes.error}`);

  // Test invalid parameters
  const invalidAdm = { ...validAdm, case_count: -10 };
  const invalidRes = validationPipeline.validateAdmission(invalidAdm);
  assert.strictEqual(invalidRes.isValid, false);
  console.log(`- Correctly rejected invalid caseload: ${invalidRes.error}`);
  validationPipeline.logValidationFailure("test_negative_cases", invalidAdm, invalidRes.error);
  console.log("=> TEST 3 PASSED: Validation pipeline rejects invalid values.");

  // ==========================================
  // 4. ML Feature Engineering & Score Variations
  // ==========================================
  console.log("\n[TEST 4] Verifying ML Anomaly Score Feature Variations...");
  const admissionsSample = [
    { hospital_name: "A", state: "Delhi", district: "New Delhi", disease: "cholera", case_count: 3, date_reported: "2026-06-01", population_density: 300 },
    { hospital_name: "A", state: "Delhi", district: "New Delhi", disease: "cholera", case_count: 10, date_reported: "2026-06-05", population_density: 300 },
    { hospital_name: "A", state: "Delhi", district: "New Delhi", disease: "cholera", case_count: 90, date_reported: "2026-06-10", population_density: 1500 }
  ];
  const waterReportsSample = [
    { station_name: "W", state: "Delhi", district: "New Delhi", ph_level: 6.8, turbidity_ntu: 1.0, coliform_count: 5, date_sampled: "2026-06-05" }
  ];
  const testForest = mlPipeline.buildIsolationForest(admissionsSample, waterReportsSample);
  
  const inst1 = { cases: 2, "7_day_avg": 2, "14_day_avg": 2, growth_rate: 1.0, waterIndex: 5, rainfall: 0, humidity: 55, temperature: 25, population_density: 300 };
  const inst2 = { cases: 95, "7_day_avg": 70, "14_day_avg": 45, growth_rate: 2.8, waterIndex: 75, rainfall: 50, humidity: 88, temperature: 34, population_density: 1800 };
  
  const score1 = testForest.computeAnomalyScore(inst1, testForest.dataSize);
  const score2 = testForest.computeAnomalyScore(inst2, testForest.dataSize);
  console.log(`- ML Pipeline anomaly variations: baselineInst=${score1}, outlierInst=${score2}`);
  assert.notStrictEqual(score1, score2, "Anomaly scores should vary based on feature values");
  console.log("=> TEST 4 PASSED: Isolation Forest generates varying anomaly scores.");

  // ==========================================
  // 5. Launching Express Server and Testing REST APIs
  // ==========================================
  console.log("\n[TEST 5] Starting Aegis Express Server on Port 5001...");
  
  const { server } = require("./server");
  
  console.log("- Waiting for database constraints, master seeding, and BORDERS graph creation...");
  let bordersCount = 0;
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const session = neo4jService.driver.session();
    try {
      const bordersRes = await session.run("MATCH ()-[r:BORDERS]->() RETURN count(r) AS c");
      bordersCount = bordersRes.records[0].get("c").toNumber();
      if (bordersCount > 0) {
        console.log(`- Detected ${bordersCount} BORDERS relationships in Neo4j after ${i * 2 + 2} seconds.`);
        break;
      }
    } catch (e) {
      console.log(`- Polling borders... Database status: ${e.message}`);
    } finally {
      await session.close();
    }
  }

  // Test Paginated API
  console.log("\n[TEST 5.1] Testing REST Paginated GET /api/admissions...");
  const pageRes = await fetch("http://localhost:5001/api/admissions?limit=5");
  assert.strictEqual(pageRes.status, 200, `Expected status 200, got ${pageRes.status}`);
  const pageData = await pageRes.json();
  console.log(`- Paginated API response length: ${pageData.length} records.`);
  assert.ok(Array.isArray(pageData), "Expected admissions array");
  assert.ok(pageData.length <= 5, "Paginated API exceeded requested limit");
  console.log("=> TEST 5.1 PASSED: Server-side pagination successfully limits records.");

  // Test Observability health checks
  console.log("\n[TEST 5.2] Checking Observability Telemetry Endpoint...");
  const sysStatusRes = await fetch("http://localhost:5001/api/system/status");
  assert.strictEqual(sysStatusRes.status, 200);
  const sysStatus = await sysStatusRes.json();
  console.log("- Observability metrics:", JSON.stringify(sysStatus.neo4j, null, 2));
  assert.strictEqual(sysStatus.status, "healthy");
  assert.strictEqual(sysStatus.neo4j.neo4j_status, "connected");
  assert.ok(sysStatus.neo4j.total_districts > 700);
  console.log("=> TEST 5.2 PASSED: Telemetry endpoint returned metrics.");

  // ==========================================
  // 6. Background Worker Thread Execution
  // ==========================================
  console.log("\n[TEST 6] Triggering Job execution inside Node Worker Thread...");
  const { Worker } = require("worker_threads");
  const workerPromise = new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "jobs", "backgroundWorker.js"), {
      workerData: { jobName: "PredictionGeneration" }
    });
    worker.on("message", (msg) => resolve(msg));
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Exit code ${code}`));
      else resolve({ success: true });
    });
  });
  const workerResult = await workerPromise;
  assert.ok(workerResult.success, "Worker job execution failed");
  console.log("=> TEST 6 PASSED: Background job executed cleanly inside worker thread.");

  // ==========================================
  // Teardown / Cleanup
  // ==========================================
  console.log("\nStopping Express server listeners and background cron tasks...");
  
  // Stop all node-cron scheduled tasks in this process
  const activeTasks = cron.getTasks();
  console.log(`- Stopping ${activeTasks.size} active cron scheduler tasks...`);
  activeTasks.forEach(task => task.stop());

  // Close web server
  await new Promise((resolve) => {
    server.close(() => {
      console.log("- Express server listener stopped.");
      resolve();
    });
  });

  console.log("\n====================================================================");
  console.log("      ALL V3.0 BACKEND SURVEILLANCE INTEGRATION TESTS PASSED         ");
  console.log("====================================================================");
}

runTests()
  .then(async () => {
    await neo4jService.driver.close();
    console.log("- Neo4j driver connection closed.");
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\nTEST SUITE FAILED WITH ERROR:", err);
    try {
      await neo4jService.driver.close();
      const activeTasks = cron.getTasks();
      activeTasks.forEach(task => task.stop());
    } catch (e) {}
    process.exit(1);
  });
