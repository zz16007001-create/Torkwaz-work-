import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, onSnapshot, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { closeMonthSnapshot } from '../../lib/data';
import { getPendingCount, subscribePending } from '../../lib/pending';
import { DEFAULT_SETTINGS, StoreSettings } from '../../lib/settings';
import { getCairoDate, getMonthKey, formatMonth } from '../../domain/dates';
import {
  calculateCapital,
  calculateInventoryValue,
  calculateReceivables,
  calculateCustomerCredits,
} from '../../domain/capital';
import {
  calculateInvoiceProfit,
  calculateRealProfit,
  calculateMismatch,
} from '../../domain/profit';
import { formatCurrency, parseArabicNumber, round2 } from '../../domain/money';
import { Card, GreenCard } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import {
  Camera,
  AlertTriangle,
  AlertCircle,
  Lock,
  CheckCircle2,
  Wallet,
  Banknote,
  CreditCard,
  Smartphone,
} from 'lucide-react';

export const SnapshotPage: React.FC = () => {
  const currentMonthKey = getMonthKey(getCairoDate());
  const prevMonthKey = (() => {
    const [y, m] = currentMonthKey.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  })();

  // البيانات المسترجعة
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [rawInvoices, setInvoices] = useState<any[]>([]);
  const [rawTransactions, setTransactions] = useState<any[]>([]);
  const [rawStockAdjustments, setStockAdjustments] = useState<any[]>([]);
  const [rawMonthReturns, setMonthReturns] = useState<any[]>([]);
  // رأس مال آخر قفل سابق (خط الأساس لحساب الربح الحقيقي)
  const [baseline, setBaseline] = useState<{ monthKey: string; capital: number; timestamp: number } | null>(null);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({
    cash: 0,
    bank: 0,
    wallet: 0,
  });
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [lockedThroughMonth, setLockedThroughMonth] = useState<string | null>(null);

  // الأرصدة الفعلية في الدرج المدخلة من قبل المستخدم
  const actualInitRef = useRef(false);
  const [actualCashStr, setActualCashStr] = useState('');
  const [actualBankStr, setActualBankStr] = useState('');
  const [actualWalletStr, setActualWalletStr] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pendingCount, setPendingCount] = useState<number>(() => getPendingCount());
  useEffect(() => {
    setPendingCount(getPendingCount());
    return subscribePending(() => setPendingCount(getPendingCount()));
  }, []);

  useEffect(() => {
    let loadedCount = 0;
    const checkReady = () => {
      loadedCount++;
      if (loadedCount >= 7) {
        setLoading(false);
      }
    };

    // 1. الأصناف
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => {
        const it = d.data();
        if (it.isActive !== false) docs.push({ id: d.id, ...it });
      });
      setItems(docs);
      checkReady();
    }, () => checkReady());

    // 2. العملاء
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setCustomers(docs);
      checkReady();
    }, () => checkReady());

    // 3. فواتير الشهر الحالي
    const invQuery = query(collection(db, 'invoices'), where('monthKey', '>=', prevMonthKey));
    const unsubInvoices = onSnapshot(invQuery, (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => {
        const inv = d.data();
        if (inv.status !== 'cancelled') docs.push({ id: d.id, ...inv });
      });
      setInvoices(docs);
      checkReady();
    }, () => checkReady());

    // 4. معاملات الشهر الحالي
    const txQuery = query(collection(db, 'transactions'), where('monthKey', '>=', prevMonthKey));
    const unsubTransactions = onSnapshot(txQuery, (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => {
        const x = d.data();
        if (x.status !== 'reversed') docs.push({ id: d.id, ...x });
      });
      setTransactions(docs);
      checkReady();
    }, () => checkReady());

    // 5. تسويات الجرد للشهر الحالي
    const adjQuery = query(collection(db, 'stock_adjustments'), where('monthKey', '>=', prevMonthKey));
    const unsubAdj = onSnapshot(adjQuery, (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setStockAdjustments(docs);
      checkReady();
    }, () => checkReady());

    // 5-ب. مرتجعات الشهر (تُخصم من المبيعات والتكلفة)
    const retQuery = query(collection(db, 'returns'), where('monthKey', '>=', prevMonthKey));
    const unsubReturns = onSnapshot(retQuery, (snap) => {
      const docs: any[] = [];
      snap.forEach((d) => {
        const r = d.data();
        if (r.type === 'return') docs.push({ id: d.id, ...r });
      });
      setMonthReturns(docs);
      checkReady();
    }, () => checkReady());

    // 5-ج. آخر قفل شهري سابق = خط الأساس
    getDocs(query(collection(db, 'snapshots'), orderBy('timestamp', 'desc'), limit(4)))
      .then((snap) => {
        const prev = snap.docs
          .map((d) => d.data())
          .find((d) => d.monthKey && d.monthKey < currentMonthKey);
        setBaseline(prev ? { monthKey: prev.monthKey, capital: Number(prev.capital) || 0, timestamp: Number(prev.timestamp) || 0 } : null);
      })
      .catch(() => setBaseline(null));

    // 6. أرصدة الخزائن والإعدادات
    const unsubWallets = onSnapshot(doc(db, 'stats', 'wallets'), (snap) => {
      if (snap.exists()) {
        const b = snap.data().balances || {};
        const sys = {
          cash: Number(b.cash) || 0,
          bank: Number(b.bank) || 0,
          wallet: Number(b.wallet) || 0,
        };
        setWalletBalances(sys);
        // نملأ خانات العد مرة واحدة فقط حتى لا تُمسح الأرقام التي يكتبها المستخدم
        if (!actualInitRef.current) {
          actualInitRef.current = true;
          setActualCashStr(String(sys.cash));
          setActualBankStr(String(sys.bank));
          setActualWalletStr(String(sys.wallet));
        }
      }
      checkReady();
    }, () => checkReady());

    // الإعدادات
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLockedThroughMonth(data.lockedThroughMonth || null);
        if (data.mismatchThreshold !== undefined && data.mismatchThreshold !== null) {
          setSettings((prev) => ({ ...prev, mismatchThreshold: data.mismatchThreshold }));
        }
      }
    });

    return () => {
      unsubItems();
      unsubCustomers();
      unsubInvoices();
      unsubTransactions();
      unsubAdj();
      unsubReturns();
      unsubWallets();
      unsubSettings();
    };
  }, [currentMonthKey]);

  // الأرصدة الفعلية المعدودة
  const actualCash = parseArabicNumber(actualCashStr);
  const actualBank = parseArabicNumber(actualBankStr);
  const actualWallet = parseArabicNumber(actualWalletStr);
  const actualWalletsTotal = round2(actualCash + actualBank + actualWallet);

  // حساب رأس المال
  // الفترة = من وقت آخر قفل حتى الآن (وليس الشهر التقويمي)، لتتطابق مع فترة نمو رأس المال
  const inPeriod = (d: any) => {
    if (baseline?.timestamp) return (Number(d.createdAt) || 0) > baseline.timestamp;
    return d.monthKey === currentMonthKey;
  };
  const invoices = useMemo(() => rawInvoices.filter(inPeriod), [rawInvoices, baseline]);
  const transactions = useMemo(() => rawTransactions.filter(inPeriod), [rawTransactions, baseline]);
  const stockAdjustments = useMemo(() => rawStockAdjustments.filter(inPeriod), [rawStockAdjustments, baseline]);
  const monthReturns = useMemo(() => rawMonthReturns.filter(inPeriod), [rawMonthReturns, baseline]);

  const inventoryValue = useMemo(() => calculateInventoryValue(items), [items]);
  const receivables = useMemo(() => calculateReceivables(customers), [customers]);
  const customerCredits = useMemo(() => calculateCustomerCredits(customers), [customers]);

  const currentCapital = useMemo(() => {
    return calculateCapital(actualWalletsTotal, inventoryValue, receivables, customerCredits, 0);
  }, [actualWalletsTotal, inventoryValue, receivables, customerCredits]);

  // قيمة وتكلفة المرتجعات خلال الشهر
  const returnsValue = useMemo(
    () => round2(monthReturns.reduce((sum, r) => sum + (Number(r.totalRefund) || 0), 0)),
    [monthReturns]
  );
  const returnsCost = useMemo(
    () =>
      round2(
        monthReturns.reduce(
          (sum, r) =>
            sum +
            (r.items || []).reduce(
              (iSum: number, it: any) => iSum + (Number(it.costPrice) || 0) * (Number(it.quantity) || 0),
              0
            ),
          0
        )
      ),
    [monthReturns]
  );

  // صافي المبيعات = مبيعات الفواتير غير الملغاة - المرتجعات
  const totalSalesNet = useMemo(() => {
    const gross = invoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);
    return round2(gross - returnsValue);
  }, [invoices, returnsValue]);

  // تكلفة البضاعة المباعة = تكلفة المباع - تكلفة المرتجع
  const costOfGoodsSold = useMemo(() => {
    const sold = invoices.reduce((sum, inv) => {
      const invCost = (inv.items || []).reduce(
        (iSum: number, it: any) => iSum + Number(it.costPrice || 0) * (Number(it.quantity) || 0),
        0
      );
      return sum + invCost;
    }, 0);
    return round2(sold - returnsCost);
  }, [invoices, returnsCost]);

  const monthExpenses = useMemo(() => {
    return round2(
      transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    );
  }, [transactions]);

  const monthBadDebt = useMemo(() => {
    return round2(
      transactions
        .filter((t) => t.type === 'bad_debt')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    );
  }, [transactions]);

  const monthDrawings = useMemo(() => {
    return round2(
      transactions
        .filter((t) => t.type === 'withdrawal')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    );
  }, [transactions]);

  const monthCapitalIn = useMemo(() => {
    return round2(
      transactions
        .filter((t) => t.type === 'capital_in')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    );
  }, [transactions]);

  const stockAdjustmentImpact = useMemo(() => {
    return round2(
      stockAdjustments.reduce((sum, adj) => sum + (Number(adj.totalCostImpact) || 0), 0)
    );
  }, [stockAdjustments]);

  // 1. ربح الفترة (من الفواتير والمصروفات)
  const invoiceProfit = useMemo(() => {
    return calculateInvoiceProfit({
      totalSalesNet,
      costOfGoodsSold,
      stockAdjustmentImpact,
      expenses: monthExpenses,
      badDebt: monthBadDebt,
    });
  }, [totalSalesNet, costOfGoodsSold, stockAdjustmentImpact, monthExpenses, monthBadDebt]);

  // 2. الربح الحقيقي = نمو رأس المال منذ آخر قفل + المسحوبات - رأس المال المضاف
  //    (لا يمكن حسابه بدون قفل سابق)
  const capitalGrowth = useMemo(() => {
    return baseline ? round2(currentCapital - baseline.capital) : null;
  }, [currentCapital, baseline]);

  const realProfit = useMemo(() => {
    return capitalGrowth === null ? invoiceProfit : calculateRealProfit(capitalGrowth, monthDrawings, monthCapitalIn);
  }, [capitalGrowth, invoiceProfit, monthDrawings, monthCapitalIn]);

  // 3. الفرق بين الربح الحقيقي وربح الفواتير (يكشف أي فلوس أو بضاعة ضايعة)
  const mismatch = useMemo(() => {
    return capitalGrowth === null ? 0 : calculateMismatch(realProfit, invoiceProfit);
  }, [capitalGrowth, realProfit, invoiceProfit]);

  const mismatchThreshold = settings.mismatchThreshold ?? 50;
  const hasBaseline = baseline !== null;
  const isMismatchWarning = hasBaseline && Math.abs(mismatch) > mismatchThreshold;
  const isCurrentMonthLocked = lockedThroughMonth === currentMonthKey;

  // تأكيد قفل الشهر
  const handleCloseMonth = async () => {
    if (isCurrentMonthLocked) {
      alert('هذا الشهر مقفل بالفعل');
      return;
    }

    if (getPendingCount() > 0) {
      setErrorMsg(
        `لا يمكن قفل الشهر الآن: يوجد ${getPendingCount()} فاتورة محفوظة على الجهاز ولم تُرفع للسيرفر بعد. انتظر حتى يعود الاتصال ويختفي مؤشر المزامنة ثم أعد المحاولة.`
      );
      return;
    }

    if (!window.confirm(`هل أنت متأكد من رغبتك في قفل حسابات شهر (${formatMonth(new Date())})؟`)) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await closeMonthSnapshot({
        monthKey: currentMonthKey,
        actualWallets: {
          cash: actualCash,
          bank: actualBank,
          wallet: actualWallet,
        },
        systemWallets: walletBalances,
        inventoryValue,
        receivables,
        customerCredits,
        capital: currentCapital,
        invoiceProfit,
        realProfit,
        mismatch,
        notes: closingNotes.trim() || undefined,
      });

      setSuccessMsg(`تم قفل شهر (${currentMonthKey}) بنجاح وحفظ Snapshot للأرقام المالية.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل قفل الشهر');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-4">جاري جلب أرقام وحسابات صورة المحل...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
            <Camera className="w-5 h-5 text-brand-600 shrink-0" />
            <span>صورة المحل وقفل الشهر ({formatMonth(new Date())})</span>
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            تدقيق الخزائن الفعلية ومطابقة الأرباح الحقيقية وقفل الشهر المالي
          </p>
        </div>

        {isCurrentMonthLocked && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-100 text-brand-800 self-start sm:self-auto">
            <Lock className="w-3.5 h-3.5" />
            <span>الشهر الحالي مقفل رسمياً</span>
          </span>
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

      {/* تنبيه الميسماتش (إن وجد فرق أكبر من 50 ج.م) */}
      {isMismatchWarning && (
        <div className="p-3 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-900 flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-xs sm:text-sm">
              ⚠️ في حاجة مش متسجلة، راجع المخزون والمصاريف
            </h3>
            <p className="text-[11px] text-rose-700 mt-0.5">
              الفرق بين الربح الحقيقي وربح الفواتير ({formatCurrency(Math.abs(mismatch))}) يتجاوز
              حد الأمان المسموح به ({formatCurrency(mismatchThreshold)}). تأكد من تسجيل كافة
              المصاريف أو فروق الجرد.
            </p>
          </div>
        </div>
      )}

      {/* كروت رأس المال والأرباح */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* رأس المال */}
        <GreenCard className="p-3 flex flex-col justify-between">
          <div>
            <span className="text-[11px] text-brand-100 block">رأس المال الفعلي الإجمالي</span>
            <span className="text-xl sm:text-2xl font-black text-white block mt-0.5">
              {formatCurrency(currentCapital)}
            </span>
            <div className="mt-2 space-y-0.5 text-xs text-brand-100 border-t border-white/15 pt-1.5">
              <div className="flex justify-between py-0.5">
                <span>الخزائن الفعلية:</span>
                <span className="font-bold text-white">{formatCurrency(actualWalletsTotal)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span>قيمة المخزون:</span>
                <span className="font-bold text-white">{formatCurrency(inventoryValue)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span>ديون العملاء:</span>
                <span className="font-bold text-accent-400">{formatCurrency(receivables)}</span>
              </div>
            </div>
          </div>
        </GreenCard>

        {/* ربح الفواتير */}
        <Card className="p-3 border-brand-100 flex flex-col justify-between">
          <div>
            <span className="text-[11px] text-slate-500 block">ربح الفواتير للشهر</span>
            <span className="text-xl sm:text-2xl font-black text-brand-700 block mt-0.5">
              {formatCurrency(invoiceProfit)}
            </span>
            <div className="mt-2 space-y-0.5 text-xs text-slate-600 border-t border-brand-100 pt-1.5">
              <div className="flex justify-between py-0.5">
                <span>صافي المبيعات:</span>
                <span className="font-bold text-slate-800">{formatCurrency(totalSalesNet)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span>تكلفة البضاعة:</span>
                <span dir="ltr">-{formatCurrency(costOfGoodsSold)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span>مصاريف الشهر:</span>
                <span dir="ltr">-{formatCurrency(monthExpenses)}</span>
              </div>
              {returnsValue > 0 && (
                <div className="flex justify-between py-0.5 text-slate-500">
                  <span>(بعد خصم مرتجعات):</span>
                  <span>{formatCurrency(returnsValue)}</span>
                </div>
              )}
              {monthBadDebt > 0 && (
                <div className="flex justify-between py-0.5">
                  <span>ديون معدومة:</span>
                  <span dir="ltr">-{formatCurrency(monthBadDebt)}</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* الربح الحقيقي والفرق */}
        <Card className="p-3 border-brand-100 flex flex-col justify-between">
          <div>
            <span className="text-[11px] text-slate-500 block">الربح الحقيقي الصافي</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 block mt-0.5">
              {formatCurrency(realProfit)}
            </span>

            <div className="mt-2 space-y-0.5 text-xs border-t border-brand-100 pt-1.5">
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>المسحوبات الشخصية:</span>
                <span className="font-bold text-slate-800">{formatCurrency(monthDrawings)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>تمويل شخصي مضاف:</span>
                <span className="font-bold text-slate-800">{formatCurrency(monthCapitalIn)}</span>
              </div>
              <div
                className={`flex justify-between py-1 font-bold border-t border-brand-100 ${
                  isMismatchWarning ? 'text-rose-600' : 'text-brand-700'
                }`}
              >
                <span>فرق الربح (Mismatch):</span>
                <span dir="ltr">{formatCurrency(mismatch)}</span>
              </div>
              {!hasBaseline && (
                <p className="text-[11px] text-slate-500 pt-1 leading-snug">
                  لا يوجد قفل شهر سابق، فالربح الحقيقي = ربح الفواتير حالياً. بعد أول قفل شهري يبدأ حساب الفرق الحقيقي.
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* قسم الرصيد الفعلي في الدرج وتدقيق الخزائن */}
      <Card className="p-3 border-brand-100 space-y-2.5">
        <div>
          <h2 className="text-sm font-bold text-brand-800 flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-brand-600 shrink-0" />
            <span>الرصيد الفعلي في الدرج والخزائن</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            أدخل المبالغ النقدية المعدودة في الواقع لمطابقتها مع رصيد النظام وتسجيل أي فروق جرد
          </p>
        </div>

        <div className="divide-y divide-brand-100 rounded-xl border border-brand-100 bg-brand-50/40">
          {[
            {
              key: 'cash',
              label: 'خزينة المحل (كاش)',
              icon: <Banknote className="w-3.5 h-3.5 text-brand-600 shrink-0" />,
              sysVal: walletBalances.cash || 0,
              actualNum: actualCash,
              inputVal: actualCashStr,
              onChange: setActualCashStr,
            },
            {
              key: 'bank',
              label: 'البنك / إنستاباي',
              icon: <CreditCard className="w-3.5 h-3.5 text-brand-700 shrink-0" />,
              sysVal: walletBalances.bank || 0,
              actualNum: actualBank,
              inputVal: actualBankStr,
              onChange: setActualBankStr,
            },
            {
              key: 'wallet',
              label: 'فودافون كاش',
              icon: <Smartphone className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
              sysVal: walletBalances.wallet || 0,
              actualNum: actualWallet,
              inputVal: actualWalletStr,
              onChange: setActualWalletStr,
            },
          ].map((w) => {
            const diff = round2(w.actualNum - w.sysVal);
            return (
              <div
                key={w.key}
                className="px-2.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3"
              >
                <div className="flex items-center justify-between sm:justify-start gap-2 sm:flex-1 min-w-0">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                    {w.icon}
                    <span>{w.label}</span>
                  </span>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    النظام: <strong className="text-slate-700">{formatCurrency(w.sysVal)}</strong>
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">الفعلي:</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={w.inputVal}
                      onChange={(e) => w.onChange(e.target.value)}
                      disabled={isCurrentMonthLocked}
                      required
                      className="w-24 sm:w-28 h-8 px-2 rounded-lg border border-brand-200 bg-white text-xs font-bold text-slate-900 text-center focus:outline-none focus:border-brand-600 disabled:opacity-60"
                    />
                  </div>

                  <div className="text-[11px] font-bold flex items-center gap-1 min-w-[82px] justify-end">
                    <span className="text-slate-500">الفرق:</span>
                    <span
                      dir="ltr"
                      className={
                        diff === 0
                          ? 'text-slate-600'
                          : diff > 0
                          ? 'text-brand-700'
                          : 'text-rose-600'
                      }
                    >
                      {diff > 0 ? '+' : ''}
                      {formatCurrency(diff)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Input
          label="ملاحظات قفل الشهر والإغلاق (اختياري)"
          placeholder="مثال: جرد نهاية شهر أكتوبر، ترحيل أرباح..."
          value={closingNotes}
          onChange={(e) => setClosingNotes(e.target.value)}
          disabled={isCurrentMonthLocked}
        />

        {/* زر قفل الشهر */}
        <Button
          type="button"
          variant="accent"
          onClick={handleCloseMonth}
          disabled={isCurrentMonthLocked || isSubmitting || pendingCount > 0}
          isLoading={isSubmitting}
          className="w-full py-2.5 text-sm font-bold shadow-sm gap-2"
        >
          <Lock className="w-4 h-4" />
          <span>
            {isCurrentMonthLocked
              ? `الشهر مقفل (${currentMonthKey})`
              : `قفل حسابات شهر ${formatMonth(new Date())}`}
          </span>
        </Button>
      </Card>
    </div>
  );
};
