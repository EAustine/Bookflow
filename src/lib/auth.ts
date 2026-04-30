import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { loginRevenueCat, logoutRevenueCat } from './revenuecat';

/**
 * Where Supabase should redirect after the user clicks the magic link.
 *
 * On native we hardcode the custom scheme instead of using Linking.createURL,
 * because in Expo dev client Linking.createURL returns the Metro server URL
 * (http://localhost:8081/...) rather than bookflow://. Localhost in an email
 * link clicked on the device routes to the device itself, not the dev Mac.
 *
 * Both URLs must be in Supabase → Authentication → URL Configuration →
 * Redirect URLs.
 */
export const AUTH_CALLBACK_URL: string =
  Platform.OS === 'web'
    ? Linking.createURL('/auth/callback')   // http://localhost:8081/auth/callback
    : 'bookflow://auth/callback';           // always works on device, dev or prod

// ============================================================================
// Magic-link sign-in / sign-up
// ============================================================================

export type SendMagicLinkArgs = {
  email: string;
  /**
   * 'signin' refuses to create a new user — we'd rather show "no account
   * found" than silently sign somebody up via a typo. 'signup' creates a
   * new auth user on first request.
   */
  variant: 'signin' | 'signup';
  /** Marketing-consent flag. Persisted as `marketing_consent` on signup. */
  marketingConsent?: boolean;
};

export type SendMagicLinkResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Sends a one-time magic-link email via Supabase. The link itself doesn't
 * route back into the app yet — that's wired in Step 1B (scheme +
 * `emailRedirectTo` + deep-link handler). For now this just confirms the
 * email send succeeds; the link will land at the Supabase project's
 * default Site URL.
 */
export async function sendMagicLink({
  email,
  variant,
  marketingConsent,
}: SendMagicLinkArgs): Promise<SendMagicLinkResult> {
  const trimmed = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      // signin: don't create unknown users (we want to fail loudly on typos).
      // signup: default behaviour creates the user on first request.
      shouldCreateUser: variant === 'signup',
      data:
        variant === 'signup'
          ? { marketing_consent: marketingConsent ?? false }
          : undefined,
      emailRedirectTo: AUTH_CALLBACK_URL,
    },
  });

  if (error) {
    return { ok: false, message: humanizeAuthError(error, variant) };
  }
  return { ok: true };
}

/**
 * Maps Supabase auth errors to short, neutral copy. We don't echo the raw
 * error string back to users — most are technical, some leak server state.
 */
function humanizeAuthError(error: AuthError, variant: 'signin' | 'signup'): string {
  const msg = error.message.toLowerCase();

  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many requests. Try again in about a minute.';
  }
  if (msg.includes('user not found') || msg.includes('signups not allowed')) {
    return variant === 'signin'
      ? "We couldn't find an account with that email. Try signing up instead."
      : "Couldn't create an account. Contact support if this keeps happening.";
  }
  if (msg.includes('invalid email') || msg.includes('email address')) {
    return 'That email looks invalid. Double-check and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return "Couldn't reach our servers. Check your connection and try again.";
  }
  return "Something went wrong sending your link. Try again in a moment.";
}

// ============================================================================
// Magic-link callback (PKCE code exchange + implicit-flow tokens)
// ============================================================================

/**
 * The four error variants the AuthCallbackScreen knows how to render.
 * Mirrors `AuthCallbackError` in that file — kept as a string union here
 * to avoid the screen layer having to depend on this lib module.
 */
export type AuthExchangeErrorKind = 'expired' | 'used' | 'network' | 'unknown';

export type ExchangeCodeResult =
  | { ok: true; userId: string }
  | { ok: false; error: AuthExchangeErrorKind };

/**
 * Discriminated union of what we can pull out of an auth callback URL.
 *
 * - `code`   — PKCE flow (native). The `code` query param is exchanged for
 *              a session via `exchangeCodeForSession`, which reads back the
 *              `code_verifier` we stashed in AsyncStorage at request time.
 * - `tokens` — Implicit flow (web). Supabase puts `access_token` and
 *              `refresh_token` directly in the URL fragment. We hand them
 *              to `setSession` — no verifier required, immune to the
 *              same-browser/same-storage requirement that breaks PKCE on
 *              web in dev.
 */
export type AuthCallbackPayload =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string };

