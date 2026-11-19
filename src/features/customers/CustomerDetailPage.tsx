import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { collectPayment, writeOffDebt, generateTransactionId } from '../../lib/data';
import { formatCurrency, parseArabicNumber } from '../../domain/money';
import { formatDate } from '../../domain/dates';
import { WalletId } from '../../domain/types';
import { Card, GreenCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import {
  ArrowRight,
  Phone,
  Banknote,
  Send,
  Ban,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // نافذة التحصيل
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [collectTxId, setCollectTxId] = useState<string>(() => generateTransactionId());
  const [collectAmountStr, setCollectAmountStr] = useState('');
  const [collectWallet, setCollectWallet] = useState<WalletId>('cash');
  const [isSubmittingCollect, setIsSubmittingCollect] = useState(false);

  // نافذة إعدام الدين
  const [isWriteOffOpen, setIsWriteOffOpen] = useState(false);
  const [writeOffAmountStr, setWriteOffAmountStr] = useState('');
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState(false);

  // جلب بيانات العميل وفواتيره
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const custRef = doc(db, 'customers', id);
    const unsubscribe = onSnapshot(
      custRef,
      async (snap) => {
        if (snap.exists()) {
          const custData: any = { id: snap.id, ...snap.data() };
          setCustomer(custData);
          setCollectAmountStr(custData.currentBalance > 0 ? String(custData.currentBalance) : '');
          setWriteOffAmountStr(custData.currentBalance > 0 ? String(custData.currentBalance) : '');

          // جلب فواتير العميل
          try {
            const invRef = collection(db, 'invoices');
            const q = query(invRef, where('customerId', '==', id));
            const invSnap = await getDocs(q);
            const docs: any[] = [];
            invSnap.forEach((d) => {
              docs.push({ id: d.id, ...d.data() });
            });
            docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setInvoices(docs);
          } catch (invErr) {
            console.warn('Error fetching customer invoices:', invErr);
          }
        } else {
          setErrorMsg('العميل غير موجود');
        }
        setLoading(false);
      },
      (err) => {
        setErrorMsg('فشل تحميل بيانات العميل: ' + err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  // إرسال رسالة تذكير عبر واتساب
  const handleSendWhatsAppReminder = () => {
    if (!customer || !customer.phone) {
      alert('لا يوجد رقم هاتف مسجل لهذا العميل');
      return;
    }

    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('0')
      ? '2' + cleanPhone
      : cleanPhone.startsWith('20')
      ? cleanPhone
      : '20' + cleanPhone;

    const debt = Math.abs(customer.currentBalance || 0);
    const message = encodeURIComponent(
      `مرحباً أستاذ ${customer.name}، نذكر سيادتكم بوجود حساب مستحق قدره ${formatCurrency(debt)} لدى «محلي». نسعد بزيارتكم وسدادكم في أقرب وقت. شكراً لتعاملكم الراقي معنا!`
    );

    window.open(`https://wa.me/${phoneWithCountry}?text=${message}`, '_blank');
  };

  // فتح نافذة التحصيل وتوليد معرف ثابت للعملية
  const openCollectModal = () => {
    setCollectTxId(generateTransactionId());
    setCollectAmountStr(customer?.currentBalance > 0 ? String(customer.currentBalance) : '');
    setIsCollectOpen(true);
    setErrorMsg(null);
  };

  // تنفيذ التحصيل الفعلي
  const executeCollect = async (amount: number) => {
    if (!customer || !id || isSubmittingCollect) return;
    setErrorMsg(null);

    try {
      setIsSubmittingCollect(true);
      await collectPayment(id, amount, collectWallet, collectTxId);
      setSuccessMsg(`تم تحصيل ${formatCurrency(amount)} بنجاح`);
      setCollectTxId(generateTransactionId());
      setIsCollectOpen(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل التحصيل');
    } finally {
      setIsSubmittingCollect(false);
    }
  };

  // تأكيد التحصيل
  const handleConfirmCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !id) return;
    setErrorMsg(null);

    const amount = parseArabicNumber(collectAmountStr);
    if (amount <= 0) {
      setErrorMsg('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }

    const currentDebt = Math.max(0, customer.currentBalance || 0);
    if (amount > currentDebt + 0.001) {
      setErrorMsg('المبلغ أكبر من الدين');
      return;
    }

    await executeCollect(amount);
  };

  // تأكيد إعدام الدين
  const handleConfirmWriteOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !id) return;
    setErrorMsg(null);

    const amount = parseArabicNumber(writeOffAmountStr);
    if (amount <= 0) {
      setErrorMsg('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إعدام دين بقيمة ${formatCurrency(amount)}؟`)) {
      return;
    }

    try {
      setIsSubmittingWriteOff(true);
      await writeOffDebt(id, amount);
      setSuccessMsg(`تم إعدام دين بقيمة ${formatCurrency(amount)} بنجاح`);
      setIsWriteOffOpen(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل إعدام الدين');
    } finally {
      setIsSubmittingWriteOff(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-3">جاري تحميل بيانات العميل...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <Card className="p-8">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">العميل غير موجود</h2>
          <Button onClick={() => navigate('/customers')} variant="outline" className="mt-4 gap-2">
            <ArrowRight className="w-4 h-4" />
            <span>العودة لسجل العملاء</span>
          </Button>
        </Card>
      </div>
    );
  }

  const hasDebt = (customer.currentBalance || 0) > 0.01;

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {/* رأس الصفحة والأزرار */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/customers')}
            className="p-1.5 rounded-lg border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 transition-colors shrink-0"
            title="رجوع لسجل العملاء"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900 truncate">{customer.name}</h1>
            {hasDebt && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-700 shrink-0">
                مدين
              </span>
            )}
          </div>
        </div>

        {/* أزرار الإجراءات في صف واحد */}
        {hasDebt && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={openCollectModal}
              className="flex-1 justify-center gap-1 h-8 px-2 text-xs"
            >
              <Banknote className="w-3.5 h-3.5 shrink-0" />
              <span>تحصيل</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSendWhatsAppReminder}
              className="flex-1 justify-center gap-1 h-8 px-2 text-xs text-brand-700 border-brand-200 hover:bg-brand-50"
            >
              <Send className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span>تذكير واتساب</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsWriteOffOpen(true)}
              className="flex-1 justify-center gap-1 h-8 px-2 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <Ban className="w-3.5 h-3.5 shrink-0" />
              <span>دين معدوم</span>
            </Button>
          </div>
        )}
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

      {/* بطاقة ملخص الحساب (كارت أخضر مدمج) */}
      <GreenCard className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-brand-100 font-medium">الرصيد الحالي</span>
          <div className="text-left">
            <span
              className={`text-xl sm:text-2xl font-black ${
                hasDebt ? 'text-accent-400' : 'text-white'
              }`}
            >
              {formatCurrency(customer.currentBalance || 0)}
            </span>
            {hasDebt && (
              <span className="text-[10px] text-brand-100 mr-1.5">(مستحق على العميل)</span>
            )}
          </div>
        </div>

        <div className="pt-1.5 border-t border-white/15 flex items-center justify-between gap-2 text-[11px] text-brand-100">
          <div className="flex items-center gap-1 font-medium" dir="ltr">
            <Phone className="w-3 h-3 text-accent-400 shrink-0" />
            <span>{customer.phone || 'غير مسجل'}</span>
          </div>
          <span>
            فتح الحساب: {customer.createdAt ? formatDate(customer.createdAt, false) : '-'}
          </span>
        </div>
      </GreenCard>

      {/* فواتير العميل */}
      <Card className="p-0 overflow-hidden border-brand-100">
        <div className="px-3 py-2 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-brand-800 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-brand-600" />
            <span>فواتير العميل ({invoices.length})</span>
          </h2>
        </div>

        {invoices.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <Clock className="w-8 h-8 mx-auto mb-1.5 text-brand-200" />
            <p className="text-xs font-medium">لا توجد فواتير مسجلة لهذا العميل</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-100">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => navigate(`/invoices/${inv.id}`)}
                className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-brand-50/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-mono text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-accent-500 text-slate-900 shrink-0">
                    {inv.invoiceNumber}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {formatDate(inv.createdAt, true)}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {(inv.remainingAmount || 0) > 0 && inv.status !== 'cancelled' && (
                    <span className="text-[10px] font-bold text-rose-600">
                      متبقي {formatCurrency(inv.remainingAmount)}
                    </span>
                  )}
                  <span className="font-black text-slate-900">
                    {formatCurrency(inv.grandTotal)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* نافذة التحصيل */}
      <Modal
        isOpen={isCollectOpen}
        onClose={() => setIsCollectOpen(false)}
        title={`تحصيل حساب من العميل: ${customer.name}`}
      >
        <form onSubmit={handleConfirmCollect} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Input
            label="المبلغ المحصل (ج.م)"
            type="text"
            value={collectAmountStr}
            onChange={(e) => {
              setCollectAmountStr(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="0.00"
            required
          />

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الخزينة المودع بها التحصيل:
            </label>
            <select
              value={collectWallet}
              onChange={(e) => setCollectWallet(e.target.value as WalletId)}
              className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-600"
            >
              <option value="cash">خزينة المحل (نقدية / كاش)</option>
              <option value="bank">الحساب البنكي / إنستاباي</option>
              <option value="wallet">محفظة إلكترونية / فودافون كاش</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCollectOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              isLoading={isSubmittingCollect}
            >
              تأكيد التحصيل
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة إعدام الدين */}
      <Modal
        isOpen={isWriteOffOpen}
        onClose={() => setIsWriteOffOpen(false)}
        title={`إعدام دين للعميل: ${customer.name}`}
      >
        <form onSubmit={handleConfirmWriteOff} className="space-y-4">
          <div className="p-3 rounded-xl bg-accent-50 border border-accent-400 text-accent-700 text-xs">
            إعدام الدين يقلل من رصيد العميل ويغلق الفواتير المستحقة دون إدخال أي أموال في الخزائن.
          </div>

          <Input
            label="مبلغ الدين المعدوم (ج.م)"
            type="text"
            value={writeOffAmountStr}
            onChange={(e) => setWriteOffAmountStr(e.target.value)}
            placeholder="0.00"
            required
          />

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsWriteOffOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isSubmittingWriteOff}
            >
              تأكيد إعدام الدين
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
