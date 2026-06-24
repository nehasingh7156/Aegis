import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Activity } from "lucide-react";
import "leaflet/dist/leaflet.css";

const riskColorMap = { low: "#22c55e", medium: "#0ea5e9", high: "#f59e0b", critical: "#ef4444" };
const statusColorMap = { safe: "#22c55e", warning: "#f59e0b", contaminated: "#ef4444", critical: "#dc2626" };

const INDIA_CENTER = [22.5, 79];
const STATE_CENTERS = {
  Maharashtra: [19.5, 76], Kerala: [10.5, 76.5], "West Bengal": [23, 87.5],
  "Tamil Nadu": [11, 78.5], "Uttar Pradesh": [27, 80.5], Bihar: [25.5, 85.5],
  Karnataka: [14.5, 76], Gujarat: [22.5, 71.5], Rajasthan: [27, 74],
  Delhi: [28.6, 77.2], Odisha: [20.5, 85], Assam: [26, 93],
};

export default function HotspotMap() {
  const [showPredictions, setShowPredictions] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showWater, setShowWater] = useState(true);

  const { data: admissions = [] } = useQuery({
    queryKey: ["admissions"],
    queryFn: async () => {
      const res = await fetch("/api/admissions");
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
    initialData: [],
  });

  const { data: waterReports = [] } = useQuery({
    queryKey: ["water-reports"],
    queryFn: async () => {
      const res = await fetch("/api/water-reports");
      if (!res.ok) throw new Error("Failed to fetch water reports");
      return res.json();
    },
    initialData: [],
  });

  const { data: predictions = [] } = useQuery({
    queryKey: ["predictions"],
    queryFn: async () => {
      const res = await fetch("/api/predictions");
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    initialData: [],
  });

  const hospitalMarkers = useMemo(() => {
    const map = new Map();
    admissions.forEach((a) => {
      if (!a.latitude || !a.longitude || !a.hospital_name) return;
      const key = `${a.latitude.toFixed(5)}_${a.longitude.toFixed(5)}_${a.disease.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          id: a.id,
          hospital_name: a.hospital_name,
          state: a.state,
          district: a.district,
          disease: a.disease,
          case_count: 0,
          severity: a.severity,
          latitude: a.latitude,
          longitude: a.longitude,
          notes: a.notes
        });
      }
      const existing = map.get(key);
      existing.case_count += a.case_count || 1;
      const ranks = { mild: 1, moderate: 2, severe: 3, critical: 4 };
      if (ranks[a.severity] > ranks[existing.severity]) {
        existing.severity = a.severity;
      }
    });
    return Array.from(map.values());
  }, [admissions]);

  const waterMarkers = useMemo(() => waterReports.filter((w) => w.latitude && w.longitude), [waterReports]);
  const predictionMarkers = useMemo(() => predictions.filter((p) => p.latitude && p.longitude), [predictions]);

  const totalMarkers = (showHospitals ? hospitalMarkers.length : 0) + (showWater ? waterMarkers.length : 0) + (showPredictions ? predictionMarkers.length : 0);

  // State-level risk aggregation
  const stateRisk = useMemo(() => {
    const map = {};
    predictions.forEach((p) => {
      const s = p.state || "Unknown";
      if (!map[s]) map[s] = { state: s, critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      map[s][p.risk_level] = (map[s][p.risk_level] || 0) + 1;
      map[s].total++;
    });
    return Object.values(map);
  }, [predictions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">India Intelligence Map</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time epidemiological surveillance across Indian states and districts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant={showHospitals ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => setShowHospitals(!showHospitals)}>
            <div className="w-2 h-2 rounded-full bg-sky-400" /> Hospitals
          </Button>
          <Button size="sm" variant={showWater ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => setShowWater(!showWater)}>
            <div className="w-2 h-2 rounded-full bg-amber-400" /> Water
          </Button>
          <Button size="sm" variant={showPredictions ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => setShowPredictions(!showPredictions)}>
            <div className="w-2 h-2 rounded-full bg-red-400" style={{ boxShadow: "0 0 6px #ef4444" }} /> Risk Zones
          </Button>
        </div>
      </div>

      {totalMarkers === 0 ? (
        <div className="rounded-xl border border-border bg-card p-16 text-center">
          <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No geo-tagged data available for India.</p>
          <p className="text-xs text-muted-foreground mt-1">Add latitude/longitude when creating hospital admission or water quality reports.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
          <MapContainer center={INDIA_CENTER} zoom={5} minZoom={4} maxZoom={12} style={{ height: "100%", width: "100%" }} className="z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {/* Prediction risk zones with pulse animation */}
            {showPredictions && predictionMarkers.map((p) => (
              <PulsingRiskZone key={`p-${p.id}`} prediction={p} />
            ))}

            {/* Hospital markers */}
            {showHospitals && hospitalMarkers.map((a) => (
              <CircleMarker
                key={`h-${a.id}`}
                center={[a.latitude, a.longitude]}
                radius={Math.max(5, Math.min(16, (a.case_count || 1) * 1.5))}
                fillColor="#0ea5e9" color="#0ea5e9" fillOpacity={0.4} weight={1.5}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[140px]">
                    <p className="font-bold text-sm">{a.hospital_name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{a.state}</Badge>
                      <span className="text-muted-foreground">{a.district}</span>
                    </div>
                    <p className="capitalize">{a.disease?.replace(/_/g, " ")} · {a.case_count} cases</p>
                    <p className="text-muted-foreground">Severity: {a.severity}</p>
                    {a.notes && <p className="text-[10px] text-muted-foreground italic">{a.notes}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Water station markers */}
            {showWater && waterMarkers.map((w) => (
              <CircleMarker
                key={`w-${w.id}`}
                center={[w.latitude, w.longitude]}
                radius={7}
                fillColor={statusColorMap[w.status] || "#888"}
                color={statusColorMap[w.status] || "#888"}
                fillOpacity={0.5} weight={1.5}
              >
                <Popup>
                  <div className="text-xs space-y-1.5 min-w-[140px]">
                    <p className="font-bold text-sm">{w.station_name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{w.state}</Badge>
                      <span className="text-muted-foreground">{w.district}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <span>pH: {w.ph_level}</span>
                      <span>Turbidity: {w.turbidity_ntu} NTU</span>
                      <span>Coliform: {w.coliform_count}</span>
                      <span>E. coli: {w.e_coli_count}</span>
                      <span>DO: {w.dissolved_oxygen} mg/L</span>
                      <span>Chem: {w.chemical_contaminants}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize" style={{ borderColor: statusColorMap[w.status], color: statusColorMap[w.status] }}>
                      {w.status}
                    </Badge>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* State Risk Summary */}
      {stateRisk.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            State-Level Risk Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stateRisk.map((s) => (
              <div key={s.state} className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-xs font-medium text-foreground truncate">{s.state}</p>
                <div className="flex justify-center gap-1 mt-1.5">
                  {s.critical > 0 && <span className="text-[10px] font-mono text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">{s.critical}C</span>}
                  {s.high > 0 && <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">{s.high}H</span>}
                  {s.medium > 0 && <span className="text-[10px] font-mono text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded">{s.medium}M</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Pulsing animated risk zone
function PulsingRiskZone({ prediction }) {
  const color = riskColorMap[prediction.risk_level] || "#888";
  const baseRadius = Math.max(12, Math.min(28, (prediction.predicted_cases || 1) * 1.8));

  return (
    <>
      {/* Outer glow */}
      <CircleMarker
        center={[prediction.latitude, prediction.longitude]}
        radius={baseRadius + 8}
        fillColor={color}
        color={color}
        fillOpacity={0.08}
        weight={0}
        className="pulse-outer"
      />
      {/* Inner pulse ring */}
      <CircleMarker
        center={[prediction.latitude, prediction.longitude]}
        radius={baseRadius}
        fillColor={color}
        color={color}
        fillOpacity={0.2}
        weight={2}
        dashArray="6 4"
        className="pulse-ring"
      />
      {/* Core dot */}
      <CircleMarker
        center={[prediction.latitude, prediction.longitude]}
        radius={5}
        fillColor={color}
        color="#fff"
        fillOpacity={0.9}
        weight={1.5}
      >
        <Popup>
          <div className="text-xs space-y-2 min-w-[180px]">
            <p className="font-bold text-sm">{prediction.district}, {prediction.state}</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] capitalize">{prediction.disease?.replace(/_/g, " ")}</Badge>
              <Badge variant="outline" className="text-[10px] uppercase" style={{ borderColor: color, color }}>
                {prediction.risk_level}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Cases (48h):</span><br /><span className="font-bold text-sm">{prediction.predicted_cases}</span></div>
              <div><span className="text-muted-foreground">Confidence:</span><br /><span className="font-bold text-sm">{prediction.confidence_score}%</span></div>
              <div><span className="text-muted-foreground">Anomaly:</span><br /><span className="font-bold text-sm text-amber-400">{prediction.anomaly_score}</span></div>
              <div><span className="text-muted-foreground">Risk Score:</span><br /><span className="font-bold text-sm" style={{ color }}>{prediction.risk_level?.toUpperCase()}</span></div>
            </div>
            {prediction.contributing_factors && (
              <div>
                <p className="text-muted-foreground font-semibold mb-0.5">Factors:</p>
                <p className="text-[10px] leading-relaxed">{prediction.contributing_factors}</p>
              </div>
            )}
            {prediction.environmental_triggers && (
              <div>
                <p className="text-muted-foreground font-semibold mb-0.5">Environment:</p>
                <p className="text-[10px] leading-relaxed">{prediction.environmental_triggers}</p>
              </div>
            )}
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}