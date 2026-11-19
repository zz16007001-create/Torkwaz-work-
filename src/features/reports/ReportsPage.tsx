import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getCairoDate, getDayKey, getMonthKey, formatDate } from '../../domain/dates';
import { formatCurrency, round2 } from '../../domain/money';
import { Card, GreenCard, GREEN_CARD_INPUT_CLASS } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Icon3D } from '../../components/ui/Icons3D';
import {
  BarChart3,
  Calendar,
  TrendingDown,
  Clock,
  Boxes,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  ArrowUpRight,
  Archive,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const currentMonth = getMonthKey(getCairoDate());
  const [todayKey, setTodayKey] = useState<string>(() => getDayKey(getCairoDate()));
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [fromDate, setFromDate] = useState<string>(() => getDayKey(getCairoDate()));
  const [toDate, setToDate] = useState<string>(() => getDayKey(getCairoDate()));
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses' | 'stagnant' | 'closings'>('sales');
  const [snapshotsList, setSnapshotsList] = useState<any[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = getDayKey(getCairoDate());
      setTodayKey((prev) => (prev !== current ? current : prev));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let readyCount = 0;
    const checkReady = () => {
      readyCount++;
      if (readyCount >= 5) setLoading(false);
    };

    // 1. الفواتير
    const unsubInvoices = onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setInvoices(docs);
        checkReady();
      },
      () => checkReady()
    );

    // 2. الحركات المالية
    const unsubTx = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => {
          const x = d.data();
          if (x.status !== 'reversed') docs.push({ id: d.id, ...x });
        });
        docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setTransactions(docs);
        checkReady();
      },
      () => checkReady()
    );

    // 3. الأصناف
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
        setItems(docs);
        checkReady();
      },
      () => checkReady()
    );

    // 4. المرتجعات (تُخصم من صافي المبيعات)
    const unsubReturns = onSnapshot(
      collection(db, 'returns'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => {
          const r = d.data();
          if (r.type === 'return') docs.push({ id: d.id, ...r });
        });
        setReturnsList(docs);
        checkReady();
      },
      () => checkReady()
    );

    // 5. الشهور المقفولة (لقطات القفل)
    const unsubSnaps = onSnapshot(
      collection(db, 'snapshots'),
      (snap) => {
        const docs: any[] = [];
        snap.forEach((d) => {
          const x = d.data();
          if (x.type === 'monthly_closing') docs.push({ id: d.id, ...x });
        });
        docs.sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)));
        setSnapshotsList(docs);
        checkReady();
      },
      () => checkReady()
    );

    return () => {
      unsubSnaps();
      unsubInvoices();
      unsubTx();
      unsubItems();
      unsubReturns();
    };
  }, []);

  // قائمة الأشهر المتاحة للاختيار (الشهر الحالي والأشهر السابقة المسجلة)
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    monthsSet.add(currentMonth);

    invoices.forEach((inv) => {
      if (inv.monthKey) monthsSet.add(inv.monthKey);
    });
    transactions.forEach((tx) => {
      if (tx.monthKey) monthsSet.add(tx.monthKey);
    });

    return Array.from(monthsSet).sort().reverse();
  }, [invoices, transactions, currentMonth]);

  // نطاق الأيام المختار لتبويب المبيعات (بتوقيت القاهرة)
  const salesDateRange = useMemo(() => {
    const rawFrom = fromDate.trim() || todayKey;
    const rawTo = toDate.trim() || todayKey;
    const from = rawFrom;
    const to = rawTo < rawFrom ? rawFrom : rawTo;

    let fullMonthKey: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const [fy, fm, fd] = from.split('-').map(Number);
      if (fd === 1) {
        const monthEndKey = getDayKey(new Date(Date.UTC(fy, fm, 0, 12, 0, 0)));
        if (to === monthEndKey) {
          fullMonthKey = from.slice(0, 7);
        }
      }
    }

    const title = from === to ? `فواتير ${from}` : `فواتير من ${from} إلى ${to}`;

    return {
      from,
      to,
      fullMonthKey,
      title,
    };
  }, [fromDate, toDate, todayKey]);

  // فواتير الفترة المختارة (النشطة فقط)
  const periodInvoices = useMemo(() => {
    return invoices.filter(
      (inv) =>
        inv.status !== 'cancelled' &&
        Boolean(inv.dayKey) &&
        inv.dayKey >= salesDateRange.from &&
        inv.dayKey <= salesDateRange.to
    );
  }, [invoices, salesDateRange]);

  // مرتجعات الفترة المختارة
  const periodReturns = useMemo(() => {
    return returnsList.filter(
      (r) =>
        r.type === 'return' &&
        Boolean(r.dayKey) &&
        r.dayKey >= salesDateRange.from &&
        r.dayKey <= salesDateRange.to
    );
  }, [returnsList, salesDateRange]);

  // صافي مبيعات الفترة بعد المرتجعات
  const totalSales = useMemo(() => {
    const gross = periodInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);
    const returned = periodReturns.reduce((sum, r) => sum + (Number(r.totalRefund) || 0), 0);
    return round2(gross - returned); // صافي المبيعات بعد المرتجعات
  }, [periodInvoices, periodReturns]);

  // عدد القطع المباعة في الفترة (بعد خصم القطع المرتجعة)
  const periodPiecesSold = useMemo(() => {
    const grossPieces = periodInvoices.reduce(
      (sum, inv) =>
        sum + (inv.items || []).reduce((s2: number, l: any) => s2 + (Number(l.quantity) || 0), 0),
      0
    );
    const returnedPieces = periodReturns.reduce(
      (sum, r) =>
        sum + (r.items || []).reduce((s2: number, it: any) => s2 + (Number(it.quantity) || 0), 0),
      0
    );
    return grossPieces - returnedPieces;
  }, [periodInvoices, periodReturns]);

  // ربح المبيعات قبل المصاريف + الصافي بعد المصاريف والديون المعدومة (أو من لقطة القفل للشهر الكامل)
  const periodProfit = useMemo(() => {
    // تكلفة البضاعة المباعة الأصلية لفواتير الفترة المختارة
    const grossPeriodCogs = periodInvoices.reduce(
      (sum, inv) =>
        sum +
        (inv.items || []).reduce(
          (s2: number, l: any) => s2 + (Number(l.costPrice) || 0) * (Number(l.quantity) || 0),
          0
        ),
      0
    );

    // تكلفة البضاعة التي أُرجعت خلال هذه الفترة
    const periodReturnsCost = periodReturns.reduce(
      (sum, r) =>
        sum +
        (r.items || []).reduce(
          (s2: number, it: any) => s2 + (Number(it.costPrice) || 0) * (Number(it.quantity) || 0),
          0
        ),
      0
    );

    const cogs = round2(grossPeriodCogs - periodReturnsCost);
    const salesProfitBeforeExpenses = round2(totalSales - cogs);

    const snap = salesDateRange.fullMonthKey
      ? snapshotsList.find((x) => x.monthKey === salesDateRange.fullMonthKey)
      : undefined;
    if (snap) {
      return {
        salesProfitBeforeExpenses,
        value: Number(snap.invoiceProfit) || 0,
        exact: true,
      };
    }

    const exp = transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          Boolean(tx.dayKey) &&
          tx.dayKey >= salesDateRange.from &&
          tx.dayKey <= salesDateRange.to
      )
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const badDebt = transactions
      .filter(
        (tx) =>
          tx.type === 'bad_debt' &&
          Boolean(tx.dayKey) &&
          tx.dayKey >= salesDateRange.from &&
          tx.dayKey <= salesDateRange.to
      )
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    return {
      salesProfitBeforeExpenses,
      value: round2(totalSales - cogs - exp - badDebt),
      exact: false,
    };
  }, [snapshotsList, salesDateRange, periodInvoices, periodReturns, transactions, totalSales]);

  // مصروفات الشهر المختار مقسمة حسب التصنيف
  const monthExpensesList = useMemo(() => {
    return transactions.filter(
      (tx) => tx.monthKey === selectedMonth && tx.type === 'expense'
    );
  }, [transactions, selectedMonth]);

  const totalExpenses = useMemo(() => {
    return round2(monthExpensesList.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
  }, [monthExpensesList]);

  const expensesByCategory = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    monthExpensesList.forEach((tx) => {
      const cat = tx.category || 'أخرى';
      categoryMap[cat] = round2((categoryMap[cat] || 0) + (Number(tx.amount) || 0));
    });

    return Object.entries(categoryMap)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? round2((amount / totalExpenses) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpensesList, totalExpenses]);

  // تقرير الأصناف الراكدة: لم تُبع منذ 90 يوماً أو أكثر
  const stagnantItems = useMemo(() => {
    const now = Date.now();
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

    // خريطة لتاريخ آخر عملية بيع لكل صنف
    const lastSoldMap: Record<string, number> = {};
    invoices.forEach((inv) => {
      if (inv.status !== 'cancelled') {
        const invDate = inv.createdAt || (inv.dateIso ? new Date(inv.dateIso).getTime() : 0);
        (inv.items || []).forEach((line: any) => {
          if (line.itemId) {
            const prev = lastSoldMap[line.itemId] || 0;
            if (invDate > prev) {
              lastSoldMap[line.itemId] = invDate;
            }
          }
        });
      }
    });

    return items
      .filter((it) => it.isActive !== false && (it.currentStock ?? 0) > 0)
      .map((it) => {
        const lastSaleDate = lastSoldMap[it.id] || it.createdAt || 0;
        const diffMs = now - lastSaleDate;
        const daysWithoutSale = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return {
          ...it,
          daysWithoutSale,
          lastActivityDate: lastSaleDate,
          neverSold: !lastSoldMap[it.id],
        };
      })
      .filter((it) => it.daysWithoutSale >= 90)
      .sort((a, b) => b.daysWithoutSale - a.daysWithoutSale);
  }, [items, invoices]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-4">جاري تجميع بيانات التقارير والإحصائيات...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      {/* رأس الصفحة وفلتر اختيار الشهر */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-brand-900 flex items-center gap-1.5">
            <BarChart3 className="w-5 h-5 text-brand-600 shrink-0" />
            <span>التقارير المالية والتشغيلية</span>
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            تحليل المبيعات، تفصيل المصروفات، ومراقبة البضاعة الراكدة
          </p>
        </div>

        {/* قائمة اختيار الشهر المالي (تُخفى في تبويب المبيعات منعاً للبس مع حقلي التاريخ) */}
        {activeTab !== 'sales' && (
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-brand-100 shadow-2xs self-start sm:self-auto shrink-0">
            <Calendar className="w-3.5 h-3.5 text-brand-600" />
            <span className="text-xs text-slate-500 font-medium">الشهر:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-brand-800 focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m} {m === currentMonth ? '(الحالي)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* تبويبات التقارير (Tabs) */}
      <div className="overflow-x-auto pb-1 print:hidden">
        <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap min-w-max">
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors ${
              activeTab === 'sales'
                ? 'bg-brand-600 border-brand-600 text-white shadow-2xs'
                : 'bg-white border-brand-100 text-slate-600 hover:bg-brand-50 hover:text-brand-800'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>تقرير المبيعات ({periodInvoices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('closings')}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors ${
              activeTab === 'closings'
                ? 'bg-brand-600 border-brand-600 text-white shadow-2xs'
                : 'bg-white border-brand-100 text-slate-600 hover:bg-brand-50 hover:text-brand-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>الشهور المقفولة ({snapshotsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors ${
              activeTab === 'expenses'
                ? 'bg-brand-600 border-brand-600 text-white shadow-2xs'
                : 'bg-white border-brand-100 text-slate-600 hover:bg-brand-50 hover:text-brand-800'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>تقرير المصروفات ({monthExpensesList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stagnant')}
            className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors ${
              activeTab === 'stagnant'
                ? 'bg-brand-600 border-brand-600 text-white shadow-2xs'
                : 'bg-white border-brand-100 text-slate-600 hover:bg-brand-50 hover:text-brand-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>الأصناف الراكدة (+90 يوم) ({stagnantItems.length})</span>
          </button>
        </div>
      </div>

      {/* 1. تقرير المبيعات */}
      {activeTab === 'sales' && (
        <div className="space-y-3">
          {/* حقلا التاريخ فقط */}
          <GreenCard className="p-2.5 sm:max-w-md print:hidden">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-bold text-brand-100">
                <span>من تاريخ</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={`w-full rounded-lg px-2 py-1.5 text-xs font-bold ${GREEN_CARD_INPUT_CLASS}`}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-bold text-brand-100">
                <span>إلى تاريخ</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={`w-full rounded-lg px-2 py-1.5 text-xs font-bold ${GREEN_CARD_INPUT_CLASS}`}
                />
              </label>
            </div>
          </GreenCard>

          <div className="grid grid-cols-2 gap-2">
            {/* 1. صافي المبيعات: كارت أخضر صلب brand-600 */}
            <Card className="p-3 bg-brand-600 border-brand-700 text-white flex items-center justify-between gap-2 print:bg-white print:text-slate-900">
              <div className="min-w-0">
                <span className="text-[11px] text-brand-100 block mb-0.5 print:text-slate-600">
                  صافي المبيعات
                </span>
                <span className="text-lg font-black text-white block print:text-slate-900">
                  {formatCurrency(totalSales)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 print:hidden">
                <Icon3D name="netSales" size={28} />
              </div>
            </Card>

            {/* 2. ربح المبيعات قبل المصاريف: كارت أصفر accent-500 */}
            <Card className="p-3 bg-accent-500 border-accent-600 text-slate-900 flex items-center justify-between gap-2 print:bg-white print:text-slate-900">
              <div className="min-w-0">
                <span className="text-[11px] text-slate-800 font-medium block mb-0.5">
                  ربح المبيعات قبل المصاريف
                </span>
                <span
                  className={`text-lg font-black block ${
                    periodProfit.salesProfitBeforeExpenses >= 0
                      ? 'text-slate-900'
                      : 'text-rose-800'
                  }`}
                >
                  {formatCurrency(periodProfit.salesProfitBeforeExpenses)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 print:hidden">
                <Icon3D name="grossProfit" size={28} />
              </div>
            </Card>

            {/* 3. الصافي بعد المصاريف: كارت brand-100 بحد brand-200 */}
            <Card className="p-3 bg-brand-100 border-brand-200 text-brand-800 flex items-center justify-between gap-2 print:bg-white print:text-slate-900">
              <div className="min-w-0">
                <span className="text-[11px] leading-snug text-brand-800/85 block mb-0.5">
                  {periodProfit.exact
                    ? 'الصافي بعد المصاريف (من القفل)'
                    : 'الصافي (بعد خصم المصاريف والديون المعدومة، ومن غير تسويات الجرد)'}
                </span>
                <span
                  className={`text-lg font-black block ${
                    periodProfit.value >= 0 ? 'text-brand-800' : 'text-rose-700'
                  }`}
                >
                  {formatCurrency(periodProfit.value)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 print:hidden">
                <Icon3D name="netProfit" size={28} />
              </div>
            </Card>

            {/* 4. عدد الفواتير: كارت accent-100 */}
            <Card className="p-3 bg-accent-100 border-accent-400/50 text-accent-700 flex items-center justify-between gap-2 print:bg-white print:text-slate-900">
              <div className="min-w-0">
                <span className="text-[11px] text-accent-700 font-medium block mb-0.5">
                  عدد الفواتير المنفذة
                </span>
                <span className="text-lg font-black text-slate-900 block">
                  {periodInvoices.length}
                </span>
                <span className="text-[11px] text-accent-700 font-bold flex items-center gap-1 mt-0.5">
                  <Icon3D name="piecesSold" size={18} className="print:hidden" />
                  <span>عدد القطع المباعة: {periodPiecesSold} قطعة</span>
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 print:hidden">
                <Icon3D name="invoices" size={28} />
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden border-brand-100">
            <div className="p-2.5 sm:p-3 bg-brand-50 border-b border-brand-100 print:bg-white">
              <h2 className="text-xs sm:text-sm font-bold text-brand-800 print:text-slate-900">
                {salesDateRange.title}
              </h2>
            </div>

            {periodInvoices.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                لا توجد فواتير مبيعات مسجلة في هذه الفترة
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-brand-50/70 text-[11px] text-brand-800 border-b border-brand-100 print:bg-white print:text-slate-700">
                    <tr>
                      <th className="p-2">رقم الفاتورة</th>
                      <th className="p-2">التاريخ</th>
                      <th className="p-2">العميل</th>
                      <th className="p-2">طريقة السداد</th>
                      <th className="p-2 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100/70">
                    {periodInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-brand-50/50">
                        <td className="p-2 font-mono text-[11px] font-bold text-slate-700">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-2 text-[11px] text-slate-500">
                          {formatDate(inv.createdAt, false)}
                        </td>
                        <td className="p-2 font-medium text-slate-800">
                          {inv.customerName || 'عميل نقدي'}
                        </td>
                        <td className="p-2 text-[11px]">
                          {(inv.remainingAmount || 0) > 0 ? (
                            <span className="text-accent-700 bg-accent-100 px-1.5 py-0.5 rounded font-bold">
                              آجل ({formatCurrency(inv.remainingAmount)})
                            </span>
                          ) : (
                            <span className="text-brand-800 bg-brand-100 px-1.5 py-0.5 rounded font-bold">
                              مدفوع بالكامل
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-bold text-slate-900 text-left">
                          {formatCurrency(inv.grandTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 2. تقرير المصروفات */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          <Card className="p-3 flex items-center justify-between bg-rose-50/50 border-rose-200">
            <div>
              <span className="text-[11px] text-rose-700 block mb-0.5">إجمالي المصروفات لشهر ({selectedMonth})</span>
              <span className="text-lg font-black text-rose-700">
                {formatCurrency(totalExpenses)}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 print:hidden">
              <Icon3D name="expenses" size={28} />
            </div>
          </Card>

          {/* تصنيف المصروفات */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <Card className="p-3 border-brand-100 space-y-2">
              <h2 className="text-xs font-bold text-brand-800 border-b border-brand-100 pb-1.5">
                توزيع المصروفات حسب التصنيف
              </h2>

              {expensesByCategory.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">لا توجد مصروفات مسجلة</p>
              ) : (
                <div className="space-y-2">
                  {expensesByCategory.map((catItem) => (
                    <div key={catItem.category} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span>{catItem.category}</span>
                        <span>
                          {formatCurrency(catItem.amount)} ({catItem.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-brand-50 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-rose-500 h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, catItem.percentage)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* تفاصيل المصروفات اليومية */}
            <Card className="p-0 overflow-hidden border-brand-100">
              <div className="p-2.5 bg-brand-50 border-b border-brand-100">
                <h2 className="text-xs font-bold text-brand-800">بيان قيود المصروفات</h2>
              </div>
              {monthExpensesList.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">لا توجد بنود مصروفات</p>
              ) : (
                <div className="divide-y divide-brand-100/70 max-h-80 overflow-y-auto">
                  {monthExpensesList.map((tx) => (
                    <div key={tx.id} className="p-2 flex items-center justify-between text-xs hover:bg-brand-50/40">
                      <div>
                        <span className="font-bold text-slate-800 block">
                          {tx.category || 'مصروف'}
                        </span>
                        {tx.description && (
                          <span className="text-slate-500 text-[11px]">{tx.description}</span>
                        )}
                        <span className="text-slate-400 text-[11px] block mt-0.5">
                          {formatDate(tx.createdAt, false)}
                        </span>
                      </div>
                      <span className="font-bold text-rose-600">
                        -{formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* الشهور المقفولة */}
      {activeTab === 'closings' && (
        <Card className="p-0 border-brand-100 overflow-hidden">
          <div className="px-3 py-2 bg-brand-50 border-b border-brand-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0 print:hidden">
              <Icon3D name="closings" size={24} />
            </div>
            <h2 className="text-xs font-bold text-brand-800">
              الشهور المقفولة ({snapshotsList.length})
            </h2>
          </div>
          {snapshotsList.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">لا توجد شهور مقفولة بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm text-right">
                <thead className="bg-brand-50/70 text-brand-800 border-b border-brand-100 print:bg-white">
                  <tr>
                    <th className="p-3">الشهر</th>
                    <th className="p-3">ربح الفواتير</th>
                    <th className="p-3">الربح الحقيقي</th>
                    <th className="p-3">رأس المال</th>
                    <th className="p-3">الفرق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100/70">
                  {snapshotsList.map((sn) => (
                    <tr key={sn.id} className="hover:bg-brand-50/50">
                      <td className="p-3 font-bold text-slate-800">{sn.monthKey}</td>
                      <td className="p-3 text-brand-700 font-medium">{formatCurrency(Number(sn.invoiceProfit) || 0)}</td>
                      <td className="p-3 text-brand-700 font-bold">{formatCurrency(Number(sn.realProfit) || 0)}</td>
                      <td className="p-3 text-slate-800">{formatCurrency(Number(sn.capital) || 0)}</td>
                      <td className="p-3 text-slate-700">{formatCurrency(Number(sn.mismatch) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 3. تقرير الأصناف الراكدة (+90 يوماً) */}
      {activeTab === 'stagnant' && (
        <div className="space-y-4">
          <Card className="p-4 border-accent-400 bg-accent-50 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 print:hidden">
              <Icon3D name="stagnant" size={28} />
            </div>
            <div className="text-xs text-accent-700 leading-relaxed">
              <strong className="block font-bold mb-0.5 text-slate-900">معيار الأصناف الراكدة:</strong>
              يتم احتساب البضاعة راكدة إذا مر 90 يوماً أو أكثر على آخر فاتورة بيع لها (أو على تاريخ
              إضافتها للمخزن إن لم تُبع قط) وما زال رصيدها أكبر من صفر في المخزن.
            </div>
          </Card>

          <Card className="p-0 overflow-hidden border-brand-100">
            <div className="p-3 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-brand-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent-700" />
                <span>قائمة الأصناف الراكدة ({stagnantItems.length} صنف)</span>
              </h2>
            </div>

            {stagnantItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-700">لا توجد بضائع راكدة</h3>
                <p className="text-xs mt-1">كافة الأصناف المتوفرة في المخزن تشهد حركة مبيعات نشطة.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-brand-50/70 text-xs text-brand-800 border-b border-brand-100">
                    <tr>
                      <th className="p-3">الكود</th>
                      <th className="p-3">اسم الموديل</th>
                      <th className="p-3">اللون</th>
                      <th className="p-3">المقاس</th>
                      <th className="p-3 text-center">الكمية بالمخزن</th>
                      <th className="p-3">سعر البيع</th>
                      <th className="p-3 text-left">مدة الركود</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100/70">
                    {stagnantItems.map((it) => (
                      <tr key={it.id} className="hover:bg-brand-50/50">
                        <td className="p-3 font-mono text-xs font-bold text-slate-700">
                          {it.code || it.barcode}
                        </td>
                        <td className="p-3 font-bold text-slate-800">{it.name}</td>
                        <td className="p-3 text-xs text-slate-600">{it.color || '-'}</td>
                        <td className="p-3 text-xs text-slate-600">{it.size || '-'}</td>
                        <td className="p-3 font-bold text-slate-900 text-center">
                          {it.currentStock} {it.unit || 'قطعة'}
                        </td>
                        <td className="p-3 font-medium text-slate-700">
                          {formatCurrency(it.sellPrice)}
                        </td>
                        <td className="p-3 text-left">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent-100 text-accent-700">
                            {it.daysWithoutSale} يوم
                            {it.neverSold && ' (لم تُبع)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
