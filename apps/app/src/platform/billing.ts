/**
 * Billing — the §8 adapter over `react-native-purchases` and
 * `react-native-purchases-ui`. The tenth, and the last with call
 * sites.
 *
 * ## What did not move here
 *
 * `features/billing/api/revenuecat.ts` keeps every Bookflow decision:
 * the entitlement id, the top-up catalogue, the period labels, the two
 * React hooks, the disabled-path copy and the dev kill switch. What
 * moved is the part that touches the SDK — ten operations and the
 * normalisation below.
 *
 * ## Why the types are ours
 *
 * `CustomerInfo` sat in the signature of four files, and three of the
 * fields the feature wanted were read through a cast whose comment
 * said the installed SDK's types might predate them. They do not:
 * `productPlanIdentifier`, `latestPurchaseDate` and
 * `originalPurchaseDate` are all declared in
 * `@revenuecat/purchases-typescript-internal`. A cast repeated at
 * every read is a normalisation with nowhere to live; it has somewhere
 * now. `BillingEntitlement` is the fields the app actually reads,
 * flattened once here, so no screen needs to know which of them the
 * SDK calls what — and the web side has a shape it can honour.
 *
 * `BillingPackage.handle` is the one deliberate leak. The SDK needs
 * its own package object back to start a purchase, so the adapter
 * carries it through untouched. Read nothing from it.
 *
 * ## Why web defers rather than implements
 *
 * §8's web cell for this row is the RevenueCat Web SDK:
 * `@revenuecat/purchases-js`, a dependency the app does not have, and
 * web billing is M8's work. So this follows the honest-deferral rule
 * §8 states for `fileCache` — the import moves behind the adapter now
 * and the web side answers truthfully. There `isAvailable` is false,
 * which is the same answer the feature's old `Platform.OS === 'web'`
 * test produced, except the platform branch now lives on the platform
 * side. That is the whole point of §8.
 */

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesEntitlementInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

/** One active entitlement, as the app reads it. */
export type BillingEntitlement = {
  identifier: string;
  /** Store product id, e.g. `bookflow_pro:monthly`. */
  productIdentifier: string;
  /**
   * Play's base-plan id (`monthly` / `annual` / `student`) — the most
   * reliable period signal there, and absent on other stores.
   */
  basePlanIdentifier: string | null;
  /** ISO timestamp, or null for a lifetime / never-expiring grant. */
  expiresAt: string | null;
  willRenew: boolean;
  inTrial: boolean;
  /**
   * Start of the current billing period, for projecting the next
   * renewal. Latest purchase where the store reports one, falling back
   * to the original.
   */
  currentPeriodStartedAt: string | null;
};

export type BillingCustomer = {
  /** Keyed by entitlement id. Only the active ones. */
  activeEntitlements: Record<string, BillingEntitlement>;
};

export type BillingProduct = {
  identifier: string;
  /**
   * Localised by the store, so it carries the buyer's real currency.
   * Never build one from `price` and a hardcoded symbol.
   */
  priceString: string | null;
  price: number | null;
  currencyCode: string | null;
  /** ISO-8601 period: `P1M`, `P1Y`, `P1W`. Null for a consumable. */
  subscriptionPeriod: string | null;
};

export type BillingPackage = {
  identifier: string;
  product: BillingProduct;
  /**
   * The SDK's own package object, which `purchase` needs back. Opaque
   * on purpose — pass it straight back, read nothing from it.
   */
  handle: unknown;
};

export type BillingOffering = {
  identifier: string;
  packages: BillingPackage[];
};

/**
 * Four outcomes, because cancelling is not failing. A user closing the
 * sheet must not reach the caller as an error, or every purchase
 * surface grows a "was that really a problem?" branch.
 */
export type PurchaseOutcome =
  | { outcome: 'purchased' }
  | { outcome: 'cancelled' }
  | { outcome: 'unavailable' }
  | { outcome: 'failed'; message: string };

export type PaywallOutcome =
  | 'purchased'
  | 'restored'
  | 'cancelled'
  | 'not_presented'
  | 'error';

/**
 * RevenueCat issues a SEPARATE public SDK key per platform (`appl_…`
 * for the iOS app, `goog_…` for the Android app). Configuring with the
 * wrong-platform key silently returns no offerings, so this must pick
 * by platform rather than taking whichever key is set.
 *
 * The legacy single key is a fallback so the existing dev and test
 * setup keeps working until per-platform keys are added.
 */
const apiKey =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) ??
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

/**
 * Whether billing can work at all here: a platform with an
 * implementation, and a key for it. False on web.
 *
 * This is deliberately not "is it switched on" — the dev kill switch
 * is the feature's business, not the platform's.
 */
export const isAvailable: boolean = Boolean(apiKey);

function toEntitlement(ent: PurchasesEntitlementInfo): BillingEntitlement {
  return {
    identifier: ent.identifier,
    productIdentifier: ent.productIdentifier,
    basePlanIdentifier: ent.productPlanIdentifier,
    expiresAt: ent.expirationDate,
    willRenew: ent.willRenew,
    inTrial: ent.periodType === 'TRIAL',
    currentPeriodStartedAt: ent.latestPurchaseDate ?? ent.originalPurchaseDate,
  };
}

