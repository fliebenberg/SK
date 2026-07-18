import { useRouter } from 'expo-router';
import { useCallback } from 'react';

export function useSafeBack() {
  const router = useRouter();

  return useCallback((fallbackHref: string) => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackHref as any);
    }
  }, [router]);
}
