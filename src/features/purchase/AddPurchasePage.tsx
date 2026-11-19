import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import { calculateProfitMargin } from '../../domain/profit';
import { checkItemPriceVsCostAnomaly } from '../../domain/validation';
import { createPurchase } from '../../lib/data';
import { parseArabicNumber, round2, formatCurrency } from '../../domain/money';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { LabelPrintModal, PrintableLabelItem } from '../items/LabelPrintModal';
import {
  PackagePlus,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Footprints,
  ShoppingBag,
  Sparkles,
  Printer,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';

interface SizeRow {
  size: number | string;
  quantity: number;
}

interface BagVariantRow {
  color: string;
  quantity: number;
}

export const AddPurchasePage: React.FC = () => {
  const navigate = useNavigate();

  // القسم
  const [category, setCategory] = useState<'shoes' | 'bags' | 'accessories'>('shoes');

  // البيانات العامة للبضاعة
  const [description, setDescription] = useState('');
  const [purchaseCostStr, setPurchaseCostStr] = useState('');
  const [sellPriceStr, setSellPriceStr] = useState('');

  // إدارة الألوان
  const [colorLetters, setColorLetters] = useState<Record<string, string>>(DEFAULT_SETTINGS.colorLetters);
  const [selectedColor, setSelectedColor] = useState<string>('أسود');

  // نافذة إضافة لون جديد
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [newColorLetter, setNewColorLetter] = useState('');

  // صفوف المقاسات للأحذية
  const [sizeRows, setSizeRows] = useState<SizeRow[]>([
    { size: 37, quantity: 1 },
    { size: 38, quantity: 1 },
    { size: 39, quantity: 1 },
  ]);

  // صفوف الألوان والكميات للشنط والإكسسوارات
  const [bagRows, setBagRows] = useState<BagVariantRow[]>([
    { color: 'أسود', quantity: 2 },
  ]);

  // طريقة ومصدر الدفع
  const [paymentSource, setPaymentSource] = useState<'cash' | 'instapay' | 'wallet' | 'pocket'>('cash');
  const [showOtherPayments, setShowOtherPayments] = useState(false);

  // حالات الإرسال والرسائل
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // حالة طباعة ملصقات البضاعة المضافة
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [createdItemsForPrint, setCreatedItemsForPrint] = useState<PrintableLabelItem[]>([]);

  // حساب الأرقام ونسبة الربح
  const cost = parseArabicNumber(purchaseCostStr);
  const sell = parseArabicNumber(sellPriceStr);

  const profitMargin = useMemo(() => {
    if (cost > 0 && sell > 0) {
      return calculateProfitMargin(cost, sell);
    }
    return null;
  }, [cost, sell]);

  // إضافة لون جديد للقائمة
  const handleAddCustomColor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColorName.trim() || !newColorLetter.trim()) return;

    const trimmedName = newColorName.trim();
    const upperLetter = newColorLetter.trim().toUpperCase();

    setColorLetters((prev) => ({
      ...prev,
      [trimmedName]: upperLetter,
    }));
    setSelectedColor(trimmedName);
    setNewColorName('');
    setNewColorLetter('');
    setIsColorModalOpen(false);
  };

  // التحكم في صفوف المقاسات للأحذية
  const addSizeRow = () => {
    const lastSize = Number(sizeRows[sizeRows.length - 1]?.size) || 36;
    setSizeRows((prev) => [...prev, { size: lastSize + 1, quantity: 1 }]);
  };

  const removeSizeRow = (index: number) => {
    setSizeRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateSizeRow = (index: number, field: keyof SizeRow, value: any) => {
    setSizeRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // التحكم في صفوف الشنط والإكسسوارات
  const addBagRow = () => {
    setBagRows((prev) => [...prev, { color: selectedColor, quantity: 1 }]);
  };

  const removeBagRow = (index: number) => {
    setBagRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateBagRow = (index: number, field: keyof BagVariantRow, value: any) => {
    setBagRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };


  // إجمالي الكمية وإجمالي التكلفة
  const totalQuantity = useMemo(() => {
    if (category === 'shoes') {
      return sizeRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    }
    return bagRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [category, sizeRows, bagRows]);

  const totalCost = round2(totalQuantity * cost);

  // إرسال البيانات وحفظ الفاتورة
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!description.trim()) {
      setErrorMsg('يرجى كتابة وصف أو اسم الصنف (إلزامي)');
      return;
    }
    if (cost <= 0) {
      setErrorMsg('يرجى تحديد سعر شراء صحيح أكبر من صفر');
      return;
    }
    if (sell <= 0) {
      setErrorMsg('يرجى تحديد سعر بيع صحيح أكبر من صفر');
      return;
    }
    if (totalQuantity <= 0) {
      setErrorMsg('يرجى إضافة كمية صحيحة واحدة على الأقل');
      return;
    }

    if (checkItemPriceVsCostAnomaly(sell, cost) === 'confirm') {
      const reason = sell < cost ? 'أقل من سعر التكلفة' : 'أكبر من 3 أضعاف التكلفة';
      const ok = window.confirm(
        `تنبيه: سعر البيع (${sell} ج) ${reason} (التكلفة: ${cost} ج).\nهل تريد المتابعة وحفظ البضاعة؟`
      );
      if (!ok) return;
    }

    try {
      setIsSubmitting(true);

      const itemsToCreate =
        category === 'shoes'
          ? sizeRows
              .filter((r) => Number(r.quantity) > 0)
              .map((r) => ({
                name: `${description.trim()} - مقاس ${r.size}`,
                category,
                color: selectedColor,
                colorLetter: colorLetters[selectedColor],
                size: r.size,
                quantity: Number(r.quantity),
                purchaseCost: cost,
                sellPrice: sell,
              }))
          : bagRows
              .filter((r) => Number(r.quantity) > 0)
              .map((r) => ({
                name: `${description.trim()} - ${r.color}`,
                category,
                color: r.color,
                colorLetter: colorLetters[r.color],
                quantity: Number(r.quantity),
                purchaseCost: cost,
                sellPrice: sell,
              }));

      const res = await createPurchase({
        paymentSource,
        paidAmount: totalCost,
        items: itemsToCreate,
      });

      // إعداد قائمة الأصناف للطباعة الفورية مع الأكواد
      const printable: PrintableLabelItem[] = itemsToCreate.map((it: any, idx: number) => ({
        code: res.codes[idx], // الكود الفعلي المحفوظ (مصدر واحد للحقيقة)
        name: it.name,
        color: it.color,
        size: it.size,
        sellPrice: it.sellPrice,
        quantity: it.quantity,
      }));

      setCreatedItemsForPrint(printable);
      setSuccessMsg(`تم حفظ بضاعة جديدة بنجاح (موديل رقم ${res.modelNo})`);
      // تفريغ النموذج بعد الحفظ لمنع تكرار الفاتورة بضغطة ثانية
      setDescription('');
      setPurchaseCostStr('');
      setSellPriceStr('');
      setSizeRows([
        { size: 37, quantity: 1 },
        { size: 38, quantity: 1 },
        { size: 39, quantity: 1 },
      ]);
      setBagRows([{ color: 'أسود', quantity: 2 }]);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ البضاعة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethodLabels: Record<'cash' | 'instapay' | 'wallet' | 'pocket', string> = {
    cash: 'نقدية (خزينة المحل)',
    instapay: 'إنستاباي (البنك)',
    wallet: 'فودافون كاش',
    pocket: 'من الجيب الشخصي',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-2">
      {/* عنوان الصفحة */}
      <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-1.5">
        <PackagePlus className="w-5 h-5 text-[#14b8a6]" />
        <span>تسجيل بضاعة جديدة</span>
      </h1>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsPrintModalOpen(true)}
              className="gap-1.5 font-bold shadow-2xs"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة ملصقات لهذه الإضافة</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/items')}
              className="gap-1.5 bg-white text-slate-700 hover:bg-slate-50"
            >
              <span>الانتقال للمخزون</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {/* اختيار القسم */}
        <Card className="p-1.5 border-slate-200">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setCategory('shoes')}
              className={`h-9 flex items-center justify-center gap-1.5 rounded-lg font-bold text-xs transition-all ${
                category === 'shoes'
                  ? 'bg-[#14b8a6] text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              <span>أحذية</span>
            </button>

            <button
              type="button"
              onClick={() => setCategory('bags')}
              className={`h-9 flex items-center justify-center gap-1.5 rounded-lg font-bold text-xs transition-all ${
                category === 'bags'
                  ? 'bg-[#14b8a6] text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>شنط</span>
            </button>

            <button
              type="button"
              onClick={() => setCategory('accessories')}
              className={`h-9 flex items-center justify-center gap-1.5 rounded-lg font-bold text-xs transition-all ${
                category === 'accessories'
                  ? 'bg-[#14b8a6] text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>إكسسوارات</span>
            </button>
          </div>
        </Card>

        {/* بيانات الموديل والأسعار في صف واحد */}
        <Card className="p-2.5 sm:p-3 border-slate-200 space-y-2">
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-6">
              <label className="block text-[11px] font-medium text-slate-600 mb-0.5 truncate">
                اسم الصنف / الموديل *
              </label>
              <input
                type="text"
                placeholder="مثال: كوتشي جلد"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#14b8a6]"
              />
            </div>

            <div className="col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 mb-0.5 truncate">
                سعر الشراء
              </label>
              <input
                type="text"
                placeholder="0"
                value={purchaseCostStr}
                onChange={(e) => setPurchaseCostStr(e.target.value)}
                required
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-center text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#14b8a6]"
              />
            </div>

            <div className="col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 mb-0.5 truncate">
                سعر البيع
              </label>
              <input
                type="text"
                placeholder="0"
                value={sellPriceStr}
                onChange={(e) => setSellPriceStr(e.target.value)}
                required
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-center text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#14b8a6]"
              />
            </div>
          </div>

          {/* سطر نسبة الربح بنفس حسابه الحالي */}
          {profitMargin !== null && (
            <div
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-between transition-colors ${
                profitMargin >= 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>نسبة الربح: {profitMargin}%</span>
              <span className="text-[11px] font-medium">
                {profitMargin >= 0
                  ? `(مكسب ${round2(sell - cost)} ج.م للقطعة)`
                  : `(خسارة ${round2(cost - sell)} ج.م للقطعة)`}
              </span>
            </div>
          )}
        </Card>

        {/* كارت اللون والكميات */}
        <Card className="p-2.5 sm:p-3 border-slate-200 space-y-2">
          {/* للأحذية: اللون الأساسي + زر إضافة لون + كروت المقاسات (2 في الصف) */}
          {category === 'shoes' && (
            <>
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#14b8a6]"
                >
                  {Object.entries(colorLetters).map(([name, letter]) => (
                    <option key={name} value={name}>
                      {name} (كود: {letter})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setIsColorModalOpen(true)}
                  title="إضافة لون جديد"
                  className="h-9 w-9 shrink-0 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {sizeRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200"
                  >
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-slate-500 block leading-tight mb-0.5 text-center">
                        المقاس
                      </label>
                      <input
                        type="number"
                        value={row.size}
                        onChange={(e) => updateSizeRow(idx, 'size', Number(e.target.value))}
                        className="w-full h-7 bg-white border border-slate-300 rounded-md px-1 text-xs text-center font-bold text-slate-900"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-slate-500 block leading-tight mb-0.5 text-center">
                        الكمية
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) =>
                          updateSizeRow(idx, 'quantity', Math.max(1, Number(e.target.value)))
                        }
                        className="w-full h-7 bg-white border border-slate-300 rounded-md px-1 text-xs text-center font-bold text-slate-900"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={sizeRows.length <= 1}
                      onClick={() => removeSizeRow(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded transition-colors self-end mb-0.5"
                      title="حذف"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addSizeRow}
                  className="min-h-[48px] rounded-lg border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>مقاس</span>
                </button>
              </div>
            </>
          )}

          {/* للشنط والإكسسوارات: كروت اللون والكمية (2 في الصف) */}
          {category !== 'shoes' && (
            <div className="grid grid-cols-2 gap-1.5">
              {bagRows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200"
                >
                  <div className="flex-[1.3] min-w-0">
                    <label className="text-[10px] text-slate-500 block leading-tight mb-0.5">
                      اللون
                    </label>
                    <select
                      value={row.color}
                      onChange={(e) => updateBagRow(idx, 'color', e.target.value)}
                      className="w-full h-7 bg-white border border-slate-300 rounded-md px-1 text-[11px] font-medium text-slate-900"
                    >
                      {Object.entries(colorLetters).map(([name, letter]) => (
                        <option key={name} value={name}>
                          {name} ({letter})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] text-slate-500 block leading-tight mb-0.5 text-center">
                      الكمية
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) =>
                        updateBagRow(idx, 'quantity', Math.max(1, Number(e.target.value)))
                      }
                      className="w-full h-7 bg-white border border-slate-300 rounded-md px-1 text-xs text-center font-bold text-slate-900"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={bagRows.length <= 1}
                    onClick={() => removeBagRow(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded transition-colors self-end mb-0.5"
                    title="حذف"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addBagRow}
                className="min-h-[48px] rounded-lg border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>لون</span>
              </button>
            </div>
          )}

          {/* إجمالي القطع والتكلفة */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
            <span className="text-slate-600">
              إجمالي القطع: <strong className="text-slate-900">{totalQuantity} قطعة</strong>
            </span>
            <span className="text-slate-600">
              إجمالي التكلفة:{' '}
              <strong className="text-[#14b8a6] text-sm">{formatCurrency(totalCost)}</strong>
            </span>
          </div>
        </Card>

        {/* كارت الدفع */}
        <Card className="p-2 border-slate-200 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPaymentSource('cash');
                setShowOtherPayments(false);
              }}
              className="flex-1 h-9 px-3 rounded-lg border border-[#14b8a6] bg-[#14b8a6]/10 text-[#0d9488] text-xs font-bold flex items-center justify-between transition-colors"
            >
              <span>{paymentMethodLabels[paymentSource]}</span>
              {paymentSource !== 'cash' && (
                <span className="text-[10px] font-medium text-slate-500">رجوع للنقدية</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowOtherPayments((prev) => !prev)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
            >
              <span>طرق أخرى</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showOtherPayments ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {showOtherPayments && (
            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
              {(
                [
                  { id: 'instapay', label: 'إنستاباي (البنك)' },
                  { id: 'wallet', label: 'فودافون كاش' },
                  { id: 'pocket', label: 'من الجيب الشخصي' },
                ] as const
              ).map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setPaymentSource(method.id);
                    setShowOtherPayments(false);
                  }}
                  className={`py-2 px-1.5 rounded-lg border text-[11px] font-bold text-center transition-colors ${
                    paymentSource === method.id
                      ? 'border-[#14b8a6] bg-[#14b8a6]/10 text-[#0d9488]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* زر الحفظ النهائي */}
        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          className="w-full py-2.5 text-sm shadow-sm gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>حفظ البضاعة وإضافتها إلى المخزون</span>
        </Button>
      </form>

      {/* نافذة إضافة لون جديد */}
      <Modal
        isOpen={isColorModalOpen}
        onClose={() => setIsColorModalOpen(false)}
        title="إضافة لون جديد ورمزه"
      >
        <form onSubmit={handleAddCustomColor} className="space-y-4">
          <Input
            label="اسم اللون بالعربية"
            placeholder="مثال: بترولي"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            required
          />

          <Input
            label="رمز أو حرف اللون (بالإنجليزية)"
            placeholder="مثال: PET أو P"
            maxLength={4}
            value={newColorLetter}
            onChange={(e) => setNewColorLetter(e.target.value)}
            required
          />

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsColorModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="primary" size="sm">
              إضافة اللون
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة طباعة ملصقات البضاعة المضافة */}
      {isPrintModalOpen && createdItemsForPrint.length > 0 && (
        <LabelPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          items={createdItemsForPrint}
        />
      )}
    </div>
  );
};
