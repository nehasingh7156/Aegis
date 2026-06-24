const { parentPort, workerData } = require("worker_threads");
const neo4jService = require("../neo4jService");

async function run() {
  const { jobName } = workerData;
  console.log(`[Worker Thread] Starting background job: ${jobName}`);
  
  if (jobName === "WeatherIngestion") {
    const weatherSyncJob = require("./weatherSyncJob");
    await weatherSyncJob.execute();
  } else if (jobName === "WaterIngestion") {
    const waterSyncJob = require("./waterSyncJob");
    await waterSyncJob.execute();
  } else if (jobName === "HospitalIngestion") {
    const hospitalSyncJob = require("./hospitalSyncJob");
    await hospitalSyncJob.execute();
  } else if (jobName === "PredictionGeneration") {
    const predictionJob = require("./predictionJob");
    await predictionJob.execute();
  } else if (jobName === "AlertGeneration") {
    const alertGenerationJob = require("./alertGenerationJob");
    await alertGenerationJob.execute();
  } else if (jobName === "DistrictSync") {
    const districtService = require("../districtService");
    const districts = await districtService.loadDistricts();
    await neo4jService.saveDistrictsBatch(districts);
    await neo4jService.createAdjacencyGraph(100);
  } else {
    throw new Error(`Unknown job name: ${jobName}`);
  }
}

run()
  .then(() => {
    console.log(`[Worker Thread] Background job '${workerData.jobName}' completed successfully.`);
    if (parentPort) {
      parentPort.postMessage({ success: true });
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[Worker Thread] Background job '${workerData.jobName}' failed:`, err);
    if (parentPort) {
      parentPort.postMessage({ success: false, error: err.message });
    }
    process.exit(1);
  });
