import { Stack } from 'expo-router';

/**
 * The `/auth` segment exists so the URL really is `/auth/callback`.
 *
 * This route used to live in the `(auth)` group next to welcome and
 * sign-in. A parenthesised segment is a GROUP: Expo Router strips it
 * from the URL, so that file served `/callback`, while the magic link,
 * `emailRedirectTo` and the App Link `pathPrefix` in app.json all point
 * at `/auth/callback`. Every magic link therefore landed on Expo
 * Router's "Unmatched Route" screen — the token was never read.
 *
 * `auth` without parentheses is a real path segment, so the file and
 * the URL now agree. Headers off, matching the `(auth)` group it came
 * from.
 */
export default function AuthPathLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
