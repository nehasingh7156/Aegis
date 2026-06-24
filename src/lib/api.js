/**
 * Centralized API base URL configuration.
 *
 * In development:  VITE_API_BASE_URL is empty -> relative paths -> Vite dev proxy -> localhost:5000
 * In production:   VITE_API_BASE_URL = https://aegis-production-f354.up.railway.app -> direct fetch
 *
 * All fetch() calls in the app use:
 *   fetch(`${API_BASE}/api/...`)
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
