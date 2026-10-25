/**
 * The TanStack Query client (§6).
 *
 * The package has been a dependency for a long time and was used by
 * nothing — Phase 0 found zero `useQuery` call sites. Server state ran
 * through bespoke hooks over Supabase instead. This is where that
 * starts changing.
 *
 * The defaults below are set for this app rather than taken as they
 * come, because the shipped defaults assume a browser tab on an office
 * connection and Bookflow's first persona is on a Ghanaian data plan.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Five minutes, not zero.
       *
       * The default treats data as stale immediately, which means a
       * refetch on every mount. On a metered connection that is the
       * user paying for the same library listing repeatedly. Realtime
       * invalidation (§6) is what keeps this correct: rows that change
       * push an invalidation rather than being polled for.
       */
      staleTime: 5 * 60_000,

      /** Keep unused data for a day so a cold launch has something to
       *  paint while the network answers. Pairs with persistence. */
      gcTime: 24 * 60 * 60_000,

      /**
       * Two retries, not three, and never on a 4xx-equivalent.
       * Supabase returns RLS denials and malformed-input errors that
       * cannot succeed on retry; hammering them wastes the user's data
       * and delays the error they need to see.
       */
      retry: (failureCount, error) => {
        const code = (error as { code?: string })?.code;
        if (code && /^(42501|22P02|PGRST\d+)$/.test(code)) return false;
        return failureCount < 2;
      },

      /** Refetching on every window focus is a browser idiom. On a
       *  phone, app-foreground is the equivalent and is handled
       *  explicitly where it matters. */
      refetchOnWindowFocus: false,

      /** Reconnect IS worth refetching on — the data is likely stale
       *  precisely because the device was offline. */
      refetchOnReconnect: true,
    },
    mutations: {
      // Writes go through the offline queue, which owns retry and
      // backoff. A second retry policy here would fight it.
      retry: false,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
