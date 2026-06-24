const cron = require("node-cron");
const districtService = require("../districtService");
const neo4jService = require("../neo4jService");

/**
 * Scan active outbreak predictions and generate alerts for spatial clusters (AlertGenerationJob)
 */
async function runAlertGeneration() {
  console.log("Running scheduled Alert Generation Job (AlertGenerationJob)...");
  try {
    const districts = districtService.getDistricts();
    const predictions = await neo4jService.getPredictions();
    const todayStr = new Date().toISOString().slice(0, 10);
    
    // Group predictions by district for today
    const activePredictions = predictions.filter(p => p.prediction_date === todayStr);
    
    const alertsToGenerate = [];
    
    for (const dist of districts) {
      const distPreds = activePredictions.filter(p => p.district.toLowerCase() === dist.name.toLowerCase());
      
      for (const pred of distPreds) {
        // Spatial Outbreak Cluster Check:
        // If this district is high risk and any neighbor is also medium/high risk, trigger a cluster advisory
        if (pred.risk_level === "high" || pred.risk_level === "critical") {
          const neighborsObj = districtService.getNearestNeighbors(dist.name, 100);
          
          let neighboringSpikeCount = 0;
          for (const nb of neighborsObj) {
            const nbPred = activePredictions.find(p => 
              p.district.toLowerCase() === nb.district.name.toLowerCase() && 
              p.disease === pred.disease
            );
            if (nbPred && (nbPred.risk_level === "high" || nbPred.risk_level === "critical")) {
              neighboringSpikeCount++;
            }
          }

          // Trigger a spatial alert if 2 or more neighbors are spiking
          if (neighboringSpikeCount >= 2) {
            alertsToGenerate.push({
              title: `SPATIAL CLUSTER: ${pred.disease.toUpperCase()} Outbreak Alert`,
              district: dist.name,
              state: dist.state,
              disease: pred.disease,
              severity: "critical",
              risk_level: pred.risk_level,
              message: `Spatial transmission cluster detected! ${dist.name} and ${neighboringSpikeCount} adjacent districts report critical transmission indicators for ${pred.disease}.`,
              status: "active",
              created_date: todayStr,
              created_at: new Date().toISOString(),
              prediction_date: todayStr
            });
          }
        }
      }
    }

    if (alertsToGenerate.length > 0) {
      console.log(`AlertGenerationJob triggered ${alertsToGenerate.length} spatial cluster alerts.`);
      await neo4jService.saveAlertsBatch(alertsToGenerate);
    } else {
      console.log("No spatial outbreak clusters detected.");
    }
  } catch (err) {
    console.error("Alert Generation Job failed:", err);
  }
}

// Schedule: Every 30 minutes
const task = cron.schedule("*/30 * * * *", runAlertGeneration, {
  scheduled: false
});

module.exports = {
  task,
  execute: runAlertGeneration
};
