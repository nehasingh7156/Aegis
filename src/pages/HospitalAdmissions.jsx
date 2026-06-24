import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Building2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const diseases = ["cholera", "typhoid", "dysentery", "hepatitis_a", "leptospirosis", "malaria", "dengue"];
const severities = ["mild", "moderate", "severe", "critical"];
const severityColors = {
  mild: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  moderate: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  severe: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Delhi (NCT)", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
].sort();

export default function HospitalAdmissions() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDisease, setFilterDisease] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const [form, setForm] = useState({
    hospital_name: "", state: "", district: "", disease: "cholera", case_count: "",
    severity: "moderate", date_reported: new Date().toISOString().slice(0, 10),
    latitude: "", longitude: "", notes: "",
  });

  const qc = useQueryClient();

  // Fetch paginated and filtered admissions from server
  const { data: admissions = [], isLoading } = useQuery({
    queryKey: ["admissions", page, search, filterDisease, filterRegion],
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const qState = filterRegion === "all" ? "" : filterRegion;
      const qDisease = filterDisease === "all" ? "" : filterDisease;
      const res = await fetch(`/api/admissions?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}&state=${encodeURIComponent(qState)}&disease=${encodeURIComponent(qDisease)}`);
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: async (d) => {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...d,
          case_count: Number(d.case_count),
          latitude: d.latitude ? Number(d.latitude) : null,
          longitude: d.longitude ? Number(d.longitude) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create admission");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admissions"] });
      qc.invalidateQueries({ queryKey: ["predictions"] });
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      qc.invalidateQueries({ queryKey: ["all-alerts"] });
      setOpen(false);
      setForm({
        hospital_name: "", state: "", district: "", disease: "cholera", case_count: "",
        severity: "moderate", date_reported: new Date().toISOString().slice(0, 10),
        latitude: "", longitude: "", notes: "",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/admissions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete admission");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admissions"] });
      qc.invalidateQueries({ queryKey: ["predictions"] });
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      qc.invalidateQueries({ queryKey: ["all-alerts"] });
    },
  });

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleRegionChange = (val) => {
    setFilterRegion(val);
    setPage(1);
  };

  const handleDiseaseChange = (val) => {
    setFilterDisease(val);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Hospital Admissions</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage disease case reports</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Report</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New Admission Report</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Hospital Name</Label>
                <Input value={form.hospital_name} onChange={(e) => setForm({ ...form, hospital_name: e.target.value })} placeholder="General Hospital" />
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
                <Label>Disease</Label>
                <Select value={form.disease} onValueChange={(v) => setForm({ ...form, disease: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{diseases.map((d) => <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Case Count</Label>
                <Input type="number" value={form.case_count} onChange={(e) => setForm({ ...form, case_count: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{severities.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date Reported</Label>
                <Input type="date" value={form.date_reported} onChange={(e) => setForm({ ...form, date_reported: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="Optional" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional info" />
              </div>
              <div className="col-span-2">
                <Button onClick={() => createMut.mutate(form)} disabled={!form.hospital_name || !form.case_count} className="w-full">
                  Submit Report
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search hospitals, states, districts..." className="pl-9" value={search} onChange={handleSearchChange} />
        </div>
        <Select value={filterRegion} onValueChange={handleRegionChange}>
          <SelectTrigger className="w-40"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {indianStates.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDisease} onValueChange={handleDiseaseChange}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Disease" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Diseases</SelectItem>
            {diseases.map((d) => <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Hospital", "Region", "Disease", "Cases", "Severity", "Date", ""].map((h) => (
                  <th key={h} className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {admissions.map((a) => (
                  <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> {a.hospital_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{a.district}, {a.state}</td>
                    <td className="px-4 py-3 text-sm capitalize">{a.disease?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-sm font-mono font-bold">{a.case_count}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] uppercase ${severityColors[a.severity]}`}>{a.severity}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{a.date_reported?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(a.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {!admissions.length && !isLoading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">No admission records found</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">Loading records...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border border-border rounded-xl">
        <div className="flex-1 flex justify-between sm:hidden">
          <Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">Previous</Button>
          <Button onClick={() => setPage(p => p + 1)} disabled={admissions.length < limit} variant="outline" size="sm">Next</Button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              Showing page <span className="font-semibold text-foreground">{page}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm" className="h-8 px-3">
              Previous
            </Button>
            <Button onClick={() => setPage(p => p + 1)} disabled={admissions.length < limit} variant="outline" size="sm" className="h-8 px-3">
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}