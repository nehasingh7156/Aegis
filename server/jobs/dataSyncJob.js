const cron = require("node-cron");

const { getAllDistricts } = require("../apis/geoService");
const { getWeather } = require("../apis/weatherService");

function startDataSyncJob() {
  cron.schedule("0 * * * *", async () => {
    console.log("Running Aegis Data Sync");

    const districts = getAllDistricts();

    for (const district of districts) {
      try {
        const weather = await getWeather(
          district.lat,
          district.lon
        );

        console.log(
          district.district,
          weather?.daily?.rain_sum?.[0]
        );
      } catch (err) {
        console.error(err);
      }
    }
  });

  console.log("Data Sync Job Started");
}

module.exports = {
  startDataSyncJob,
};