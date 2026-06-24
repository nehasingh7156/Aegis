import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";


export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check for prefers-reduced-motion accessibility setting
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    
    const listener = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // Use animated gradient fallback if video fails or prefers-reduced-motion is active
  const useFallback = prefersReducedMotion || videoFailed;

  const containerBgClass = useFallback
    ? "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-900 to-black px-4 relative overflow-hidden animate-gradient"
    : "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-black px-4 relative overflow-hidden";

  return (
    <div className={containerBgClass}>
      {/* Video Background (Only rendered if no fallback is active and component is mounted) */}
      {!useFallback && mounted && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => {
            console.warn("[Aegis Auth] Background video failed to load, falling back to animated gradient.");
            setVideoFailed(true);
          }}
          className="fixed inset-0 w-full h-full object-cover z-0"
        >
          <source src="/videos/aegis-bg.mp4" type="video/mp4" />
        </video>
      )}

      {/* Dark Overlay for readability and glassmorphism contrast (reduced blur on mobile) */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[1px] md:backdrop-blur-[2px] z-10" />

      {/* Auth Content Container */}
      <div className="relative z-20 w-full max-w-md my-8">
        
        {/* Aegis Platform Branding Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-8"
        >
          <h2 className="text-4xl font-extrabold tracking-widest text-white mb-1 font-heading drop-shadow-md">
            AEGIS
          </h2>
          <p className="text-[10px] text-blue-400 font-mono uppercase tracking-[0.2em] font-semibold">
            Disease Surveillance & Intelligence Platform
          </p>
        </motion.div>

        {/* Page Specific Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md mb-3 text-white shadow-lg">
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">{title}</h1>
          {subtitle && <p className="text-slate-300 text-sm mt-1.5">{subtitle}</p>}
        </div>

        {/* Glassmorphism Authentication Card (reduced blur on mobile) */}
        <div className="bg-white/10 backdrop-blur-md md:backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 text-slate-100 transition-all duration-300">
          {children}
        </div>

        {/* Footer Link */}
        {footer && (
          <p className="text-center text-sm text-slate-300 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}