// Advanced 180-Day Historical Epidemiological Simulator and Seeder
const districtService = require("./districtService");
const weatherService = require("./weatherService");
const hospitalService = require("./hospitalService");
const waterStationService = require("./waterStationService");
const neo4jService = require("./neo4jService");
const { runPredictionPipeline, buildIsolationForest } = require("./mlPipeline");

const DISEASES = ["cholera", "typhoid", "dengue", "malaria"];

async function seedDatabase() {
  try {
    console.log("Starting production-grade 180-day dynamic seeding simulator...");
    
    // 1. Clear existing nodes
    await neo4jService.clearDatabase();
    await neo4jService.initConstraints();

    const allDistricts = await districtService.loadDistricts();
    console.log(`Loaded ${allDistricts.length} master districts dynamically.`);

    // Batch save all master districts to Neo4j
    await neo4jService.saveDistrictsBatch(allDistricts);
    console.log("Saved all master districts to Neo4j.");

    // Group districts by state and select 1-2 representative districts per state/UT
    const districtsByState = {};
    for (const dist of allDistricts) {
      if (!districtsByState[dist.state]) {
        districtsByState[dist.state] = [];
      }
      districtsByState[dist.state].push(dist);
    }

    const activeDistricts = [];
    for (const stateName of Object.keys(districtsByState)) {
      const stateDists = districtsByState[stateName];
      const countToPick = Math.min(2, stateDists.length);
      for (let i = 0; i < countToPick; i++) {
        activeDistricts.push(stateDists[i]);
      }
    }
    console.log(`Selected ${activeDistricts.length} active districts for historical simulation.`);

    const today = new Date();
    
    // Arrays to collect batch transactions
    let weatherBatch = [];
    let waterReportsBatch = [];
    let admissionsBatch = [];

    // Pre-discover hospitals and water stations for each active district (with caching)
    console.log("Resolving hospitals and water stations from OSM/Overpass for active districts...");
    const districtFacilities = {};
    for (const dist of activeDistricts) {
      // Discovers dynamically from OpenStreetMap or fallback names
      const hospitals = await hospitalService.discoverHospitals(dist.name, dist.latitude, dist.longitude, dist.state);
      const waterStations = await waterStationService.discoverWaterStations(dist.name, dist.latitude, dist.longitude, dist.state);
      
      districtFacilities[dist.name] = {
        hospitals,
        waterStations
      };
    }
    console.log("All active district facilities resolved.");

    // Loop through 180 days of simulation
    console.log("Simulating 180 days of historical epidemiological trends for active districts...");
    for (let dayOffset = 180; dayOffset >= 0; dayOffset--) {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOffset);
      const dateStr = date.toISOString().slice(0, 10);
      const month = date.getMonth();

      // Seasonality classification
      const isMonsoon = month >= 5 && month <= 8;
      const isSummer = month >= 2 && month <= 4;

      for (const dist of activeDistricts) {
        const facilities = districtFacilities[dist.name];
        
        // 1. SIMULATE WEATHER SNAPSHOT
        // Weather varies by state region and season
        let rainSum = 0.0;
        let humidity = 50;
        let tempMax = 28.0;

        if (isMonsoon) {
          // Monsoon rains: high precipitation and humidity
          rainSum = Math.random() > 0.4 ? parseFloat((15 + Math.random() * 35).toFixed(1)) : 0.0;
          humidity = Math.round(75 + Math.random() * 20);
          tempMax = parseFloat((26 + Math.random() * 5).toFixed(1));
        } else if (isSummer) {
          // Hot summer months, dry
          rainSum = Math.random() > 0.9 ? parseFloat((Math.random() * 5).toFixed(1)) : 0.0;
          humidity = Math.round(30 + Math.random() * 20);
          tempMax = parseFloat((35 + Math.random() * 7).toFixed(1));
        } else {
          // Moderate winter
          rainSum = Math.random() > 0.95 ? parseFloat((Math.random() * 3).toFixed(1)) : 0.0;
          humidity = Math.round(40 + Math.random() * 20);
          tempMax = parseFloat((18 + Math.random() * 7).toFixed(1));
        }

        weatherBatch.push({
          district: dist.name,
          state: dist.state,
          tempMax,
          tempMin: tempMax - 8.0,
          rainSum,
          humidity,
          wind: 10.0,
          date: dateStr
        });

        // 2. SIMULATE WATER CONTAMINATION OUTBREAKS (Localized Events)
        // Let's seed 3 separate water contamination outbreaks:
        // - Delhi NCR (New Delhi/Noida) experiences sewage runoff contamination in early Monsoon (dayOffset 120-115)
        // - Haryana (Gurugram) experiences peak summer pipe breakage/contamination (dayOffset 60-55)
        // - Varanasi (UP) experiences river flooding water pollution in late Monsoon (dayOffset 25-20)
        let isContaminated = false;
        let isCritical = false;

        if (dist.state === "Delhi NCR" && dayOffset >= 115 && dayOffset <= 120) {
          isContaminated = true;
          isCritical = Math.random() > 0.5;
        } else if (dist.name === "Gurugram" && dayOffset >= 55 && dayOffset <= 60) {
          isContaminated = true;
          isCritical = true;
        } else if (dist.name === "Varanasi" && dayOffset >= 20 && dayOffset <= 25) {
          isContaminated = true;
          isCritical = Math.random() > 0.3;
        }

        for (const ws of facilities.waterStations) {
          let ph_level = parseFloat((6.8 + Math.random() * 0.8).toFixed(1));
          let turbidity_ntu = parseFloat((0.5 + Math.random() * 1.5).toFixed(1));
          let coliform_count = Math.floor(5 + Math.random() * 25);
          let e_coli_count = 0;
          let dissolved_oxygen = parseFloat((6.5 + Math.random() * 1.5).toFixed(1));
          let chemical_contaminants = Math.floor(10 + Math.random() * 15);
          let status = "safe";

          if (isContaminated) {
            ph_level = isCritical ? 5.8 : 6.2;
            turbidity_ntu = isCritical ? 14.5 : 8.2;
            coliform_count = isCritical ? 950 : 380;
            e_coli_count = isCritical ? 120 : 35;
            dissolved_oxygen = isCritical ? 3.8 : 4.8;
            chemical_contaminants = isCritical ? 75 : 45;
            status = isCritical ? "critical" : "contaminated";
          } else if (isMonsoon && Math.random() > 0.8) {
            // General monsoon runoff warnings
            turbidity_ntu = 4.2;
            coliform_count = 85;
            status = "warning";
          }

          waterReportsBatch.push({
            station_name: ws.name,
            state: dist.state,
            district: dist.name,
            ph_level,
            turbidity_ntu,
            coliform_count,
            e_coli_count,
            dissolved_oxygen,
            chemical_contaminants,
            date_sampled: dateStr,
            latitude: ws.latitude,
            longitude: ws.longitude,
            status
          });
        }

        // 3. SIMULATE HOSPITAL ADMISSIONS WITH SEASONAL AND CONTAMINATION OUTBREAKS
        // Diseases: cholera, typhoid, dengue, malaria
        for (const hosp of facilities.hospitals) {
          for (const disease of DISEASES) {
            let cases = 0;
            let severity = "mild";

            // Baseline background cases
            if (Math.random() > 0.88) {
              cases = Math.floor(1 + Math.random() * 3);
            }

            // Waterborne spikes (Cholera, Typhoid) during local contamination events
            if (isContaminated && (disease === "cholera" || disease === "typhoid")) {
              const peakOffset = isCritical ? 10 : 5;
              cases += Math.floor(peakOffset + Math.random() * 12);
              severity = isCritical ? "critical" : "severe";
            }

            // Neighbor Spillovers (Delhi NCR contagions)
            // Noida/Ghaziabad/Faridabad cases rise after New Delhi contamination (days 114 to 110)
            if (dayOffset >= 110 && dayOffset <= 114 && (disease === "cholera" || disease === "typhoid")) {
              if (dist.name === "Noida" || dist.name === "Ghaziabad" || dist.name === "Faridabad") {
                cases += Math.floor(3 + Math.random() * 7);
                severity = "moderate";
              }
            }

            // Vectorborne spikes (Dengue, Malaria) during monsoon (lagged by 14 days)
            // Monsoon is month 5-8 (June-Sept), vector peaks late monsoon/post-monsoon (Aug-Oct)
            if ((month === 7 || month === 8 || month === 9) && (disease === "dengue" || disease === "malaria")) {
              cases += Math.floor(2 + Math.random() * 8);
              severity = cases > 6 ? "severe" : "moderate";
            }

            if (cases > 0) {
              admissionsBatch.push({
                hospital_name: hosp.name,
                state: dist.state,
                district: dist.name,
                disease,
                case_count: cases,
                severity,
                date_reported: dateStr,
                latitude: hosp.latitude,
                longitude: hosp.longitude,
                notes: `Admissions tracking for ${disease} caseloads.`
              });
            }
          }
        }
      }

      // Execute in database in chunks of 15 days of historical data to keep transactions clean
      if (dayOffset % 15 === 0 && dayOffset > 0) {
        console.log(`Writing batch chunk to Neo4j (Days remaining: ${dayOffset})...`);
        await neo4jService.saveWeatherPatternsBatch(weatherBatch);
        await neo4jService.saveWaterQualityReportsBatch(waterReportsBatch);
        await neo4jService.saveAdmissionsBatch(admissionsBatch);
        
        // Reset buffers
        weatherBatch = [];
        waterReportsBatch = [];
        admissionsBatch = [];
      }
    }

    // Flush remaining day entries
    if (weatherBatch.length > 0) {
      console.log("Writing final batches to Neo4j...");
      await neo4jService.saveWeatherPatternsBatch(weatherBatch);
      await neo4jService.saveWaterQualityReportsBatch(waterReportsBatch);
      await neo4jService.saveAdmissionsBatch(admissionsBatch);
    }

    console.log("Historical seeding completed successfully.");

    // 4. CREATE ADJACENCY GEOGRAPHIC NEIGHBOR MAP
    await neo4jService.createAdjacencyGraph();

    // 5. RUN PREDICTIONS FOR CURRENT DATE (Today)
    console.log("Executing ML forecasting engine to seed initial dashboard predictions...");
    const admissions = await neo4jService.getAdmissions();
    const waterReports = await neo4jService.getWaterReports();
    const todayStr = today.toISOString().slice(0, 10);
    const predictionsBatch = [];
    const alertsBatch = [];

    console.log("Pre-fitting Isolation Forest on simulation admissions data...");
    const prebuiltForest = buildIsolationForest(admissions, waterReports);

    for (const dist of activeDistricts) {
      // Get weather for today
      const weather = await weatherService.fetchWeatherForCoordinates(dist.latitude, dist.longitude);
      
      let weatherHistory = await neo4jService.getWeatherHistory(dist.name, 30);
      if (weatherHistory.length === 0) {
        weatherHistory = [weather];
      } else if (weatherHistory[0].date !== weather.date) {
        weatherHistory.unshift(weather);
      }

      for (const disease of DISEASES) {
        // Fetch rolling 14-day history for the district from graph
        const rollingHistory = await neo4jService.getRollingAverages(dist.name, disease, todayStr, 14);
        
        // Pad rolling history if empty
        while (rollingHistory.length < 14) {
          rollingHistory.push({ date: todayStr, cases: 0 });
        }
        
        // Fetch adjacent cases
        const neighborCases = await neo4jService.getNeighborOutbreakSum(dist.name, disease, todayStr);

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
          prebuiltForest
        );

        prediction.latitude = dist.latitude;
        prediction.longitude = dist.longitude;
        prediction.prediction_date = todayStr;
        predictionsBatch.push(prediction);

        if (alert) {
          alert.created_date = todayStr;
          alertsBatch.push(alert);
        }
      }
    }

    await neo4jService.savePredictionsBatch(predictionsBatch);
    if (alertsBatch.length > 0) {
      await neo4jService.saveAlertsBatch(alertsBatch);
    }
    
    console.log("Aegis simulation seeding fully completed.");
  } catch (err) {
    console.error("Simulation seeding failed:", err);
    throw err;
  }
}

module.exports = {
  seedDatabase
};

if (require.main === module) {
  seedDatabase()
    .then(async () => {
      console.log("Seeding script completed successfully.");
      await neo4jService.driver.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Seeding script crashed:", err);
      await neo4jService.driver.close();
      process.exit(1);
    });
}

