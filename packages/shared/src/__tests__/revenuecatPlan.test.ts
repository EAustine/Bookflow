/**
 * The webhook's plan decision.
 *
 * The module under test lives in `supabase/functions/_shared/` because
 * the edge function imports it as `../_shared/revenuecatPlan.ts` and the
 * Supabase deploy bundle only follows paths inside `supabase/functions`.
 * It is pure and Deno-free, so Vitest can import it directly from here,
 * which is where the runner looks for specs
 * (`packages/*​/src/**​/*.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  PRO_ENTITLEMENT,
  decideRevenueCatPlan,
  type RevenueCatPlanEvent,
} from '../../../../supabase/functions/_shared/revenuecatPlan';

const decide = (event: RevenueCatPlanEvent) => decideRevenueCatPlan(event);

describe('decideRevenueCatPlan', () => {
  it('grants Pro on an initial purchase that names the entitlement', () => {
    expect(
      decide({
        type: 'INITIAL_PURCHASE',
        store: 'PLAY_STORE',
        entitlement_ids: [PRO_ENTITLEMENT],
      }),
    ).toEqual({ plan: 'pro', topup: false });
  });

  it('revokes Pro on an expiration', () => {
    expect(
      decide({
        type: 'EXPIRATION',
        store: 'PLAY_STORE',
        entitlement_ids: [PRO_ENTITLEMENT],
      }),
    ).toEqual({ plan: 'free', topup: false });
  });

  /**
   * The bug. A dashboard grant arrives as NON_RENEWING_PURCHASE, matched
   * no top-up product, and was acknowledged with `changed: false` without
   * ever reaching the plan logic.
   */
  it('grants Pro on a promotional grant, including one that names no entitlement', () => {
    expect(
      decide({
        type: 'NON_RENEWING_PURCHASE',
        store: 'PROMOTIONAL',
        entitlement_ids: [PRO_ENTITLEMENT],
      }),
    ).toEqual({ plan: 'pro', topup: false });

    expect(
      decide({ type: 'NON_RENEWING_PURCHASE', store: 'PROMOTIONAL' }),
    ).toEqual({ plan: 'pro', topup: false });
  });

  it('accepts a lowercase store value', () => {
    // Not hypothetical tidiness: a case mismatch here silently reverts
    // the whole fix, and the symptom is identical to the original bug.
    expect(
      decide({ type: 'NON_RENEWING_PURCHASE', store: 'promotional' }),
    ).toEqual({ plan: 'pro', topup: false });
  });

  /**
   * The guarantee that matters most: buying credits must never buy Pro.
   * Credit packs and audio-hour packs send the same event type as a
   * promotional grant.
   */
  it('never grants Pro for a credit pack, and routes it to the top-up path', () => {
    expect(
      decide({
        type: 'NON_RENEWING_PURCHASE',
        store: 'PLAY_STORE',
        entitlement_ids: [],
      }),
    ).toEqual({ plan: null, topup: true });

    // Audio hours, and the Play purchase-option suffix form, behave the
    // same: the product id is resolved downstream, not here.
    expect(decide({ type: 'NON_RENEWING_PURCHASE', store: 'APP_STORE' })).toEqual(
      { plan: null, topup: true },
    );
  });

  it('never grants Pro for an event naming only another entitlement', () => {
    expect(
      decide({
        type: 'INITIAL_PURCHASE',
        store: 'PLAY_STORE',
        entitlement_ids: ['Some Other Tier'],
      }),
    ).toEqual({ plan: null, topup: false });

    // Even promotionally. A promotional grant of a different entitlement
    // is not a promotional grant of Pro.
    expect(
      decide({
        type: 'NON_RENEWING_PURCHASE',
        store: 'PROMOTIONAL',
        entitlement_ids: ['Some Other Tier'],
      }),
    ).toEqual({ plan: null, topup: true });
  });

  it('leaves the row alone for events that are not a grant or a revoke', () => {
    for (const type of ['CANCELLATION', 'BILLING_ISSUE', 'TRANSFER', 'TEST']) {
      expect(decide({ type, entitlement_ids: [PRO_ENTITLEMENT] })).toEqual({
        plan: null,
        topup: false,
      });
    }
  });

  it('reads the singular entitlement_id field too', () => {
    expect(
      decide({ type: 'RENEWAL', entitlement_id: PRO_ENTITLEMENT }),
    ).toEqual({ plan: 'pro', topup: false });
  });

  /**
   * Revoking is deliberately more lenient than granting: an expiration
   * that names nothing still ends Pro, because keeping access someone
   * stopped paying for is lost revenue, while dropping it wrongly is
   * recoverable on the next renewal or restore.
   */
  it('revokes on an expiration that names no entitlement', () => {
    expect(decide({ type: 'EXPIRATION' })).toEqual({
      plan: 'free',
      topup: false,
    });
  });

  it('does not grant on an empty-entitlement event from a real store', () => {
    // The old `entitlements.length === 0` default treated this as Pro.
    expect(decide({ type: 'INITIAL_PURCHASE', store: 'PLAY_STORE' })).toEqual({
      plan: null,
      topup: false,
    });
  });
});
