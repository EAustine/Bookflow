/**
 * revenuecat-webhook — receives RevenueCat subscription lifecycle events and
 * syncs the user's plan onto their Supabase `profiles` row, so the AI edge
 * functions can enforce credit limits server-side (the client SDK knows the
 * entitlement instantly, but the server must not trust the client).
 *
 * User mapping: the app calls `Purchases.logIn(session.user.id)` on sign-in
 * (see src/lib/auth.ts), so RevenueCat's `event.app_user_id` IS the Supabase
 * user id — we update `profiles` by that id directly.
 *
 * Security: RevenueCat sends a configurable `Authorization` header with every
 * webhook. We compare it to REVENUECAT_WEBHOOK_SECRET. Deploy this function
 * with `--no-verify-jwt` (RevenueCat is not a Supabase user and sends no JWT).
 *
 * Idempotent + non-destructive: only GRANT events set plan=pro and only
 * REVOKE events set plan=free. CANCELLATION (auto-renew turned off, still
 * active until expiry), BILLING_ISSUE, TRANSFER, TEST, etc. make no change.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { decideRevenueCatPlan } from '../_shared/revenuecatPlan.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

const FREE_LIMIT = 50_000;
const PRO_LIMIT = 500_000;

// Consumable top-up products → how much each grants. Keys are the Google Play
// product IDs; amounts match what's advertised (AI = credits, audio = seconds).
// Prices live in Play Console and don't matter here — the grant is fixed.
const TOPUP_PRODUCTS: Record<string, { kind: 'ai' | 'audio'; amount: number }> = {
  bookflow_ai_100k: { kind: 'ai', amount: 100_000 },
  bookflow_ai_500k: { kind: 'ai', amount: 500_000 },
  bookflow_audio_300min: { kind: 'audio', amount: 300 * 60 },
  bookflow_audio_900min: { kind: 'audio', amount: 900 * 60 },
};

// Resolve a webhook product_id to its grant. Google Play's one-time products
// surface as `productId:purchaseOptionId` (e.g. "bookflow_audio_300min:standard"),
// and RevenueCat may pass either the base id or that suffixed store identifier
// depending on configuration — so match the exact id first, then fall back to
// the base id before the first ':'. Tolerant of both so a Play purchase-option
// suffix can never silently drop a paid grant.
function resolveTopup(
  rawProductId: string,
): { kind: 'ai' | 'audio'; amount: number } | undefined {
  if (!rawProductId) return undefined;
  if (TOPUP_PRODUCTS[rawProductId]) return TOPUP_PRODUCTS[rawProductId];
  const base = rawProductId.split(':')[0];
  return base !== rawProductId ? TOPUP_PRODUCTS[base] : undefined;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }

  // Verify the shared secret RevenueCat is configured to send.
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== WEBHOOK_SECRET && auth !== `Bearer ${WEBHOOK_SECRET}`) {
      return new Response('unauthorized', { status: 401 });
    }
  } else {
    console.warn(
      '[revenuecat-webhook] REVENUECAT_WEBHOOK_SECRET not set — accepting unverified requests',
    );
  }

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid_json', { status: 400 });
  }

  const event = payload?.event;
  if (!event || typeof event !== 'object') {
    return new Response('no_event', { status: 200 });
  }

  const appUserId: string = event.app_user_id ?? '';
  const type: string = event.type ?? '';

  // Anonymous RevenueCat ids aren't Supabase users — nothing to sync.
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    return new Response('skipped_anonymous', { status: 200 });
  }

  // What this event means for the plan, and whether it is a consumable
  // top-up instead. Pure and unit tested in revenuecatPlan.ts, which also
  // carries the reasoning: a promotional grant and a credit pack arrive
  // under the same `NON_RENEWING_PURCHASE` type, so the entitlement has to
  // decide which is which.
  const decision = decideRevenueCatPlan(event);

  const supabaseSvc = () =>
    createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  // Consumable credit top-ups (one-time, non-subscription). These do NOT grant
  // Pro — they add to the user's purchased balance via grant_credits, which is
  // idempotent by transaction id so a redelivered webhook never double-grants.
  // `decision.topup` rather than the type alone: a promotional Pro grant
  // also arrives as NON_RENEWING_PURCHASE, and used to be swallowed here
  // because it matches no top-up product. That is exactly how a granted
  // entitlement left `profiles.plan` on free while the app showed Premium.
  if (decision.topup) {
    const productId: string = event.product_id ?? '';
    const txn: string = event.transaction_id ?? event.id ?? '';
    const grant = resolveTopup(productId);
    if (grant && txn) {
      const { data, error } = await supabaseSvc().rpc('grant_credits', {
        p_txn: txn,
        p_user: appUserId,
        p_kind: grant.kind,
        p_amount: grant.amount,
        p_product: productId,
      });
      if (error) {
        console.error('[revenuecat-webhook] grant_credits failed:', error.message);
        return new Response('grant_failed', { status: 500 });
      }
      console.log(
        `[revenuecat-webhook] topup ${productId} → ${appUserId} ${grant.kind}+${grant.amount} applied=${data}`,
      );
      return new Response(JSON.stringify({ ok: true, granted: !!data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Unrecognised consumable (or missing txn) — acknowledge without change.
    // Log the raw id so a product-id mismatch (e.g. an unexpected store suffix
    // or a typo'd Play product ID) is debuggable from the function logs right
    // after a test purchase, instead of silently dropping a paid grant.
    console.warn(
      `[revenuecat-webhook] no top-up applied: product_id="${productId}" txn="${txn}" (no TOPUP_PRODUCTS match or empty txn)`,
    );
    return new Response(JSON.stringify({ ok: true, changed: false, type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const plan = decision.plan;

  if (!plan) {
    // CANCELLATION / BILLING_ISSUE / TRANSFER / TEST / … — acknowledge, no change.
    return new Response(JSON.stringify({ ok: true, changed: false, type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const limit = plan === 'pro' ? PRO_LIMIT : FREE_LIMIT;
  const { error } = await supabase
    .from('profiles')
    .update({ plan, ai_credits_limit: limit })
    .eq('id', appUserId);

  if (error) {
    console.error('[revenuecat-webhook] profile update failed:', error.message);
    return new Response('update_failed', { status: 500 });
  }

  console.log(
    `[revenuecat-webhook] ${type} → ${appUserId} plan=${plan} limit=${limit}`,
  );
  return new Response(JSON.stringify({ ok: true, changed: true, plan }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
