require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const { Worker } = require("worker_threads");

const neo4jService = require("./neo4jService");
const districtService = require("./districtService");
const weatherService = require("./weatherService");
const cache = require("./cachingService");
const { normalizeABDMAdmission } = require("./adapters/hospitalAdapter");
const intelligenceService = require("./intelligenceService");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ----------------------------------------
// Telemetry and Cache Statistics
// ----------------------------------------
let cacheHits = 0;
let cacheMisses = 0;

let queryLatencies = [];
function recordQueryLatency(ms) {
  queryLatencies.push(ms);
  if (queryLatencies.length > 50) {
    queryLatencies.shift();
  }
}
function getAvgQueryLatency() {
  if (queryLatencies.length === 0) return 0;
  return Math.round(queryLatencies.reduce((a, b) => a + b, 0) / queryLatencies.length);
}

let workerLatencies = [];
function recordWorkerLatency(ms) {
  workerLatencies.push(ms);
  if (workerLatencies.length > 10) {
    workerLatencies.shift();
  }
}
function getAvgWorkerLatency() {
  if (workerLatencies.length === 0) return 0;
  return Math.round(workerLatencies.reduce((a, b) => a + b, 0) / workerLatencies.length);
}

const jobHealth = {
  weather_etl: { status: "unknown", last_run: null, error: null },
  water_etl: { status: "unknown", last_run: null, error: null },
  hospital_etl: { status: "unknown", last_run: null, error: null },
  prediction_etl: { status: "unknown", last_run: null, error: null }
};

// ----------------------------------------
// Helper: run background tasks inside Node worker threads
// ----------------------------------------
function runJobInWorker(jobName) {
  return new Promise((resolve, reject) => {
    console.log(`[Main Thread] Spawning worker thread for job: ${jobName}`);
    const t0 = Date.now();
    const worker = new Worker(path.join(__dirname, "jobs", "backgroundWorker.js"), {
      workerData: { jobName }
    });
    
    worker.on("message", (msg) => {
      const duration = Date.now() - t0;
      recordWorkerLatency(duration);

      const last_run = new Date().toISOString();
      if (jobName === "WeatherIngestion") {
        jobHealth.weather_etl = { status: msg.success ? "success" : "failed", last_run, error: msg.error || null };
      } else if (jobName === "WaterIngestion") {
        jobHealth.water_etl = { status: msg.success ? "success" : "failed", last_run, error: msg.error || null };
      } else if (jobName === "HospitalIngestion") {
        jobHealth.hospital_etl = { status: msg.success ? "success" : "failed", last_run, error: msg.error || null };
      } else if (jobName === "PredictionGeneration") {
        jobHealth.prediction_etl = { status: msg.success ? "success" : "failed", last_run, error: msg.error || null };
      }
      resolve(msg);
    });
    
    worker.on("error", (err) => {
      console.error(`[Main Thread] Worker thread error for job ${jobName}:`, err.message);
      const last_run = new Date().toISOString();
      if (jobName === "WeatherIngestion") {
        jobHealth.weather_etl = { status: "failed", last_run, error: err.message };
      } else if (jobName === "WaterIngestion") {
        jobHealth.water_etl = { status: "failed", last_run, error: err.message };
      } else if (jobName === "HospitalIngestion") {
        jobHealth.hospital_etl = { status: "failed", last_run, error: err.message };
      } else if (jobName === "PredictionGeneration") {
        jobHealth.prediction_etl = { status: "failed", last_run, error: err.message };
      }
      reject(err);
    });
    
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`[Main Thread] Worker thread for ${jobName} stopped with exit code ${code}`));
      } else {
        console.log(`[Main Thread] Worker thread for ${jobName} exited cleanly.`);
        resolve({ success: true });
      }
    });
  });
}

// ----------------------------------------
// Cache Helpers
// ----------------------------------------
async function handleCachedGet(req, res, cacheKey, ttlSeconds, dbQueryFn) {
  const t0 = Date.now();
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      cacheHits++;
      return res.json(cached);
    }
    
    cacheMisses++;
    const data = await dbQueryFn();
    await cache.set(cacheKey, data, ttlSeconds);
    const dbLatency = Date.now() - t0;
    recordQueryLatency(dbLatency);
    res.json(data);
  } catch (err) {
    const dbLatency = Date.now() - t0;
    recordQueryLatency(dbLatency);
    res.status(500).json({ error: err.message });
  }
}

