import React from "react";
import { Badge } from "@/components/ui/badge";

const riskColors = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function RegionRiskTable({ predictions }) {
  if (!predictions?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Regional Risk Assessment</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No prediction data available. Run analysis to generate predictions.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Regional Risk Assessment</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground pb-3">State / District</th>
              <th className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground pb-3">Disease</th>
              <th className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground pb-3">Risk</th>
              <th className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground pb-3">Confidence</th>
              <th className="text-right text-[10px] font-mono uppercase tracking-wider text-muted-foreground pb-3">Predicted Cases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {predictions.map((pred) => (
              <tr key={pred.id} className="group hover:bg-muted/30 transition-colors">
                <td className="py-3 text-sm font-medium">{pred.district}, {pred.state}</td>
                <td className="py-3 text-sm text-muted-foreground capitalize">{pred.disease?.replace(/_/g, " ")}</td>
                <td className="py-3">
                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${riskColors[pred.risk_level]}`}>
                    {pred.risk_level}
                  </Badge>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pred.confidence_score || 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{pred.confidence_score || 0}%</span>
                  </div>
                </td>
                <td className="py-3 text-right text-sm font-mono font-medium">{pred.predicted_cases || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}