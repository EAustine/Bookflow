import { Alert, Linking, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export const ENTITLEMENT_PRO = 'Bookflow Pro';

export type ProductId = 'lifetime' | 'yearly' | 'monthly';

/**
 * RevenueCat issues a SEPARATE public SDK key per platform (an
 * `appl_…` key for the iOS app, a `goog_…` key for the Android app).
 * Configuring with the wrong-platform key silently returns no
 * offerings, so production MUST pick the key by platform.
 *
 * Resolution order:
 *   1. Platform-specific key (EXPO_PUBLIC_REVENUECAT_IOS_KEY /
 *      EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) — use these in production.
 *   2. Legacy single EXPO_PUBLIC_REVENUECAT_API_KEY — backward-compat
 *      for the current dev/test setup so nothing breaks before the
 *      per-platform keys are added.
 */
const apiKey =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) ??
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

/**
 * Set `EXPO_PUBLIC_REVENUECAT_DISABLED=1` in `.env` to skip RevenueCat
 * entirely — useful while the billing/paywall flow isn't a priority,
 * since the SDK noisily logs 404s on `configure()` if your project
 * doesn't have offerings set up. Configure / login / logout become
 * no-ops; entitlement checks return false; presentPaywall throws so
 * misuse is loud rather than silent.
 */
const disabled =
  process.env.EXPO_PUBLIC_REVENUECAT_DISABLED === '1' || !apiKey;

let configured = false;

export function configureRevenueCat(appUserID?: string): void {
  if (configured || disabled) return;
  if (!apiKey) {
    // Reachable only if `disabled` is false and apiKey is missing —
    // shouldn't happen given the disabled-when-no-key rule above, but
    // keep the throw as a defensive guard for refactors.
    throw new Error(
      'Missing EXPO_PUBLIC_REVENUECAT_API_KEY. Add it to .env or set EXPO_PUBLIC_REVENUECAT_DISABLED=1.',
    );
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey, appUserID });
  configured = true;
}

