const cron = require("node-cron");
const districtService = require("../districtService");
const hospitalService = require("../hospitalService");
const neo4jService = require("../neo4jService");
const { normalizeABDMRegistryHospital } = require("../adapters/hospitalAdapter");

/**
 * Sync hospital registry entries across all active districts
 */
async function runHospitalSync() {
  console.log("Running scheduled Hospital Registry Ingestion Sync Job (HospitalSyncJob)...");
  try {
    const districts = districtService.getDistricts();
    let syncCount = 0;
    
    for (const dist of districts) {
      try {
        const rawHospitals = await hospitalService.discoverHospitals(dist.name, dist.latitude, dist.longitude, dist.state);
        
        const normalizedList = [];
        for (const hosp of rawHospitals) {
          const norm = normalizeABDMRegistryHospital({
            facility_id: hosp.hospital_id || `hosp_sync_${dist.name.toLowerCase()}_${hosp.name.toLowerCase().replace(/\s+/g, '_')}`,
            facility_name: hosp.name,
            state_name: dist.state,
            district_name: dist.name,
            latitude: hosp.latitude,
            longitude: hosp.longitude,
            ownership: hosp.ownership_type || (Math.random() > 0.4 ? "public" : "private"),
            bed_capacity: hosp.bed_capacity || (50 + Math.floor(Math.random() * 450))
          });
          
          if (norm) {
            normalizedList.push(norm);
          }
        }

        if (normalizedList.length > 0) {
          await neo4jService.saveHospitalsBatch(normalizedList);
          syncCount += normalizedList.length;
        }
      } catch (distErr) {
        console.error(`Hospital sync failed for district ${dist.name}:`, distErr.message);
      }
    }
    
    console.log(`Hospital Sync Job complete. Synced ${syncCount} hospitals across India.`);
  } catch (err) {
    console.error("Hospital Registry Sync Job crashed:", err);
  }
}

// Schedule: Daily at 2:00 AM
const task = cron.schedule("0 2 * * *", runHospitalSync, {
  scheduled: false
});

module.exports = {
  task,
  execute: runHospitalSync
};
