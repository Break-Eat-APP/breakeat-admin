import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient for the mobile app.
 * Configured for realtime-sensitive use:
 * - short staleTime (data refreshes quickly)
 * - no window focus refetch (mobile has no window focus events)
 * - 3 retries for network failures (common on mobile)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 1000, // 15 seconds
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