async function invalidatePatterns(patterns) {
  for (const pattern of patterns) {
    await cache.deletePattern(pattern).catch(err => console.warn(`Cache deletePattern error for ${pattern}:`, err.message));
  }
}

// Coordinate and population resolver for fallback cases
function getCoordinatesForDistrict(district) {
  const match = districtService.getDistrictByName(district);
  if (match) {
    return { lat: match.latitude, lon: match.longitude, pop: match.population, density: match.population_density };
  }
  return { lat: 22.0, lon: 79.0, pop: 1000000, density: 350 };
}

// ----------------------------------------
// Express REST API Routes
// ----------------------------------------

// 1. SYSTEM HEALTH AND OBSERVABILITY
app.get("/api/system/status", async (req, res) => {
  try {
    const metrics = await neo4jService.getSystemMetrics();
    const hitRate = cacheHits + cacheMisses > 0 
      ? parseFloat((cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2)) 
      : 0.0;

    res.json({
      status: "healthy",
      uptime_seconds: Math.round(process.uptime()),
      neo4j: metrics,
      last_data_refresh: metrics.last_data_refresh,
      redis: {
        status: cache.isRedisConnected() ? "connected" : "disconnected",
        cache_hit_rate_percent: hitRate,
        cache_hits: cacheHits,
        cache_misses: cacheMisses
      },
      telemetry: {
        average_query_latency_ms: getAvgQueryLatency(),
        average_worker_latency_ms: getAvgWorkerLatency(),
        weather_etl: jobHealth.weather_etl,
        water_etl: jobHealth.water_etl,
        hospital_etl: jobHealth.hospital_etl,
        prediction_etl: jobHealth.prediction_etl,
        active_high_risk_districts: metrics.active_high_risk_districts,
        last_data_refresh: metrics.last_data_refresh
      },
      memory_usage: {
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10,
        heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/jobs/status", async (req, res) => {
  res.json({
    jobs: {
      WeatherIngestionJob: { interval: "3h", active: true },
      WaterQualityIngestionJob: { interval: "6h", active: true },
      HospitalSyncJob: { interval: "24h", active: true },
      PredictionJob: { interval: "1h", active: true },
      AlertGenerationJob: { interval: "30m", active: true }
    }
  });
});

// 2. HOSPITAL ADMISSIONS
app.get("/api/admissions", async (req, res) => {
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : null;
  const offset = req.query.offset !== undefined ? Number(req.query.offset) : null;
  const search = req.query.search || "";
  const state = req.query.state || "";
  const disease = req.query.disease || "";

  const cacheKey = `admissions_${limit || "all"}_${offset || "0"}_${search}_${state}_${disease}`;
  await handleCachedGet(req, res, cacheKey, 900, () => 
    neo4jService.getAdmissions({ limit, offset, search, state, disease })
  );
});

app.post("/api/admissions", async (req, res) => {
  try {
    const admission = req.body;
    const coords = getCoordinatesForDistrict(admission.district);
    
    if (!admission.latitude || !admission.longitude) {
      admission.latitude = coords.lat;
      admission.longitude = coords.lon;
    }
    const saved = await neo4jService.saveAdmission(admission);
    await invalidatePatterns(["admissions_*", "rankings_*", "hotspots_*"]);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK JSON ADMISSIONS ADAPTER ENDPOINT
app.post("/api/admissions/bulk", async (req, res) => {
  try {
    const rawBatch = req.body;
    if (!Array.isArray(rawBatch)) {
      return res.status(400).json({ error: "Request body must be a JSON array of admissions." });
    }

    const validatedAdmissions = [];
    const rejectedAdmissions = [];

    for (const item of rawBatch) {
      const normalized = normalizeABDMAdmission(item);
      if (normalized) {
        const coords = getCoordinatesForDistrict(normalized.district);
        if (!normalized.latitude || !normalized.longitude) {
          normalized.latitude = coords.lat;
          normalized.longitude = coords.lon;
        }
        normalized.population_density = coords.density;
        validatedAdmissions.push(normalized);
      } else {
        rejectedAdmissions.push(item);
      }
    }

    if (validatedAdmissions.length > 0) {
      await neo4jService.saveAdmissionsBatch(validatedAdmissions);
    }

    await invalidatePatterns(["admissions_*", "rankings_*", "hotspots_*"]);

    res.status(201).json({
      success: true,
      message: `Ingested ${validatedAdmissions.length} admissions. Rejected ${rejectedAdmissions.length} invalid records.`,
      ingestedCount: validatedAdmissions.length,
      rejectedCount: rejectedAdmissions.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV UPLOAD ADMISSION ADAPTER ENDPOINT
app.post("/api/admissions/import", express.text({ type: ["text/csv", "text/plain"], limit: "10mb" }), async (req, res) => {
  try {
    let csvData = req.body;
    if (!csvData || typeof csvData !== "string") {
      return res.status(400).json({ error: "Empty request body. Please send raw CSV in request body." });
    }

    // Handle multipart boundary wrappers if uploaded via file input
    if (csvData.includes("Content-Disposition: form-data")) {
      const lines = csvData.split(/\r?\n/);
      let startIndex = -1;
      let endIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Content-Type:") || lines[i].includes("Content-Disposition:")) {
          startIndex = i + 2; 
        }
        if (lines[i].includes("------") && startIndex !== -1 && i > startIndex) {
          endIndex = i - 1;
          break;
        }
      }
      if (startIndex !== -1 && endIndex !== -1) {
        csvData = lines.slice(startIndex, endIndex).join("\n");
      }
    }

    const { parseCSV } = require("./adapters/csvAdapter");
    const { records, errors } = parseCSV(csvData);

    if (records.length > 0) {
      records.forEach(normalized => {
        const coords = getCoordinatesForDistrict(normalized.district);
        if (!normalized.latitude || !normalized.longitude) {
          normalized.latitude = coords.lat;
          normalized.longitude = coords.lon;
        }
        normalized.population_density = coords.density;
      });
      await neo4jService.saveAdmissionsBatch(records);
    }

    await invalidatePatterns(["admissions_*", "rankings_*", "hotspots_*"]);

    res.status(201).json({
      success: true,
      message: `Import complete. Ingested ${records.length} records. Rejected ${errors.length} rows with errors.`,
      importedCount: records.length,
      errorCount: errors.length,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admissions/:id", async (req, res) => {
  try {
    const result = await neo4jService.deleteAdmission(req.params.id);
    await invalidatePatterns(["admissions_*", "rankings_*", "hotspots_*"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. WATER QUALITY REPORTS
app.get("/api/water-quality", async (req, res) => {
  await handleCachedGet(req, res, "water_reports", 900, () => neo4jService.getWaterReports());
});

app.get("/api/water-reports", async (req, res) => {
  await handleCachedGet(req, res, "water_reports", 900, () => neo4jService.getWaterReports());
});

app.post("/api/water-reports", async (req, res) => {
  try {
    const report = req.body;
    const coords = getCoordinatesForDistrict(report.district);
    
    if (!report.latitude || !report.longitude) {
      report.latitude = coords.lat;
      report.longitude = coords.lon;
    }
    const saved = await neo4jService.saveWaterQualityReport(report);
    await invalidatePatterns(["water_reports_*", "rankings_*", "hotspots_*"]);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/water-reports/:id", async (req, res) => {
  try {
    const result = await neo4jService.deleteWaterQualityReport(req.params.id);
    await invalidatePatterns(["water_reports_*", "rankings_*", "hotspots_*"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. WEATHER REPORTS (Compatible)
app.get("/api/weather", async (req, res) => {
  await handleCachedGet(req, res, "weather", 3600, async () => {
    const session = neo4jService.driver.session();
    try {
      const result = await session.run("MATCH (wp:WeatherPattern) RETURN wp LIMIT 100");
      return result.records.map(r => r.get("wp").properties);
    } finally {
      await session.close();
    }
  });
});

// 5. DISTRICTS REGISTRY (Compatible)
app.get("/api/districts", async (req, res) => {
  await handleCachedGet(req, res, "districts", 86400, async () => {
    return districtService.getDistricts();
  });
});

// 6. OUTBREAK PREDICTIONS
app.get("/api/predictions", async (req, res) => {
  await handleCachedGet(req, res, "predictions", 1800, () => neo4jService.getPredictions());
});

app.post("/api/predictions/trigger", async (req, res) => {
  try {
    console.log("Triggering dynamic ML prediction pipeline asynchronously in background worker thread...");
    // Offload prediction execution to worker thread (non-blocking)
    runJobInWorker("PredictionGeneration").catch((err) => {
      console.error("Background prediction job failed:", err.message);
    });
    
    // Invalidate predictions, alerts, hotspots, and rankings caches immediately
    await invalidatePatterns(["predictions_*", "alerts_*", "rankings_*", "hotspots_*"]);
    
    res.json({
      success: true,
      message: "Prediction execution triggered in background worker thread."
    });
  } catch (err) {
    console.error("Predictions trigger failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. ALERTS
app.get("/api/alerts", async (req, res) => {
  await handleCachedGet(req, res, "alerts", 300, () => neo4jService.getAlerts());
});

app.put("/api/alerts/:id", async (req, res) => {
  try {
    const updated = await neo4jService.updateAlert(req.params.id, req.body);
    await invalidatePatterns(["alerts_*"]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/alerts/:id", async (req, res) => {
  try {
    const result = await neo4jService.deleteAlert(req.params.id);
    await invalidatePatterns(["alerts_*"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. HOTSPOTS DETECTION ENDPOINT
app.get("/api/hotspots", async (req, res) => {
  await handleCachedGet(req, res, "hotspots", 600, () => neo4jService.getLatestHotspots());
});

// 9. NATIONAL RANKINGS ENDPOINT
app.get("/api/rankings", async (req, res) => {
  await handleCachedGet(req, res, "rankings", 600, () => neo4jService.getNationalRankings());
});

// 10. AI INTELLIGENCE BRIEFING ENDPOINTS
app.post("/api/briefing", async (req, res) => {
  try {
    const briefing = await intelligenceService.generateIntelligenceBriefing();
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/briefing", async (req, res) => {
  try {
    const briefing = await intelligenceService.generateIntelligenceBriefing();
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnostic endpoint: GET /api/debug/intelligence
app.get("/api/debug/intelligence", async (req, res) => {
  const session = neo4jService.driver.session();
  try {
    const dateRes = await session.run("MATCH (p:OutbreakPrediction) RETURN max(p.prediction_date) AS maxDate");
    const maxDate = dateRes.records[0]?.get("maxDate");
    
    let criticalCount = 0;
    let highCount = 0;
    let emergingCount = 0;
    
    if (maxDate) {
      const countsRes = await session.run(`
        MATCH (p:OutbreakPrediction {prediction_date: $maxDate})
        RETURN 
          sum(CASE WHEN p.risk_level = 'critical' THEN 1 ELSE 0 END) AS critical,
          sum(CASE WHEN p.risk_level = 'high' THEN 1 ELSE 0 END) AS high,
          sum(CASE WHEN p.hotspot_status = 'Emerging Hotspot' THEN 1 ELSE 0 END) AS emerging
      `, { maxDate });
      
      const record = countsRes.records[0];
      if (record) {
        criticalCount = record.get("critical").toNumber();
        highCount = record.get("high").toNumber();
        emergingCount = record.get("emerging").toNumber();
      }
    }

    const totalCountsRes = await session.run(`
      CALL { MATCH (p:OutbreakPrediction) RETURN count(p) AS preds }
      CALL { MATCH (a:Alert) RETURN count(a) AS alts }
      RETURN preds, alts
    `);
    const totalRecord = totalCountsRes.records[0];
    const predictionCount = totalRecord ? totalRecord.get("preds").toNumber() : 0;
    const alertCount = totalRecord ? totalRecord.get("alts").toNumber() : 0;

    // Check if briefing can be successfully generated
    const briefing = await intelligenceService.generateIntelligenceBriefing();
    const briefingGenerated = !!(briefing && briefing.headline && !briefing.headline.includes("Waiting for data ingestion"));

    res.json({
      prediction_count: predictionCount,
      alert_count: alertCount,
      critical_count: criticalCount,
      high_count: highCount,
      emerging_hotspots: emergingCount,
      briefing_generated: briefingGenerated
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /api/debug/firebase - Temporary diagnostic helper endpoint
app.get("/api/debug/firebase", async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(__dirname, "..", ".env");
    let projectId = "";
    let authDomain = "";
    
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const projIdMatch = content.match(/VITE_FIREBASE_PROJECT_ID\s*=\s*([^\s#\r\n]+)/);
      const authDomMatch = content.match(/VITE_FIREBASE_AUTH_DOMAIN\s*=\s*([^\s#\r\n]+)/);
      if (projIdMatch) {
        projectId = projIdMatch[1].trim().replace(/['\";]/g, "");
      }
      if (authDomMatch) {
        authDomain = authDomMatch[1].trim().replace(/['\";]/g, "");
      }
    }
    
    res.json({
      projectId,
      authDomain,
      enabledProviders: ["password", "google.com"]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEST DATABASE CONNECTION
app.get("/test", async (req, res) => {
  const session = neo4jService.driver.session();
  try {
    const result = await session.run(
      "RETURN 'AuraDB Connected Successfully' AS message"
    );
    res.json({
      success: true,
      message: result.records[0].get("message"),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  } finally {
    await session.close();
  }
});

// Startup initialization: districts dataset & borders setup, start cron schedulers
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await neo4jService.initConstraints();

  // Dynamic India District Master Seeding & Borders Graph calculation
  try {
    console.log("Initializing dynamic districts master catalog...");
    const districts = await districtService.loadDistricts();
    await neo4jService.saveDistrictsBatch(districts);
    
    // Mapborders (BORDERS adjacency graph setup)
    await neo4jService.createAdjacencyGraph(100);
    console.log("Master district registry successfully initialized in Neo4j.");
    
    // Startup validation logging of database node counts
    try {
      const metrics = await neo4jService.getSystemMetrics();
      console.log("==========================================");
      console.log("      AEGIS CORE TELEMETRY STATUS      ");
      console.log("==========================================");
      console.log(`- States count:          ${metrics.total_states}`);
      console.log(`- District count:        ${metrics.total_districts}`);
      console.log(`- Admissions count:      ${metrics.total_admissions}`);
      console.log(`- Predictions count:     ${metrics.total_predictions}`);
      console.log(`- Weather count:         ${metrics.total_weather}`);
      console.log(`- Water reports count:   ${metrics.total_water}`);
      console.log(`- Active high-risk districts: ${metrics.active_high_risk_districts}`);
      console.log(`- Last data refresh:     ${metrics.last_data_refresh || "N/A"}`);
      console.log("==========================================");
    } catch (err) {
      console.error("Startup validation telemetry checks failed:", err.message);
    }

    // Pre-warm the cache for heavy queries
    try {
      console.log("Pre-warming dashboard cache...");
      const startPrewarm = Date.now();
      
      const admissionsData = await neo4jService.getAdmissions();
      await cache.set("admissions_all_0____", admissionsData, 900);
      
      const waterData = await neo4jService.getWaterReports();
      await cache.set("water_reports", waterData, 900);
      
      const predData = await neo4jService.getPredictions();
      await cache.set("predictions", predData, 1800);
      
      const alertData = await neo4jService.getAlerts();
      await cache.set("alerts", alertData, 300);
      
      console.log(`Dashboard cache pre-warmed successfully in ${Date.now() - startPrewarm}ms.`);
    } catch (cacheErr) {
      console.warn("Dashboard cache pre-warming warning:", cacheErr.message);
    }
  } catch (err) {
    console.error("Failed to initialize master districts on startup:", err.message);
  }
  
  // Schedule background jobs using node-cron to spawn worker threads
  // Weather Ingestion: Hourly
  cron.schedule("0 * * * *", () => runJobInWorker("WeatherIngestion"));
  // Water Ingestion: Daily at 1:00 AM
  cron.schedule("0 1 * * *", () => runJobInWorker("WaterIngestion"));
  // Hospital Ingestion: Daily at 2:00 AM
  cron.schedule("0 2 * * *", () => runJobInWorker("HospitalIngestion"));
  // Prediction Generation: Hourly (30 mins offset from weather to ensure fresh inputs)
  cron.schedule("30 * * * *", () => runJobInWorker("PredictionGeneration"));
  // Alert Generation: Every 30 minutes
  cron.schedule("*/30 * * * *", () => runJobInWorker("AlertGeneration"));
  // District Synchronization: Daily at 3:00 AM
  cron.schedule("0 3 * * *", () => runJobInWorker("DistrictSync"));

  console.log("Background jobs scheduler started successfully using worker threads.");
});

module.exports = { app, server };