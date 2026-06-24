const cron = require("node-cron");
const districtService = require("../districtService");
const weatherService = require("../weatherService");
const neo4jService = require("../neo4jService");

/**
 * Execute weather synchronization task every 3 hours (WeatherIngestionJob)
 */
async function runWeatherIngestion() {
  console.log("Running scheduled Weather Ingestion Job (WeatherIngestionJob)...");
  
  // Load districts
  await districtService.loadDistricts();
  const districts = districtService.getDistricts();
  const dateStr = new Date().toISOString().slice(0, 10);
  
  const weatherBatch = [];
  for (const dist of districts) {
    try {
      // Pass state parameter to assist fallback mapping if open-meteo fails
      const weather = await weatherService.fetchWeatherForCoordinates(dist.latitude, dist.longitude, dist.state);
      weatherBatch.push({
        district: dist.name,
        state: dist.state,
        tempMax: weather.tempMax,
        tempMin: weather.tempMin,
        temperature: weather.temperature !== undefined ? weather.temperature : weather.tempMax,
        rainSum: weather.rainSum,
        humidity: weather.humidity,
        wind: weather.wind || weather.windspeed || 10.0,
        date: dateStr,
        source: weather.source,
        observation_timestamp: weather.observation_timestamp,
        data_age: weather.data_age
      });
    } catch (err) {
      console.error(`Failed to resolve weather data for ${dist.name}:`, err.message);
    }
  }

  if (weatherBatch.length > 0) {
    try {
      await neo4jService.saveWeatherPatternsBatch(weatherBatch);
      console.log(`Weather Ingestion Job complete. Batched and saved weather patterns for ${weatherBatch.length} districts.`);
    } catch (dbErr) {
      console.error("Failed to commit weather patterns batch write:", dbErr.message);
    }
  } else {
    console.log("No weather data was successfully fetched. Skipping database write.");
  }
}

// Schedule: Every 3 hours
const task = cron.schedule("0 */3 * * *", runWeatherIngestion, {
  scheduled: false
});

module.exports = {
  task,
  execute: runWeatherIngestion
};
