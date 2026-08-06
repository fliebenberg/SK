import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

export function useSocketQuery<T = any>(
  type: string,
  payload: Record<string, any> = {},
  options: { timeoutMs?: number } = {}
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
        } else {
          setData(res);
        }
        setIsLoading(false);
      },
      options.timeoutMs
    );
  }, [isConnected, type, payloadString, options.timeoutMs]);

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
        } else {
          setData(res);
        }
        setIsLoading(false);
      },
      options.timeoutMs
    );

    return () => {
      active = false;
    };
  }, [isConnected, type, payloadString, options.timeoutMs]);

  return { data, isLoading, error, refetch: fetchData, setData };
}
