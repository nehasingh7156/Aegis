import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  Activity,
  Map,
  Bell,
  BarChart3,
  Droplets,
  Building2,
  Brain,
  Menu,
  X,
  Shield,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/firebase";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase";
import { LogOut } from "lucide-react";

const navItems = [
  { path: "/", label: "Overview", icon: Activity },
  { path: "/admissions", label: "Hospital Data", icon: Building2 },
  { path: "/water-quality", label: "Water Quality", icon: Droplets },
  { path: "/predictions", label: "Predictions", icon: Brain },
  { path: "/map", label: "Hotspot Map", icon: Map },
  { path: "/charts", label: "Charts", icon: BarChart3 },
  { path: "/alerts", label: "Alerts", icon: Bell },
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
  try {
    await signOut(auth);

    // Redirect to login page
    window.location.href = "/login";
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

  const { data: activeAlerts = [] } = useQuery({
  queryKey: ["active-alerts"],
  queryFn: async () => {
    const q = query(
      collection(db, "alerts"),
      where("status", "==", "active")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  },
  initialData: [],
});

  const alertCount = activeAlerts.length;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-sm text-sidebar-foreground tracking-tight">
                AEGIS
              </h1>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                India IDSP
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {item.label === "Alerts" && alertCount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">
                    {alertCount}
                  </Badge>
                )}
                {isActive && <ChevronRight className="w-3 h-3 text-primary" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-3">

  <Button
    onClick={handleLogout}
    variant="destructive"
    className="w-full flex items-center gap-2"
  >
    <LogOut className="w-4 h-4" />
    Logout
  </Button>

  <div className="flex items-center gap-2 px-2">
    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
    <span className="text-xs text-muted-foreground font-mono">
      System Online
    </span>
  </div>

</div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              LIVE
            </div>
            <Link to="/alerts" className="relative">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-4 h-4" />
                {alertCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive rounded-full text-[9px] text-destructive-foreground flex items-center justify-center font-bold">
                    {alertCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}