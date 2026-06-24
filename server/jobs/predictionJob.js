const cron = require("node-cron");
const districtService = require("../districtService");
const weatherService = require("../weatherService");
const neo4jService = require("../neo4jService");
const { runPredictionPipeline, buildIsolationForest } = require("../mlPipeline");

const DISEASES = ["cholera", "typhoid", "dengue", "malaria"];

/**
 * Execute hourly outbreak predictions (PredictionJob)
 */
async function runPredictionJob() {
  console.log("Running scheduled hourly Outbreak Prediction Job (PredictionJob)...");
  try {
    const admissions = await neo4jService.getAdmissions();
    const waterReports = await neo4jService.getWaterReports();
    const borders = await neo4jService.getAllBorders();
    const recentPredictions = await neo4jService.getPredictions();
    const todayStr = new Date().toISOString().slice(0, 10);
    
    // Identify active districts with telemetry activity to focus compute resources
    const activeDistKeys = new Set();
    admissions.forEach(a => activeDistKeys.add(a.district.toLowerCase()));
    waterReports.forEach(w => activeDistKeys.add(w.district.toLowerCase()));

    await districtService.loadDistricts();
    const districts = districtService.getDistricts().filter(d => 
      activeDistKeys.has(d.name.toLowerCase())
    );

    if (districts.length === 0) {
      console.log("No active districts with admissions or water data found. Skipping prediction run.");
      return;
    }

    console.log(`Pre-fitting Isolation Forest on admissions dataset (Active Districts: ${districts.length})...`);
    const prebuiltForest = buildIsolationForest(admissions, waterReports);
    
    // 1. Build in-memory index for admissions: key = "district_disease", value = Map of {date: sum(cases)}
    const admissionsMap = new Map();
    for (const adm of admissions) {
      const key = `${adm.district.toLowerCase()}_${adm.disease.toLowerCase()}`;
      if (!admissionsMap.has(key)) {
        admissionsMap.set(key, new Map());
      }
      const dateMap = admissionsMap.get(key);
      dateMap.set(adm.date_reported, (dateMap.get(adm.date_reported) || 0) + Number(adm.case_count));
    }

    // 2. Build in-memory index for neighbor adjacency borders: key = district, value = Set of neighboring district names
    const neighborsMap = new Map();
    for (const b of borders) {
      const d1 = b.d1.toLowerCase();
      const d2 = b.d2.toLowerCase();
      if (!neighborsMap.has(d1)) neighborsMap.set(d1, new Set());
      if (!neighborsMap.has(d2)) neighborsMap.set(d2, new Set());
      neighborsMap.get(d1).add(b.d2); // Keep original case for matches
      neighborsMap.get(d2).add(b.d1);
    }

    // 3. Build in-memory index for recent predictions: key = "district_disease", value = prediction object
    const predictionsMap = new Map();
    for (const pred of recentPredictions) {
      const key = `${pred.district.toLowerCase()}_${pred.disease.toLowerCase()}`;
      if (!predictionsMap.has(key)) {
        predictionsMap.set(key, pred);
      }
    }

    const predictionsBatch = [];
    const alertsBatch = [];
    let successCount = 0;

    for (const dist of districts) {
      try {
        const weather = await weatherService.fetchWeatherForCoordinates(dist.latitude, dist.longitude);
        const distLower = dist.name.toLowerCase();

        let weatherHistory = await neo4jService.getWeatherHistory(dist.name, 30);
        if (weatherHistory.length === 0) {
          weatherHistory = [weather];
        } else if (weatherHistory[0].date !== weather.date) {
          weatherHistory.unshift(weather);
        }

        // Count unique hospital names for each district from the admissions list
        const distAdmissions = admissions.filter(a => a.district.toLowerCase() === distLower);
        const uniqueHospitals = new Set(distAdmissions.map(a => a.hospital_name.toLowerCase()));
        const hospitalCount = uniqueHospitals.size || 2; // Default fallback to 2

        for (const disease of DISEASES) {
          const diseaseLower = disease.toLowerCase();
          const key = `${distLower}_${diseaseLower}`;
          const dateMap = admissionsMap.get(key);

          // Calculate 14-day rolling averages in memory (O(1) lookups)
          const rollingHistory = [];
          for (let i = 0; i < 14; i++) {
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() - i);
            const lookupDate = dateObj.toISOString().slice(0, 10);
            const cases = dateMap ? (dateMap.get(lookupDate) || 0) : 0;
            rollingHistory.push({ date: lookupDate, cases });
          }

          // Calculate neighbor outbreak sum in memory
          let neighborCases = 0;
          let neighborRiskCount = 0;
          let neighborRisingIncidenceCount = 0;
          const neighbors = neighborsMap.get(distLower);
          if (neighbors) {
            for (const neighborName of neighbors) {
              const neighborNameLower = neighborName.toLowerCase();
              const neighborKey = `${neighborNameLower}_${diseaseLower}`;
              
              const neighborDateMap = admissionsMap.get(neighborKey);
              if (neighborDateMap) {
                neighborCases += neighborDateMap.get(todayStr) || 0;
              }

              // Risk levels and growth lookup
              const neighborPred = predictionsMap.get(neighborKey);
              if (neighborPred) {
                if (neighborPred.risk_level === "high" || neighborPred.risk_level === "critical") {
                  neighborRiskCount++;
                }
                const isGrowing = neighborPred.hotspot_status === "Growing Hotspot" || 
                                  neighborPred.hotspot_status === "Critical Hotspot" || 
                                  (neighborPred.forecast_48h > neighborPred.forecast_24h * 1.1);
                if (isGrowing) {
                  neighborRisingIncidenceCount++;
                }
              }
            }
          }

          const { prediction, alert } = runPredictionPipeline(
            admissions,
            waterReports,
            weatherHistory,
            rollingHistory,
            neighborCases,
            dist.name,
            dist.state,
            disease,
            dist.population,
            dist.population_density || 400,
            prebuiltForest,
            neighborRiskCount,
            neighborRisingIncidenceCount,
            hospitalCount
          );

          prediction.latitude = dist.latitude;
          prediction.longitude = dist.longitude;
          prediction.prediction_date = todayStr;
          predictionsBatch.push(prediction);

          if (alert) {
            alert.created_date = todayStr;
            alert.prediction_date = todayStr;
            alert.risk_level = alert.risk_level || prediction.risk_level;
            alertsBatch.push(alert);
          }
        }
        successCount++;
      } catch (err) {
        console.error(`Prediction pipeline failed for ${dist.name}:`, err.message);
      }
    }

    // Save outputs in batch
    if (predictionsBatch.length > 0) {
      await neo4jService.savePredictionsBatch(predictionsBatch);
    }
    if (alertsBatch.length > 0) {
      await neo4jService.saveAlertsBatch(alertsBatch);
    }
    
    console.log(`Prediction Job complete. Generated predictions for ${successCount}/${districts.length} active districts.`);
  } catch (err) {
    console.error("Outbreak Prediction Job failed:", err);
  }
}

// Schedule: Hourly (every 1 hour)
const task = cron.schedule("0 * * * *", runPredictionJob, {
  scheduled: false
});

module.exports = {
  task,
  execute: runPredictionJob
};