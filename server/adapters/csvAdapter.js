// CSV Ingestion Adapter - Parses and normalizes CSV data streams
const { validateAdmission, logValidationFailure } = require("../validationPipeline");

/**
 * Parses a CSV string into Admission objects
 * Handles mapping header names case-insensitively and removing quotes/whitespaces
 * @param {string} csvContent 
 * @returns {Array<object>} array of parsed and validated records
 */
function parseCSV(csvContent) {
  if (!csvContent || typeof csvContent !== "string") {
    return [];
  }

  const lines = csvContent.split(/\r?\n/);
  if (lines.length < 2) {
    return [];
  }

  // Parse header
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim().replace(/['"_\s]/g, ""));
  
  const parsedRecords = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const record = {};

    headers.forEach((header, index) => {
      // Map common CSV header names to model properties
      let key = header;
      if (header === "hospital" || header === "hospitalname") key = "hospital_name";
      if (header === "casecount" || header === "cases") key = "case_count";
      if (header === "datereported" || header === "date") key = "date_reported";
      if (header === "lat") key = "latitude";
      if (header === "lon" || header === "lng") key = "longitude";

      let val = values[index] !== undefined ? values[index].trim() : "";
      
      // Convert types
      if (key === "case_count") {
        record[key] = val ? parseInt(val, 10) : 0;
      } else if (key === "latitude" || key === "longitude") {
        record[key] = val ? parseFloat(val) : null;
      } else {
        record[key] = val;
      }
    });

    // Validate the parsed record
    const valResult = validateAdmission(record);
    if (valResult.isValid) {
      parsedRecords.push(record);
    } else {
      errors.push({ line: i + 1, record, error: valResult.error });
      logValidationFailure("admission_csv", record, `CSV Line ${i + 1}: ${valResult.error}`);
    }
  }

  return {
    records: parsedRecords,
    errors
  };
}

/**
 * Helper to parse a single CSV line, handling comma splits inside quotes
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""));
  return result;
}

module.exports = {
  parseCSV
};
