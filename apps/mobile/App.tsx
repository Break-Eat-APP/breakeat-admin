import './src/instrument'; // Sentry must be first
import React, { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@lib/query/query-client';
import { RootNavigator } from '@navigation/root-navigator';
import { useAppStore } from '@store/app.store';

/**
 * App entry point.
 * Wraps the app with:
 * 1. QueryClientProvider (TanStack Query)
 * 2. RootNavigator (React Navigation)
 *
 * Phase 2 adds: AuthProvider, ThemeProvider
 */
export default function App() {
  const setReady = useAppStore((s) => s.setReady);

  useEffect(() => {
    // Phase 1: mark ready immediately
    // Phase 2+: wait for session check, fonts, etc.
    setReady(true);
  }, [setReady]);

  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}