/**
 * Pulls auth material out of an inbound deep link.
 *
 * Tries fragment first (implicit-flow tokens look like
 * `…/auth/callback#access_token=…&refresh_token=…`), then falls back to
 * query string (PKCE: `…/auth/callback?code=…`). Returns null if the URL
 * isn't an auth callback or carries neither.
 */
export function parseAuthCallback(url: string): AuthCallbackPayload | null {
  try {
    const parsed = Linking.parse(url);
    const isCallback =
      parsed.path?.includes('auth/callback') ||
      parsed.hostname?.includes('auth') ||
      // Web in dev: the full URL still parses, path is '/auth/callback'
      url.includes('/auth/callback');
    if (!isCallback) return null;

    // 1. Implicit flow — tokens in the URL fragment. `Linking.parse` doesn't
    //    surface the fragment, so we slice it off the raw URL ourselves.
    const hashIdx = url.indexOf('#');
    if (hashIdx >= 0) {
      const fragment = url.slice(hashIdx + 1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        return { kind: 'tokens', accessToken, refreshToken };
      }
    }

    // 2. PKCE flow — `code` query param.
    const code = parsed.queryParams?.code;
    if (typeof code === 'string' && code.length > 0) {
      return { kind: 'code', code };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Backwards-compatible helper that returns just the PKCE code, used by
 * call sites that haven't been migrated yet. Prefer `parseAuthCallback`.
 */
export function parseAuthCallbackCode(url: string): string | null {
  const payload = parseAuthCallback(url);
  return payload?.kind === 'code' ? payload.code : null;
}

/**
 * Completes the auth callback — dispatches to PKCE exchange or implicit
 * `setSession` based on what came back in the URL. On success Supabase
 * persists the session via AsyncStorage and fires `SIGNED_IN`; the existing
 * `setupRevenueCatAuthSync` listener picks it up and routes RevenueCat.
 */
export async function completeAuthCallback(
  payload: AuthCallbackPayload,
): Promise<ExchangeCodeResult> {
  if (payload.kind === 'code') {
    const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code);
    if (error) {
      console.warn('[auth] exchangeCodeForSession failed:', error.message, error);
      return { ok: false, error: categorizeExchangeError(error) };
    }
    if (!data.session?.user) return { ok: false, error: 'unknown' };
    return { ok: true, userId: data.session.user.id };
  }

  // Implicit flow: hand the tokens straight to setSession.
  const { data, error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  if (error) {
    console.warn('[auth] setSession failed:', error.message, error);
    return { ok: false, error: categorizeExchangeError(error) };
  }
  if (!data.session?.user) return { ok: false, error: 'unknown' };
  return { ok: true, userId: data.session.user.id };
}

/**
 * @deprecated Use `completeAuthCallback({ kind: 'code', code })` directly.
 * Kept for any caller that still passes a bare PKCE code.
 */
export async function exchangeAuthCallbackCode(code: string): Promise<ExchangeCodeResult> {
  return completeAuthCallback({ kind: 'code', code });
}

function categorizeExchangeError(error: AuthError): AuthExchangeErrorKind {
  const msg = error.message.toLowerCase();
  if (msg.includes('expired') || msg.includes('invalid or has expired')) return 'expired';
  if (msg.includes('already used') || msg.includes('already been used')) return 'used';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return 'network';
  }
  // PKCE failure modes: the code_verifier stored at request time didn't match
  // (link opened in a different storage context — different browser, different
  // device, or storage cleared between request and click). Treat as 'expired'
  // since the right action is "get a new link in this same environment."
  if (
    msg.includes('code verifier') ||
    msg.includes('code_verifier') ||
    msg.includes('code challenge') ||
    msg.includes('pkce') ||
    msg.includes('invalid grant') ||
    msg.includes('invalid request') ||
    msg.includes('auth session missing')
  ) {
    return 'expired';
  }
  return 'unknown';
}

// ============================================================================
// RevenueCat <-> Supabase session sync
// ============================================================================

function syncRevenueCatUser(userId: string) {
  loginRevenueCat(userId).catch((err) => {
    console.warn('[auth] RevenueCat login failed:', err);
  });
}

function clearRevenueCatUser() {
  logoutRevenueCat().catch((err) => {
    console.warn('[auth] RevenueCat logout failed:', err);
  });
}

export function setupRevenueCatAuthSync(): () => void {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) syncRevenueCatUser(session.user.id);
  });

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      syncRevenueCatUser(session.user.id);
    } else if (event === 'SIGNED_OUT') {
      clearRevenueCatUser();
    }
  });

  return () => data.subscription.unsubscribe();
}
