import React, { useState, useEffect } from 'react';
import { WifiOff, Clock, Loader2, CheckCircle2, X } from 'lucide-react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import {
  getRejectedInvoices,
  subscribeRejectedInvoices,
  RejectedInvoiceAlert,
} from '../../lib/pending';

export const SyncIndicator: React.FC = () => {
  const { connection, pendingInvoices } = useSyncStatus();
  const [rejectedInvoices, setRejectedInvoices] = useState<RejectedInvoiceAlert[]>(() =>
    getRejectedInvoices()
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return subscribeRejectedInvoices(() => {
      setRejectedInvoices(getRejectedInvoices());
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const pendingCount = pendingInvoices.length;
  const pendingCountAr = pendingCount.toLocaleString('ar-EG');
  const hasRejected = rejectedInvoices.length > 0;
  const hasPending = pendingCount > 0;

  let badgeClasses = 'bg-emerald-100 text-emerald-900 border-emerald-300';
  let badgeText = 'تمام';
  let BadgeIcon: React.ReactNode = <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;

  if (connection === 'offline' || hasRejected) {
    badgeClasses = 'bg-rose-100 text-rose-800 border-rose-300';
    BadgeIcon = <WifiOff className="w-3.5 h-3.5 shrink-0" />;
    if (hasRejected) {
      badgeText = 'فاتورة مرفوضة';
    } else if (hasPending) {
      badgeText = `النت فاصل • ${pendingCountAr} لم يُرفع`;
    } else {
      badgeText = 'النت فاصل';
    }
  } else if (hasPending) {
    badgeClasses = 'bg-accent-100 text-accent-700 border-accent-400';
    BadgeIcon = <Clock className="w-3.5 h-3.5 shrink-0" />;
    badgeText = `${pendingCountAr} لم يُرفع`;
  } else if (connection === 'checking') {
    badgeClasses = 'bg-white/90 text-slate-700 border-brand-200';
    BadgeIcon = <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />;
    badgeText = 'جاري الاتصال';
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${badgeClasses}`}
      >
        {BadgeIcon}
        <span>{badgeText}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            dir="rtl"
            className="fixed z-50 top-[68px] inset-x-3 sm:inset-x-auto sm:left-4 sm:w-80 bg-white border border-brand-100 rounded-2xl shadow-lg p-4 text-sm space-y-2"
          >
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-brand-100">
              <div>
                {connection === 'online' ? (
                  <span className="font-bold text-brand-700">النت: شغال</span>
                ) : connection === 'offline' ? (
                  <span className="font-bold text-rose-700">النت: فاصل</span>
                ) : (
                  <span className="font-bold text-slate-600">جاري فحص الاتصال…</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="إغلاق"
                className="p-1 rounded-lg text-slate-400 hover:text-brand-800 hover:bg-brand-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {hasPending && (
              <div className="space-y-1">
                <p className="text-slate-800 font-medium">فواتير لسه ما اترفعتش:</p>
                <p className="font-mono text-xs text-slate-800 bg-brand-50 border border-brand-100 rounded-xl p-2 break-words">
                  {pendingInvoices.join('، ')}
                </p>
                <p className="text-xs text-slate-500">
                  {connection === 'offline'
                    ? 'كمّل بيع عادي، هتترفع لما النت يرجع.'
                    : 'سيب الصفحة مفتوحة، هيترفعوا لوحدهم.'}
                </p>
              </div>
            )}

            {!hasPending && !hasRejected && (
              <p className="text-slate-600 text-xs">مفيش فواتير معلّقة. كل حاجة اترفعت.</p>
            )}

            {hasRejected && (
              <div className="space-y-1.5 pt-1 border-t border-rose-100">
                {rejectedInvoices.map((rej) => (
                  <div
                    key={rej.invoiceNumber}
                    className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800"
                  >
                    <p className="text-xs font-bold">
                      فاتورة {rej.invoiceNumber} رفضها السيرفر
                    </p>
                    <p className="text-[11px] text-rose-700 mt-0.5">{rej.errorMessage}</p>
                  </div>
                ))}
                <p className="text-xs font-bold text-rose-700">راجع الإدارة.</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};
