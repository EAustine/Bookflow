import { useCustomerInfo } from './useCustomerInfo';

export function useEntitlement(entitlementId: string) {
  const { customerInfo, isLoading, error } = useCustomerInfo();
  return {
    isActive: Boolean(customerInfo?.entitlements.active[entitlementId]),
    customerInfo,
    isLoading,
    error,
  };
}
