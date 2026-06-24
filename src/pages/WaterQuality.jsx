import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Droplets, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "@/lib/api";

const statuses = ["safe", "warning", "contaminated", "critical"];
const statusColors = {
  safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  contaminated: "bg-red-500/10 text-red-400 border-red-500/30",
  critical: "bg-red-600/15 text-red-500 border-red-600/40",
};

export default function WaterQuality() {
  const [open, setOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    station_name: "", state: "", district: "", ph_level: "", turbidity_ntu: "",
    coliform_count: "", e_coli_count: "", dissolved_oxygen: "",
    chemical_contaminants: "", date_sampled: new Date().toISOString().slice(0, 10),
    latitude: "", longitude: "", status: "safe",
  });

  const qc = useQueryClient();
  const { data: reports = [] } = useQuery({
    queryKey: ["water-reports"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/water-reports`);
      if (!res.ok) throw new Error("Failed to fetch water reports");
      return res.json();
    },
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: async (d) => {
      const numFields = ["ph_level", "turbidity_ntu", "coliform_count", "e_coli_count", "dissolved_oxygen", "chemical_contaminants", "latitude", "longitude"];
      const clean = { ...d };
      numFields.forEach((f) => { if (clean[f]) clean[f] = Number(clean[f]); else delete clean[f]; });
      
      const res = await fetch(`${API_BASE}/api/water-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
      if (!res.ok) throw new Error("Failed to create water report");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["water-reports"] });
      qc.invalidateQueries({ queryKey: ["predictions"] });
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      qc.invalidateQueries({ queryKey: ["all-alerts"] });
      setOpen(false);
      setForm({
        station_name: "", state: "", district: "", ph_level: "", turbidity_ntu: "",
        coliform_count: "", e_coli_count: "", dissolved_oxygen: "",
        chemical_contaminants: "", date_sampled: new Date().toISOString().slice(0, 10),
        latitude: "", longitude: "", status: "safe",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${API_BASE}/api/water-reports/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete water report");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["water-reports"] });
      qc.invalidateQueries({ queryKey: ["predictions"] });
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      qc.invalidateQueries({ queryKey: ["all-alerts"] });
    },
  });

  const filtered = filterStatus === "all" ? reports : reports.filter((r) => r.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Water Quality Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">Track water contamination levels across monitoring stations</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Report</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Water Quality Report</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Station Name</Label>
                <Input value={form.station_name} onChange={(e) => setForm({ ...form, station_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="e.g. Maharashtra" />
              </div>
              <div className="space-y-1.5">
                <Label>District</Label>
                <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="e.g. Mumbai" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>pH Level</Label>
                <Input type="number" step="0.1" value={form.ph_level} onChange={(e) => setForm({ ...form, ph_level: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Turbidity (NTU)</Label>
                <Input type="number" step="0.1" value={form.turbidity_ntu} onChange={(e) => setForm({ ...form, turbidity_ntu: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Coliform Count</Label>
                <Input type="number" value={form.coliform_count} onChange={(e) => setForm({ ...form, coliform_count: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E. Coli Count</Label>
                <Input type="number" value={form.e_coli_count} onChange={(e) => setForm({ ...form, e_coli_count: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Dissolved Oxygen (mg/L)</Label>
                <Input type="number" step="0.1" value={form.dissolved_oxygen} onChange={(e) => setForm({ ...form, dissolved_oxygen: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Chemical Index (0-100)</Label>
                <Input type="number" value={form.chemical_contaminants} onChange={(e) => setForm({ ...form, chemical_contaminants: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Date Sampled</Label>
                <Input type="date" value={form.date_sampled} onChange={(e) => setForm({ ...form, date_sampled: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Button onClick={() => createMut.mutate(form)} disabled={!form.station_name || !form.state} className="w-full">Submit Report</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Droplets className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{r.station_name}</p>
                    <p className="text-xs text-muted-foreground">{r.district}, {r.state}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${statusColors[r.status]}`}>{r.status}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(r.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="pH" value={r.ph_level} />
                <Metric label="Turbidity" value={r.turbidity_ntu} unit="NTU" />
                <Metric label="Coliform" value={r.coliform_count} />
                <Metric label="E. Coli" value={r.e_coli_count} />
                <Metric label="DO" value={r.dissolved_oxygen} unit="mg/L" />
                <Metric label="Chem Idx" value={r.chemical_contaminants} />
              </div>
              <p className="text-[10px] font-mono text-muted-foreground">{r.date_sampled?.slice(0, 10)}</p>
            </motion.div>
          ))}
        </AnimatePresence>
        {!filtered.length && (
          <div className="col-span-full py-12 text-center text-muted-foreground text-sm">No water quality reports found</div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-semibold">{value != null ? value : "—"}{unit && value != null ? <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span> : null}</p>
    </div>
  );
}