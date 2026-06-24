// ML Pipeline verification script
const { runPredictionPipeline } = require("./mlPipeline");

// Mock Data
const mockAdmissions = [
  { hospital_name: "AIIMS", state: "Delhi NCR", district: "New Delhi", disease: "cholera", case_count: 5, date_reported: "2026-06-01" },
  { hospital_name: "AIIMS", state: "Delhi NCR", district: "New Delhi", disease: "cholera", case_count: 12, date_reported: "2026-06-05" },
  { hospital_name: "AIIMS", state: "Delhi NCR", district: "New Delhi", disease: "cholera", case_count: 24, date_reported: "2026-06-10" }
];

const mockWaterReports = [
  { station_name: "Wazirabad", state: "Delhi NCR", district: "New Delhi", ph_level: 6.2, turbidity_ntu: 15.0, coliform_count: 800, e_coli_count: 85, dissolved_oxygen: 4.5, chemical_contaminants: 45, date_sampled: "2026-06-10", status: "contaminated" }
];

const mockWeather = {
  tempMax: 30.5,
  tempMin: 23.0,
  rainSum: 48.2, // monsoon rain event
  humidity: 88.0,
  date: "2026-06-12"
};

console.log("Starting ML Pipeline Verification...");

try {
  const result = runPredictionPipeline(
    mockAdmissions,
    mockWaterReports,
    mockWeather,
    "New Delhi",
    "Delhi NCR",
    "cholera"
  );
  
  console.log("Prediction Result:", JSON.stringify(result.prediction, null, 2));
  console.log("Alert Generated:", JSON.stringify(result.alert, null, 2));
  
  if (result.prediction && typeof result.prediction.anomaly_score === 'number') {
    console.log("SUCCESS: ML Pipeline verified successfully.");
  } else {
    throw new Error("Invalid output format from pipeline");
  }
} catch (err) {
  console.error("FAILURE: ML Pipeline verification failed:", err);
  process.exit(1);
}
