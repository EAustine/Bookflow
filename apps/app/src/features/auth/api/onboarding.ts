/**
 * The two onboarding profile writes, both restored from `App.tsx`
 * after the M2 router cutover orphaned that file and took them with it.
 *
 * `onboarding_complete` is the one that mattered: two routers read it,
 * so losing the write sent every account created since the cutover back
 * through onboarding on each sign-in. `onboarding_intent` is softer,
 * nothing reads it yet, but it had been silently null for the same
 * period while a screen comment claimed it was "stored on profile".
 *
 * The update is injected rather than imported so this file stays free
 * of React Native imports and can be unit tested. That also makes the
 * one behaviour worth pinning down testable: skipping must persist an
 * explicit `null`, not omit the column, so "asked and declined" is
 * distinguishable from "never reached the question".
 */

/** Applies a patch to one profile row. Bound to Supabase in `auth.ts`. */
export type ProfileUpdate = (
  userId: string,
  patch: Record<string, unknown>,
) => PromiseLike<{ error: { message: string } | null }>;

export type OnboardingWriteResult = { ok: boolean; error?: string };

/**
 * Best-effort by design, matching what `App.tsx` did: onboarding is a
 * soft signal, and blocking forward motion on a network hiccup would be
 * worse than losing it. Callers navigate regardless and never await.
 */
async function writeProfile(
  update: ProfileUpdate,
  userId: string,
  patch: Record<string, unknown>,
  label: string,
): Promise<OnboardingWriteResult> {
  try {
    const { error } = await update(userId, patch);
    if (error) {
      console.warn(`[onboarding] ${label} write failed:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`[onboarding] ${label} write threw:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** `null` means the user skipped the question, and is written as such. */
export function persistOnboardingIntent(
  update: ProfileUpdate,
  userId: string,
  intent: string | null,
): Promise<OnboardingWriteResult> {
  return writeProfile(update, userId, { onboarding_intent: intent }, 'intent');
}

export function persistOnboardingComplete(
  update: ProfileUpdate,
  userId: string,
): Promise<OnboardingWriteResult> {
  return writeProfile(
    update,
    userId,
    { onboarding_complete: true },
    'complete',
  );
}
