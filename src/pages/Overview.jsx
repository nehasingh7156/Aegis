import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Droplets, AlertTriangle, Brain, MapPin } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import DiseaseChart from "@/components/dashboard/DiseaseChart";
import RiskGauge from "@/components/dashboard/RiskGauge";
import RecentAlertsBanner from "@/components/dashboard/RecentAlertsBanner";
import RegionRiskTable from "@/components/dashboard/RegionRiskTable";
import AIInsightsPanel from "@/components/dashboard/AIInsightsPanel";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { API_BASE } from "@/lib/api";

export default function Overview() {
  const { data: systemStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["system-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/system/status`);
      if (!res.ok) throw new Error("Failed to fetch system status");
      return res.json();
    },
    // Match the 30s server-side cache TTL — no point asking for fresher data
    staleTime: 30_000,
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

  const { data: predictions = [] } = useQuery({
    queryKey: ["predictions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/predictions`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    initialData: [],
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/alerts`);
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const allAlerts = await res.json();
      return allAlerts.filter(a => a.status === "active");
    },
    initialData: [],
  });

  const stats = useMemo(() => {
    const totalCases = admissions.reduce((s, a) => s + (a.case_count || 0), 0);
    const contaminated = waterReports.filter((w) => w.status === "contaminated" || w.status === "critical").length;
    const criticalPredictions = predictions.filter((p) => p.risk_level === "critical" || p.risk_level === "high").length;
    const overallRisk = predictions.length
      ? predictions.reduce((s, p) => {
          const scores = { low: 15, medium: 40, high: 70, critical: 95 };
          return s + (scores[p.risk_level] || 0);
        }, 0) / predictions.length
      : 0;
    const riskLevel = overallRisk >= 75 ? "critical" : overallRisk >= 50 ? "high" : overallRisk >= 25 ? "medium" : "low";
    const activeStates = [...new Set(admissions.map((a) => a.state).filter(Boolean))].length;
    return { totalCases, contaminated, criticalPredictions, overallRisk: Math.round(overallRisk), riskLevel, activeStates };
  }, [admissions, waterReports, predictions]);

  const chartData = useMemo(() => {
    // Build actual vs. predicted lookup from Neo4j admissions
    const byDate = {};
    admissions.forEach((a) => {
      const d = a.date_reported?.slice(0, 10) || "unknown";
      byDate[d] = (byDate[d] || 0) + (a.case_count || 0);
    });

    // Build predicted cases lookup from real OutbreakPrediction nodes
    const predictedByDate = {};
    predictions.forEach((p) => {
      const d = p.prediction_date?.slice(0, 10);
      if (d) {
        predictedByDate[d] = (predictedByDate[d] || 0) + (p.predicted_cases || 0);
      }
    });

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, cases]) => {
        const entry = { date: date.slice(5), cases };
        if (predictedByDate[date] !== undefined) {
          entry.predicted = predictedByDate[date];
        }
        return entry;
      });
  }, [admissions, predictions]);

  // Top affected states
  const topStates = useMemo(() => {
    const m = {};
    admissions.forEach((a) => { m[a.state] = (m[a.state] || 0) + (a.case_count || 0); });
    return Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [admissions]);

  const telemetry = systemStatus?.neo4j;
  const totalAdmissionsValue = telemetry && telemetry.total_admissions !== undefined ? telemetry.total_admissions : "--";
  const totalPredictionsValue = telemetry && telemetry.total_predictions !== undefined ? telemetry.total_predictions : "--";
  const totalWaterValue = telemetry && telemetry.total_water !== undefined ? telemetry.total_water : "--";
  const activeHighRiskDistrictsValue = telemetry && telemetry.active_high_risk_districts !== undefined ? telemetry.active_high_risk_districts : "--";

  const formatTelemetryTimestamp = (isoString) => {
    if (!isoString || isoString === "--") return "Last Updated: --";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "Last Updated: --";

      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });

      let formatted = formatter.format(date);
      formatted = formatted.replace(/am/i, "AM").replace(/pm/i, "PM");
      return `Last Updated: ${formatted} IST`;
    } catch (err) {
      console.error("Error formatting timestamp:", err);
      return "Last Updated: --";
    }
  };

  const getRelativeTimeString = (isoString) => {
    if (!isoString || isoString === "--") return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "";

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.round(diffMs / 60000);
      const diffHours = Math.round(diffMs / 3600000);
      const diffDays = Math.round(diffMs / 86400000);

      if (diffMins < 1) return "Updated just now";
      if (diffMins < 60) return `Updated ${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
      if (diffHours < 24) return `Updated ${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
      return `Updated ${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    } catch (err) {
      return "";
    }
  };

  const formattedRefresh = formatTelemetryTimestamp(systemStatus?.last_data_refresh);
  const relativeTime = getRelativeTimeString(systemStatus?.last_data_refresh);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
              <ShieldMini />
            </div>
            <h1 className="text-2xl font-heading font-bold tracking-tight">National Surveillance Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground">India Integrated Disease Surveillance — real-time monitoring & 48-hour predictive analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center bg-muted border border-border rounded-full px-3 py-1 cursor-help">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    {formattedRefresh}
                  </span>
                </div>
              </TooltipTrigger>
              {relativeTime && (
                <TooltipContent>
                  <p>{relativeTime}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Live — {stats.activeStates} States</span>
          </div>
        </div>
      </div>

      {/* Alerts Banner */}
      <RecentAlertsBanner alerts={alerts} />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard 
          title="Total Cases" 
          value={totalAdmissionsValue} 
          subtitle="Admissions (Last 24h)" 
          icon={Building2} 
          trend="up" 
          trendValue="India-wide" 
          color="destructive"
          loading={statusLoading}
        />
        <StatCard 
          title="Water Stations" 
          value={totalWaterValue} 
          subtitle="Water Reports (Latest Reporting Date)" 
          icon={Droplets} 
          color={stats.contaminated > 0 ? "warning" : "success"}
          loading={statusLoading}
        />
        <StatCard 
          title="Predictions" 
          value={totalPredictionsValue} 
          subtitle="Latest Prediction Run" 
          icon={Brain} 
          color="info"
          loading={statusLoading}
        />
        <StatCard 
          title="Active High-Risk Districts" 
          value={activeHighRiskDistrictsValue} 
          subtitle="Latest Prediction Run" 
          icon={MapPin} 
          color="warning"
          loading={statusLoading}
        />
        <StatCard 
          title="Active Alerts" 
          value={alerts.length !== undefined ? alerts.length : "--"} 
          icon={AlertTriangle} 
          color={alerts.length > 0 ? "destructive" : "success"} 
        />
        <StatCard 
          title="Overall Risk" 
          value={stats.overallRisk !== undefined && predictions.length > 0 ? `${stats.overallRisk}%` : "--"} 
          subtitle={stats.riskLevel ? stats.riskLevel.toUpperCase() : "--"} 
          icon={Activity} 
          color={stats.riskLevel === "critical" ? "destructive" : stats.riskLevel === "high" ? "warning" : "info"} 
        />
      </div>

      {/* Top States Overview */}
      {topStates.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top Affected States</h3>
          <div className="flex flex-wrap gap-2">
            {topStates.map(([state, cases]) => (
              <Badge key={state} variant="outline" className="text-xs px-3 py-1.5 gap-2">
                <MapPin className="w-3 h-3" />
                {state}
                <span className="font-mono font-bold text-foreground">{cases}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DiseaseChart data={chartData} title="Case Trend — Last 14 Days (India)" />
          <RegionRiskTable predictions={predictions} />
        </div>

        <div className="space-y-6">
          {/* Risk Gauge */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">National Risk Index</h3>
            <RiskGauge level={stats.riskLevel} label="Aggregated across all Indian states" score={stats.overallRisk} />
          </div>

          {/* Disease breakdown */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Disease Breakdown — India</h3>
            <DiseaseBreakdown admissions={admissions} />
          </div>
        </div>
      </div>

      {/* AI Insights Panel */}
      <AIInsightsPanel admissions={admissions} waterReports={waterReports} predictions={predictions} alerts={alerts} />

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <Link to="/predictions"><Button variant="outline" size="sm" className="gap-1.5"><Brain className="w-3.5 h-3.5" /> Run Prediction Engine</Button></Link>
        <Link to="/map"><Button variant="outline" size="sm" className="gap-1.5"><MapPin className="w-3.5 h-3.5" /> View Intelligence Map</Button></Link>
        <Link to="/charts"><Button variant="outline" size="sm" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Charts & Analytics</Button></Link>
      </div>
    </div>
  );
}

function DiseaseBreakdown({ admissions }) {
  const byDisease = {};
  admissions.forEach((a) => { const d = a.disease || "unknown"; byDisease[d] = (byDisease[d] || 0) + (a.case_count || 0); });
  const sorted = Object.entries(byDisease).sort(([, a], [, b]) => b - a);
  const max = sorted.length ? sorted[0][1] : 1;

  const diseaseColors = { cholera: "bg-red-400", typhoid: "bg-amber-400", dysentery: "bg-orange-400", hepatitis_a: "bg-purple-400", leptospirosis: "bg-sky-400", malaria: "bg-emerald-400", dengue: "bg-pink-400", unknown: "bg-muted-foreground" };

  if (!sorted.length) return <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>;

  return (
    <div className="space-y-3">
      {sorted.map(([disease, count]) => (
        <div key={disease}>
          <div className="flex justify-between text-xs mb-1">
            <span className="capitalize text-foreground font-medium">{disease.replace(/_/g, " ")}</span>
            <span className="font-mono text-muted-foreground">{count}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }} transition={{ duration: 1, ease: "easeOut" }} className={`h-full rounded-full ${diseaseColors[disease] || diseaseColors.unknown}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ShieldMini() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-primary">
      <path d="M8 1.5l5.5 2.75v4.5c0 3-2.5 5.25-5.5 5.75-3-0.5-5.5-2.75-5.5-5.75v-4.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}