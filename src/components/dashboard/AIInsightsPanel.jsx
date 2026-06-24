import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { model } from "@/lib/gemini";
import { motion, AnimatePresence } from "framer-motion";

export default function AIInsightsPanel({
  admissions,
  waterReports,
  predictions,
  alerts,
}) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response.ok) {
        throw new Error("Failed to generate AI insights");
      }

      const parsed = await response.json();
      setInsights(parsed);
    } catch (error) {
      console.error(error);
      alert("Failed to generate AI insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Aegis AI Intelligence Briefing
          </h3>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={generateInsights}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Lightbulb className="w-3 h-3" />
          )}

          {loading
            ? "Analyzing..."
            : insights
            ? "Refresh"
            : "Generate"}
        </Button>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 py-8 justify-center"
          >
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />

            <p className="text-sm text-muted-foreground">
              Generating Aegis AI intelligence briefing...
            </p>
          </motion.div>
        )}

        {insights && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-sm font-semibold text-foreground">
                {insights.headline}
              </p>
            </div>

            <div className="space-y-3">
              <InsightBlock
                icon={AlertTriangle}
                color="text-red-400"
                label="Escalation Causes"
                text={insights.escalation_causes}
              />

              <InsightBlock
                icon={TrendingUp}
                color="text-amber-400"
                label="Contamination Correlations"
                text={insights.contamination_correlations}
              />

              <InsightBlock
                icon={ArrowRight}
                color="text-sky-400"
                label="Projected Spread"
                text={insights.projected_spread}
              />

              <InsightBlock
                icon={AlertTriangle}
                color="text-orange-400"
                label="Emerging Hotspots"
                text={insights.emerging_hotspots}
              />
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-2">
                Priority Actions
              </p>

              <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">
                {insights.key_actions}
              </p>
            </div>
          </motion.div>
        )}

        {!insights && !loading && (
          <div className="py-8 text-center">
            <Brain className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />

            <p className="text-sm text-muted-foreground">
              Click Generate to create an Aegis AI intelligence briefing
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              Analyzes outbreak patterns, water quality correlations,
              and emerging threats
            </p>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InsightBlock({ icon: Icon, color, label, text }) {
  return (
    <div className="bg-muted/20 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${color}`} />

        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          {label}
        </p>
      </div>

      <p className="text-xs text-foreground leading-relaxed">
        {text}
      </p>
    </div>
  );
}