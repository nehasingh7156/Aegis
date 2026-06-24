// Validation Pipeline - Production-Grade Data Quality Controls
const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "validation_logs.json");

// Bounding box for India
const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 38.0,
  minLon: 68.0,
  maxLon: 98.0
};

// Valid diseases list
const VALID_DISEASES = ["cholera", "typhoid", "dengue", "malaria", "dysentery", "hepatitis_a", "leptospirosis"];

// Valid severities list
const VALID_SEVERITIES = ["mild", "moderate", "severe", "critical"];

/**
 * Log validation failure to local validation_logs.json file
 */
function logValidationFailure(entityType, data, reason) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    entityType,
    rejectedData: data,
    reason
  };

  try {
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      const fileContent = fs.readFileSync(LOG_FILE, "utf8");
      if (fileContent.trim()) {
        logs = JSON.parse(fileContent);
      }
    }
    logs.push(logEntry);
    // Keep last 1000 logs
    if (logs.length > 1000) logs.shift();
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write to validation log:", err.message);
  }
}

/**
 * Validate date is not in the future and conforms to YYYY-MM-DD
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return false;

  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return false;

  const inputDate = new Date(dateStr);
  const today = new Date();
  today.setHours(23, 59, 59, 999); // allow today

  return inputDate <= today;
}

/**
 * Validate coordinates fit inside India boundary box
 */
function isValidCoordinates(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return true; // Autocomplete will handle missing values
  }
  const l = parseFloat(lat);
  const n = parseFloat(lon);
  if (isNaN(l) || isNaN(n)) return false;
  return l >= INDIA_BOUNDS.minLat && l <= INDIA_BOUNDS.maxLat && n >= INDIA_BOUNDS.minLon && n <= INDIA_BOUNDS.maxLon;
}

/**
 * Validate Admission Record
 * @param {object} record 
 * @returns {object} { isValid: boolean, error: string }
 */
function validateAdmission(record) {
  if (!record) return { isValid: false, error: "Empty record" };

  if (!record.hospital_name || typeof record.hospital_name !== "string" || !record.hospital_name.trim()) {
    return { isValid: false, error: "Missing or invalid hospital_name" };
  }
  if (!record.state || typeof record.state !== "string" || !record.state.trim()) {
    return { isValid: false, error: "Missing or invalid state" };
  }
  if (!record.district || typeof record.district !== "string" || !record.district.trim()) {
    return { isValid: false, error: "Missing or invalid district" };
  }

  const disease = record.disease ? record.disease.toLowerCase().trim() : "";
  if (!VALID_DISEASES.includes(disease)) {
    return { isValid: false, error: `Invalid disease: ${record.disease}. Valid options: ${VALID_DISEASES.join(", ")}` };
  }

  const case_count = Number(record.case_count);
  if (isNaN(case_count) || !Number.isInteger(case_count) || case_count < 0) {
    return { isValid: false, error: `Invalid case_count: ${record.case_count}. Must be non-negative integer.` };
  }

  if (record.severity) {
    const sev = record.severity.toLowerCase().trim();
    if (!VALID_SEVERITIES.includes(sev)) {
      return { isValid: false, error: `Invalid severity: ${record.severity}. Valid: ${VALID_SEVERITIES.join(", ")}` };
    }
  }

  if (!isValidDate(record.date_reported)) {
    return { isValid: false, error: `Invalid date_reported: ${record.date_reported}. Date must be YYYY-MM-DD and not in the future.` };
  }

  if (!isValidCoordinates(record.latitude, record.longitude)) {
    return { isValid: false, error: `Coordinates outside India bounds: Lat ${record.latitude}, Lon ${record.longitude}` };
  }

  return { isValid: true };
}

/**
 * Validate Water Quality Report Record
 */
function validateWaterReport(record) {
  if (!record) return { isValid: false, error: "Empty record" };

  if (!record.station_name || typeof record.station_name !== "string" || !record.station_name.trim()) {
    return { isValid: false, error: "Missing or invalid station_name" };
  }
  if (!record.state || typeof record.state !== "string" || !record.state.trim()) {
    return { isValid: false, error: "Missing or invalid state" };
  }
  if (!record.district || typeof record.district !== "string" || !record.district.trim()) {
    return { isValid: false, error: "Missing or invalid district" };
  }

  if (record.ph_level !== undefined && record.ph_level !== null) {
    const ph = parseFloat(record.ph_level);
    if (isNaN(ph) || ph < 0.0 || ph > 14.0) {
      return { isValid: false, error: `Invalid pH level: ${record.ph_level}. Must be between 0.0 and 14.0.` };
    }
  }

  if (record.turbidity_ntu !== undefined && record.turbidity_ntu !== null) {
    const turb = parseFloat(record.turbidity_ntu);
    if (isNaN(turb) || turb < 0.0) {
      return { isValid: false, error: `Invalid turbidity: ${record.turbidity_ntu}. Must be non-negative.` };
    }
  }

  if (record.coliform_count !== undefined && record.coliform_count !== null) {
    const col = Number(record.coliform_count);
    if (isNaN(col) || col < 0) {
      return { isValid: false, error: `Invalid coliform count: ${record.coliform_count}. Must be non-negative.` };
    }
  }

  if (record.e_coli_count !== undefined && record.e_coli_count !== null) {
    const eco = Number(record.e_coli_count);
    if (isNaN(eco) || eco < 0) {
      return { isValid: false, error: `Invalid e_coli count: ${record.e_coli_count}. Must be non-negative.` };
    }
  }

  if (!isValidDate(record.date_sampled)) {
    return { isValid: false, error: `Invalid date_sampled: ${record.date_sampled}. Date must be YYYY-MM-DD and not in the future.` };
  }

  if (!isValidCoordinates(record.latitude, record.longitude)) {
    return { isValid: false, error: `Coordinates outside India bounds: Lat ${record.latitude}, Lon ${record.longitude}` };
  }

  return { isValid: true };
}

/**
 * Validate Hospital Registration Record
 */
function validateHospital(record) {
  if (!record) return { isValid: false, error: "Empty record" };

  if (!record.hospital_id || typeof record.hospital_id !== "string" || !record.hospital_id.trim()) {
    return { isValid: false, error: "Missing or invalid hospital_id" };
  }
  if (!record.name || typeof record.name !== "string" || !record.name.trim()) {
    return { isValid: false, error: "Missing or invalid name" };
  }
  if (!record.state || typeof record.state !== "string" || !record.state.trim()) {
    return { isValid: false, error: "Missing or invalid state" };
  }
  if (!record.district || typeof record.district !== "string" || !record.district.trim()) {
    return { isValid: false, error: "Missing or invalid district" };
  }

  if (record.bed_capacity !== undefined && record.bed_capacity !== null) {
    const beds = Number(record.bed_capacity);
    if (isNaN(beds) || beds < 0) {
      return { isValid: false, error: `Invalid bed_capacity: ${record.bed_capacity}. Must be non-negative.` };
    }
  }

  if (!isValidCoordinates(record.latitude, record.longitude)) {
    return { isValid: false, error: `Coordinates outside India bounds: Lat ${record.latitude}, Lon ${record.longitude}` };
  }

  return { isValid: true };
}

module.exports = {
  validateAdmission,
  validateWaterReport,
  validateHospital,
  logValidationFailure,
  LOG_FILE
};
