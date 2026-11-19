import { useState, useEffect, useRef } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type SyncConnectionStatus = 'checking' | 'online' | 'offline';

export interface SyncStatusResult {
  connection: SyncConnectionStatus;
  pendingInvoices: string[];
}

export function useSyncStatus(): SyncStatusResult {
  const [connection, setConnection] = useState<SyncConnectionStatus>('checking');
  const [pendingInvoices, setPendingInvoices] = useState<string[]>([]);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubWallet: (() => void) | undefined;
    let unsubInvoices: (() => void) | undefined;

    const clearOfflineTimer = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };

    const startOfflineTimerIfNeeded = () => {
      if (offlineTimerRef.current) return;
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null;
        if (isMounted) {
          setConnection('offline');
        }
      }, 8000);
    };

    const handleWindowOffline = () => {
      clearOfflineTimer();
      if (isMounted) {
        setConnection('offline');
      }
    };

    const handleWindowOnline = () => {
      if (isMounted) {
        setConnection('checking');
        startOfflineTimerIfNeeded();
      }
    };

    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('offline', handleWindowOffline);
        window.addEventListener('online', handleWindowOnline);
      }

      if (db) {
        const walletDocRef = doc(db, 'stats', 'wallets');
        unsubWallet = onSnapshot(
          walletDocRef,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!isMounted) return;
            if (snapshot.metadata.fromCache === false) {
              clearOfflineTimer();
              setConnection('online');
            } else {
              startOfflineTimerIfNeeded();
            }
          },
          () => {
            if (!isMounted) return;
            clearOfflineTimer();
            setConnection('offline');
          }
        );

        const invoicesColRef = collection(db, 'invoices');
        unsubInvoices = onSnapshot(
          invoicesColRef,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!isMounted) return;
            const pending: string[] = [];
            for (const d of snapshot.docs) {
              if (d.metadata.hasPendingWrites) {
                const data = d.data();
                pending.push(String(data?.invoiceNumber || d.id));
              }
            }
            pending.sort((a, b) => a.localeCompare(b));
            setPendingInvoices(pending);
          },
          () => {
            // تجاهل أخطاء قراءة الفواتير المعلقة بصمت
          }
        );
      }
    } catch {
      if (isMounted) {
        setConnection('offline');
      }
    }

    return () => {
      isMounted = false;
      clearOfflineTimer();
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleWindowOffline);
        window.removeEventListener('online', handleWindowOnline);
      }
      if (unsubWallet) unsubWallet();
      if (unsubInvoices) unsubInvoices();
    };
  }, []);

  return { connection, pendingInvoices };
}
