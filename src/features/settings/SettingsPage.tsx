import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { DEFAULT_SETTINGS, StoreSettings } from '../../lib/settings';
import { Card } from '../../components/ui/Card';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import {
  Settings as SettingsIcon,
  Store,
  Wallet,
  Sliders,
  DollarSign,
  Palette,
  Lock,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';

interface LiabilityItem {
  id: string;
  name: string;
  amount: number;
}

interface WalletConfigItem {
  id: string;
  name: string;
  enabled: boolean;
}

export const SettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. بيانات المحل
  const [storeName, setStoreName] = useState(DEFAULT_SETTINGS.storeName);
  const [storePhone, setStorePhone] = useState(DEFAULT_SETTINGS.phone);
  const [storeAddress, setStoreAddress] = useState(DEFAULT_SETTINGS.address);

  // 2. الخزائن
  const [wallets, setWallets] = useState<WalletConfigItem[]>([
    { id: 'cash', name: 'خزينة المحل (نقدية / كاش)', enabled: true },
    { id: 'bank', name: 'الحساب البنكي / إنستاباي', enabled: true },
    { id: 'wallet', name: 'محفظة إلكترونية / فودافون كاش', enabled: true },
  ]);
  const [isAddWalletModalOpen, setIsAddWalletModalOpen] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');

  // 3. إعدادات عامة
  const [lowStockDefault, setLowStockDefault] = useState(DEFAULT_SETTINGS.lowStockThreshold);
  const [mismatchThreshold, setMismatchThreshold] = useState(DEFAULT_SETTINGS.mismatchThreshold);

  // 4. الالتزامات (مستحقات على المحل)
  const [liabilities, setLiabilities] = useState<LiabilityItem[]>([]);

  // 5. حروف الألوان
  const [colorLetters, setColorLetters] = useState<Record<string, string>>(
    DEFAULT_SETTINGS.colorLetters
  );
  const [isAddColorModalOpen, setIsAddColorModalOpen] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [newColorLetter, setNewColorLetter] = useState('');

  // 6. الشهر المقفول حالياً (Read-only)
  const [lockedThroughMonth, setLockedThroughMonth] = useState<string>('لا يوجد أشهر مقفلة');

  useEffect(() => {
    setLoading(true);
    // جلب مستند الإعدادات meta/settings
    const settingsRef = doc(db, 'meta', 'settings');
    const genRef = doc(db, 'settings', 'general');

    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.storeName) setStoreName(data.storeName);
          if (data.phone) setStorePhone(data.phone);
          if (data.address) setStoreAddress(data.address);
          if (data.lowStockDefault !== undefined) setLowStockDefault(Number(data.lowStockDefault));
          if (data.mismatchThreshold !== undefined) setMismatchThreshold(Number(data.mismatchThreshold));
          if (data.wallets) setWallets(data.wallets);
          if (data.liabilities) setLiabilities(data.liabilities);
          if (data.colorLetters) setColorLetters(data.colorLetters);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Settings listener error:', err);
        setLoading(false);
      }
    );

    // جلب الشهر المقفول من settings/general حيث تكتب دالة closeMonthSnapshot
    const unsubGeneral = onSnapshot(
      genRef,
      (snap) => {
        if (snap.exists() && snap.data().lockedThroughMonth) {
          setLockedThroughMonth(snap.data().lockedThroughMonth);
        } else {
          setLockedThroughMonth('لا يوجد أشهر مقفلة');
        }
      },
      (err) => {
        console.warn('General settings listener error:', err);
      }
    );

    return () => {
      unsubSettings();
      unsubGeneral();
    };
  }, []);

  // إضافة خزينة جديدة
  const handleAddWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWalletName.trim()) return;

    const id = `wallet_${Date.now()}`;
    setWallets((prev) => [...prev, { id, name: newWalletName.trim(), enabled: true }]);
    setNewWalletName('');
    setIsAddWalletModalOpen(false);
  };

  // تبديل تفعيل الخزينة
  const toggleWallet = (id: string) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  };

  // إدارة الالتزامات
  const addLiability = () => {
    setLiabilities((prev) => [
      ...prev,
      { id: `liab_${Date.now()}`, name: '', amount: 0 },
    ]);
  };

  const removeLiability = (id: string) => {
    setLiabilities((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLiability = (id: string, field: 'name' | 'amount', value: any) => {
    setLiabilities((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  // إدارة الألوان
  const updateColorLetter = (colorName: string, letter: string) => {
    setColorLetters((prev) => ({
      ...prev,
      [colorName]: letter.trim().toUpperCase(),
    }));
  };

  const handleAddColor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColorName.trim() || !newColorLetter.trim()) return;

    setColorLetters((prev) => ({
      ...prev,
      [newColorName.trim()]: newColorLetter.trim().toUpperCase(),
    }));
    setNewColorName('');
    setNewColorLetter('');
    setIsAddColorModalOpen(false);
  };

  const removeColor = (colorName: string) => {
    setColorLetters((prev) => {
      const copy = { ...prev };
      delete copy[colorName];
      return copy;
    });
  };

  // حفظ الإعدادات في Firestore (meta/settings و settings/general)
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        storeName: storeName.trim(),
        phone: storePhone.trim(),
        address: storeAddress.trim(),
        lowStockDefault: Number(lowStockDefault) || 5,
        mismatchThreshold: Number(mismatchThreshold) || 50,
        wallets,
        liabilities: liabilities.filter((l) => l.name.trim() && l.amount > 0),
        colorLetters,
        updatedAt: Date.now(),
      };

      // الحفظ في meta/settings مع merge
      await setDoc(doc(db, 'meta', 'settings'), payload, { merge: true });

      // تزامن مع settings/general
      await setDoc(doc(db, 'settings', 'general'), payload, { merge: true });

      setSuccessMsg('تم حفظ كافة الإعدادات بنجاح');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ الإعدادات');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 mt-4">جاري تحميل إعدادات النظام...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-2.5 pb-8">
      {/* رأس الصفحة وزر الحفظ */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
            <SettingsIcon className="w-5 h-5 text-brand-600 shrink-0" />
            <span>إعدادات النظام</span>
          </h1>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            تخصيص بيانات المتجر، الخزائن، الحسابات، وقواعد التنبيه
          </p>
        </div>

        <Button
          onClick={handleSaveSettings}
          isLoading={isSaving}
          variant="primary"
          size="sm"
          className="shadow-sm gap-1.5 shrink-0 px-3"
        >
          <Save className="w-3.5 h-3.5" />
          <span>حفظ الإعدادات</span>
        </Button>
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

      {/* 1. بيانات المحل */}
      <CollapsibleSection
        title="بيانات المحل الأساسية"
        icon={<Store className="w-4 h-4 text-brand-600" />}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Input
            label="اسم المحل / المتجر"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            required
          />

          <Input
            label="رقم الهاتف للتواصل"
            value={storePhone}
            onChange={(e) => setStorePhone(e.target.value)}
          />

          <div className="col-span-2">
            <Input
              label="العنوان / الفرع"
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 2. الخزائن */}
      <CollapsibleSection
        title="الخزائن وطرق الدفع"
        icon={<Wallet className="w-4 h-4 text-brand-600" />}
        bodyClassName="space-y-2.5"
      >
        <div className="space-y-1.5">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-brand-50/60 border border-brand-100 text-xs"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-slate-800 truncate">{w.name}</span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">({w.id})</span>
              </div>

              {/* مفتاح Toggle لتفعيل/تعطيل الخزينة */}
              <button
                type="button"
                onClick={() => toggleWallet(w.id)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  w.enabled ? 'bg-brand-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    w.enabled ? '-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAddWalletModalOpen(true)}
          className="gap-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة خزينة جديدة</span>
        </Button>
      </CollapsibleSection>

      {/* 3. إعدادات عامة وتنبيهات الأمان */}
      <CollapsibleSection
        title="حدود التنبيهات والأمان"
        icon={<Sliders className="w-4 h-4 text-brand-600" />}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Input
            label="حد تنبيه نقص الرصيد"
            type="number"
            min="1"
            value={lowStockDefault}
            onChange={(e) => setLowStockDefault(Number(e.target.value))}
            hint="يظهر بالأحمر تحته"
          />

          <Input
            label="حد فرق الربح المسموح"
            type="number"
            min="0"
            value={mismatchThreshold}
            onChange={(e) => setMismatchThreshold(Number(e.target.value))}
            hint="الافتراضي 50 ج.م"
          />
        </div>
      </CollapsibleSection>

      {/* 4. الالتزامات (Liabilities) */}
      <CollapsibleSection
        title="الالتزامات والديون على المحل"
        icon={<DollarSign className="w-4 h-4 text-brand-600" />}
        bodyClassName="space-y-2.5"
      >
        {liabilities.length === 0 ? (
          <p className="text-xs text-slate-400 py-2 text-center">
            لا توجد التزامات مسجلة على المحل حالياً.
          </p>
        ) : (
          <div className="space-y-1.5">
            {liabilities.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="اسم الالتزام (مثال: لمورد أو قسط)"
                  value={item.name}
                  onChange={(e) => updateLiability(item.id, 'name', e.target.value)}
                  className="flex-1 min-w-0 bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-brand-600"
                />
                <div className="w-24 sm:w-32 shrink-0">
                  <input
                    type="number"
                    min="0"
                    dir="ltr"
                    placeholder="المبلغ"
                    value={item.amount || ''}
                    onChange={(e) =>
                      updateLiability(item.id, 'amount', Number(e.target.value) || 0)
                    }
                    className="w-full bg-brand-50/70 focus:bg-white border border-brand-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 text-center focus:outline-none focus:border-brand-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLiability(item.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLiability}
          className="gap-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة التزام</span>
        </Button>
      </CollapsibleSection>

      {/* 5. حروف الألوان */}
      <CollapsibleSection
        title="حروف ورموز الألوان التلقائية"
        icon={<Palette className="w-4 h-4 text-brand-600" />}
        bodyClassName="space-y-2.5"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(colorLetters).map(([name, letter]) => (
            <div
              key={name}
              className="p-2 rounded-xl bg-brand-50/60 border border-brand-100 flex items-center justify-between gap-1.5"
            >
              <span className="text-xs font-bold text-slate-800 truncate">{name}</span>
              <input
                type="text"
                maxLength={4}
                dir="ltr"
                value={letter}
                onChange={(e) => updateColorLetter(name, e.target.value)}
                className="w-11 text-center font-mono font-bold bg-white border border-brand-200 rounded-lg px-1 py-1 text-xs uppercase focus:outline-none focus:border-brand-600 shrink-0"
              />
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAddColorModalOpen(true)}
          className="gap-1 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>لون جديد</span>
        </Button>
      </CollapsibleSection>

      {/* 6. الشهر المقفول حالياً (Read-only) */}
      <Card className="p-3 border-brand-100 bg-brand-50/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-slate-500 font-bold block">
              حالة قفل الفترات المحاسبية (عرض فقط)
            </span>
            <span className="text-xs font-extrabold text-brand-900 truncate block">
              الشهر المقفول حالياً: {lockedThroughMonth}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-semibold text-brand-700 bg-white border border-brand-200 px-2.5 py-0.5 rounded-full shrink-0">
          عبر صورة المحل
        </span>
      </Card>

      {/* زر الحفظ السفلي */}
      <div className="pt-1">
        <Button
          onClick={handleSaveSettings}
          isLoading={isSaving}
          variant="accent"
          className="w-full py-3 text-sm font-bold shadow-sm gap-2"
        >
          <Save className="w-4 h-4" />
          <span>حفظ وتطبيق كافة الإعدادات</span>
        </Button>
      </div>

      {/* نافذة إضافة خزينة جديدة */}
      <Modal
        isOpen={isAddWalletModalOpen}
        onClose={() => setIsAddWalletModalOpen(false)}
        title="إضافة خزينة أو حساب جديد"
      >
        <form onSubmit={handleAddWallet} className="space-y-4">
          <Input
            label="اسم الخزينة أو الحساب"
            placeholder="مثال: الخزينة الفرعية، فودافون كاش 2..."
            value={newWalletName}
            onChange={(e) => setNewWalletName(e.target.value)}
            required
          />

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddWalletModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="accent" size="sm">
              إضافة
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة إضافة لون جديد */}
      <Modal
        isOpen={isAddColorModalOpen}
        onClose={() => setIsAddColorModalOpen(false)}
        title="إضافة لون ورمزه"
      >
        <form onSubmit={handleAddColor} className="space-y-4">
          <Input
            label="اسم اللون بالعربية"
            placeholder="مثال: زيتوني"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            required
          />

          <Input
            label="رمز أو حرف اللون (بالإنجليزية)"
            placeholder="مثال: OL"
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
              onClick={() => setIsAddColorModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="accent" size="sm">
              إضافة اللون
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
