const axios = require("axios");

const coordinateCache = {};

async function getCoordinatesForDistrict(
  districtName,
  stateName
) {
  try {

    const cacheKey =
      `${districtName}_${stateName}`;

    if (coordinateCache[cacheKey]) {
      return coordinateCache[cacheKey];
    }

    // Search only by district name
    const query = districtName;

    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

    console.log("Geo Query:", query);
    console.log("Geo URL:", url);

    const response = await axios.get(url);

    console.log(
      "Geo API Response:",
      JSON.stringify(response.data)
    );

    if (
      response.data.results &&
      response.data.results.length > 0
    ) {

      // Prefer Indian result
      const result =
        response.data.results.find(
          r => r.country_code === "IN"
        ) || response.data.results[0];

      const coords = {
        lat: result.latitude,
        lon: result.longitude
      };

      coordinateCache[cacheKey] = coords;

      return coords;
    }

    throw new Error("Location not found");

  } catch (err) {

    console.error(
      `Geo lookup failed for ${districtName}:`,
      err.message
    );

    return {
      lat: 28.6139,
      lon: 77.2090
    };
  }
}

module.exports = {
  getCoordinatesForDistrict
};