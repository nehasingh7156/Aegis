import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Info, AlertCircle, Flame, CheckCircle2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const severityConfig = {
  info: { icon: Info, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/30" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  danger: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  critical: { icon: Flame, color: "text-red-500", bg: "bg-red-600/15 border-red-600/40" },
};

const statusColors = {
  active: "bg-red-500/10 text-red-400 border-red-500/30",
  acknowledged: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

export default function Alerts() {
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const qc = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ["all-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    initialData: [],
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update alert");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-alerts"] });
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete alert");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-alerts"] });
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
    },
  });

  const filtered = alerts.filter((a) => {
    const matchSev = filterSeverity === "all" || a.severity === filterSeverity;
    const matchSt = filterStatus === "all" || a.status === filterStatus;
    return matchSev && matchSt;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight">Alert Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Automated outbreak alerts and notifications</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="danger">Danger</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filtered.map((alert, i) => {
            const config = severityConfig[alert.severity] || severityConfig.info;
            const Icon = config.icon;
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-xl border p-5 ${config.bg}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {alert.state && <span>{alert.district && `${alert.district}, `}{alert.state} · </span>}
                          {alert.disease && <span className="capitalize">{alert.disease.replace(/_/g, " ")} · </span>}
                          <span className="font-mono">{alert.severity?.toUpperCase()}</span>
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] uppercase shrink-0 ${statusColors[alert.status]}`}>
                        {alert.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{alert.message}</p>
                    <div className="flex items-center gap-2 pt-1">
                      {alert.status === "active" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => updateMut.mutate({ id: alert.id, data: { status: "acknowledged" } })}>
                          <CheckCircle2 className="w-3 h-3" /> Acknowledge
                        </Button>
                      )}
                      {alert.status !== "resolved" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => updateMut.mutate({ id: alert.id, data: { status: "resolved" } })}>
                          Resolve
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMut.mutate(alert.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                        {alert.created_date ? new Date(alert.created_date).toLocaleString() : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!filtered.length && (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No alerts found</p>
          </div>
        )}
      </div>
    </div>
  );
}