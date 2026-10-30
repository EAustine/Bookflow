/**
 * Billing on web — deferred, and honest about it. See `billing.ts` for
 * the contract.
 *
 * §8's web cell for this row is the RevenueCat Web SDK
 * (`@revenuecat/purchases-js`). The app does not depend on it and web
 * billing is M8, so this is the deferral §8 describes rather than an
 * implementation: the import moves behind the adapter at M4 and the
 * web side answers truthfully in the meantime.
 *
 * The split follows `fileCache`. Anything shaped like a question
 * answers empty — no entitlements, no offerings — because "we know of
 * no subscription for you" is true here. Anything that would promise
 * a change in state rejects, because telling someone their purchase
 * was restored when nothing was restored is a promise the product
 * breaks the next time they open the app. `purchase` is the exception
 * only in form: it reports `unavailable` through the union it already
 * has, which is why no purchase surface needs a try/catch for web.
 *
 * `isAvailable` being false is what every caller actually branches on,
 * so none of the rejections below are reachable today. They are
 * written for the refactor that stops checking.
 */

const UNAVAILABLE = 'Billing is not available on web yet.';

export const isAvailable: typeof import('./billing').isAvailable = false;

export const configure: typeof import('./billing').configure = () => {
  // Nothing to configure. Not a throw: the root layout calls this on
  // every platform, and web reaching it is expected, not a fault.
};

export const logIn: typeof import('./billing').logIn = async () => ({
  activeEntitlements: {},
});

export const logOut: typeof import('./billing').logOut = async () => null;

export const getCustomer: typeof import('./billing').getCustomer = async () => ({
  activeEntitlements: {},
});

export const onCustomerChange: typeof import('./billing').onCustomerChange =
  () => {
    // Never fires, so the unsubscribe has nothing to undo. Returning a
    // function rather than undefined keeps every caller's cleanup path
    // identical to native.
    return () => {};
  };

export const getOfferings: typeof import('./billing').getOfferings =
  async () => ({ current: null, byId: {} });

export const purchase: typeof import('./billing').purchase = async () => ({
  outcome: 'unavailable',
});

export const restore: typeof import('./billing').restore = async () => {
  throw new Error(UNAVAILABLE);
};

export const presentPaywall: typeof import('./billing').presentPaywall =
  async () => 'not_presented';

export const presentCustomerCenter: typeof import('./billing').presentCustomerCenter =
  async () => {
    throw new Error(UNAVAILABLE);
  };
