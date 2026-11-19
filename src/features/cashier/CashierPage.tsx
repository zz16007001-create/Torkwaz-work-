import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useItems, ExtendedItem } from '../../hooks/useItems';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { normalizeAr } from '../../domain/arabic';
import { formatCurrency, parseArabicNumber, round2 } from '../../domain/money';
import { calculateInvoiceTotals } from '../../domain/invoice';
import { checkCashierPriceAnomaly } from '../../domain/validation';
import { createInvoice, generateInvoiceId } from '../../lib/data';
import {
  subscribeRejectedInvoices,
  getRejectedInvoices,
  dismissRejectedInvoice,
  RejectedInvoiceAlert,
} from '../../lib/pending';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  User,
  Phone,
  Wallet,
  Receipt,
  Tag,
  CreditCard,
  Banknote,
  Smartphone,
  ScanBarcode,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react';

interface CartItem {
  itemId: string;
  code: string;
  name: string;
  color?: string;
  size?: number | string;
  quantity: number;
  unitPrice: number;
  unitPriceStr?: string;
  costPrice?: number;
  availableStock: number;
}

export const CashierPage: React.FC = () => {
  const { items, loading } = useItems();

  // حالة البحث عن صنف
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // السلة
  const [cart, setCart] = useState<CartItem[]>([]);

  // معرّف ثابت للسلة الحالية يُمرر للدالة ويُعاد استخدامه عند إعادة المحاولة لمنع التكرار
  const [cartInvoiceId, setCartInvoiceId] = useState<string>(() => generateInvoiceId());

  // تنبيهات الفواتير المرفوضة من السيرفر بعد قبولها محلياً (لا تختفي تلقائياً)
  const [rejectedAlerts, setRejectedAlerts] = useState<RejectedInvoiceAlert[]>(() => getRejectedInvoices());

  useEffect(() => {
    return subscribeRejectedInvoices(() => {
      setRejectedAlerts(getRejectedInvoices());
    });
  }, []);

  // الخصم الإجمالي: نوع الخصم (مبلغ ثابت أو نسبة مئوية)
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountInputStr, setDiscountInputStr] = useState('');

  // بيانات العميل
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // بصمة آخر فاتورة محفوظة بنجاح لتنبيه الكاشير عند إعادة نفس السلة (لا تمنع الحفظ)
  const lastSavedRef = useRef<{ fp: string; at: number; invoiceNumber: string } | null>(null);
  const cartFingerprint = () =>
    [...cart]
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
      .map((it) => `${it.itemId}x${it.quantity}@${it.unitPrice}`)
      .join('|') + `#${customerPhone.trim()}`;

  // خانات الدفع
  const [cashStr, setCashStr] = useState('');
  const [instapayStr, setInstapayStr] = useState('');
  const [walletStr, setWalletStr] = useState('');

  // الملاحظات
  const [notes, setNotes] = useState('');

  // حالات الإرسال والرسائل
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInvoiceNum, setSuccessInvoiceNum] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);

  // مرجع خانة البحث وحالة أخطاء السكانر ومؤقتات الصوت والخمول
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scanErrorMsg, setScanErrorMsg] = useState<string | null>(null);
  const scanErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartInputIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const focusSearchInput = () => {
    searchInputRef.current?.focus();
  };

  const clearCartInputIdleTimer = () => {
    if (cartInputIdleTimerRef.current) {
      clearTimeout(cartInputIdleTimerRef.current);
      cartInputIdleTimerRef.current = null;
    }
  };

  const resetCartInputIdleTimer = () => {
    clearCartInputIdleTimer();
    cartInputIdleTimerRef.current = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 8000);
  };

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
    focusSearchInput();
    return () => {
      if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
      clearCartInputIdleTimer();
    };
  }, []);

  useEffect(() => {
    if (successInvoiceNum !== null) {
      focusSearchInput();
    }
  }, [successInvoiceNum]);

  useBarcodeScanner({
    enabled: !isSubmitting,
    onScan: (code) => {
      const q = normalizeAr(code.trim());
      const hit = items.find((it) => it.isActive && normalizeAr(String(it.code || '')) === q);
      if (hit) {
        if (scanErrorTimerRef.current) {
          clearTimeout(scanErrorTimerRef.current);
          scanErrorTimerRef.current = null;
        }
        setScanErrorMsg(null);
        addToCart(hit);
        playBeep('success');
        focusSearchInput();
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

  const handleCartNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      clearCartInputIdleTimer();
      focusSearchInput();
      return;
    }
    if (e.key.length === 1) {
      const isAllowedChar = /^[0-9\u0660-\u0669\u06F0-\u06F9.,\u066B]$/.test(e.key);
      if (!isAllowedChar) {
        e.preventDefault();
        return;
      }
    }
    resetCartInputIdleTimer();
  };

  // تصفية نتائج البحث السريع
  const searchResults = useMemo(() => {
    const q = normalizeAr(searchTerm.trim());
    if (!q) return [];

    const matches = items
      .filter((it) => it.isActive)
      .filter((it) => {
        const fullSearch = it.search || normalizeAr(`${it.code} ${it.name} ${it.color} ${it.size}`);
        return fullSearch.includes(q);
      });
    // التطابق التام للكود أولاً (حتى لا يضيع الباركود المطابق خارج أول 8 نتائج)
    const exact = matches.filter((it) => normalizeAr(String(it.code || '')) === q);
    const others = matches.filter((it) => !exact.includes(it));
    return [...exact, ...others].slice(0, 8);
  }, [items, searchTerm]);

  // إضافة صنف للسلة
  const addToCart = (item: ExtendedItem) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.itemId === item.id);
      if (existingIdx >= 0) {
        return prev.map((c, i) => (i === existingIdx ? { ...c, quantity: c.quantity + 1 } : c));
      }

      return [
        ...prev,
        {
          itemId: item.id,
          code: item.code || item.barcode || '',
          name: item.name,
          color: item.color,
          size: item.size,
          quantity: 1,
          unitPrice: round2(item.sellPrice),
          unitPriceStr: String(round2(item.sellPrice)),
          costPrice: round2(item.costPrice || 0),
          availableStock: item.currentStock ?? 0,
        },
      ];
    });

    setSearchTerm('');
    setIsSearchFocused(false);
    setErrorMsg(null);
  };

  // تحديث سعر بيع القطعة في السلة
  const updateUnitPrice = (itemId: string, rawInput: string) => {
    const parsed = parseArabicNumber(rawInput);
    const isValid = !isNaN(parsed) && parsed > 0;
    setCart((prev) =>
      prev.map((it) => {
        if (it.itemId !== itemId) return it;
        return {
          ...it,
          unitPriceStr: rawInput,
          unitPrice: isValid ? round2(parsed) : 0,
        };
      })
    );
  };

  // تحديث كمية صنف بالسلة
  const updateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((it) => (it.itemId === itemId ? { ...it, quantity: newQty } : it))
    );
  };

  // إزالة صنف من السلة
  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((it) => it.itemId !== itemId));
  };

  // تفريغ السلة
  const clearCart = () => {
    setCart([]);
    setCartInvoiceId(generateInvoiceId());
    setDiscountInputStr('');
    setCashStr('');
    setInstapayStr('');
    setWalletStr('');
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setErrorMsg(null);
  };

  // الحسابات المالية باستخدام calculateInvoiceTotals
  const subtotal = useMemo(() => {
    return round2(cart.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0));
  }, [cart]);

  const overallDiscount = useMemo(() => {
    const rawVal = parseArabicNumber(discountInputStr);
    if (rawVal <= 0) return 0;
    if (discountType === 'percent') {
      return round2((subtotal * Math.min(100, rawVal)) / 100);
    }
    return round2(Math.min(subtotal, rawVal));
  }, [subtotal, discountInputStr, discountType]);

  const cashPaid = parseArabicNumber(cashStr);
  const instapayPaid = parseArabicNumber(instapayStr);
  const walletPaid = parseArabicNumber(walletStr);
  const totalPaid = round2(cashPaid + instapayPaid + walletPaid);

  const invoiceTotals = useMemo(() => {
    return calculateInvoiceTotals({
      items: cart.map((it) => ({
        itemId: it.itemId,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        costPrice: it.costPrice || 0,
        discount: 0,
        total: round2(it.unitPrice * it.quantity),
      })),
      overallDiscount,
      paidAmount: totalPaid,
    });
  }, [cart, overallDiscount, totalPaid]);

  const grandTotal = invoiceTotals.grandTotal;
  const remainingDebt = invoiceTotals.remainingAmount;
  const changeDue = round2(Math.max(0, totalPaid - grandTotal));

  // تعبئة المبلغ بالكامل كاش سريعاً
  const handlePayFullCash = () => {
    setCashStr(String(grandTotal));
    setInstapayStr('');
    setWalletStr('');
  };

  // حالات عرض لوحة السداد فقط
  const [payMode, setPayMode] = useState<'cashFull' | 'custom'>('cashFull');
  const [showDiscount, setShowDiscount] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);

  // مزامنة الدفع الكاش الكامل تلقائياً مع تغير الإجمالي
  useEffect(() => {
    if (payMode === 'cashFull' && cart.length > 0) {
      handlePayFullCash();
    }
  }, [payMode, grandTotal, cart.length]);

  // إعادة لوحة السداد لوضعها الافتراضي عند تفريغ السلة أو بعد الحفظ
  useEffect(() => {
    if (cart.length === 0) {
      setPayMode('cashFull');
      setShowDiscount(false);
      setShowCustomer(false);
    }
  }, [cart.length]);

  // حفظ الفاتورة
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    if (cart.length === 0) {
      setErrorMsg('السلة فارغة. يرجى اختيار صنف واحد على الأقل');
      return;
    }

    for (const it of cart) {
      if (typeof it.unitPrice !== 'number' || isNaN(it.unitPrice) || it.unitPrice <= 0) {
        setErrorMsg(`سعر الصنف (${it.name}) غير صحيح، يجب أن يكون رقماً أكبر من صفر`);
        return;
      }
    }

    if (remainingDebt > 0.01 && (!customerName.trim() || !customerPhone.trim())) {
      setErrorMsg('يرجى كتابة اسم ورقم هاتف العميل لأن الفاتورة تحتوي على متبقٍ آجل');
      return;
    }

    // فحص الأسعار الشاذة قبل الحفظ
    const promptItems: CartItem[] = [];
    const confirmItems: CartItem[] = [];

    for (const it of cart) {
      const origItem = items.find((x) => x.id === it.itemId);
      const catalogPrice = origItem ? round2(origItem.sellPrice) : it.unitPrice;
      const costPrice = it.costPrice ?? origItem?.costPrice ?? 0;

      const anomaly = checkCashierPriceAnomaly(it.unitPrice, catalogPrice, costPrice);
      if (anomaly === 'prompt') {
        promptItems.push(it);
      } else if (anomaly === 'confirm') {
        confirmItems.push(it);
      }
    }

    // 1. طلب إعادة كتابة السعر للتأكيد في حال الشذوذ الكبير (أكبر من الضعف أو أكبر من 1500)
    for (const it of promptItems) {
      const origItem = items.find((x) => x.id === it.itemId);
      const catalogPrice = origItem ? round2(origItem.sellPrice) : it.unitPrice;
      const promptVal = window.prompt(
        `تنبيه: سعر الصنف (${it.name}) هو ${it.unitPrice} ج (سعر الصنف: ${catalogPrice} ج)، وهو غير معتاد.\nأعد كتابة السعر (${it.unitPrice}) للتأكيد:`
      );
      if (promptVal === null || parseArabicNumber(promptVal.trim()) !== it.unitPrice) {
        // عدم التطابق أو الإلغاء = إلغاء الحفظ والسلة تفضل زي ما هي
        return;
      }
    }

    // 2. نافذة confirm واحدة تعرض البنود التي تختلف بأكثر من 25% أو أقل من التكلفة
    if (confirmItems.length > 0) {
      const details = confirmItems.map((it) => {
        const origItem = items.find((x) => x.id === it.itemId);
        const catalogPrice = origItem ? round2(origItem.sellPrice) : it.unitPrice;
        const costPrice = it.costPrice ?? origItem?.costPrice ?? 0;
        let reason = '';
        if (costPrice > 0 && it.unitPrice < costPrice) {
          reason = `أقل من التكلفة (${costPrice} ج)`;
        } else if (catalogPrice > 0 && it.unitPrice > catalogPrice) {
          reason = `أعلى من سعر الصنف (${catalogPrice} ج) بـ ${Math.round(((it.unitPrice - catalogPrice) / catalogPrice) * 100)}%`;
        } else if (catalogPrice > 0 && it.unitPrice < catalogPrice) {
          reason = `أقل من سعر الصنف (${catalogPrice} ج) بـ ${Math.round(((catalogPrice - it.unitPrice) / catalogPrice) * 100)}%`;
        }
        return `• ${it.name}: سعر البيع ${it.unitPrice} ج [${reason}]`;
      });

      const confirmMsg = `تنبيه: توجد أسعار غير معتادة بالبنود التالية:\n${details.join('\n')}\n\nهل أنت متأكد من حفظ الفاتورة بهذه الأسعار؟`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    {
      const last = lastSavedRef.current;
      const WINDOW_MS = 10 * 60 * 1000;
      if (last && last.fp === cartFingerprint() && Date.now() - last.at < WINDOW_MS) {
        const mins = Math.max(1, Math.round((Date.now() - last.at) / 60000));
        if (
          !window.confirm(
            `هذه السلة مطابقة تمامًا للفاتورة ${last.invoiceNumber} التي حُفظت منذ ${mins} دقيقة.\nلو كنت تعيد إدخالها ظنًا أنها لم تُحفظ فلا تكمل، وراجع قائمة الفواتير.\nهل هذا بيع جديد فعلًا؟`
          )
        ) {
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);

      const res = await createInvoice({
        invoiceId: cartInvoiceId,
        items: cart.map((it) => ({
          itemId: it.itemId,
          code: it.code,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          costPrice: it.costPrice,
        })),
        overallDiscount,
        payments: {
          cash: cashPaid,
          instapay: instapayPaid,
          wallet: walletPaid,
        },
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setSavedOffline(!!res.queued);
      setSuccessInvoiceNum(res.invoiceNumber);
      lastSavedRef.current = { fp: cartFingerprint(), at: Date.now(), invoiceNumber: res.invoiceNumber };
      clearCart();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ الفاتورة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-[#14b8a6]" />
            <span>نقطة البيع والكاشير</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            إتمام عمليات البيع الفوري وإصدار الفواتير
          </p>
        </div>

        {cart.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { if (window.confirm('متأكد إنك عايز تفرّغ السلة؟\nكل الأصناف هتتمسح.')) { clearCart(); } }}
            className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5 self-start sm:self-auto"
          >
            <Trash2 className="w-4 h-4" />
            <span>تفريغ السلة</span>
          </Button>
        )}
      </div>

      {/* تنبيهات رفض كتابة الفواتير من قبل السيرفر (لا تختفي تلقائياً) */}
      {rejectedAlerts.length > 0 && (
        <div className="space-y-2">
          {rejectedAlerts.map((rej) => (
            <div
              key={rej.invoiceNumber}
              className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-500 text-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <div>
                  <p className="text-sm font-black">
                    تنبيه: تم رفض حفظ الفاتورة رقم ({rej.invoiceNumber}) من قبل السيرفر!
                  </p>
                  <p className="text-xs text-rose-700 mt-0.5 font-medium">
                    السبب: {rej.errorMessage} — لن يتم رفع هذه الفاتورة. يرجى مراجعة بياناتها.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dismissRejectedInvoice(rej.invoiceNumber)}
                className="text-rose-700 border-rose-300 hover:bg-rose-100 shrink-0"
              >
                إغلاق التنبيه
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* رسالة نجاح الفاتورة */}
      {successInvoiceNum && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>
              {savedOffline
                ? `تم الحفظ على الجهاز (رقم ${successInvoiceNum}) وهيترفع لما النت يرجع`
                : `تم إصدار الفاتورة بنجاح برقم: ${successInvoiceNum}`}
            </span>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setSuccessInvoiceNum(null);
              focusSearchInput();
            }}
          >
            فاتورة جديدة
          </Button>
        </div>
      )}

      {/* رسائل الخطأ */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* شريط البحث المباشر عن الأصناف */}
      <div className="relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14b8a6]">
            <ScanBarcode className="w-3.5 h-3.5 shrink-0" />
            <span>السكانر جاهز</span>
          </span>
          {scanErrorMsg && (
            <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{scanErrorMsg}</span>
            </span>
          )}
        </div>
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onKeyDown={(e) => {
              // قارئ الباركود يكتب الكود ثم Enter: نضيف الصنف المطابق تماماً مباشرة
              if (e.key === 'Enter') {
                e.preventDefault();
                const q = normalizeAr(searchTerm.trim());
                const hit = items.find((it) => it.isActive && normalizeAr(String(it.code || '')) === q);
                if (hit) {
                  addToCart(hit);
                  focusSearchInput();
                }
              }
            }}
            placeholder="ابحث بالكود، أو اسم الصنف، أو اللون، أو المقاس..."
            dir="rtl"
            className="w-full rounded-2xl border-2 border-[#14b8a6]/40 bg-white pr-12 pl-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#14b8a6] focus:ring-4 focus:ring-[#14b8a6]/15 shadow-sm transition-all"
          />
          <Search className="absolute right-4 top-4 w-5 h-5 text-slate-400 pointer-events-none" />
        </div>

        {/* قائمة النتائج المنسدلة للبحث */}
        {isSearchFocused && searchResults.length > 0 && (
          <div className="absolute top-full mt-2 inset-x-0 bg-white rounded-2xl shadow-xl border border-slate-200 max-h-80 overflow-y-auto divide-y divide-slate-100 p-1.5">
            {searchResults.map((item) => {
              const stock = item.currentStock ?? 0;
              const isOut = stock <= 0;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    addToCart(item);
                    focusSearchInput();
                  }}
                  className="p-3 hover:bg-slate-50 cursor-pointer rounded-xl flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                      {item.code || item.barcode}
                    </span>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        {item.color && <span>لون: {item.color}</span>}
                        {item.size && <span>مقاس: {item.size}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-left">
                    {/* إظهار الرصيد المتاح مع تنبيه أحمر لو صفر، لكن لا يمنع البيع */}
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-bold ${
                          isOut
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isOut && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                        <span>الرصيد: {stock}</span>
                      </span>
                    </div>

                    <span className="text-sm font-black text-[#14b8a6]">
                      {formatCurrency(item.sellPrice)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* المحتوى الرئيسي: جدول السلة + لوحة الدفع */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* جدول بنود السلة (8 أعمدة) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-0 overflow-hidden border-slate-200">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#14b8a6]" />
                <span>بنود الفاتورة ({cart.length})</span>
              </span>
              <span className="text-xs text-slate-500">
                إجمالي القطع: {cart.reduce((s, it) => s + it.quantity, 0)}
              </span>
            </div>

            {cart.length > 0 && (
              <div className="px-2 sm:px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex flex-row items-center gap-1.5 sm:gap-2 text-[11px] font-medium text-slate-500">
                <div className="flex-1 min-w-0">الصنف</div>
                <div className="w-[84px] sm:w-[120px] shrink-0 text-center">الكمية</div>
                <div aria-hidden="true" className="w-3 sm:w-6 shrink-0" />
                <div className="w-[60px] sm:w-[96px] shrink-0 text-center">السعر (ج.م)</div>
                <div className="w-[72px] sm:w-[110px] shrink-0 text-left">الإجمالي</div>
                <div aria-hidden="true" className="w-6 shrink-0" />
              </div>
            )}

            {cart.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">السلة فارغة حالياً</p>
                <p className="text-xs mt-1">ابحث عن صنف بالأعلى لإضافته إلى الفاتورة</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cart.map((it) => {
                  const lineTotal = round2(it.unitPrice * it.quantity);
                  const isStockOut = it.availableStock <= 0;

                  return (
                    <div
                      key={it.itemId}
                      className="px-2 sm:px-4 py-3 flex flex-row items-center gap-1.5 sm:gap-2 hover:bg-slate-50/50 transition-colors"
                    >
                      {/* خانة الصنف */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm break-words">
                          {it.name}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-xs text-slate-500">
                          {it.code && (
                            <span className="font-mono font-bold text-slate-600">{it.code}</span>
                          )}
                          {it.code && it.color && <span aria-hidden="true">·</span>}
                          {it.color && <span>{it.color}</span>}
                          {(it.code || it.color) && it.size && <span aria-hidden="true">·</span>}
                          {it.size && <span>مقاس {it.size}</span>}
                          {isStockOut && (
                            <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[11px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>رصيد المخزن 0</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* خانة الكمية */}
                      <div className="w-[84px] sm:w-[120px] shrink-0">
                        <div className="flex items-center justify-between border border-slate-200 rounded-xl bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => updateQuantity(it.itemId, it.quantity - 1)}
                            className="p-1 sm:p-1.5 text-slate-600 hover:text-rose-600 hover:bg-slate-50 rounded-r-xl transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onFocus={resetCartInputIdleTimer}
                            onBlur={clearCartInputIdleTimer}
                            onKeyDown={handleCartNumericKeyDown}
                            onChange={(e) =>
                              updateQuantity(it.itemId, Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="w-8 sm:w-12 text-center text-sm font-bold text-slate-800 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(it.itemId, it.quantity + 1)}
                            className="p-1 sm:p-1.5 text-slate-600 hover:text-[#14b8a6] hover:bg-slate-50 rounded-l-xl transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* فاصل بين الكمية والسعر */}
                      <div aria-hidden="true" className="w-3 sm:w-6 shrink-0" />

                      {/* خانة السعر */}
                      <div className="w-[60px] sm:w-[96px] shrink-0">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="text"
                            value={it.unitPriceStr !== undefined ? it.unitPriceStr : it.unitPrice}
                            onFocus={resetCartInputIdleTimer}
                            onBlur={clearCartInputIdleTimer}
                            onKeyDown={handleCartNumericKeyDown}
                            onChange={(e) => updateUnitPrice(it.itemId, e.target.value)}
                            className="w-full sm:w-16 px-1 sm:px-1.5 py-0.5 text-center text-xs font-bold text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:border-[#14b8a6] bg-white"
                            title="سعر القطعة (قابل للتعديل)"
                          />
                          <span className="hidden sm:inline text-[10px] text-slate-400">ج.م</span>
                        </div>
                      </div>

                      {/* خانة الإجمالي */}
                      <div className="w-[72px] sm:w-[110px] shrink-0 text-left">
                        <span className="text-[11px] sm:text-sm font-black text-slate-900 whitespace-nowrap block">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>

                      {/* زر الحذف */}
                      <button
                        type="button"
                        onClick={() => removeFromCart(it.itemId)}
                        className="p-1 shrink-0 w-6 flex items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
                        title="حذف البند"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* لوحة الحسابات والدفع (5 أعمدة) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 border-slate-200 space-y-5">
            {/* إجمالي الفاتورة بخط كبير */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-sm">
              <div>
                <span className="text-xs text-slate-400 block mb-1">المطلوب سداده</span>
                <span className="text-2xl sm:text-3xl font-black text-[#14b8a6]">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>

            {/* صف حالة السداد */}
            {payMode === 'cashFull' ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>كاش كامل</span>
                </span>
                <span className="font-bold text-emerald-800 text-sm">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                  <Pencil className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>دفع مخصص</span>
                </span>
                <span className="font-bold text-slate-700 text-sm">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            )}

            {/* الروابط القابلة للفتح */}
            <div>
              {/* 1. رابط ولوحة الخصم */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDiscount((prev) => !prev)}
                  className="w-full flex items-center justify-between border-t border-slate-100 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span className={overallDiscount > 0 ? 'text-rose-600 font-bold' : ''}>
                    {overallDiscount > 0 ? `خصم: -${formatCurrency(overallDiscount)}` : 'خصم'}
                  </span>
                  {showDiscount || overallDiscount > 0 ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {(showDiscount || overallDiscount > 0) && (
                  <div className="space-y-3 text-sm pb-3">
                    {overallDiscount > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>المجموع الفرعي:</span>
                        <span className="font-bold text-slate-800">{formatCurrency(subtotal)}</span>
                      </div>
                    )}

                    {/* قسم الخصم مع زر الاختيار بين نسبة أو مبلغ */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">خصم الفاتورة:</span>
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-xs">
                          <button
                            type="button"
                            onClick={() => setDiscountType('fixed')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                              discountType === 'fixed'
                                ? 'bg-[#14b8a6] text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            مبلغ (ج)
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountType('percent')}
                            className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                              discountType === 'percent'
                                ? 'bg-[#14b8a6] text-white shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            نسبة (%)
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={discountType === 'percent' ? 'مثال: 10' : 'مثال: 50'}
                          value={discountInputStr}
                          onChange={(e) => setDiscountInputStr(e.target.value)}
                          className="flex-1 text-left bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#14b8a6]"
                        />
                        {overallDiscount > 0 && (
                          <span className="text-xs font-extrabold text-rose-600 whitespace-nowrap">
                            خصم: -{formatCurrency(overallDiscount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. رابط ولوحة الدفع المخصص */}
              <div>
                <button
                  type="button"
                  onClick={() => setPayMode(payMode === 'cashFull' ? 'custom' : 'cashFull')}
                  className="w-full flex items-center justify-between border-t border-slate-100 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span>
                    {payMode === 'custom' ? 'رجوع لكاش كامل' : 'طريقة دفع تانية أو آجل'}
                  </span>
                  {payMode === 'custom' ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {payMode === 'custom' && (
                  <div className="space-y-3 pb-3">
                    <span className="text-xs font-bold text-slate-800 block">تفاصيل السداد والمحافظ:</span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                          <Banknote className="w-3 h-3 text-emerald-600" />
                          <span>نقدية (كاش)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="0.00"
                          value={cashStr}
                          onChange={(e) => setCashStr(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-indigo-600" />
                          <span>إنستاباي</span>
                        </label>
                        <input
                          type="text"
                          placeholder="0.00"
                          value={instapayStr}
                          onChange={(e) => setInstapayStr(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                          <Smartphone className="w-3 h-3 text-rose-600" />
                          <span>فودافون كاش</span>
                        </label>
                        <input
                          type="text"
                          placeholder="0.00"
                          value={walletStr}
                          onChange={(e) => setWalletStr(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#14b8a6]"
                        />
                      </div>
                    </div>

                    {/* ملخص المتبقي آجل أو الباقي للعميل */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600">إجمالي المدفوع:</span>
                        <span className="text-slate-900">{formatCurrency(totalPaid)}</span>
                      </div>
                      {remainingDebt > 0 ? (
                        <div className="flex justify-between text-rose-600 font-extrabold text-sm pt-1 border-t border-slate-200">
                          <span>المتبقي آجل (دين على العميل):</span>
                          <span>{formatCurrency(remainingDebt)}</span>
                        </div>
                      ) : changeDue > 0 ? (
                        <div className="flex justify-between text-emerald-700 font-bold pt-1 border-t border-slate-200">
                          <span>الباقي للعميل:</span>
                          <span>{formatCurrency(changeDue)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. رابط ولوحة بيانات العميل */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCustomer((prev) => !prev)}
                  className="w-full flex items-center justify-between border-t border-slate-100 py-2.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span>بيانات عميل (اختياري)</span>
                  {showCustomer || remainingDebt > 0 || customerName.trim() || customerPhone.trim() ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {(showCustomer || remainingDebt > 0 || customerName.trim() || customerPhone.trim()) && (
                  <div className="space-y-3 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#14b8a6]" />
                        <span>بيانات العميل</span>
                      </span>
                      {remainingDebt > 0 && (
                        <span className="text-[11px] text-rose-600 font-bold">* إلزامي لوجود آجل</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="اسم العميل"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required={remainingDebt > 0}
                      />
                      <Input
                        placeholder="رقم الهاتف"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        required={remainingDebt > 0}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* زر حفظ الفاتورة */}
            <Button
              type="button"
              onClick={handleSaveInvoice}
              disabled={cart.length === 0 || isSubmitting}
              isLoading={isSubmitting}
              variant="primary"
              className="w-full py-4 text-base font-bold shadow-sm gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>حفظ وإصدار الفاتورة</span>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
