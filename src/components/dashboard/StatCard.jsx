import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = "primary", loading = false }) {
  const colorMap = {
    primary: "text-primary bg-primary/10 border-primary/20",
    destructive: "text-red-400 bg-red-500/10 border-red-500/20",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    info: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-red-400" : trend === "down" ? "text-emerald-400" : "text-muted-foreground";
  const parts = (colorMap[color] || colorMap.primary).split(" ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border bg-card p-5 ${parts[2]}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          
          {loading ? (
            <div className="h-9 w-20 rounded-md bg-muted animate-pulse" />
          ) : (
            <p className="text-3xl font-bold font-heading tracking-tight text-foreground">{value}</p>
          )}

          {subtitle && (
            loading
              ? <div className="h-3 w-28 rounded bg-muted animate-pulse" />
              : <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trendValue && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg ${parts[1]}`}>
            <Icon className={`w-5 h-5 ${parts[0]}`} />
          </div>
        )}
      </div>
    </motion.div>
  );
}