const axios = require("axios");

async function fetchWeatherData(lat, lon) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,rain_sum` +
      `&hourly=relative_humidity_2m,wind_speed_10m` +
      `&forecast_days=1` +
      `&timezone=Asia/Kolkata`;

    const response = await axios.get(url);

    const humidityValues =
      response.data.hourly?.relative_humidity_2m || [];

    const windValues =
      response.data.hourly?.wind_speed_10m || [];

    const maxHumidity =
      humidityValues.length > 0
        ? Math.max(...humidityValues)
        : 60;

    const maxWind =
      windValues.length > 0
        ? Math.max(...windValues)
        : 10;

    return {
      tempMax: response.data.daily.temperature_2m_max[0],
      tempMin: response.data.daily.temperature_2m_min[0],
      rainSum: response.data.daily.rain_sum[0],
      humidity: maxHumidity,
      wind: maxWind,
      date: response.data.daily.time[0]
    };

  } catch (err) {
    console.error("Weather API Error:", err.message);

    return {
      tempMax: 30,
      tempMin: 22,
      rainSum: 0,
      humidity: 60,
      wind: 10,
      date: new Date().toISOString().slice(0, 10)
    };
  }
}

module.exports = {
  fetchWeatherData
};