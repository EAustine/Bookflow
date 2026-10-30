/**
 * The onboarding profile writes, restored from `App.tsx` after the M2
 * router cutover orphaned it.
 *
 * The module under test lives in the app because that is where it is
 * used, but it takes its update function as an argument and imports no
 * React Native, so Vitest can load it directly from here, which is
 * where the runner looks for specs (`packages/*​/src/**​/*.test.ts`).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  persistOnboardingComplete,
  persistOnboardingIntent,
  type ProfileUpdate,
} from '../../../../apps/app/src/features/auth/api/onboarding';

const USER = 'da711cd1-db57-474c-9def-1c707d1c60ce';

/** Records what was written, and reports success. */
function recorder() {
  const calls: { userId: string; patch: Record<string, unknown> }[] = [];
  const update: ProfileUpdate = (userId, patch) => {
    calls.push({ userId, patch });
    return Promise.resolve({ error: null });
  };
  return { calls, update };
}

describe('persistOnboardingIntent', () => {
  it('writes the chosen intent against the right user', async () => {
    const { calls, update } = recorder();
    const result = await persistOnboardingIntent(update, USER, 'study');

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { userId: USER, patch: { onboarding_intent: 'study' } },
    ]);
  });

  /**
   * The one behaviour worth pinning down. Skipping must write an
   * explicit null rather than omitting the column, so "asked and
   * declined" stays distinguishable from "never reached the question".
   * Omitting it would also make the patch empty, which is a silent
   * no-op rather than a recorded answer.
   */
  it('writes an explicit null when the user skips', async () => {
    const { calls, update } = recorder();
    await persistOnboardingIntent(update, USER, null);

    expect(calls[0].patch).toEqual({ onboarding_intent: null });
    expect('onboarding_intent' in calls[0].patch).toBe(true);
  });
});

describe('persistOnboardingComplete', () => {
  it('sets the flag to true', async () => {
    const { calls, update } = recorder();
    const result = await persistOnboardingComplete(update, USER);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      { userId: USER, patch: { onboarding_complete: true } },
    ]);
  });
});

/**
 * Both writes are best effort: the caller navigates without awaiting,
 * so a rejection that escaped would surface as an unhandled rejection
 * rather than a repeated onboarding. `App.tsx` swallowed failures the
 * same way, and losing the flag must never cost the user the button.
 */
describe('failure handling', () => {
  it('reports a returned error without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update: ProfileUpdate = () =>
      Promise.resolve({ error: { message: 'row level security' } });

    await expect(
      persistOnboardingComplete(update, USER),
    ).resolves.toEqual({ ok: false, error: 'row level security' });
    warn.mockRestore();
  });

  it('reports a thrown error without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update: ProfileUpdate = () => {
      throw new Error('offline');
    };

    await expect(
      persistOnboardingIntent(update, USER, 'fun'),
    ).resolves.toEqual({ ok: false, error: 'offline' });
    warn.mockRestore();
  });

  it('reports a rejected promise without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update: ProfileUpdate = () => Promise.reject(new Error('timeout'));

    await expect(
      persistOnboardingIntent(update, USER, null),
    ).resolves.toEqual({ ok: false, error: 'timeout' });
    warn.mockRestore();
  });
});
