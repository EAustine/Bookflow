/**
 * Which plan, if any, a RevenueCat webhook event should write.
 *
 * Pure and dependency-free so it can be unit tested. The webhook itself
 * needs Deno, a live Supabase client and a shared secret; this is the
 * part that decides, and it is the part that was wrong.
 *
 * ## The bug this exists to fix
 *
 * A promotional entitlement granted from the RevenueCat dashboard never
 * reached the plan logic at all. `NON_RENEWING_PURCHASE` was handled in
 * the consumable top-up branch, which returns early, so the event fell
 * through `resolveTopup` (promotional products are not top-up products),
 * logged a warning and answered `{ ok: true, changed: false }`. A green
 * delivery history, and `profiles.plan` still `free`.
 *
 * That is a revenue bug once purchases work, not a cosmetic one. The app
 * reads Premium from the RevenueCat entitlement, while `generate-audio`
 * meters from `profiles.plan`, so a paying subscriber would see Premium
 * and get free-tier limits.
 *
 * ## Why the type alone cannot decide
 *
 * `NON_RENEWING_PURCHASE` is ambiguous: a promotional Pro grant sends it,
 * and so do the credit packs and audio-hour packs. So it is deliberately
 * **not** in `GRANT` — adding it there would hand Pro to anyone who
 * bought 100K credits. The event has to say it touches Pro.
 *
 * ## Granting is strict, revoking is lenient
 *
 * Granting requires the event to name the Pro entitlement, or to be a
 * promotional grant that names no entitlement at all (the dashboard can
 * omit the list). An event that names only some *other* entitlement
 * never grants Pro, which is what keeps credit packs honest.
 *
 * Revoking also accepts an empty entitlement list, because the two
 * mistakes are not symmetric: wrongly keeping access the user has
 * stopped paying for is lost revenue, while wrongly dropping it is
 * recoverable on the next renewal or restore. With a single entitlement
 * in the project, an expiration that names nothing means Pro ended.
 */

export const PRO_ENTITLEMENT = 'Bookflow Pro';

/** Events that grant or extend Pro. See above for why NON_RENEWING_PURCHASE is absent. */
const GRANT = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

/**
 * Events that revoke Pro. CANCELLATION is intentionally absent: it means
 * auto-renew was turned off, but access continues until EXPIRATION.
 */
const REVOKE = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

export type RevenueCatPlanEvent = {
  type?: string | null;
  store?: string | null;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
};

export type RevenueCatPlanDecision = {
  /** The plan to write, or null to leave the profile row alone. */
  plan: 'pro' | 'free' | null;
  /** True when this event is a consumable top-up and should go to grant_credits. */
  topup: boolean;
};

function entitlementsOf(event: RevenueCatPlanEvent): string[] {
  if (Array.isArray(event.entitlement_ids)) return event.entitlement_ids;
  if (event.entitlement_id) return [event.entitlement_id];
  return [];
}

export function decideRevenueCatPlan(
  event: RevenueCatPlanEvent,
): RevenueCatPlanDecision {
  const type = event.type ?? '';
  const entitlements = entitlementsOf(event);
  const namesPro = entitlements.includes(PRO_ENTITLEMENT);
  // Case-insensitive: RevenueCat has sent both "PROMOTIONAL" and
  // "promotional" over the years, and getting this wrong silently
  // reverts the whole fix.
  const promotional = String(event.store ?? '').toUpperCase() === 'PROMOTIONAL';

  const grantsPro = namesPro || (promotional && entitlements.length === 0);
  const revokesPro = namesPro || entitlements.length === 0;

  // The ambiguous one. A promotional Pro grant and a credit pack arrive
  // under the same type, so the entitlement decides which this is.
  if (type === 'NON_RENEWING_PURCHASE') {
    return grantsPro
      ? { plan: 'pro', topup: false }
      : { plan: null, topup: true };
  }

  if (GRANT.has(type) && grantsPro) return { plan: 'pro', topup: false };
  if (REVOKE.has(type) && revokesPro) return { plan: 'free', topup: false };

  // CANCELLATION / BILLING_ISSUE / TRANSFER / TEST, and anything naming
  // only another entitlement: acknowledge without changing the row.
  return { plan: null, topup: false };
}
