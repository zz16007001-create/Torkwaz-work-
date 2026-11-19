import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItems, ExtendedItem } from '../../hooks/useItems';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useUiMode } from '../../lib/uiMode';
import { normalizeAr } from '../../domain/arabic';
import { formatCurrency } from '../../domain/money';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import {
  PackagePlus,
  Search,
  AlertTriangle,
  Boxes,
  Tag,
  Palette,
  Ruler,
  Archive,
  X,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'الكل' },
  { id: 'shoes', label: 'أحذية' },
  { id: 'bags', label: 'شنط' },
  { id: 'accessories', label: 'إكسسوارات' },
];

const CATEGORY_LABELS: Record<string, string> = {
  shoes: 'أحذية',
  bags: 'شنط',
  accessories: 'إكسسوارات',
};

export const ItemsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, loading } = useItems();
  const { mode } = useUiMode();
  const isSalesMode = mode === 'sales';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [scannedItem, setScannedItem] = useState<ExtendedItem | null>(null);
  const [scanErrorMsg, setScanErrorMsg] = useState<string | null>(null);
  const scanErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = (type: 'success' | 'error') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch {
      // تجاهل أخطاء الصوت بصمت
    }
  };

  useEffect(() => {
    return () => {
      if (scanErrorTimerRef.current) {
        clearTimeout(scanErrorTimerRef.current);
        scanErrorTimerRef.current = null;
      }
    };
  }, []);

  useBarcodeScanner({
    enabled: true,
    onScan: (code) => {
      const q = normalizeAr(code.trim());
      const hit = items.find((it) => it.isActive && normalizeAr(String(it.code || '')) === q);

      if (hit) {
        if (scanErrorTimerRef.current) {
          clearTimeout(scanErrorTimerRef.current);
          scanErrorTimerRef.current = null;
        }
        setScanErrorMsg(null);
        if (mode !== 'sales') {
          playBeep('success');
          navigate(`/items/${hit.id}`);
        } else {
          setScannedItem(hit);
          playBeep('success');
        }
      } else {
        const hasArabic = /[\u0600-\u06FF]/.test(code);
        const msg = hasArabic
          ? `الكود غير موجود: ${code} (تأكد أن لغة الكيبورد إنجليزي)`
          : `الكود غير موجود: ${code}`;
        setScanErrorMsg(msg);
        if (scanErrorTimerRef.current) {
          clearTimeout(scanErrorTimerRef.current);
        }
        scanErrorTimerRef.current = setTimeout(() => {
          setScanErrorMsg(null);
          scanErrorTimerRef.current = null;
        }, 3000);
        playBeep('error');
      }
    },
  });

  // أصناف نفس الموديل للعرض في كارت استعلام الموديل بوضع البيع
  const modelVariants = useMemo(() => {
    if (!scannedItem) return [];
    const rawCode = String(scannedItem.code || '').trim();
    const dashIndex = rawCode.indexOf('-');
    if (dashIndex === -1) {
      return [scannedItem];
    }
    const targetModelKey = normalizeAr(rawCode.slice(0, dashIndex));
    const matches = items.filter((it) => {
      if (!it.isActive) return false;
      const itCode = String(it.code || '').trim();
      const itDash = itCode.indexOf('-');
      if (itDash === -1) return false;
      return normalizeAr(itCode.slice(0, itDash)) === targetModelKey;
    });

    const list = matches.length > 0 ? matches : [scannedItem];
    return [...list].sort((a, b) => {
      const colorA = normalizeAr(String(a.color || ''));
      const colorB = normalizeAr(String(b.color || ''));
      const colorCmp = colorA.localeCompare(colorB, 'ar');
      if (colorCmp !== 0) return colorCmp;

      const sizeNumA = Number(a.size);
      const sizeNumB = Number(b.size);
      if (!isNaN(sizeNumA) && !isNaN(sizeNumB) && sizeNumA !== sizeNumB) {
        return sizeNumA - sizeNumB;
      }
      return String(a.size || '').localeCompare(String(b.size || ''), 'ar', { numeric: true });
    });
  }, [items, scannedItem]);

  // تصفية وترشيح الأصناف
  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeAr(searchTerm.trim());

    return items.filter((item) => {
      // فلتر الأرشفة
      if (!showArchived && !item.isActive) {
        return false;
      }
      if (showArchived && item.isActive) {
        return false;
      }

      // فلتر التصنيف
      if (selectedCategory !== 'all') {
        const itemCat = normalizeAr(item.categoryId || item.categoryName || '');
        if (selectedCategory === 'shoes' && !itemCat.includes('shoe') && !itemCat.includes('حذاء') && !itemCat.includes('احذي')) {
          return false;
        }
        if (selectedCategory === 'bags' && !itemCat.includes('bag') && !itemCat.includes('شنط') && !itemCat.includes('حقائب')) {
          return false;
        }
        if (selectedCategory === 'accessories' && !itemCat.includes('access') && !itemCat.includes('اكسسوار')) {
          return false;
        }
      }

      // فلتر البحث بالاسم والكود واللون والمقاس
      if (normalizedQuery) {
        const itemSearch = item.search || normalizeAr(`${item.code} ${item.name} ${item.color} ${item.size}`);
        if (!itemSearch.includes(normalizedQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [items, searchTerm, selectedCategory, showArchived]);

  return (
    <div className="space-y-3 max-w-7xl mx-auto">
      {/* الشريط العلوي */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <Boxes className="w-6 h-6 text-[#14b8a6]" />
          <span>المخزون والأصناف</span>
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          إجمالي الأصناف المسجلة: {items.length} صنف
        </p>
      </div>

      {/* شريط البحث والفلترة */}
      <Card className="p-3 space-y-2 border-slate-200">
        <div className="flex flex-row items-center gap-2">
          {/* حقل البحث */}
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالكود، اسم الصنف، اللون، أو المقاس..."
              dir="rtl"
              className="w-full rounded-xl border border-slate-300 bg-white pr-9 pl-3 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#14b8a6]/20 transition-all"
            />
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* تبديل عرض المؤرشف */}
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl border text-[11px] font-medium transition-colors shrink-0 whitespace-nowrap ${
              showArchived
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Archive className="w-3.5 h-3.5 shrink-0" />
            <span>{showArchived ? 'عرض النشط' : 'عرض المؤرشف فقط'}</span>
          </button>
        </div>

        {/* فلاتر التصنيف */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-xs text-slate-400 ml-0.5 shrink-0">التصنيف:</span>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-[#14b8a6] text-white shadow-2xs font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </Card>

      {scanErrorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{scanErrorMsg}</span>
        </div>
      )}

      {isSalesMode && scannedItem && (
        <Card className="p-4 border-2 border-[#14b8a6]/40 bg-white space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <span className="text-[11px] font-bold text-[#14b8a6] block">استعلام الموديل</span>
              <h2 className="text-base font-bold text-slate-900">{scannedItem.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => setScannedItem(null)}
              aria-label="إغلاق"
              title="إغلاق"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {modelVariants.map((variant) => {
              const isScannedExact = variant.id === scannedItem.id;
              const isOutOfStock = (variant.currentStock ?? 0) <= 0;
              return (
                <div
                  key={variant.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs sm:text-sm ${
                    isScannedExact
                      ? 'bg-[#14b8a6]/10 border-[#14b8a6] font-bold text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-slate-400" />
                      <span>{variant.color || '-'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Ruler className="w-3.5 h-3.5 text-slate-400" />
                      <span>{variant.size ? `مقاس ${variant.size}` : '-'}</span>
                    </span>
                  </div>

                  <div>
                    {isOutOfStock ? (
                      <span className="text-rose-600 font-bold">نفد</span>
                    ) : (
                      <span className="font-bold text-emerald-700">
                        الرصيد: {variant.currentStock}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* محتوى القائمة */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Spinner size="lg" />
          <p className="text-sm text-slate-500 mt-4">جاري تحميل الأصناف والمخزون...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        /* Empty State */
        <Card className="py-16 text-center border-dashed border-2 border-slate-200">
          <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">لا توجد أصناف مطابقة للبحث</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            جرّب تغيير كلمات البحث أو التصنيف، أو قم بإضافة بضاعة جديدة للمخزن.
          </p>
          {!isSalesMode && (
            <Button
              onClick={() => navigate('/purchase')}
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>إضافة بضاعة</span>
            </Button>
          )}
        </Card>
      ) : (
        /* Grid of Items */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filteredItems.map((item) => {
            const isLowStock = item.currentStock <= item.minStockAlert;
            const rawCategory = item.categoryName || item.categoryId || 'عام';
            const categoryLabel =
              CATEGORY_LABELS[String(rawCategory).toLowerCase()] || rawCategory;

            return (
              <Card
                key={item.id}
                onClick={isSalesMode ? undefined : () => navigate(`/items/${item.id}`)}
                className={`p-2.5 space-y-1.5 transition-all border-slate-200 ${
                  isSalesMode
                    ? ''
                    : 'hover:shadow-md cursor-pointer hover:border-[#14b8a6]/50 group'
                }`}
              >
                {/* السطر 1: الكود واسم القسم */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 group-hover:border-[#14b8a6]/40 transition-colors">
                    {item.code || item.barcode}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    {categoryLabel}
                  </span>
                </div>

                {/* السطر 2: اسم الصنف + سعر البيع */}
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-xs font-bold text-slate-900 truncate group-hover:text-[#14b8a6] transition-colors">
                    {item.name}
                  </span>
                  <span className="text-base font-extrabold text-[#14b8a6] shrink-0 whitespace-nowrap">
                    {formatCurrency(item.sellPrice)}
                  </span>
                </div>

                {/* السطر 3: الرصيد المتاح والكمية على نفس السطر */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] text-slate-400">الرصيد المتاح</span>
                  <div
                    className={`inline-flex items-center gap-1 text-xs font-bold ${
                      isLowStock ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {isLowStock && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{item.currentStock}</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {item.unit || 'قطعة'}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