export async function loginRevenueCat(userId: string): Promise<CustomerInfo | null> {
  if (disabled || !configured) return null;
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

export async function logoutRevenueCat(): Promise<CustomerInfo | null> {
  if (disabled || !configured) return null;
  return Purchases.logOut();
}

export function isEntitlementActive(
  customerInfo: CustomerInfo | null | undefined,
  entitlementId: string,
): boolean {
  return Boolean(customerInfo?.entitlements.active[entitlementId]);
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  // When RevenueCat is disabled (test/dev or closed-testing without IAP
  // wired) the SDK isn't configured — calling getOfferings would throw.
  // Return null so the caller can treat it as "no offerings available."
  if (disabled || !configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/** RevenueCat Offering id holding the consumable credit-pack products.
 * Create this offering (with the top-up products) in the RevenueCat dashboard. */
export const TOPUP_OFFERING_ID = 'topups';

export type TopupKind = 'audio' | 'ai';
export type TopupMeta = {
  kind: TopupKind;
  /** Units the pack grants: minutes for audio, credits for AI. */
  units: number;
  /** Card name, e.g. "15 hours audio" / "500K AI credits". */
  name: string;
  /** One-line description shown under the name. */
  description: string;
};

/**
 * Display metadata for the consumable top-up products, keyed by Google Play
 * product id. Mirrors the grant amounts in the revenuecat-webhook's
 * TOPUP_PRODUCTS map — keep the two in sync. Only names/units live here; live
 * prices come from RevenueCat. Powers the Buy Credits sheet's audio/AI grouping
 * and its per-unit / savings math.
 */
export const TOPUP_CATALOG: Record<string, TopupMeta> = {
  bookflow_audio_300min: {
    kind: 'audio',
    units: 300,
    name: '5 hours audio',
    description: '300 min of narration · used after your monthly allowance',
  },
  bookflow_audio_900min: {
    kind: 'audio',
    units: 900,
    name: '15 hours audio',
    description: '900 min of narration · used after your monthly allowance',
  },
  bookflow_ai_100k: {
    kind: 'ai',
    units: 100_000,
    name: '100K AI credits',
    description: 'Summaries, Q&A, and practice questions',
  },
  bookflow_ai_500k: {
    kind: 'ai',
    units: 500_000,
    name: '500K AI credits',
    description: 'Summaries, Q&A, practice questions & translation',
  },
};

/** Resolve a package's product id to its top-up metadata. Tolerant of Google
 * Play's `productId:purchaseOption` suffix (same as the webhook). */
export function topupMetaFor(
  productId: string | undefined | null,
): TopupMeta | undefined {
  if (!productId) return undefined;
  return TOPUP_CATALOG[productId] ?? TOPUP_CATALOG[productId.split(':')[0]];
}

/** Fetch the consumable credit-pack packages, or [] if unavailable. */
export async function getTopupPackages(): Promise<PurchasesPackage[]> {
  if (disabled || !configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all[TOPUP_OFFERING_ID]?.availablePackages ?? [];
  } catch (err) {
    console.warn('[revenuecat] getTopupPackages failed:', err);
    return [];
  }
}

export type TopupResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; error?: string };

/**
 * Buy a consumable credit pack. The credits themselves are granted
 * server-side by the RevenueCat webhook (→ grant_credits), so they land on
 * the user's balance a few seconds after a successful purchase rather than
 * synchronously here.
 */
export async function purchaseTopup(pkg: PurchasesPackage): Promise<TopupResult> {
  if (disabled || !configured) return { ok: false, error: 'unavailable' };
  try {
    await Purchases.purchasePackage(pkg);
    return { ok: true };
  } catch (err) {
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return { ok: false, cancelled: true };
    return { ok: false, error: e?.message ?? 'purchase_failed' };
  }
}

export async function presentPaywall(opts?: {
  requiredEntitlement?: string;
  offering?: PurchasesOffering;
}): Promise<PAYWALL_RESULT> {
  // When RC is disabled, show a friendly alert instead of crashing the
  // app. Closed testers tap Upgrade out of curiosity; we'd rather they
  // see "Coming soon" than a hard crash. Returns NOT_PRESENTED so the
  // caller's flow doesn't think a purchase happened.
  if (disabled || !configured) {
    Alert.alert(
      'Upgrade coming soon',
      'Pro subscriptions are being set up. You can use everything in the free tier in the meantime. Thanks for testing!',
    );
    return PAYWALL_RESULT.NOT_PRESENTED;
  }
  if (opts?.requiredEntitlement) {
    return RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: opts.requiredEntitlement,
      offering: opts.offering,
    });
  }
  return RevenueCatUI.presentPaywall({ offering: opts?.offering });
}

export async function presentCustomerCenter(): Promise<void> {
  // Same disabled-safe behaviour — show an Alert instead of letting
  // the SDK throw an "SDK not configured" runtime error.
  if (disabled || !configured) {
    Alert.alert(
      'Subscription management coming soon',
      'You can cancel a subscription via your Apple ID / Google account settings in the meantime.',
    );
    return;
  }
  await RevenueCatUI.presentCustomerCenter();
}

const PLAY_PACKAGE = 'com.eaustine.bookflow';
const PLAY_SUBSCRIPTION_ID = 'bookflow_pro';

/**
 * Open the native subscription-management surface (change plan, cancel,
 * update payment). On Android we deep-link straight to the Google Play
 * subscriptions page for our subscription — always available, no
 * RevenueCat dashboard config required (unlike the Customer Center). On
 * iOS we point at the App Store management URL (iOS billing isn't wired
 * yet, but the link is harmless if reached). Falls back to an Alert with
 * manual steps if the device can't open the deep link.
 */
