import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { createTransaction, reverseTransaction, TransactionActionType, generateTransactionId } from '../../lib/data';
import { WalletId } from '../../domain/types';
import { formatCurrency, parseArabicNumber } from '../../domain/money';
import { formatDate, getCairoDate, getMonthKey } from '../../domain/dates';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import {
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  UserMinus,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
} from 'lucide-react';

interface TransactionItem {
  id: string;
  type: string;
  amount: number;
  walletId: string;
  targetWalletId?: string;
  category?: string;
  description?: string;
  status?: string;
  referenceNumber?: string;
  createdAt: number;
}

const WALLET_NAMES: Record<string, string> = {
  cash: 'خزينة المحل (كاش)',
  bank: 'الحساب البنكي / إنستاباي',
  wallet: 'محفظة إلكترونية / فودافون كاش',
  pocket: 'الجيب الشخصي',
  none: 'بدون خزينة',
};

const EXPENSE_CATEGORIES = [
  'إيجار المحل',
  'كهرباء ومياه ومرافق',
  'مرتبات ومكافآت',
  'بوفيه ومشروبات ونظافة',
  'تغليف وأكياس ومطبوعات',
  'دعاية وإعلانات',
  'صيانة وإصلاحات',
  'شحن ومواصلات',
  'مصروفات نثريات أخرى',
];

const BADGE_STYLE_BY_TYPE: Record<string, { label: string; cls: string }> = {
  collection: { label: 'تحصيل من عميل', cls: 'bg-emerald-600 text-white' },
  capital_in: { label: 'إضافة رأس مال', cls: 'bg-emerald-600 text-white' },
  expense: { label: 'مصروف', cls: 'bg-rose-600 text-white' },
  purchase_payment: { label: 'سداد مشتريات', cls: 'bg-accent-500 text-slate-900' },
  refund: { label: 'رد مرتجع', cls: 'bg-orange-500 text-white' },
  withdrawal: { label: 'سحب شخصي', cls: 'bg-violet-600 text-white' },
  transfer: { label: 'تحويل', cls: 'bg-sky-600 text-white' },
};

function getCompactTxSummary(tx: TransactionItem, badgeLabel: string): string {
  const cleanText = (raw: string) =>
    raw
      .replace(/^تحصيل دفعة حساب من العميل:\s*/i, '')
      .replace(/^رد مرتجع\s*/i, '')
      .replace(/^سداد مشتريات\s*/i, '')
      .replace(/^إضافة رأس مال\s*/i, '')
      .replace(/^سحب شخصي\s*/i, '')
      .replace(/^تحويل بين الخزائن\s*/i, '')
      .replace(/^مصروف:\s*/i, '')
      .replace(/\s*\(?\bOPENING-[A-Za-z0-9_-]+\b\)?/g, '')
      .trim();

  const cat = cleanText(tx.category || '');
  const desc = cleanText(tx.description || '');

  const parts: string[] = [];
  if (cat && cat !== badgeLabel) parts.push(cat);
  if (desc && desc !== badgeLabel && desc !== cat) parts.push(desc);

  if (parts.length > 0) return parts.join(' · ');
  if (tx.type === 'transfer' && tx.targetWalletId) {
    return `إلى ${WALLET_NAMES[tx.targetWalletId] || tx.targetWalletId}`;
  }
  return tx.referenceNumber || '-';
}

