import { useEffect, useState } from 'react';
import Purchases, { type CustomerInfo } from 'react-native-purchases';

type UseCustomerInfoResult = {
  customerInfo: CustomerInfo | null;
  isLoading: boolean;
  error: Error | null;
};

export function useCustomerInfo(): UseCustomerInfoResult {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    Purchases.getCustomerInfo()
      .then((info) => {
        if (!mounted) return;
        setCustomerInfo(info);
        setError(null);
      })
      .catch((err: Error) => {
        if (mounted) setError(err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const onUpdate = (info: CustomerInfo) => {
      if (!mounted) return;
      setCustomerInfo(info);
      setError(null);
    };
    Purchases.addCustomerInfoUpdateListener(onUpdate);

    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener(onUpdate);
    };
  }, []);

  return { customerInfo, isLoading, error };
}
