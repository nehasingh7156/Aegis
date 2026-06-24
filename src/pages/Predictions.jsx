import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, Zap, Lightbulb, MapPin, Droplets, Thermometer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "@/lib/api";

const riskColors = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

const riskDotColors = { low: "#22c55e", medium: "#0ea5e9", high: "#f59e0b", critical: "#ef4444" };

export default function Predictions() {
  const [generating, setGenerating] = useState(false);
  const [expandedPred, setExpandedPred] = useState(null);
  const qc = useQueryClient();

  const { data: predictions = [] } = useQuery({
    queryKey: ["predictions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/predictions`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    initialData: [],
  });

  const { data: admissions = [] } = useQuery({
    queryKey: ["admissions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admissions`);
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
    initialData: [],
  });

  const { data: waterReports = [] } = useQuery({
    queryKey: ["water-reports"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/water-reports`);
      if (!res.ok) throw new Error("Failed to fetch water reports");
      return res.json();
    },
    initialData: [],
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${API_BASE}/api/predictions/trigger`, {
        method: "POST",
      });
      if (response.ok) {
        qc.invalidateQueries({ queryKey: ["predictions"] });
        qc.invalidateQueries({ queryKey: ["active-alerts"] });
        qc.invalidateQueries({ queryKey: ["all-alerts"] });
      } else {
        alert("Failed to run prediction engine");
      }
    } catch (err) {
      console.error(err);
      alert("Error executing ML pipeline");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Outbreak Prediction Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered 48-hour epidemiological forecasting with causal reasoning</p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="gap-2" size="lg">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {generating ? "Analyzing India data..." : "Run Prediction Engine"}
        </Button>
      </div>

      {generating && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <Zap className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Epidemiological Intelligence Analysis Running</p>
            <p className="text-xs text-muted-foreground mt-1">Processing hospital data, water quality correlations, anomaly detection, and cross-state propagation patterns across India...</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence>
          {predictions.map((pred, i) => {
            const isExpanded = expandedPred === pred.id;
            return (
              <motion.div
                key={pred.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl border transition-all cursor-pointer ${isExpanded ? "border-primary/50 bg-card ring-1 ring-primary/20" : "border-border bg-card"} p-5 space-y-4`}
                onClick={() => setExpandedPred(isExpanded ? null : pred.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: riskDotColors[pred.risk_level], boxShadow: `0 0 10px ${riskDotColors[pred.risk_level]}` }} />
                    <div>
                      <p className="text-lg font-heading font-bold">{pred.district}, {pred.state}</p>
                      <p className="text-sm text-muted-foreground capitalize">{pred.disease?.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs uppercase font-mono ${riskColors[pred.risk_level]}`}>
                    {pred.risk_level}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pred.confidence_score || 0}%` }} />
                      </div>
                      <span className="text-xs font-mono">{pred.confidence_score}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Anomaly</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pred.anomaly_score || 0}%` }} />
                      </div>
                      <span className="text-xs font-mono">{pred.anomaly_score}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">48h Forecast</p>
                    <p className="text-xl font-heading font-bold mt-0.5">{pred.predicted_cases || 0} <span className="text-xs font-normal text-muted-foreground">cases</span></p>
                  </div>
                </div>

                {/* Expanded: AI Reasoning */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      {pred.reasoning && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="w-3.5 h-3.5 text-primary" />
                            <p className="text-[10px] text-primary uppercase tracking-wider font-semibold">AI Epidemiological Reasoning</p>
                          </div>
                          <p className="text-xs text-foreground leading-relaxed">{pred.reasoning}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {pred.environmental_triggers && (
                          <div className="bg-muted/30 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Thermometer className="w-3 h-3 text-amber-400" />
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Environmental Triggers</p>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{pred.environmental_triggers}</p>
                          </div>
                        )}
                        {pred.neighbor_influence && (
                          <div className="bg-muted/30 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <MapPin className="w-3 h-3 text-sky-400" />
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Neighbor Influence</p>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{pred.neighbor_influence}</p>
                          </div>
                        )}
                      </div>
                      {pred.contributing_factors && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Contributing Factors</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{pred.contributing_factors}</p>
                        </div>
                      )}
                      {pred.recommended_actions && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1 font-semibold">Recommended Actions</p>
                          <p className="text-xs text-foreground leading-relaxed">{pred.recommended_actions}</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono text-muted-foreground">Generated {pred.prediction_date?.slice(0, 10)}</p>
                  <p className="text-[10px] text-muted-foreground">{isExpanded ? "Click to collapse" : "Click for AI reasoning"}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!predictions.length && !generating && (
          <div className="col-span-full py-16 text-center">
            <Brain className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No predictions generated yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Run Prediction Engine" to analyze India epidemiological data with AI reasoning</p>
          </div>
        )}
      </div>
    </div>
  );
}