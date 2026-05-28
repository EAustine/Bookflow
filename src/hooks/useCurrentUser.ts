import { useEffect, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Reactive snapshot of the signed-in user's display info. Reads on
 * mount + subscribes to `onAuthStateChange` so a sign-out / sign-in
 * mid-session updates the consumers without a manual refetch.
 *
 * `name` priority order:
 *   1. profiles.full_name (set during signup)
 *   2. user_metadata.full_name (Supabase Auth metadata, set by some
 *      providers like Google)
 *   3. local-part of email ("ada.lovelace" from "ada.lovelace@…")
 *   4. empty string
 *
 * Consumers should treat empty values as "not yet loaded" — `loading`
 * is exposed for that purpose.
 */
export type CurrentUser = {
  name: string;
  email: string;
  /** Public URL to the user's profile picture, resolved from
   *  `profiles.avatar_storage_path` against the `avatars` bucket.
   *  Null when the user hasn't uploaded a photo. */
  avatarUrl: string | null;
};

// Module-level subscribers. Any mounted `useCurrentUser` instance
// registers itself here so that imperative mutations elsewhere
// (e.g. the Edit-profile Save handler) can trigger a refetch
// across every active consumer without prop drilling.
const refreshListeners = new Set<() => void>();

/**
 * Trigger every mounted `useCurrentUser` to re-read the profile
 * row. Call this after any imperative write to `profiles` (avatar
 * upload, display-name change, etc.) so consumers see the new
 * values without waiting for the next auth-state event.
 *
 * No-op when no `useCurrentUser` is mounted — safe to call from
 * code paths that may run outside the React tree.
 */
export function refreshCurrentUser(): void {
  for (const cb of refreshListeners) {
    try {
      cb();
    } catch {
      // listeners must not crash the broadcast loop
    }
  }
}

export function useCurrentUser(): { user: CurrentUser; loading: boolean } {
  const [user, setUser] = useState<CurrentUser>({
    name: '',
    email: '',
    avatarUrl: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Per-invocation cancellation token. Each `resolveUser` call
    // captures its own callId; we bump the shared `latestCallId`
    // before kicking off a new resolution, and stale invocations
    // exit without writing state. Without this, rapid auth state
    // flips (e.g. magic-link sign-in immediately after a sign-out)
    // could let an earlier resolveUser finish AFTER a later one
    // and overwrite the new user's name with the old user's.
    let unmounted = false;
    let latestCallId = 0;

    const resolveUser = async () => {
      const callId = ++latestCallId;
      try {
        const { data } = await supabase.auth.getUser();
        if (callId !== latestCallId || unmounted) return;
        const u = data?.user;
        if (!u) {
          setUser({ name: '', email: '', avatarUrl: null });
          setLoading(false);
          return;
        }

        const email = u.email ?? '';

        // Prefer profiles.full_name if a row exists. If the column is
        // missing or the row hasn't been seeded yet (early signup
        // race), fall back to auth metadata, then to the email
        // local-part. We also pull avatar_storage_path in the same
        // query so the avatar comes through with the name without a
        // second round-trip.
        let name = '';
        let avatarStoragePath: string | null = null;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_storage_path')
            .eq('id', u.id)
            .maybeSingle();
          if (callId !== latestCallId || unmounted) return;
          if (profile) {
            const row = profile as {
              full_name?: string | null;
              avatar_storage_path?: string | null;
            };
            if (typeof row.full_name === 'string') {
              name = row.full_name.trim();
            }
            if (typeof row.avatar_storage_path === 'string') {
              avatarStoragePath = row.avatar_storage_path;
            }
          }
        } catch {
          // Profiles table missing or unreachable — soldier on.
        }

        if (!name) {
          const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
          if (typeof meta.full_name === 'string') name = meta.full_name.trim();
          else if (typeof meta.name === 'string') name = (meta.name as string).trim();
        }
        if (!name && email) {
          // Best-effort first-name from email local-part.
          const local = email.split('@')[0]?.replace(/[._-]+/g, ' ') ?? '';
          name = local.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
        }

        // Resolve avatar path → public URL with a cache-buster query
        // string. Without `?v=…`, the OS image cache (especially on
        // Android) would keep serving the previous avatar bytes
        // forever — uploading a new photo updates the file under the
        // same path but the URL stays identical. Stamping the URL
        // with Date.now() forces a fresh fetch on every refetch
        // event (auth change or explicit refreshCurrentUser call).
        let avatarUrl: string | null = null;
        if (avatarStoragePath) {
          try {
            const { data: pub } = supabase.storage
              .from('avatars')
              .getPublicUrl(avatarStoragePath);
            avatarUrl = pub?.publicUrl
              ? `${pub.publicUrl}?v=${Date.now()}`
              : null;
          } catch {
            avatarUrl = null;
          }
        }

        if (callId !== latestCallId || unmounted) return;
        setUser({ name, email, avatarUrl });
        setLoading(false);
      } catch (err) {
        console.warn('[useCurrentUser] resolve failed:', err);
        if (callId === latestCallId && !unmounted) setLoading(false);
      }
    };

    void resolveUser();

    // Re-resolve on auth state change so a sign-in updates consumers.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void resolveUser();
    });

    // Also re-resolve on imperative refresh signals (called from
    // EditProfileScreen after a successful save).
    const refreshCb = () => {
      void resolveUser();
    };
    refreshListeners.add(refreshCb);

    return () => {
      unmounted = true;
      sub.subscription.unsubscribe();
      refreshListeners.delete(refreshCb);
    };
  }, []);

  return { user, loading };
}
