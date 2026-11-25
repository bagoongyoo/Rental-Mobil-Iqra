import { useState, useEffect, useCallback } from 'react';
import { checkServerConnectivity } from '../api/driverApi';

/**
 * Hook untuk memantau koneksi internet driver secara realtime
 * dan melakukan pengecekan koneksi sebelum driver memulai tugas.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const verifyConnectionBeforeAction = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    setIsChecking(true);
    try {
      const reachable = await checkServerConnectivity();
      setIsOnline(reachable);
      return reachable;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    isOnline,
    isChecking,
    verifyConnectionBeforeAction,
  };
}
