import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Droplets, Activity } from "lucide-react";
import { API_BASE } from "@/lib/api";

const RISK_COLORS = { low: "#22c55e", medium: "#0ea5e9", high: "#f59e0b", critical: "#ef4444" };
const DISEASE_COLORS = { cholera: "#ef4444", typhoid: "#f59e0b", dysentery: "#f97316", hepatitis_a: "#a855f7", leptospirosis: "#0ea5e9", malaria: "#22c55e", dengue: "#ec4899" };

CustomTooltip.displayName = "CustomTooltip";
MiniTooltip.displayName = "MiniTooltip";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
      <p className="text-xs text-muted-foreground font-mono mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-foreground font-medium">{entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
      <div className="flex items-center gap-2 text-xs">
        <div className="w-2 h-2 rounded-full" style={{ background: payload[0].payload.fill }} />
        <span className="text-foreground font-medium">{payload[0].name}</span>
        <span className="text-muted-foreground">{payload[0].value}</span>
      </div>
    </div>
  );
}

export default function Charts() {
  const [selectedDisease, setSelectedDisease] = useState("all");
  const [selectedState, setSelectedState] = useState("all");

  const { data: predictions = [] } = useQuery({
    queryKey: ["predictions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/predictions`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
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

  const { data: admissions = [] } = useQuery({
    queryKey: ["admissions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admissions`);
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
    initialData: [],
  });

  // Filters
  const filteredPreds = predictions.filter((p) => {
    const matchDisease = selectedDisease === "all" || p.disease === selectedDisease;
    const matchState = selectedState === "all" || p.state === selectedState;
    return matchDisease && matchState;
  });

  const predDiseases = useMemo(() => [...new Set(predictions.map((p) => p.disease).filter(Boolean))], [predictions]);
  const predStates = useMemo(() => [...new Set(predictions.map((p) => p.state).filter(Boolean))].sort(), [predictions]);

  // Risk distribution
  const riskDistribution = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    filteredPreds.forEach((p) => { if (counts[p.risk_level] !== undefined) counts[p.risk_level]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: RISK_COLORS[name] }));
  }, [filteredPreds]);

  // State risk stacked bar
  const stateRisks = useMemo(() => {
    const map = {};
    filteredPreds.forEach((p) => {
      if (!map[p.state]) map[p.state] = { state: p.state, low: 0, medium: 0, high: 0, critical: 0, total: 0 };
      map[p.state][p.risk_level]++;
      map[p.state].total++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [filteredPreds]);

  // Disease cases bar
  const diseaseCases = useMemo(() => {
    const map = {};
    filteredPreds.forEach((p) => { const d = p.disease || "unknown"; map[d] = (map[d] || 0) + (p.predicted_cases || 0); });
    return Object.entries(map).map(([d, c]) => ({ disease: d.replace(/_/g, " "), cases: c, fill: DISEASE_COLORS[d] || "#888" })).sort((a, b) => b.cases - a.cases);
  }, [filteredPreds]);

  // Case trend
  const caseTrend = useMemo(() => {
    const byDate = {};
    admissions.forEach((a) => { const d = a.date_reported?.slice(0, 10) || ""; if (!d) return; if (!byDate[d]) byDate[d] = { date: d.slice(5), cases: 0 }; byDate[d].cases += a.case_count || 0; });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  }, [admissions]);

  // Comparative: disease cases vs coliform (by state)
  const comparativeData = useMemo(() => {
    const byState = {};
    admissions.forEach((a) => {
      if (!byState[a.state]) byState[a.state] = { state: a.state, cases: 0, coliform: 0, stations: 0 };
      byState[a.state].cases += a.case_count || 0;
    });
    waterReports.forEach((w) => {
      if (!byState[w.state]) byState[w.state] = { state: w.state, cases: 0, coliform: 0, stations: 0 };
      byState[w.state].coliform += w.coliform_count || 0;
      byState[w.state].stations++;
    });
    return Object.values(byState)
      .map((s) => ({ ...s, avgColiform: s.stations ? Math.round(s.coliform / s.stations) : 0 }))
      .filter((s) => s.cases > 0 || s.coliform > 0)
      .sort((a, b) => b.cases - a.cases)
      .slice(0, 8);
  }, [admissions, waterReports]);

  // Confidence analysis
  const confidenceData = useMemo(() => {
    return filteredPreds.map((p) => ({
      district: `${p.district}, ${p.state}`,
      disease: p.disease?.replace(/_/g, " "),
      confidence: p.confidence_score || 0,
      anomaly: p.anomaly_score || 0,
      predicted: p.predicted_cases || 0,
      risk: p.risk_level,
    })).sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  }, [filteredPreds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Charts & Comparative Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Disease trends, risk distribution, and water quality correlation across Indian states</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger className="w-36"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {predStates.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedDisease} onValueChange={setSelectedDisease}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Disease" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Diseases</SelectItem>
              {predDiseases.map((d) => <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!predictions.length && !admissions.length ? (
        <div className="rounded-xl border border-border bg-card p-16 text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No data available yet</p>
          <p className="text-xs text-muted-foreground mt-1">Run the Prediction Engine and add hospital/water data to populate charts</p>
        </div>
      ) : (
        <>
          {/* Row 1: Risk Pie + Disease Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Risk Level Distribution</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={4} dataKey="value" stroke="hsl(var(--card))" strokeWidth={3}>
                      {riskDistribution.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted-foreground capitalize">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-2">
                {riskDistribution.map((r) => (
                  <div key={r.name} className="text-center">
                    <p className="text-lg font-heading font-bold" style={{ color: r.fill }}>{r.value}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{r.name}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Predicted Cases by Disease</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={diseaseCases} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 16%)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="disease" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="cases" radius={[0, 6, 6, 0]}>
                      {diseaseCases.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Case Trend + Comparative (Disease vs Water) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Case Trend — Last 10 Days</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={caseTrend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 16%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="cases" stroke="hsl(199, 89%, 48%)" fill="url(#trendGrad)" strokeWidth={2} name="Cases" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Comparative: Cases vs Coliform */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-sky-400" />
                Disease Cases vs Avg Coliform by State
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={comparativeData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 16%)" />
                    <XAxis dataKey="state" tick={{ fontSize: 9, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={40} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} label={{ value: "Cases", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(215, 20%, 55%)" } }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} label={{ value: "Coliform/100ml", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "hsl(215, 20%, 55%)" } }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10 }} />
                    <Bar yAxisId="left" dataKey="cases" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} name="Cases" />
                    <Line yAxisId="right" type="monotone" dataKey="avgColiform" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: "#0ea5e9" }} name="Avg Coliform" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 3: State Risk Stacked + Confidence Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">State Risk Breakdown</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stateRisks} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 16%)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="state" tick={{ fontSize: 10, fill: "hsl(215, 20%, 55%)" }} tickLine={false} axisLine={false} width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="critical" stackId="a" fill={RISK_COLORS.critical} name="Critical" />
                    <Bar dataKey="high" stackId="a" fill={RISK_COLORS.high} name="High" />
                    <Bar dataKey="medium" stackId="a" fill={RISK_COLORS.medium} name="Medium" />
                    <Bar dataKey="low" stackId="a" fill={RISK_COLORS.low} name="Low" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Confidence & Anomaly Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] font-mono uppercase text-muted-foreground pb-3 px-2">District</th>
                      <th className="text-left text-[10px] font-mono uppercase text-muted-foreground pb-3 px-2">Risk</th>
                      <th className="text-left text-[10px] font-mono uppercase text-muted-foreground pb-3 px-2">Confidence</th>
                      <th className="text-left text-[10px] font-mono uppercase text-muted-foreground pb-3 px-2">Anomaly</th>
                      <th className="text-right text-[10px] font-mono uppercase text-muted-foreground pb-3 px-2">Cases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {confidenceData.map((item, i) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-2 text-xs font-medium truncate max-w-[120px]">{item.district}</td>
                        <td className="py-2.5 px-2">
                          <Badge variant="outline" className="text-[9px] uppercase" style={{ borderColor: RISK_COLORS[item.risk], color: RISK_COLORS[item.risk] }}>{item.risk}</Badge>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${item.confidence}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">{item.confidence}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className="text-[10px] font-mono" style={{ color: item.anomaly > 70 ? "#ef4444" : item.anomaly > 50 ? "#f59e0b" : "#22c55e" }}>{item.anomaly}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right text-xs font-mono font-bold">{item.predicted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}