'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface ResolveResult {
  key: string;
  enabled: boolean;
  resolvedAt: string;
}

interface UseFeatureFlagOptions {
  /** JWT token — required for authenticated endpoints */
  token?: string;
  /** Organization UUID for org-scoped resolution */
  orgId?: string;
  /** Event UUID for event-scoped resolution */
  eventId?: string;
}

interface UseFeatureFlagReturn {
  /** Whether the feature is enabled (false while loading or on error) */
  enabled: boolean;
  /** True while the flag is being fetched */
  loading: boolean;
  /** Error message if the fetch failed */
  error: string | null;
}

/**
 * useFeatureFlag — resolve a feature flag from the backend.
 *
 * Resolution is performed server-side with EVENT > ORGANIZATION > GLOBAL precedence.
 * Returns false while loading and on network errors.
 *
 * @example
 * const { enabled } = useFeatureFlag('rush_mode', { eventId, token });
 * if (!enabled) return null;
 */
export function useFeatureFlag(
  key: string,
  options: UseFeatureFlagOptions = {},
): UseFeatureFlagReturn {
  const { token, orgId, eventId } = options;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ key });
        if (orgId) params.set('orgId', orgId);
        if (eventId) params.set('eventId', eventId);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/feature-flags/resolve?${params.toString()}`, {
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as ResolveResult;
        if (!cancelled) setEnabled(data.enabled);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setEnabled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, [key, token, orgId, eventId]);

  return { enabled, loading, error };
}
