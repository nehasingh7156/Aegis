// Hospital Ingestion Adapter - Normalizes ABDM, NHA, and Open Health feeds into Aegis schemas
const { validateAdmission, validateHospital, logValidationFailure } = require("../validationPipeline");

/**
 * Normalizes an ABDM / NHA REST live patient admission event
 * @param {object} payload raw API payload
 * @returns {object|null} normalized and validated Admission object
 */
function normalizeABDMAdmission(payload) {
  if (!payload) return null;

  // Map NHA/ABDM keys to Aegis Admission schema
  const normalized = {
    hospital_name: payload.facility_name || payload.hospital || payload.facility || "",
    state: payload.state_name || payload.state || "",
    district: payload.district_name || payload.district || "",
    disease: (payload.diagnosed_disease || payload.disease || "").toLowerCase().trim(),
    case_count: payload.admitted_count !== undefined ? Number(payload.admitted_count) : Number(payload.cases || 0),
    severity: (payload.severity_code || payload.severity || "moderate").toLowerCase().trim(),
    date_reported: payload.report_timestamp ? payload.report_timestamp.slice(0, 10) : (payload.date || new Date().toISOString().slice(0, 10)),
    latitude: payload.latitude ? parseFloat(payload.latitude) : null,
    longitude: payload.longitude ? parseFloat(payload.longitude) : null,
    notes: payload.notes || payload.remarks || "ABDM Ingest Feed Event."
  };

  const valResult = validateAdmission(normalized);
  if (valResult.isValid) {
    return normalized;
  } else {
    logValidationFailure("admission_abdm", payload, valResult.error);
    return null;
  }
}

/**
 * Normalizes registry records to dynamic Hospital Nodes
 * @param {object} payload raw ABDM registry record
 */
function normalizeABDMRegistryHospital(payload) {
  if (!payload) return null;

  const normalized = {
    hospital_id: payload.facility_id || payload.hospital_id || `hosp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: payload.facility_name || payload.name || "",
    state: payload.state_name || payload.state || "",
    district: payload.district_name || payload.district || "",
    latitude: payload.latitude ? parseFloat(payload.latitude) : null,
    longitude: payload.longitude ? parseFloat(payload.longitude) : null,
    ownership_type: payload.ownership || payload.ownership_type || "public", // public / private / charitable
    bed_capacity: payload.bed_capacity ? parseInt(payload.bed_capacity, 10) : 50 // default size
  };

  const valResult = validateHospital(normalized);
  if (valResult.isValid) {
    return normalized;
  } else {
    logValidationFailure("hospital_registry", payload, valResult.error);
    return null;
  }
}

module.exports = {
  normalizeABDMAdmission,
  normalizeABDMRegistryHospital
};
