import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getCairoDate, getDayKey } from '../../domain/dates';
import {
  calculateCapital,
  calculateInventoryValue,
  calculateReceivables,
  calculateCustomerCredits,
} from '../../domain/capital';
import { formatCurrency, round2 } from '../../domain/money';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import {
  ShoppingCart,
  Boxes,
  AlertTriangle,
  Database,
  Building,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // حالات البيانات
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [todayInvoices, setTodayInvoices] = useState<any[]>([]);
  const [todayReturns, setTodayReturns] = useState<any[]>([]);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({
    cash: 0,
    bank: 0,
    wallet: 0,
  });

  const [loading, setLoading] = useState(true);
  const [backupAlert, setBackupAlert] = useState(false);
  const [showWalletDetails, setShowWalletDetails] = useState(false);

  // تحديث todayKey كل دقيقة بتوقيت القاهرة
  const [todayKey, setTodayKey] = useState<string>(() => getDayKey(getCairoDate()));

  useEffect(() => {
    const timer = setInterval(() => {
      const current = getDayKey(getCairoDate());
      setTodayKey((prev) => (prev !== current ? current : prev));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const loadedSourcesRef = useRef<Set<string>>(new Set());
  const checkLoaded = (source: string) => {
    loadedSourcesRef.current.add(source);
    if (loadedSourcesRef.current.size >= 5) {
      setLoading(false);
    }
  };

  useEffect(() => {
    // التحقق من تاريخ آخر نسخة احتياطية (7 أيام)
    try {
      const lastBackupStr = localStorage.getItem('mahally_last_backup');
      if (!lastBackupStr) {
        setBackupAlert(true);
      } else {
        const lastBackupDate = new Date(lastBackupStr).getTime();
        const diffDays = (Date.now() - lastBackupDate) / (1000 * 60 * 60 * 24);
        if (diffDays >= 7) {
          setBackupAlert(true);
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    // 1. الاستماع للأصناف
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => {
          const it = d.data();
          if (it.isActive !== false) {
            docs.push({ id: d.id, ...it });
          }
        });
        setItems(docs);
        checkLoaded('items');
      },
      () => checkLoaded('items')
    );

    // 2. الاستماع للعملاء
    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
        setCustomers(docs);
        checkLoaded('customers');
      },
      () => checkLoaded('customers')
    );

    // 5. الاستماع لأرصدة الخزائن
    const unsubWallets = onSnapshot(
      doc(db, 'stats', 'wallets'),
      (snap) => {
        if (snap.exists()) {
          const b = snap.data().balances || {};
          setWalletBalances({
            cash: Number(b.cash) || 0,
            bank: Number(b.bank) || 0,
            wallet: Number(b.wallet) || 0,
          });
        }
        checkLoaded('wallets');
      },
      () => checkLoaded('wallets')
    );

    return () => {
      unsubItems();
      unsubCustomers();
      unsubWallets();
    };
  }, []);

  // الاستماع لفواتير ومرتجعات اليوم بحسب todayKey الحالي
  useEffect(() => {
    // 3. الاستماع لفواتير اليوم الحالي فقط
    const invQuery = query(collection(db, 'invoices'), where('dayKey', '==', todayKey));
    const unsubInvoices = onSnapshot(
      invQuery,
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => {
          const inv = d.data();
          if (inv.status !== 'cancelled') {
            docs.push({ id: d.id, ...inv });
          }
        });
        setTodayInvoices(docs);
        checkLoaded('invoices');
      },
      () => checkLoaded('invoices')
    );

    // 4. الاستماع لمرتجعات اليوم لحساب صافي حركة اليوم
    const retQuery = query(collection(db, 'returns'), where('dayKey', '==', todayKey));
    const unsubReturns = onSnapshot(
      retQuery,
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => {
          const r = d.data();
          if (r.type === 'return') {
            docs.push({ id: d.id, ...r });
          }
        });
        setTodayReturns(docs);
        checkLoaded('returns');
      },
      () => checkLoaded('returns')
    );

    return () => {
      unsubInvoices();
      unsubReturns();
    };
  }, [todayKey]);

  // الحسابات المالية ورأس المال
  const totalWallets = useMemo(() => {
    return round2(
      (walletBalances.cash || 0) + (walletBalances.bank || 0) + (walletBalances.wallet || 0)
    );
  }, [walletBalances]);

  const inventoryValue = useMemo(() => {
    return calculateInventoryValue(items);
  }, [items]);

  const receivables = useMemo(() => {
    return calculateReceivables(customers);
  }, [customers]);

  const customerCredits = useMemo(() => {
    return calculateCustomerCredits(customers);
  }, [customers]);

  const currentCapital = useMemo(() => {
    return calculateCapital(totalWallets, inventoryValue, receivables, customerCredits, 0);
  }, [totalWallets, inventoryValue, receivables, customerCredits]);

  // مبيعات اليوم (الإجمالية والصافية بعد المرتجعات)
  const todayGrossSales = useMemo(() => {
    return round2(todayInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0));
  }, [todayInvoices]);

  const todayReturnsTotal = useMemo(() => {
    return round2(
      todayReturns
        .filter((r) => r.type === 'return')
        .reduce((sum, r) => sum + (Number(r.totalRefund) || 0), 0)
    );
  }, [todayReturns]);

  const todayNetSales = useMemo(() => {
    return round2(todayGrossSales - todayReturnsTotal);
  }, [todayGrossSales, todayReturnsTotal]);

  // نواقص المخزون
  const lowStockItems = useMemo(() => {
    return items.filter((it) => (it.currentStock ?? 0) <= (it.minStockAlert ?? 5));
  }, [items]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-4">جاري تحميل لوحة التحكم والبيانات المالية...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* تنبيه النسخ الاحتياطي */}
      {backupAlert && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>تنبيه: لم يتم عمل نسخة احتياطية محلية لبياناتك منذ أكثر من 7 أيام!</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings')}
            className="text-amber-800 border-amber-300 bg-white hover:bg-amber-100 shrink-0 self-start sm:self-auto text-xs"
          >
            <Database className="w-3.5 h-3.5" />
            <span>الذهاب للإعدادات والنسخ</span>
          </Button>
        </div>
      )}

      {/* عنوان لوحة التحكم */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">لوحة التحكم الرئيسية</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            نظرة شاملة وسريعة على رأس المال والمبيعات اليومية والمخزون
          </p>
        </div>
      </div>

      {/* شبكة الكروت الأساسية */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* كارت رأس المال المدمج */}
        <Card className="col-span-2 p-5 border-slate-200 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-800 text-white flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">رأس المال التشغيلي الحالي</span>
              <Building className="w-5 h-5 text-[#14b8a6]" />
            </div>
            <div className="text-3xl sm:text-4xl font-black text-white mt-2 tracking-tight">
              {formatCurrency(currentCapital)}
            </div>
          </div>

          {/* مربعات مكونات رأس المال */}
          <div
            className={`grid gap-2 pt-4 mt-4 border-t border-white/10 text-xs ${
              customerCredits > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowWalletDetails((prev) => !prev)}
              className="text-right rounded-lg p-1.5 -m-1.5 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                <span>الخزائن</span>
                {showWalletDetails ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[#14b8a6] shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
              </span>
              <span className="font-bold text-white text-sm block mt-0.5">
                {formatCurrency(totalWallets)}
              </span>
            </button>

            <div>
              <span className="text-slate-400 block text-[11px]">البضاعة</span>
              <span className="font-bold text-white text-sm block mt-0.5">
                {formatCurrency(inventoryValue)}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">ديون لنا</span>
              <span className="font-bold text-amber-400 text-sm block mt-0.5">
                {formatCurrency(receivables)}
              </span>
            </div>

            {customerCredits > 0 && (
              <div>
                <span className="text-slate-400 block text-[11px]">فلوس عملاء عندنا</span>
                <span className="font-bold text-rose-300 text-sm block mt-0.5">
                  {formatCurrency(customerCredits)}
                </span>
              </div>
            )}
          </div>

          {/* تفاصيل الخزائن ومعادلة رأس المال (مغلقة افتراضياً) */}
          {showWalletDetails && (
            <div className="pt-3 mt-3 border-t border-white/10 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">كاش (الدرج)</span>
                  <span className="font-bold text-white text-sm">
                    {formatCurrency(walletBalances.cash || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">إنستاباي</span>
                  <span className="font-bold text-white text-sm">
                    {formatCurrency(walletBalances.bank || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">فودافون</span>
                  <span className="font-bold text-white text-sm">
                    {formatCurrency(walletBalances.wallet || 0)}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                رأس المال = {formatCurrency(totalWallets)} + {formatCurrency(inventoryValue)} +{' '}
                {formatCurrency(receivables)} - {formatCurrency(customerCredits)}. لمعرفة ربح الشهر
                والفرق الحقيقي افتح «الجرد والإغلاق».
              </p>
            </div>
          )}
        </Card>

        {/* كارت مبيعات اليوم */}
        <Card className="p-4 sm:p-5 border-slate-200 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-slate-600">صافي حركة اليوم</span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#14b8a6] flex items-center justify-center shrink-0">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
              {formatCurrency(todayNetSales)}
            </div>
            {todayReturnsTotal > 0 ? (
              <p className="text-[11px] text-slate-500 mt-1">
                إجمالي: {formatCurrency(todayGrossSales)} | مرتجعات: -{formatCurrency(todayReturnsTotal)}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-1">
                عدد الفواتير المنفذة اليوم: {todayInvoices.length} فاتورة
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/reports?period=today')}
            className="flex items-center justify-between text-xs font-bold text-[#14b8a6] hover:text-[#0d9488] pt-3 border-t border-slate-100 mt-3"
          >
            <span>عرض التفاصيل</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </Card>

        {/* كارت نواقص المخزون */}
        <Card className="p-4 sm:p-5 border-slate-200 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-slate-600">نواقص المخزون</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black mt-2 ${
                lowStockItems.length > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {lowStockItems.length} صنف
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              أصناف وصلت للحد الأدنى وتطلب التوريد
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/items')}
            className="flex items-center justify-between text-xs font-bold text-rose-600 hover:text-rose-700 pt-3 border-t border-slate-100 mt-3"
          >
            <span>فحص النواقص</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </Card>
      </div>
    </div>
  );
};
