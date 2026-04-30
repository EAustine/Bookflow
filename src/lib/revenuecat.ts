import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

export const ENTITLEMENT_PRO = 'Bookflow Pro';

export type ProductId = 'lifetime' | 'yearly' | 'monthly';

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

let configured = false;

export function configureRevenueCat(appUserID?: string): void {
  if (configured) return;
  if (!apiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_REVENUECAT_API_KEY. Add it to .env.',
    );
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey, appUserID });
  configured = true;
}

export async function loginRevenueCat(userId: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

export async function logoutRevenueCat(): Promise<CustomerInfo> {
  return Purchases.logOut();
}

export function isEntitlementActive(
  customerInfo: CustomerInfo | null | undefined,
  entitlementId: string,
): boolean {
  return Boolean(customerInfo?.entitlements.active[entitlementId]);
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function presentPaywall(opts?: {
  requiredEntitlement?: string;
  offering?: PurchasesOffering;
}): Promise<PAYWALL_RESULT> {
  if (opts?.requiredEntitlement) {
    return RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: opts.requiredEntitlement,
      offering: opts.offering,
    });
  }
  return RevenueCatUI.presentPaywall({ offering: opts?.offering });
}

export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}

export { PAYWALL_RESULT };
