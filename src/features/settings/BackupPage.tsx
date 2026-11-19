import React, { useState, useRef, useMemo } from 'react';
import { exportBackup, importBackup, createOpening } from '../../lib/data';
import { getPendingCount } from '../../lib/pending';
import { formatCurrency, parseArabicNumber, round2 } from '../../domain/money';
import { getCairoDate, getDayKey } from '../../domain/dates';
import { GreenCard } from '../../components/ui/Card';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Banknote,
  CreditCard,
  Smartphone,
  Boxes,
  Users,
  ShieldCheck,
  Building,
} from 'lucide-react';

export const BackupPage: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isOpeningSubmitting, setIsOpeningSubmitting] = useState(false);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // مدخلات بداية جديدة (إعادة تأسيس)
  const [openCash, setOpenCash] = useState('');
  const [openBank, setOpenBank] = useState('');
  const [openWallet, setOpenWallet] = useState('');
  const [openInventoryVal, setOpenInventoryVal] = useState('');
  const [openReceivables, setOpenReceivables] = useState('');
  const [openLiabilities, setOpenLiabilities] = useState('');
  const [openNotes, setOpenNotes] = useState('');

  // حساب رأس المال الافتتاحي في الوقت الفعلي
  const calculatedCapital = useMemo(() => {
    const cash = parseArabicNumber(openCash);
    const bank = parseArabicNumber(openBank);
    const wallet = parseArabicNumber(openWallet);
    const inv = parseArabicNumber(openInventoryVal);
    const rec = parseArabicNumber(openReceivables);
    const liab = parseArabicNumber(openLiabilities);

    const totalWallets = cash + bank + wallet;
    return round2(totalWallets + inv + rec - liab);
  }, [openCash, openBank, openWallet, openInventoryVal, openReceivables, openLiabilities]);

  // تصدير نسخة احتياطية
  const handleExportBackup = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMsg('لا يمكن تصدير نسخة احتياطية في وضع عدم الاتصال (أوفلاين). يرجى الاتصال بالإنترنت أولاً لضمان اكتمال كافة البيانات.');
      return;
    }

    try {
      setIsExporting(true);
      setErrorMsg(null);

      const jsonString = await exportBackup();
      const today = getDayKey(getCairoDate());
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mahally_backup_${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // تسجيل تاريخ النسخ الاحتياطي بعد نجاح إنشاء الملف وبدء التنزيل فعلياً
      try {
        localStorage.setItem('mahally_last_backup', new Date().toISOString());
      } catch {}

      setSuccessMsg('تم تصدير وتحميل النسخة الاحتياطية بنجاح.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تصدير النسخة الاحتياطية');
    } finally {
      setIsExporting(false);
    }
  };

  // اختيار ملف النسخة واستيراده
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (getPendingCount() > 0) {
      setErrorMsg(`لا يمكن الاستعادة الآن: يوجد ${getPendingCount()} فاتورة لم تُرفع للسيرفر بعد. انتظر حتى تُرفع ثم أعد المحاولة.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (
      !window.confirm(
        'تحذير هام: سيتم مسح كافة البيانات الحالية واستبدالها بالبيانات الموجودة في ملف النسخة الاحتياطية. هل تريد المتابعة؟'
      )
    ) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const typed = window.prompt(
      'تحذير: الاستعادة تمسح بيانات المحل الحالية، وإن انقطع الاتصال في منتصفها قد تبقى البيانات غير مكتملة.\nتأكد أنك صدّرت نسخة حديثة الآن، وأن النت مستقر، ولا يوجد بيع جارٍ على أي جهاز.\nاكتب كلمة: استعادة  للمتابعة'
    );
    if ((typed ?? '').trim() !== 'استعادة') {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsImporting(true);
      setErrorMsg(null);

      const text = await file.text();
      await importBackup(text);

      setSuccessMsg('تم استيراد كافة البيانات بنجاح واستعادة النظام.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل استيراد النسخة الاحتياطية');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // تأكيد بداية جديدة
  const handleCreateOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (
      !window.confirm(
        `تأكيد البداية الجديدة: سيتم حفظ الرصيد الافتتاحي برأس مال ${formatCurrency(
          calculatedCapital
        )} وتحديث الخزائن. هل ترغب في بدء العمل؟`
      )
    ) {
      return;
    }

    try {
      setIsOpeningSubmitting(true);
      const capital = await createOpening({
        cash: parseArabicNumber(openCash),
        bank: parseArabicNumber(openBank),
        wallet: parseArabicNumber(openWallet),
        inventoryValue: parseArabicNumber(openInventoryVal),
        receivables: parseArabicNumber(openReceivables),
        liabilities: parseArabicNumber(openLiabilities),
        notes: openNotes.trim() || undefined,
      });

      setSuccessMsg(
        `تم تأسيس البداية الجديدة بنجاح ورأس المال الافتتاحي هو ${formatCurrency(capital)}.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تأسيس البداية الجديدة');
    } finally {
      setIsOpeningSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-2.5 pb-8">
      {/* رأس الصفحة */}
      <div>
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
          <Database className="w-5 h-5 text-brand-600 shrink-0" />
          <span>النسخ الاحتياطي وبداية جديدة</span>
        </h1>
        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
          حفظ وتصدير بياناتك محلياً بصيغة JSON، أو إعادة تأسيس الأرصدة الافتتاحية للمحل
        </p>
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

      {/* 1. قسم النسخ الاحتياطي (تصدير واستيراد) */}
      <CollapsibleSection
        title="النسخ الاحتياطي لبيانات النظام"
        subtitle="احتفظ بنسخة من الفواتير والأصناف والعملاء والخزائن على جهازك"
        icon={<ShieldCheck className="w-4 h-4 text-brand-600" />}
        bodyClassName="space-y-2"
      >
        {/* تصدير نسخة */}
        <CollapsibleSection
          variant="sub"
          title="تصدير نسخة احتياطية كاملة"
          subtitle="تحميل ملف JSON كامل يحتوي على كل السجلات"
          icon={<Download className="w-3.5 h-3.5 text-brand-600" />}
          bodyClassName="space-y-2.5"
        >
          <p className="text-xs text-slate-600 leading-relaxed">
            تحميل ملف JSON كامل يحتوي على كل السجلات المحاسبية والمخزون حتى اللحظة.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleExportBackup}
            isLoading={isExporting}
            className="w-full gap-1.5 font-bold"
          >
            <Download className="w-4 h-4" />
            <span>تصدير وتحميل الملف</span>
          </Button>
        </CollapsibleSection>

        {/* استيراد نسخة */}
        <CollapsibleSection
          variant="sub"
          title="استيراد واستعادة نسخة احتياطية"
          subtitle="رفع ملف JSON سابق لاسترجاع البيانات"
          icon={<Upload className="w-3.5 h-3.5 text-rose-600" />}
          bodyClassName="space-y-2.5"
        >
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>
              تحذير هام: الاستعادة تمسح كافة البيانات الحالية وتستبدلها بملف النسخة الاحتياطية. تأكد من استقرار الإنترنت وتصدير نسخة حديثة أولاً.
            </span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            isLoading={isImporting}
            className="w-full gap-1.5 font-bold"
          >
            <Upload className="w-4 h-4 text-brand-600" />
            <span>اختيار ملف والاستيراد</span>
          </Button>
        </CollapsibleSection>
      </CollapsibleSection>

      {/* 2. قسم بداية جديدة (إعادة تأسيس) */}
      <CollapsibleSection
        title="بداية جديدة (إعادة تأسيس الأرصدة)"
        subtitle="تهيئة الأرصدة الافتتاحية للمحل للبدء برأس مال تشغيلي مضبوط"
        icon={<RefreshCw className="w-4 h-4 text-brand-600" />}
      >
        <form onSubmit={handleCreateOpening} className="space-y-2.5">
          {/* تحذير البداية الجديدة ظاهر عند فتح القسم */}
          <div className="p-2.5 rounded-lg bg-accent-50 border border-accent-400 text-accent-700 text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-accent-600 shrink-0 mt-0.5" />
            <span>
              تنبيه: البداية الجديدة تُثبّت أرصدة الخزائن الافتتاحية ورأس المال الأساسي. لإدخال الأصناف استخدم شاشة الشراء بالدفع «من الجيب»، وللعملاء شاشة العملاء.
            </span>
          </div>

          {/* أرصدة الخزائن الافتتاحية */}
          <CollapsibleSection
            variant="sub"
            title="الأرصدة النقدية الافتتاحية في الخزائن"
            subtitle="كاش المحل، إنستاباي، وفودافون كاش"
            icon={<Banknote className="w-3.5 h-3.5 text-brand-600" />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5 text-brand-600" />
                  <span>خزينة المحل (كاش)</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="0.00"
                  value={openCash}
                  onChange={(e) => setOpenCash(e.target.value)}
                  className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-brand-700" />
                  <span>البنك / إنستاباي</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="0.00"
                  value={openBank}
                  onChange={(e) => setOpenBank(e.target.value)}
                  className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-rose-600" />
                  <span>فودافون كاش</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="0.00"
                  value={openWallet}
                  onChange={(e) => setOpenWallet(e.target.value)}
                  className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-600"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* المخزون والديون والالتزامات */}
          <CollapsibleSection
            variant="sub"
            title="المخزون والديون والالتزامات والملاحظات"
            subtitle="تقدير قيمة البضاعة والمديونيات والملاحظات"
            icon={<Boxes className="w-3.5 h-3.5 text-brand-600" />}
            bodyClassName="space-y-2.5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Boxes className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                  <span>قيمة المخزون الحالي (للعلم)</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="0.00"
                  value={openInventoryVal}
                  onChange={(e) => setOpenInventoryVal(e.target.value)}
                  className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-accent-600 shrink-0" />
                  <span>ديون العملاء (للعلم)</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="0.00"
                  value={openReceivables}
                  onChange={(e) => setOpenReceivables(e.target.value)}
                  className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>الالتزامات على المحل (ج.م)</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="0.00"
                  value={openLiabilities}
                  onChange={(e) => setOpenLiabilities(e.target.value)}
                  className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-600"
                />
              </div>
            </div>

            <Input
              label="ملاحظات التأسيس (اختياري)"
              placeholder="مثال: جرد بداية العام الجديد 2026..."
              value={openNotes}
              onChange={(e) => setOpenNotes(e.target.value)}
            />
          </CollapsibleSection>

          {/* عرض رأس المال الافتتاحي المحسوب */}
          <GreenCard className="p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-brand-100 block">
                رأس المال الافتتاحي المحسوب (Capital):
              </span>
              <span className="text-lg sm:text-xl font-black text-accent-400">
                {formatCurrency(calculatedCapital)}
              </span>
            </div>
            <p className="text-[11px] text-brand-100 text-left max-w-[180px] hidden sm:block">
              الخزائن + المخزون + الديون - الالتزامات
            </p>
          </GreenCard>

          {/* زر بدء العمل */}
          <Button
            type="submit"
            variant="accent"
            isLoading={isOpeningSubmitting}
            className="w-full py-2.5 text-sm font-bold shadow-sm gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>بدء العمل وتثبيت الأرصدة الافتتاحية</span>
          </Button>
        </form>
      </CollapsibleSection>
    </div>
  );
};
