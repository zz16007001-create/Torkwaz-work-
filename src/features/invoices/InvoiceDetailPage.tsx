import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useUiMode } from '../../lib/uiMode';
import { createReturn, cancelInvoice, ReturnLineInput, generateReturnId } from '../../lib/data';
import { calculateLineReturn } from '../../domain/invoice';
import { formatCurrency, round2 } from '../../domain/money';
import { formatDate } from '../../domain/dates';
import { WalletId } from '../../domain/types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import {
  ArrowRight,
  User,
  Phone,
  Printer,
  RotateCcw,
  Ban,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mode } = useUiMode();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // حالة نافذة المرتجع ومعرف المرتجع الثابت
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnId, setReturnId] = useState<string>(() => generateReturnId());
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [refundWallet, setRefundWallet] = useState<WalletId>('cash');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // حالة نافذة تأكيد الإلغاء
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, 'invoices', id),
      (snap) => {
        if (snap.exists()) {
          setInvoice({ id: snap.id, ...snap.data() });
        } else {
          setErrorMsg('لم يتم العثور على الفاتورة المطلوبة');
        }
        setLoading(false);
      },
      (err) => {
        setErrorMsg('فشل تحميل الفاتورة: ' + err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  // إعداد وتصفير كميات المرتجع عند فتح النافذة
  const openReturnModal = () => {
    if (!invoice) return;
    const initial: Record<string, number> = {};
    (invoice.items || []).forEach((it: any, idx: number) => {
      initial[`${it.itemId || 'item'}_${idx}`] = 0;
    });
    setReturnQuantities(initial);
    setReturnId(generateReturnId());
    setIsReturnModalOpen(true);
    setErrorMsg(null);
  };

  // حساب معاينة المرتجع
  const returnPreview = useMemo(() => {
    if (!invoice || !invoice.items) {
      return { totalReturnValue: 0, appliedToDebt: 0, cashRefund: 0, validLines: [] };
    }

    let totalVal = 0;
    const validLines: ReturnLineInput[] = [];

    invoice.items.forEach((it: any, idx: number) => {
      const lineKey = `${it.itemId || 'item'}_${idx}`;
      const returnQty = returnQuantities[lineKey] || 0;
      if (returnQty > 0) {
        const soldQty = Number(it.quantity) || 1;
        // نفس منطق createReturn: القيمة بعد الخصم والضريبة، مع مراعاة ما سبق إرجاعه
        const sumTotals = invoice.items.reduce(
          (sm: number, x: any) => sm + (Number(x.total) || Number(x.unitPrice) * Number(x.quantity) || 0),
          0
        );
        const legacyFactor = sumTotals > 0 ? (Number(invoice.grandTotal) || sumTotals) / sumTotals : 1;
        const lineNet =
          it.lineGrand !== undefined && it.lineGrand !== null
            ? Number(it.lineGrand)
            : round2((Number(it.total) || Number(it.unitPrice) * soldQty) * legacyFactor);
        const { refundAmount } = calculateLineReturn(
          lineNet,
          soldQty,
          returnQty,
          Number(it.returnedQty) || 0,
          Number(it.returnedAmount) || 0
        );
        totalVal = round2(totalVal + refundAmount);
        validLines.push({ itemId: it.itemId, quantity: returnQty, lineIndex: idx });
      }
    });

    const currentDebt = round2(Number(invoice.remainingAmount) || 0);
    const appliedToDebt = round2(Math.min(currentDebt, totalVal));
    const cashRefund = round2(totalVal - appliedToDebt);

    return {
      totalReturnValue: totalVal,
      appliedToDebt,
      cashRefund,
      validLines,
    };
  }, [invoice, returnQuantities]);

  // تنفيذ المرتجع
  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice || !id || isSubmittingReturn) return;
    setErrorMsg(null);

    if (returnPreview.validLines.length === 0 || returnPreview.totalReturnValue <= 0) {
      setErrorMsg('يرجى إدخال كمية مرتجعة واحدة على الأقل');
      return;
    }

    try {
      setIsSubmittingReturn(true);
      await createReturn(id, returnPreview.validLines, refundWallet, returnId);
      setSuccessMsg('تم تسجيل المرتجع بنجاح وتحديث المخزون والخزينة');
      setReturnId(generateReturnId());
      setIsReturnModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل المرتجع');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // تنفيذ إلغاء الفاتورة
  const handleConfirmCancel = async () => {
    if (!invoice || !id || isSubmittingCancel) return;
    setErrorMsg(null);

    try {
      setIsSubmittingCancel(true);
      await cancelInvoice(id);
      setSuccessMsg('تم إلغاء الفاتورة بالكامل وعكس القيود بنجاح');
      setIsCancelModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل إلغاء الفاتورة');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-3">جاري تحميل الفاتورة...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <Card className="p-8">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">الفاتورة غير موجودة</h2>
          <Button onClick={() => navigate('/invoices')} variant="outline" className="mt-4 gap-2">
            <ArrowRight className="w-4 h-4" />
            <span>العودة للفواتير</span>
          </Button>
        </Card>
      </div>
    );
  }

  const isCancelled = invoice.status === 'cancelled';
  const hasDebt = (invoice.remainingAmount || 0) > 0.01;
  const hasDiscount = (invoice.discountTotal || 0) > 0;
  const payments = invoice.payments || {};

  // فحص ما إذا كان هناك أي بنود قابلة للإرجاع
  const hasReturnableItems = (invoice.items || []).some(
    (it: any) => (Number(it.quantity) || 0) > (Number(it.returnedQty) || 0)
  );
  const hasAnyReturned = (invoice.items || []).some(
    (it: any) => (Number(it.returnedQty) || 0) > 0
  );

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {/* الشريط العلوي والأزرار */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <button
            onClick={() => navigate('/invoices')}
            className="p-1.5 rounded-lg border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 transition-colors shrink-0 mt-0.5 print:hidden"
            title="رجوع لسجل الفواتير"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">
                فاتورة {invoice.invoiceNumber}
              </h1>
              {isCancelled ? (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-700 shrink-0 print:bg-white print:text-slate-900 print:border print:border-slate-300">
                  ملغاة
                </span>
              ) : hasDebt ? (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-accent-100 text-accent-700 shrink-0 print:bg-white print:text-slate-900 print:border print:border-slate-300">
                  آجل
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-brand-100 text-brand-800 shrink-0 print:bg-white print:text-slate-900 print:border print:border-slate-300">
                  مدفوعة
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {formatDate(invoice.createdAt, true)}
            </p>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex items-center gap-1.5 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="flex-1 justify-center gap-1 h-8 px-2 text-xs"
          >
            <Printer className="w-3.5 h-3.5 text-brand-600 shrink-0" />
            <span>طباعة</span>
          </Button>

          {!isCancelled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasReturnableItems}
              onClick={openReturnModal}
              title={hasReturnableItems ? 'تسجيل مرتجع' : 'تم إرجاع كافة البنود بالفعل'}
              className="flex-1 justify-center gap-1 h-8 px-2 text-xs text-accent-700 border-accent-400 hover:bg-accent-50 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5 text-accent-600 shrink-0" />
              <span>مرتجع</span>
            </Button>
          )}

          {!isCancelled && mode !== 'sales' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCancelModalOpen(true)}
              className="flex-1 justify-center gap-1 h-8 px-2 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <Ban className="w-3.5 h-3.5 shrink-0" />
              <span>إلغاء</span>
            </Button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-2.5 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* بيانات العميل */}
      <Card className="p-3 border-brand-100">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 min-w-0">
            <User className="w-3.5 h-3.5 text-brand-600 shrink-0 print:hidden" />
            <span className="truncate">{invoice.customerName || 'عميل نقدي'}</span>
          </div>

          <div className="flex items-center gap-1.5 font-medium text-slate-600 shrink-0">
            <Phone className="w-3.5 h-3.5 text-brand-600 shrink-0 print:hidden" />
            <span dir="ltr">{invoice.customerPhone || '-'}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-2 pt-2 border-t border-brand-100 text-[11px] text-slate-600">
            <span className="font-bold ml-1">ملاحظات:</span>
            <span>{invoice.notes}</span>
          </div>
        )}
      </Card>

      {/* بنود الفاتورة - ممنوع تماماً إظهار سعر الشراء أو الربح */}
      <Card className="p-0 overflow-hidden border-brand-100">
        <div className="px-3 py-2 bg-brand-50 border-b border-brand-100 flex items-center justify-between gap-2 print:bg-white print:border-slate-300">
          <h2 className="text-xs font-bold text-brand-800 print:text-slate-900">بنود الفاتورة</h2>
          {isCancelled && (
            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
              تم إلغاء وإرجاع كافة البنود للمخزن
            </span>
          )}
        </div>

        {/* عرض الموبايل: كروت صغيرة بدون سكرول أفقي */}
        <div className="md:hidden print:hidden divide-y divide-brand-100">
          {(invoice.items || []).map((it: any, index: number) => {
            const returned = Number(it.returnedQty) || 0;
            return (
              <div key={index} className="p-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 leading-snug">
                    {it.name}
                  </span>
                  <span className="text-xs font-black text-slate-900 shrink-0">
                    {formatCurrency(it.total || it.unitPrice * it.quantity)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-brand-700">{it.code || '-'}</span>
                    <span>
                      {it.quantity} × {formatCurrency(it.unitPrice)}
                    </span>
                  </div>
                  {returned > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 shrink-0">
                      مرتجع سابقاً: {returned} قطعة
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* عرض اللاب توب والطباعة: جدول نظيف */}
        <div className="hidden md:block print:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-brand-50 text-[11px] text-brand-800 border-b border-brand-100 print:bg-slate-100 print:text-slate-900 print:border-slate-300">
              <tr>
                <th className="p-2 font-semibold">#</th>
                <th className="p-2 font-semibold">الكود</th>
                <th className="p-2 font-semibold">الصنف / الموديل</th>
                <th className="p-2 font-semibold text-center">الكمية المباعة</th>
                {hasAnyReturned && (
                  <th className="p-2 font-semibold text-center">المرتجع سابقاً</th>
                )}
                <th className="p-2 font-semibold">سعر الوحدة</th>
                <th className="p-2 font-semibold text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 print:divide-slate-200">
              {(invoice.items || []).map((it: any, index: number) => {
                const returned = Number(it.returnedQty) || 0;
                return (
                  <tr key={index} className="hover:bg-brand-50/50">
                    <td className="p-2 text-xs text-slate-400">{index + 1}</td>
                    <td className="p-2 font-mono text-xs font-bold text-brand-800 print:text-slate-900">
                      {it.code || '-'}
                    </td>
                    <td className="p-2 font-medium text-slate-800">{it.name}</td>
                    <td className="p-2 font-bold text-slate-900 text-center">{it.quantity}</td>
                    {hasAnyReturned && (
                      <td className="p-2 font-medium text-accent-700 text-center print:text-slate-800">
                        {returned > 0 ? `${returned} قطعة` : '-'}
                      </td>
                    )}
                    <td className="p-2 font-medium text-slate-700">
                      {formatCurrency(it.unitPrice)}
                    </td>
                    <td className="p-2 font-bold text-slate-900 text-left">
                      {formatCurrency(it.total || it.unitPrice * it.quantity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* كارت الحساب المدمج (الإجماليات + طرق الدفع) */}
      <Card className="p-3 border-brand-100 space-y-2">
        <h2 className="text-xs font-bold text-brand-800 border-b border-brand-100 pb-1.5 print:text-slate-900 print:border-slate-300">
          الحساب
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-6">
          {/* الإجماليات */}
          <div className="space-y-1.5 text-xs">
            {hasDiscount && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(invoice.subtotal || invoice.grandTotal)}
                  </span>
                </div>

                <div className="flex justify-between text-rose-600 font-bold">
                  <span>خصم الفاتورة:</span>
                  <span>-{formatCurrency(invoice.discountTotal)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between items-center text-sm font-black text-slate-900">
              <span>إجمالي الفاتورة:</span>
              <span className="text-base">{formatCurrency(invoice.grandTotal)}</span>
            </div>
          </div>

          {/* طرق الدفع والمسدد والمتبقي */}
          <div className="space-y-1.5 text-xs border-t border-brand-100 pt-2 md:border-t-0 md:pt-0 md:border-r md:pr-6 print:border-slate-300">
            {payments.cash > 0 && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-brand-600 shrink-0 print:hidden" />
                  <span>نقدي (خزينة المحل):</span>
                </span>
                <span className="font-bold">{formatCurrency(payments.cash)}</span>
              </div>
            )}

            {payments.instapay > 0 && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-brand-700 shrink-0 print:hidden" />
                  <span>إنستاباي (البنك):</span>
                </span>
                <span className="font-bold">{formatCurrency(payments.instapay)}</span>
              </div>
            )}

            {payments.wallet > 0 && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-rose-600 shrink-0 print:hidden" />
                  <span>فودافون كاش:</span>
                </span>
                <span className="font-bold">{formatCurrency(payments.wallet)}</span>
              </div>
            )}

            <div className="flex items-center justify-between font-bold text-slate-900 pt-1">
              <span>إجمالي المسدد:</span>
              <span className="text-brand-700 print:text-slate-900">{formatCurrency(invoice.paidAmount)}</span>
            </div>

            {hasDebt && !isCancelled && (
              <div className="flex justify-between items-center text-rose-600 font-black text-xs bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg print:bg-white print:text-slate-900 print:border-slate-300">
                <span>المتبقي آجل (دين):</span>
                <span>{formatCurrency(invoice.remainingAmount)}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* نافذة المرتجع */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title={`تسجيل مرتجع - فاتورة ${invoice.invoiceNumber}`}
      >
        <form onSubmit={handleConfirmReturn} className="space-y-4">
          <div className="space-y-3 max-h-60 overflow-y-auto p-1">
            {(invoice.items || []).map((it: any, idx: number) => {
              const lineKey = `${it.itemId || 'item'}_${idx}`;
              const soldQty = Number(it.quantity) || 0;
              const returnedSoFar = Number(it.returnedQty) || 0;
              const maxReturnable = Math.max(0, soldQty - returnedSoFar);

              if (maxReturnable <= 0) return null;

              return (
                <div
                  key={lineKey}
                  className="p-3 bg-brand-50/60 border border-brand-100 rounded-xl space-y-2"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">{it.name}</span>
                    <span className="text-slate-500">
                      المتاح للإرجاع: <strong>{maxReturnable}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-600 shrink-0">الكمية المرتجعة:</label>
                    <input
                      type="number"
                      min="0"
                      max={maxReturnable}
                      value={returnQuantities[lineKey] || 0}
                      onChange={(e) => {
                        const val = Math.min(
                          maxReturnable,
                          Math.max(0, parseInt(e.target.value) || 0)
                        );
                        setReturnQuantities((prev) => ({ ...prev, [lineKey]: val }));
                      }}
                      className="w-20 bg-white border border-brand-200 rounded-lg px-2 py-1 text-center font-bold text-sm focus:outline-none focus:border-brand-600"
                    />
                    <span className="text-xs text-slate-400">
                      سعر الوحدة: {formatCurrency(it.unitPrice)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* اختيار خزينة الرد */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              خزينة رد المبلغ النقدي (إن وجد رد كاش):
            </label>
            <select
              value={refundWallet}
              onChange={(e) => setRefundWallet(e.target.value as WalletId)}
              className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-600"
            >
              <option value="cash">خزينة المحل (نقدية / كاش)</option>
              <option value="bank">الحساب البنكي / إنستاباي</option>
              <option value="wallet">محفظة إلكترونية / فودافون كاش</option>
            </select>
          </div>

          {/* معاينة الحسبة المالية للمرتجع */}
          <div className="p-3 rounded-xl bg-brand-50/70 border border-brand-100 text-xs font-bold space-y-1.5">
            <div className="flex justify-between text-slate-700">
              <span>إجمالي قيمة المرتجع:</span>
              <span className="text-slate-900">
                {formatCurrency(returnPreview.totalReturnValue)}
              </span>
            </div>

            {returnPreview.appliedToDebt > 0 && (
              <div className="flex justify-between text-accent-700 border-t border-brand-100 pt-1">
                <span>خصم من الدين الآجل للفاتورة:</span>
                <span>-{formatCurrency(returnPreview.appliedToDebt)}</span>
              </div>
            )}

            <div className="flex justify-between text-brand-700 border-t border-brand-100 pt-1 text-sm font-extrabold">
              <span>المبلغ المسترد نقداً للعميل:</span>
              <span>{formatCurrency(returnPreview.cashRefund)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReturnModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              isLoading={isSubmittingReturn}
              disabled={returnPreview.totalReturnValue <= 0}
            >
              تأكيد المرتجع
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة تأكيد الإلغاء */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="تأكيد إلغاء الفاتورة بالكامل"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">هل أنت متأكد من رغبتك في إلغاء الفاتورة؟</p>
              <p className="mt-1">
                سيتم إرجاع كافة الكميات المتبقية إلى المخزن، وتصفية الدين الآجل على العميل، وسحب
                المبالغ التي تم تحصيلها من الخزائن. هذا الإجراء لا يمكن التراجع عنه.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCancelModalOpen(false)}
            >
              تراجع
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isSubmittingCancel}
              onClick={handleConfirmCancel}
            >
              نعم، تأكيد الإلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
