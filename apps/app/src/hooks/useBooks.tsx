/**
 * BooksProvider + `useBooks` — single-instance lifecycle for the user's
 * library.
 *
 * Why this exists: `useBooksImpl` does a Supabase fetch, an AsyncStorage
 * cache read, and a realtime subscription on every mount. When the
 * library tab was the only place mounting it, that was fine. After
 * DiscoverScreen and ListenHistoryScreen also started consuming
 * `useBooks` (each as its own hook instance), navigating between tabs
 * would tear the library state down and rehydrate it from scratch,
 * giving the user a visible "shimmer + re-fetch" pattern on every tab
 * switch.
 *
 * The fix is a single Provider mounted once per signed-in session
 * (App.tsx wraps LibraryStage with it). All consumers read the SAME
 * cached state via React context. Tab switches no longer remount the
 * underlying fetch hook — books, isLoading, refetch, continueBook are
 * referentially stable across navigations.
 *
 * Migration notes for screens: the consumer surface is identical to
 * the previous bare `useBooks` hook — same shape, same destructure.
 * The only behavioural change is that calling `useBooks()` outside
 * the provider throws (forcing every consumer to be inside a
 * BooksProvider, which is what we want).
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useBooksImpl, type UseBooksResult } from './useBooksImpl';

export type { UseBooksResult } from './useBooksImpl';

const BooksContext = createContext<UseBooksResult | null>(null);

/**
 * Mount once per signed-in session. Anything that calls `useBooks()`
 * must be a descendant. Recommended placement: just inside the
 * `stage === 'library'` branch of App.tsx so the Provider lifecycle
 * matches the signed-in tab shell.
 */
export function BooksProvider({ children }: { children: ReactNode }) {
  const value = useBooksImpl();
  return <BooksContext.Provider value={value}>{children}</BooksContext.Provider>;
}

/**
 * Read the shared books state. Throws if called outside a
 * BooksProvider so misuse is loud rather than silently rendering
 * empty libraries.
 */
export function useBooks(): UseBooksResult {
  const ctx = useContext(BooksContext);
  if (!ctx) {
    throw new Error('useBooks must be used inside <BooksProvider>');
  }
  return ctx;
}
