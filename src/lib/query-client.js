import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      // ── React Query performance constraints ──────────────────────────────
      // Don't refetch on window focus (user tab-switch won't re-hit backend)
      refetchOnWindowFocus: false,
      // Don't refetch when network reconnects (avoids cascade after brief drops)
      refetchOnReconnect: false,
      // Data younger than 30s is considered fresh \u2014 no background refetch
      staleTime: 30_000,
      // Keep inactive query data in memory for 5 minutes after unmount
      gcTime: 300_000,
      // Retry once on failure before surfacing an error
      retry: 1,
    },
  },
});