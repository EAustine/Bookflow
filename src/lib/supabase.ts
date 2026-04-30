import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.',
  );
}

/**
 * Auth flow type — split by platform.
 *
 * Native (iOS/Android): PKCE. The custom `bookflow://` URL scheme routes
 * the magic-link callback back into the same app instance, so the
 * code_verifier stashed in AsyncStorage at request time is guaranteed to
 * be there at exchange time. Best security, no friction.
 *
 * Web: implicit. PKCE on web requires the click on the email link to land
 * in the *same browser/profile/origin* as the request, because the
 * verifier lives in localStorage. That's brittle in dev (different
 * default browser, different tab) and not something we can control for
 * users. Implicit flow returns the access + refresh tokens directly in
 * the URL fragment — no verifier to lose. Tokens never hit the server
 * (fragment isn't sent in HTTP requests) and we hand them straight to
 * `supabase.auth.setSession()`.
 *
 * This matches Supabase's recommended pattern for hybrid React Native +
 * Web apps and is production-correct on both surfaces.
 */
const flowType: 'pkce' | 'implicit' = Platform.OS === 'web' ? 'implicit' : 'pkce';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // We handle URL parsing manually via expo-linking + parseAuthCallback.
    // detectSessionInUrl=true would fight us by grabbing tokens from window.location.
    detectSessionInUrl: false,
    flowType,
  },
});
