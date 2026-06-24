import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, AlertCircle, Flame, X } from "lucide-react";
import { Link } from "react-router-dom";

const severityConfig = {
  info: { icon: Info, bg: "bg-sky-500/10 border-sky-500/30", text: "text-sky-400" },
  warning: { icon: AlertTriangle, bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400" },
  danger: { icon: AlertCircle, bg: "bg-red-500/10 border-red-500/30", text: "text-red-400" },
  critical: { icon: Flame, bg: "bg-red-600/15 border-red-600/40", text: "text-red-500" },
};

export default function RecentAlertsBanner({ alerts }) {
  if (!alerts?.length) return null;
  const topAlerts = alerts.slice(0, 3);

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {topAlerts.map((alert, i) => {
          const config = severityConfig[alert.severity] || severityConfig.info;
          const Icon = config.icon;
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                to="/alerts"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${config.bg} transition-all hover:scale-[1.01]`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${config.text}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${config.text}`}>{alert.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{alert.district}, {alert.state} · {alert.disease?.replace(/_/g, " ")}</p>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase">{alert.severity}</span>
              </Link>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}