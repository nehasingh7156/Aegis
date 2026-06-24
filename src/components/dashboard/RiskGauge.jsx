import React from "react";
import { motion } from "framer-motion";

export default function RiskGauge({ level, label, score }) {
  const levels = {
    low: { color: "text-emerald-400", bg: "bg-emerald-400", percent: 25 },
    medium: { color: "text-sky-400", bg: "bg-sky-400", percent: 50 },
    high: { color: "text-amber-400", bg: "bg-amber-400", percent: 75 },
    critical: { color: "text-red-400", bg: "bg-red-400", percent: 95 },
  };

  const config = levels[level] || levels.low;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <motion.circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 50}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 50 * (1 - config.percent / 100) }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={config.color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold font-heading ${config.color}`}>{score}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className={`text-sm font-semibold uppercase tracking-wider ${config.color}`}>{level}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}