// M0 spike 2 stub — react-native-purchases
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


const notOnWeb = (name) => () => {
  throw new Error(`[stub] react-native-purchases.${name} on web — M8 uses the RevenueCat Web SDK`);
};
export default {
  configure: notOnWeb('configure'),
  getOfferings: notOnWeb('getOfferings'),
  purchasePackage: notOnWeb('purchasePackage'),
  getCustomerInfo: notOnWeb('getCustomerInfo'),
  logIn: notOnWeb('logIn'),
  logOut: notOnWeb('logOut'),
  addCustomerInfoUpdateListener: () => () => {},
  setLogLevel: () => {},
};
export const LOG_LEVEL = { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };
export const PURCHASES_ERROR_CODE = {};
