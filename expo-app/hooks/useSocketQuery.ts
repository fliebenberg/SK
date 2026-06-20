import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

export function useSocketQuery<T = any>(type: string, payload: Record<string, any> = {}) {
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

    wsService.emit('get_data', { type, ...payload }, (res: any) => {
      if (res && res.error) {
        setError(res.error);
      } else {
        setData(res);
      }
      setIsLoading(false);
    });
  }, [isConnected, type, payloadString]);

  useEffect(() => {
    let active = true;

    if (!isConnected) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    wsService.emit('get_data', { type, ...payload }, (res: any) => {
      if (!active) return;
      if (res && res.error) {
        setError(res.error);
      } else {
        setData(res);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isConnected, type, payloadString]);

  return { data, isLoading, error, refetch: fetchData, setData };
}
