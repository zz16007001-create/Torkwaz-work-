import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export interface RejectedInvoiceAlert {
  invoiceNumber: string;
  errorMessage: string;
  timestamp: number;
}

/**
 * عدّاد العمليات التي لم يؤكدها السيرفر بعد (يُقرأ من حالة Firestore الفعلية مع includeMetadataChanges).
 */
let count = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

let rejectedInvoices: RejectedInvoiceAlert[] = [];
const rejectedSubs = new Set<() => void>();
const emitRejected = () => rejectedSubs.forEach((f) => f());

export const getPendingCount = () => count;

let listenerStarted = false;

export function initPendingListener(): void {
  if (listenerStarted) return;
  listenerStarted = true;

  try {
    if (typeof window !== 'undefined' && db) {
      const invCol = collection(db, 'invoices');
      onSnapshot(
        invCol,
        { includeMetadataChanges: true },
        (snapshot) => {
          let pending = 0;
          for (const d of snapshot.docs) {
            if (d.metadata.hasPendingWrites) {
              pending++;
            }
          }
          count = pending;
          emit();
        },
        (err) => {
          console.warn('Pending invoices onSnapshot error:', err);
        }
      );
    }
  } catch (err) {
    console.warn('Could not initialize pending listener:', err);
  }
}

export function subscribePending(fn: () => void): () => void {
  initPendingListener();
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function trackPending(_p: Promise<unknown>): void {
  // العدّاد يُقرأ الآن بدقة ومباشرة من Firestore metadata.hasPendingWrites
  // ليبقى صحيحاً ومستقراً حتى بعد تحديث الصفحة (Refresh)
}

export const getRejectedInvoices = (): RejectedInvoiceAlert[] => [...rejectedInvoices];

export function reportRejectedInvoice(alert: RejectedInvoiceAlert): void {
  if (!rejectedInvoices.some((r) => r.invoiceNumber === alert.invoiceNumber)) {
    rejectedInvoices.push(alert);
    emitRejected();
  }
}

export function dismissRejectedInvoice(invoiceNumber: string): void {
  rejectedInvoices = rejectedInvoices.filter((r) => r.invoiceNumber !== invoiceNumber);
  emitRejected();
}

export function subscribeRejectedInvoices(fn: () => void): () => void {
  rejectedSubs.add(fn);
  return () => {
    rejectedSubs.delete(fn);
  };
}
