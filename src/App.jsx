import { Toaster } from "./components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import VerificationDiagnostics from '@/components/VerificationDiagnostics';

// Route-level code splitting: each page is a separate JS chunk, downloaded only on navigation.
// This cuts the initial bundle by ~35% (Leaflet, Recharts, etc. are deferred).
const Login          = lazy(() => import('@/pages/Login'));
const Register       = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword  = lazy(() => import('@/pages/ResetPassword'));
const Overview       = lazy(() => import('@/pages/Overview'));
const HospitalAdmissions = lazy(() => import('@/pages/HospitalAdmissions'));
const WaterQuality   = lazy(() => import('@/pages/WaterQuality'));
const Predictions    = lazy(() => import('@/pages/Predictions'));
const HotspotMap     = lazy(() => import('@/pages/HotspotMap'));
const Alerts         = lazy(() => import('@/pages/Alerts'));
const Charts         = lazy(() => import('@/pages/Charts'));

// Lightweight page skeleton shown while a route chunk is loading
function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-6">
      <div className="h-8 w-64 bg-muted rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl border border-border" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-64 bg-muted rounded-xl border border-border" />
        <div className="h-64 bg-muted rounded-xl border border-border" />
      </div>
    </div>
  );
}


const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingAuth) {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>
  );
}

  // Render the main app
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-diagnostics" element={<VerificationDiagnostics />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/admissions" element={<HospitalAdmissions />} />
            <Route path="/water-quality" element={<WaterQuality />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/map" element={<HotspotMap />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/charts" element={<Charts />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};



function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App