function toCustomer(info: CustomerInfo): BillingCustomer {
  const activeEntitlements: Record<string, BillingEntitlement> = {};
  for (const [id, ent] of Object.entries(info.entitlements.active)) {
    activeEntitlements[id] = toEntitlement(ent);
  }
  return { activeEntitlements };
}

function toPackage(pkg: PurchasesPackage): BillingPackage {
  return {
    identifier: pkg.identifier,
    product: {
      identifier: pkg.product.identifier,
      priceString: pkg.product.priceString ?? null,
      price: pkg.product.price ?? null,
      currencyCode: pkg.product.currencyCode ?? null,
      subscriptionPeriod: pkg.product.subscriptionPeriod ?? null,
    },
    handle: pkg,
  };
}

function toOffering(offering: PurchasesOffering): BillingOffering {
  return {
    identifier: offering.identifier,
    packages: offering.availablePackages.map(toPackage),
  };
}

/**
 * Hand the SDK its own package object back. The cast is confined to
 * this one line, which is what `handle` being opaque buys.
 */
const unwrap = (pkg: BillingPackage): PurchasesPackage =>
  pkg.handle as PurchasesPackage;

/**
 * Must run before anything else here. Callers check `isAvailable`
 * first; the throw is for a refactor that stops doing that.
 */
export function configure(appUserId?: string): void {
  if (!apiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_REVENUECAT_API_KEY. Add it to .env or set EXPO_PUBLIC_REVENUECAT_DISABLED=1.',
    );
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey, appUserID: appUserId });
}

export async function logIn(userId: string): Promise<BillingCustomer> {
  const { customerInfo } = await Purchases.logIn(userId);
  return toCustomer(customerInfo);
}

/**
 * Log out, and answer null when there was nobody to log out.
 *
 * RevenueCat errors on logging out an anonymous customer, and after
 * `configure()` with no `appUserId` that is exactly what we are until
 * the first `logIn`. So a sign-out before sign-in, or a second
 * sign-out, would throw and look like a billing fault when nothing is
 * wrong. The id prefix is the test rather than an SDK `isAnonymous`
 * getter, because the prefix is stable across SDK versions.
 */
export async function logOut(): Promise<BillingCustomer | null> {
  const appUserId = await Purchases.getAppUserID();
  if (appUserId.startsWith('$RCAnonymousID:')) return null;
  return toCustomer(await Purchases.logOut());
}

export async function getCustomer(): Promise<BillingCustomer> {
  return toCustomer(await Purchases.getCustomerInfo());
}

/** Fires on purchase, restore, renewal and expiry. Returns unsubscribe. */
export function onCustomerChange(
  listener: (customer: BillingCustomer) => void,
): () => void {
  const wrapped = (info: CustomerInfo) => listener(toCustomer(info));
  Purchases.addCustomerInfoUpdateListener(wrapped);
  return () => Purchases.removeCustomerInfoUpdateListener(wrapped);
}

export async function getOfferings(): Promise<{
  current: BillingOffering | null;
  byId: Record<string, BillingOffering>;
}> {
  const offerings = await Purchases.getOfferings();
  const byId: Record<string, BillingOffering> = {};
  for (const [id, offering] of Object.entries(offerings.all)) {
    byId[id] = toOffering(offering);
  }
  return {
    current: offerings.current ? toOffering(offerings.current) : null,
    byId,
  };
}

export async function purchase(pkg: BillingPackage): Promise<PurchaseOutcome> {
  try {
    await Purchases.purchasePackage(unwrap(pkg));
    return { outcome: 'purchased' };
  } catch (err) {
    // `userCancelled` is how this SDK reports a closed sheet: an
    // error object with a flag, not a distinct result. Reading it
    // here is what keeps that shape out of the app.
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return { outcome: 'cancelled' };
    return { outcome: 'failed', message: e?.message ?? 'purchase_failed' };
  }
}

/** Throws on failure — unlike a cancelled purchase, that is an error. */
export async function restore(): Promise<BillingCustomer> {
  return toCustomer(await Purchases.restorePurchases());
}

const PAYWALL_OUTCOMES: Record<PAYWALL_RESULT, PaywallOutcome> = {
  [PAYWALL_RESULT.PURCHASED]: 'purchased',
  [PAYWALL_RESULT.RESTORED]: 'restored',
  [PAYWALL_RESULT.CANCELLED]: 'cancelled',
  [PAYWALL_RESULT.NOT_PRESENTED]: 'not_presented',
  [PAYWALL_RESULT.ERROR]: 'error',
};

/**
 * RevenueCat's hosted paywall. With `requiredEntitlement` it no-ops
 * when that entitlement is already active, which is what every call
 * site in the app wants.
 */
export async function presentPaywall(opts?: {
  requiredEntitlement?: string;
}): Promise<PaywallOutcome> {
  const result = opts?.requiredEntitlement
    ? await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: opts.requiredEntitlement,
      })
    : await RevenueCatUI.presentPaywall();
  return PAYWALL_OUTCOMES[result];
}

export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}
