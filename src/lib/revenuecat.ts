import { Alert } from 'react-native';
import { useEffect, useState } from 'react';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export const ENTITLEMENT_PRO = 'Bookflow Pro';

export type ProductId = 'lifetime' | 'yearly' | 'monthly';

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

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