export const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // حالة النافذة المنبثقة
  const [activeModalType, setActiveModalType] = useState<TransactionActionType | null>(null);
  const [txDocumentId, setTxDocumentId] = useState<string>(() => generateTransactionId());
  const [amountStr, setAmountStr] = useState('');
  const [wallet, setWallet] = useState<WalletId>('cash');
  const [toWallet, setToWallet] = useState<WalletId>('bank');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');
  const [dateStr, setDateStr] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reversingTxId, setReversingTxId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const txRef = collection(db, 'transactions');
    const q = query(txRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: TransactionItem[] = [];
        snapshot.forEach((snap) => {
          const d = snap.data();
          docs.push({
            id: snap.id,
            type: d.type || 'expense',
            amount: Number(d.amount) || 0,
            walletId: d.walletId || 'cash',
            targetWalletId: d.targetWalletId,
            category: d.category || '',
            description: d.description || '',
            status: d.status,
            referenceNumber: d.referenceNumber,
            createdAt: d.createdAt || 0,
          });
        });
        docs.sort((a, b) => b.createdAt - a.createdAt);
        setTransactions(docs);
        setLoading(false);
      },
      (err) => {
        console.warn('Transactions listener error:', err);
        // Fallback without orderBy
        const fallbackSub = onSnapshot(txRef, (snap) => {
          const docs: TransactionItem[] = [];
          snap.forEach((s) => {
            const d = s.data();
            docs.push({
              id: s.id,
              type: d.type || 'expense',
              amount: Number(d.amount) || 0,
              walletId: d.walletId || 'cash',
              targetWalletId: d.targetWalletId,
              category: d.category || '',
              description: d.description || '',
              status: d.status,
              referenceNumber: d.referenceNumber,
              createdAt: d.createdAt || 0,
            });
          });
          docs.sort((a, b) => b.createdAt - a.createdAt);
          setTransactions(docs);
          setLoading(false);
        });
        return () => fallbackSub();
      }
    );

    return () => unsubscribe();
  }, []);

  // أرصدة الخزائن والشهر المقفول (للتحذيرات فقط)
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [lockedThroughMonth, setLockedThroughMonth] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'stats', 'wallets'), (snap) => {
      const b = (snap.exists() ? snap.data().balances : null) || {};
      setWalletBalances({
        cash: Number(b.cash) || 0,
        bank: Number(b.bank) || 0,
        wallet: Number(b.wallet) || 0,
      });
    }, () => {});
    const u2 = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      setLockedThroughMonth(snap.exists() ? snap.data().lockedThroughMonth || null : null);
    }, () => {});
    return () => {
      u1();
      u2();
    };
  }, []);

  const handleReverse = async (tx: TransactionItem) => {
    if (reversingTxId || tx.status === 'reversed') return;
    if (!window.confirm(`عكس هذه الحركة (${formatCurrency(tx.amount)})؟ سيُرجَع أثرها على الخزينة وتُستبعد من الحسابات.`)) return;
    try {
      setReversingTxId(tx.id);
      await reverseTransaction(tx.id);
      setSuccessMsg('تم عكس الحركة وتصحيح الخزينة');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      window.alert(err.message || 'فشل عكس الحركة');
    } finally {
      setReversingTxId(null);
    }
  };

  const openModal = (type: TransactionActionType) => {
    setActiveModalType(type);
    setTxDocumentId(generateTransactionId());
    setAmountStr('');
    setWallet('cash');
    setToWallet('bank');
    setCategory(EXPENSE_CATEGORIES[0]);
    setCustomCategory('');
    setNote('');
    setDateStr('');
    setErrorMsg(null);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalType || isSubmitting) return;
    setErrorMsg(null);

    const amount = parseArabicNumber(amountStr);
    if (amount <= 0) {
      setErrorMsg('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    const finalCategory =
      activeModalType === 'expense'
        ? category === 'مصروفات نثريات أخرى' && customCategory.trim()
          ? customCategory.trim()
          : category
        : undefined;

    // تحذير: خزينة ستصبح سالبة
    if (activeModalType !== 'capital_in') {
      const after = (walletBalances[wallet] ?? 0) - amount;
      if (after < 0) {
        const ok = window.confirm(
          `تنبيه: رصيد الخزينة سيصبح ${formatCurrency(after)} (سالب). هل تريد المتابعة؟`
        );
        if (!ok) return;
      }
    }

    // تحذير: التسجيل في شهر تم قفله
    const txMonth = getMonthKey(dateStr ? new Date(dateStr) : getCairoDate());
    if (lockedThroughMonth && txMonth <= lockedThroughMonth) {
      const ok = window.confirm(
        `تنبيه: شهر ${txMonth} تم قفله بالفعل، وهذه الحركة ستدخل في حسابات ما بعد القفل. هل تريد المتابعة؟`
      );
      if (!ok) return;
    }

    try {
      setIsSubmitting(true);
      await createTransaction({
        transactionId: txDocumentId,
        type: activeModalType,
        amount,
        wallet,
        toWallet: activeModalType === 'transfer' ? toWallet : undefined,
        category: finalCategory,
        note: note.trim() || undefined,
        date: dateStr ? new Date(dateStr) : undefined,
      });

      setSuccessMsg('تم تسجيل الحركة وتحديث رصيد الخزينة بنجاح');
      setTxDocumentId(generateTransactionId());
      setActiveModalType(null);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ الحركة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getModalTitle = () => {
    switch (activeModalType) {
      case 'expense':
        return 'تسجيل مصروف جديد';
      case 'withdrawal':
        return 'تسجيل سحب شخصي (مسحوبات الشركاء)';
      case 'capital_in':
        return 'إضافة رأس مال / تمويل شخصي';
      case 'transfer':
        return 'تحويل أموال بين الخزائن';
      default:
        return 'تسجيل حركة مالية';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      {/* رأس الصفحة وأزرار العمليات الأربعة */}
      <div className="space-y-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
            <ArrowLeftRight className="w-5 h-5 text-brand-600 shrink-0" />
            <span>العمليات وحركات الخزينة</span>
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            تسجيل المصروفات والمسحوبات الشخصية والتحويلات اليومية
          </p>
        </div>

        {/* 4 أزرار في شبكة 2×2 مدمجة */}
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openModal('expense')}
            className="w-full justify-center gap-1.5 py-1 px-2 h-8 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
          >
            <TrendingDown className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span className="truncate">مصروف</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openModal('withdrawal')}
            className="w-full justify-center gap-1.5 py-1 px-2 h-8 text-xs bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
          >
            <UserMinus className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            <span className="truncate">سحب شخصي</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openModal('capital_in')}
            className="w-full justify-center gap-1.5 py-1 px-2 h-8 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">إضافة رأس مال</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openModal('transfer')}
            className="w-full justify-center gap-1.5 py-1 px-2 h-8 text-xs bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="truncate">تحويل</span>
          </Button>
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

      {/* قائمة الحركات الأخيرة */}
      <Card className="p-0 overflow-hidden border-brand-100">
        <div className="px-3 py-2 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-brand-800 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-brand-600" />
            <span>سجل المعاملات والقيود المالية ({transactions.length})</span>
          </h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Spinner size="lg" />
            <p className="text-xs text-slate-500 mt-2">جاري تحميل حركات الخزينة...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 text-brand-200" />
            <h3 className="text-sm font-bold text-slate-700">لا توجد حركات مسجلة</h3>
            <p className="text-xs mt-1">استخدم الأزرار في الأعلى لتسجيل المصروفات أو التحويلات.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-100">
            {transactions.map((tx) => {
              const isExpense = tx.type === 'expense';
              const isWithdrawal = tx.type === 'withdrawal';
              const isCapitalIn = tx.type === 'capital_in';
              const isTransfer = tx.type === 'transfer';
              const isCollection = tx.type === 'collection';
              const isRefund = tx.type === 'refund';
              const isPurchase = tx.type === 'purchase_payment';

              const isOutflow = isExpense || isWithdrawal || isRefund || isPurchase;
              const isInflow = isCapitalIn || isCollection;

              const badgeInfo = BADGE_STYLE_BY_TYPE[tx.type] || {
                label: tx.type,
                cls: 'bg-slate-600 text-white',
              };
              const summaryText = getCompactTxSummary(tx, badgeInfo.label);
              const canReverse =
                tx.status !== 'reversed' &&
                ['expense', 'withdrawal', 'capital_in', 'transfer'].includes(tx.type) &&
                tx.walletId !== 'pocket' &&
                !tx.referenceNumber;

              return (
                <div
                  key={tx.id}
                  className="px-3 py-2 hover:bg-brand-50/40 transition-colors"
                >
                  {/* السطر الأول: شارة النوع + وصف مختصر + المبلغ */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeInfo.cls}`}
                      >
                        {badgeInfo.label}
                      </span>

                      <span className="font-bold text-slate-800 text-xs truncate">
                        {summaryText}
                      </span>
                    </div>

                    <span
                      className={`shrink-0 text-sm font-black ${
                        tx.status === 'reversed' ? 'line-through opacity-50 ' : ''
                      }${
                        isOutflow
                          ? 'text-rose-600'
                          : isInflow
                          ? 'text-emerald-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {isOutflow ? '−' : isInflow ? '+' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>

                  {/* السطر الثاني: التاريخ والوقت · اسم الخزينة + زر عكس الحركة */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 mt-1">
                    <span className="truncate min-w-0">
                      {formatDate(tx.createdAt, true)} ·{' '}
                      {WALLET_NAMES[tx.walletId] || tx.walletId}
                      {isTransfer && tx.targetWalletId && (
                        <> &rarr; {WALLET_NAMES[tx.targetWalletId] || tx.targetWalletId}</>
                      )}
                    </span>

                    {(tx.status === 'reversed' || canReverse) && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {tx.status === 'reversed' && (
                          <span className="text-[10px] text-slate-400">معكوسة</span>
                        )}
                        {canReverse && (
                          <button
                            type="button"
                            disabled={reversingTxId === tx.id}
                            onClick={() => handleReverse(tx)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3 shrink-0" />
                            <span>{reversingTxId === tx.id ? 'جاري العكس...' : 'عكس الحركة'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* نافذة تسجيل الحركة */}
      <Modal
        isOpen={!!activeModalType}
        onClose={() => setActiveModalType(null)}
        title={getModalTitle()}
      >
        <form onSubmit={handleSaveTransaction} className="space-y-4">
          <Input
            label="المبلغ (ج.م)"
            type="text"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
          />

          {/* اختيار الخزينة المصدر */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {activeModalType === 'transfer' ? 'من خزينة:' : 'الخزينة:'}
            </label>
            <select
              value={wallet}
              onChange={(e) => setWallet(e.target.value as WalletId)}
              className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-600"
            >
              <option value="cash">خزينة المحل (نقدية / كاش)</option>
              <option value="bank">الحساب البنكي / إنستاباي</option>
              <option value="wallet">محفظة إلكترونية / فودافون كاش</option>
            </select>
          </div>

          {/* إلى خزينة (للتحويل فقط) */}
          {activeModalType === 'transfer' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                إلى خزينة:
              </label>
              <select
                value={toWallet}
                onChange={(e) => setToWallet(e.target.value as WalletId)}
                className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-600"
              >
                <option value="bank">الحساب البنكي / إنستاباي</option>
                <option value="cash">خزينة المحل (نقدية / كاش)</option>
                <option value="wallet">محفظة إلكترونية / فودافون كاش</option>
              </select>
            </div>
          )}

          {/* تصنيف المصروف (للمصروف فقط) */}
          {activeModalType === 'expense' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                تصنيف المصروف:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-600"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {category === 'مصروفات نثريات أخرى' && (
                <div className="mt-2">
                  <Input
                    placeholder="اكتب تصنيف المصروف..."
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* التاريخ (اختياري) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              تاريخ الحركة (اتركه فارغاً للتاريخ الحالي):
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-brand-600"
            />
          </div>

          <Input
            label="ملاحظات / تفاصيل إضافية (اختياري)"
            placeholder="مثال: فاتورة شهر 10، سحب شخصي للبيت..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveModalType(null)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              isLoading={isSubmitting}
            >
              تأكيد وحفظ
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
