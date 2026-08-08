import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';
import { useToastStore } from '../store/toastStore';

export function useSocketQuery<T = any>(
  type: string,
  payload: Record<string, any> = {},
  options: { timeoutMs?: number; suppressToast?: boolean } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const isConnected = useWsStore(state => state.isConnected);

  // Stringify payload to use as key in dependency array
  const payloadString = JSON.stringify(payload);

  const fetchData = useCallback(() => {
    if (!isConnected) return;
    
    setIsLoading(true);
    setError(null);

    wsService.emit(
      'get_data',
      { type, ...payload },
      (res: any) => {
        if (res && res.error) {
          setError(res.error);
          if (!options.suppressToast) {
            const msg = typeof res.error === 'string' ? res.error : 'Failed to fetch data';
            useToastStore.getState().showError(msg, 'Data Query Failed');
          }
        } else {
          setData(res);
        }
        setIsLoading(false);
      },
      options.timeoutMs,
      { suppressToast: options.suppressToast }
    );
  }, [isConnected, type, payloadString, options.timeoutMs, options.suppressToast]);

  useEffect(() => {
    let active = true;

    if (!isConnected) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    wsService.emit(
      'get_data',
      { type, ...payload },
      (res: any) => {
        if (!active) return;
        if (res && res.error) {
          setError(res.error);
          if (!options.suppressToast) {
            const msg = typeof res.error === 'string' ? res.error : 'Failed to fetch data';
            useToastStore.getState().showError(msg, 'Data Query Failed');
          }
        } else {
          setData(res);
        }
        setIsLoading(false);
      },
      options.timeoutMs,
      { suppressToast: options.suppressToast }
    );

    return () => {
      active = false;
    };
  }, [isConnected, type, payloadString, options.timeoutMs, options.suppressToast]);

  return { data, isLoading, error, refetch: fetchData, setData };
}