export async function openManageSubscription(): Promise<void> {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : `https://play.google.com/store/account/subscriptions?sku=${PLAY_SUBSCRIPTION_ID}&package=${PLAY_PACKAGE}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Manage subscription',
      Platform.OS === 'ios'
        ? 'Open Settings → your Apple ID → Subscriptions to manage your plan.'
        : 'Open the Google Play Store → tap your profile → Payments & subscriptions → Subscriptions to manage your plan.',
    );
  }
}

/**
 * Restore the user's previous purchases on this Apple ID / Google
 * account. Apple's App Store review guidelines (3.1.1) require a
 * visible restore mechanism in any app that sells non-consumable
 * IAPs — without it the build gets rejected. The result tells the
 * caller whether the restore activated a Pro entitlement so the UI
 * can confirm or explain.
 *
 * When RevenueCat is disabled (no API key, or the dev kill-switch
 * env var is set), we return `{ ok: false, reason: 'disabled' }`
 * so the UI can still acknowledge the tap rather than hanging.
 */
export type RestoreResult =
  | { ok: true; pro: boolean; customerInfo: CustomerInfo }
  | { ok: false; reason: 'disabled' | 'failed'; message?: string };

export async function restorePurchases(): Promise<RestoreResult> {
  if (disabled || !configured) {
    return { ok: false, reason: 'disabled' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return {
      ok: true,
      pro: isEntitlementActive(customerInfo, ENTITLEMENT_PRO),
      customerInfo,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export { PAYWALL_RESULT };

// ─── React hook for entitlement state ─────────────────────────────────────

/** Display-friendly plan label for the user's current subscription. */
export type CurrentPlan =
  | { tier: 'free' }
  | {
      tier: 'pro';
      /** Subscription period (monthly / yearly / lifetime) or null if
       * RevenueCat can't infer it from the product identifier. */
      period: 'monthly' | 'yearly' | 'lifetime' | null;
      /** ISO timestamp the entitlement expires (null for lifetime /
       * never-expires entitlements). */
      expiresAt: string | null;
      /** True when the entitlement is in a trial period — useful for
       * "Your free trial ends in 5 days" copy. */
      inTrial: boolean;
    };

/**
 * Reactive entitlement hook. Returns the user's current Pro state +
 * plan details; updates automatically when RevenueCat reports a
 * change (purchase, restore, subscription expiry, etc).
 *
 * Returns `{ isPro: false, plan: { tier: 'free' }, isLoading: true }`
 * during the first render and while RevenueCat is loading. Calling
 * sites should treat `isLoading=true` as "we don't yet know" and not
 * lock features prematurely.
 *
 * When RevenueCat is disabled (no API key / kill switch) the hook
 * settles on `isLoading=false, isPro=false` — every user is "free"
 * which matches the in-dev no-billing state.
 */
export function useIsPro(): {
  isPro: boolean;
  plan: CurrentPlan;
  isLoading: boolean;
  /** Trigger restore-purchases — surfaces an inline result so the
   * caller can confirm or show an error. Same envelope as the
   * top-level `restorePurchases` function. */
  restore: () => Promise<RestoreResult>;
} {
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (disabled || !configured) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    // Initial read so we don't wait on the listener for first paint.
    Purchases.getCustomerInfo()
      .then((ci) => {
        if (!cancelled) {
          setInfo(ci);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[revenuecat] getCustomerInfo threw:', err);
        if (!cancelled) setIsLoading(false);
      });
    // Then subscribe to updates so a purchase / restore / expiry
    // flips state without a manual refresh.
    const listener = (ci: CustomerInfo) => {
      if (!cancelled) setInfo(ci);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const isPro = isEntitlementActive(info, ENTITLEMENT_PRO);
  const plan: CurrentPlan = isPro
    ? {
        tier: 'pro',
        period: derivePeriod(info, ENTITLEMENT_PRO),
        expiresAt:
          info?.entitlements.active[ENTITLEMENT_PRO]?.expirationDate ?? null,
        inTrial:
          info?.entitlements.active[ENTITLEMENT_PRO]?.periodType === 'TRIAL',
      }
    : { tier: 'free' };

  return { isPro, plan, isLoading, restore: restorePurchases };
}

/**
 * Derive a coarse monthly/yearly/lifetime label from the active
 * entitlement's product identifier. Stores conventionally name
 * products `*.monthly`, `*.yearly`, `*.lifetime` — we sniff the
 * suffix. Falls back to `null` when the identifier is opaque (e.g.
 * a custom name a store admin set) so the UI can render a neutral
 * "Pro" label instead of an inferred-wrong one.
 */
function derivePeriod(
  info: CustomerInfo | null,
  entitlementId: string,
): 'monthly' | 'yearly' | 'lifetime' | null {
  const productId =
    info?.entitlements.active[entitlementId]?.productIdentifier ?? '';
  const lower = productId.toLowerCase();
  if (lower.includes('lifetime')) return 'lifetime';
  if (lower.includes('yearly') || lower.includes('annual')) return 'yearly';
  if (lower.includes('monthly') || lower.includes('month')) return 'monthly';
  return null;
}

// ─── Active-subscription display details ──────────────────────────────────

export type ProSubscriptionDetails = {
  /** "Monthly" | "Yearly" | "Weekly" | "Lifetime" | null when unknown. */
  periodLabel: string | null;
  /** Localized price + cadence, e.g. "₦4,500 / month" or "$79 / year".
   * Null when we can't read it. Localized by the store, so it shows the
   * buyer's real currency (naira, etc) — never a hardcoded "$". */
  priceLabel: string | null;
  /** Next renewal / expiry, e.g. "May 12, 2027". Null when none. */
  renewalLabel: string | null;
  /** True when the subscription auto-renews (false = cancelled/expiring). */
  willRenew: boolean;
};

const EMPTY_SUB_DETAILS: ProSubscriptionDetails = {
  periodLabel: null,
  priceLabel: null,
  renewalLabel: null,
  willRenew: false,
};

/**
 * Reactive display details for the user's ACTIVE Pro subscription, for the
 * "Account & Subscription" / plan surfaces. Combines two RevenueCat sources:
 *   - CustomerInfo → active entitlement: the Play base-plan id (period),
 *     expiry/renewal date, and willRenew.
 *   - Current offering → the matching package's LOCALIZED price string.
 *     CustomerInfo doesn't carry the price the user paid, so we read it
 *     from the store product, which is correctly localized to the buyer's
 *     currency. This is why we never hardcode a "$" amount.
 *
 * Every field is null until known (or when RC is disabled). Callers should
 * omit the row rather than render a wrong placeholder. Re-derives on every
 * RevenueCat customer-info update (purchase / restore / renewal / expiry).
 */
export function useProSubscriptionDetails(): ProSubscriptionDetails {
  const [state, setState] = useState<ProSubscriptionDetails>(EMPTY_SUB_DETAILS);

  useEffect(() => {
    if (disabled || !configured) return;
    let cancelled = false;

    async function load() {
      try {
        const ci = await Purchases.getCustomerInfo();
        const ent = ci.entitlements.active[ENTITLEMENT_PRO];
        if (!ent) {
          if (!cancelled) setState(EMPTY_SUB_DETAILS);
          return;
        }
        // Play reports the base-plan id (monthly/annual/student) here —
        // the most reliable period signal. Cast defensively in case the
        // installed SDK's types predate the field.
        const basePlan =
          (ent as { productPlanIdentifier?: string | null })
            .productPlanIdentifier ?? null;

        // Match the active product to an offering package to read its
        // localized price + authoritative subscription period. Play
        // product ids look like `bookflow_pro:monthly`, so when the
        // entitlement only reports the bare subscription id we match on
        // the base-plan suffix instead.
        let priceLabel: string | null = null;
        let periodLabel: string | null = null;
        let subPeriodISO: string | null = null;
        try {
          const offering = await getCurrentOffering();
          const pkg =
            offering?.availablePackages.find(
              (p) => p.product.identifier === ent.productIdentifier,
            ) ??
            (basePlan
              ? offering?.availablePackages.find((p) =>
                  p.product.identifier.endsWith(`:${basePlan}`),
                )
              : undefined);
          subPeriodISO = pkg?.product.subscriptionPeriod ?? null;
          periodLabel = labelFromISO(subPeriodISO);
          const word = wordFromISO(subPeriodISO);
          const priceString = pkg?.product.priceString ?? null;
          if (priceString) {
            priceLabel = word ? `${priceString} / ${word}` : priceString;
          }
        } catch {
          // Offerings unavailable — fall back below, leave price null.
        }

        // Fallbacks when the offering lookup couldn't resolve a package.
        if (!periodLabel) {
          periodLabel = labelFromText(basePlan ?? ent.productIdentifier);
        }

        // Renewal date. For an auto-renewing sub we compute
        // start-of-current-period + one billing period, which reads
        // naturally (+1 month / +1 year) and — crucially — is robust to
        // Google Play's SANDBOX clock, where test subs renew every ~5 min
        // so the raw expirationDate is only minutes out. In production
        // this equals the real expiry. For a cancelled sub we show the
        // actual expirationDate (when access genuinely ends).
        const anchor =
          (ent as { latestPurchaseDate?: string | null }).latestPurchaseDate ??
          (ent as { originalPurchaseDate?: string | null })
            .originalPurchaseDate ??
          null;
        let renewalLabel: string | null = null;
        if (ent.willRenew && anchor && subPeriodISO) {
          renewalLabel = formatDate(addPeriod(anchor, subPeriodISO));
        } else if (ent.expirationDate) {
          renewalLabel = formatDate(ent.expirationDate);
        }

        if (!cancelled) {
          setState({
            periodLabel,
            priceLabel,
            renewalLabel,
            willRenew: Boolean(ent.willRenew),
          });
        }
      } catch {
        // CustomerInfo unavailable — keep prior state rather than flicker.
      }
    }

    void load();
    const listener = () => void load();
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  return state;
}

/** ISO-8601 subscription period ("P1M"/"P1Y"/"P1W") → display label. */
function labelFromISO(iso: string | null): string | null {
  if (!iso) return null;
  if (/\d+W$/.test(iso)) return 'Weekly';
  if (/\d+Y$/.test(iso) || iso === 'P12M') return 'Yearly';
  if (/\d+M$/.test(iso)) return 'Monthly';
  if (/\d+D$/.test(iso)) return 'Daily';
  return null;
}

/** ISO-8601 subscription period → cadence word for a price suffix. */
function wordFromISO(iso: string | null): string | null {
  if (!iso) return null;
  if (/\d+W$/.test(iso)) return 'week';
  if (/\d+Y$/.test(iso) || iso === 'P12M') return 'year';
  if (/\d+M$/.test(iso)) return 'month';
  if (/\d+D$/.test(iso)) return 'day';
  return null;
}

/** Last-resort label from a base-plan id / product id string. */
function labelFromText(text: string): string | null {
  const s = text.toLowerCase();
  if (s.includes('annual') || s.includes('year')) return 'Yearly';
  if (s.includes('week')) return 'Weekly';
  if (s.includes('life')) return 'Lifetime';
  if (s.includes('month') || s.includes('student')) return 'Monthly';
  return null;
}

/** ISO timestamp → "May 12, 2027". Defensive against bad input. */
function formatDate(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

/**
 * Add one ISO-8601 billing period (P1M / P1Y / P1W / P7D) to a date,
 * returning a new ISO string. Used to project the next renewal from the
 * current period's start — accurate in production and immune to Google
 * Play's compressed sandbox renewal clock. Returns the input unchanged
 * if the period can't be parsed.
 */
function addPeriod(startISO: string, periodISO: string): string {
  try {
    const d = new Date(startISO);
    if (Number.isNaN(d.getTime())) return startISO;
    const m = periodISO.match(/^P(\d+)([DWMY])$/);
    if (!m) return startISO;
    const n = Number(m[1]);
    switch (m[2]) {
      case 'Y':
        d.setFullYear(d.getFullYear() + n);
        break;
      case 'M':
        d.setMonth(d.getMonth() + n);
        break;
      case 'W':
        d.setDate(d.getDate() + n * 7);
        break;
      case 'D':
        d.setDate(d.getDate() + n);
        break;
    }
    return d.toISOString();
  } catch {
    return startISO;
  }
}
