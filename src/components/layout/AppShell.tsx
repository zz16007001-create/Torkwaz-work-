import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  PackagePlus,
  Receipt,
  Users,
  ArrowLeftRight,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Store,
  Menu,
  X,
  Camera,
  Download,
  Laptop,
  Smartphone,
  AlertCircle,
} from 'lucide-react';
import { SyncIndicator } from './SyncIndicator';
import { PWAInstallButton } from './PWAInstallButton';
import { signOut, subscribeToAuth } from '../../lib/auth';
import { migrateWalletKeys } from '../../lib/data';
import { UiModeProvider, useUiMode, isPathAllowedInSales } from '../../lib/uiMode';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const NAV_ITEMS = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/cashier', label: 'الكاشير', icon: ShoppingCart },
  { to: '/items', label: 'المخزون', icon: Boxes },
  { to: '/purchase', label: 'إضافة بضاعة', icon: PackagePlus },
  { to: '/invoices', label: 'الفواتير', icon: Receipt },
  { to: '/customers', label: 'العملاء', icon: Users },
  { to: '/transactions', label: 'العمليات', icon: ArrowLeftRight },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/snapshot', label: 'الجرد والإغلاق', icon: Camera },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
  { to: '/backup', label: 'النسخ الاحتياطي', icon: Download },
];

const SALES_ALLOWED_NAV_PATHS = new Set(['/cashier', '/items', '/invoices']);

const AppShellContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, switchToSales, tryUnlockAdmin } = useUiMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // نافذة فتح وضع الإدارة
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);

  // حارس الدخول: undefined = جارٍ الفحص، null = غير مسجل
  const [authUser, setAuthUser] = useState<any | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    const unsub = subscribeToAuth((user) => {
      if (!isMounted) return;
      setAuthUser(user);
      if (!user) {
        navigate('/login', { replace: true });
      } else {
        // ترحيل لمرة واحدة لأرصدة الخزائن القديمة (آمن للتكرار)
        migrateWalletKeys().catch((e) => console.warn('migrateWalletKeys:', e));
      }
    });

    // حماية ضد التعليق إذا تأخر أو انقطع فحص الجلسة الأولي
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        setAuthUser((prev: any) => {
          if (prev === undefined) {
            navigate('/login', { replace: true });
            return null;
          }
          return prev;
        });
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsub();
    };
  }, [navigate]);

  const handleSignOut = async () => {
    switchToSales();
    try {
      await signOut();
    } catch {
      // Ignore signOut errors
    } finally {
      navigate('/login');
    }
  };

  const handleSwitchToSales = () => {
    switchToSales();
    setMobileMenuOpen(false);
    navigate('/cashier');
  };

  const handleOpenAdminModal = () => {
    if (mode === 'admin') return;
    setAdminPasswordInput('');
    setAdminPasswordError(null);
    setUnlockModalOpen(true);
  };

  const handleConfirmAdminUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (tryUnlockAdmin(adminPasswordInput)) {
      setUnlockModalOpen(false);
      setAdminPasswordInput('');
      setAdminPasswordError(null);
    } else {
      setAdminPasswordError('كلمة السر غير صحيحة');
      setAdminPasswordInput('');
    }
  };

  if (authUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">جاري التحقق من تسجيل الدخول...</span>
        </div>
      </div>
    );
  }
  if (authUser === null) {
    return null;
  }

  const visibleNavItems =
    mode === 'sales'
      ? NAV_ITEMS.filter((item) => SALES_ALLOWED_NAV_PATHS.has(item.to))
      : NAV_ITEMS;

  const isRouteBlocked = mode === 'sales' && !isPathAllowedInSales(location.pathname);

  return (
    <div className="min-h-screen bg-page flex flex-col antialiased text-slate-800 print:bg-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-brand-600 border-b border-brand-700 text-white px-4 lg:px-6 h-16 flex items-center justify-between shadow-2xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-500 text-brand-900 flex items-center justify-center shadow-sm">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base lg:text-lg text-white leading-tight">
              محلي
            </h1>
            <p className="text-[11px] text-brand-100 hidden sm:block">
              نظام إدارة المبيعات والمخزون
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <PWAInstallButton />
          <SyncIndicator />

          {/* Mode Switch Pill */}
          <div
            dir="ltr"
            className="relative inline-flex items-center p-0.5 rounded-full bg-brand-800/80 border border-brand-500/40 shrink-0"
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 left-0.5 w-7 h-6 rounded-full bg-accent-500 shadow-xs transition-transform duration-200 ease-out ${
                mode === 'sales' ? 'translate-x-0' : 'translate-x-7'
              }`}
            />
            <button
              type="button"
              onClick={handleSwitchToSales}
              aria-label="وضع البيع (لاب توب)"
              title="وضع البيع (لاب توب)"
              className={`relative z-10 w-7 h-6 flex items-center justify-center rounded-full transition-colors ${
                mode === 'sales' ? 'text-brand-900' : 'text-brand-100 hover:text-white'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleOpenAdminModal}
              aria-label="وضع الإدارة (موبايل)"
              title="وضع الإدارة (موبايل)"
              className={`relative z-10 w-7 h-6 flex items-center justify-center rounded-full transition-colors ${
                mode === 'admin' ? 'text-brand-900' : 'text-brand-100 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => { if (window.confirm('متأكد إنك عايز تخرج؟\nلو النت فاصل مش هتقدر تدخل تاني لحد ما يرجع.')) { handleSignOut(); } }}
            title="تسجيل الخروج"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white hover:bg-brand-700 transition-colors border border-brand-500/50"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-60 bg-white border-l border-brand-100 p-3 shrink-0 print:hidden">
          <nav className="space-y-1 overflow-y-auto flex-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 hover:bg-brand-50 hover:text-brand-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* Content Outlet */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {isRouteBlocked ? <Navigate to="/cashier" replace /> : <Outlet />}
        </main>
      </div>

      {/* Mobile Drawer Overlay for "المزيد" */}
      {mode === 'admin' && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden print:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute bottom-16 inset-x-0 bg-white rounded-t-3xl p-5 shadow-2xl border-t border-brand-100 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-brand-100">
              <span className="font-bold text-brand-800 text-sm">كافة أقسام النظام</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-brand-800 hover:bg-brand-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 p-3 rounded-xl text-xs font-medium border ${
                        isActive
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-brand-100 text-slate-700 hover:bg-brand-50'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-brand-600'}`} />
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-brand-100 md:hidden flex items-center justify-around h-16 px-2 shadow-lg print:hidden">
        <NavLink
          to="/cashier"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-16 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
              isActive ? 'bg-brand-600 text-white font-semibold' : 'text-slate-500 hover:text-brand-800'
            }`
          }
        >
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          <span>الكاشير</span>
        </NavLink>

        <NavLink
          to="/items"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-16 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
              isActive ? 'bg-brand-600 text-white font-semibold' : 'text-slate-500 hover:text-brand-800'
            }`
          }
        >
          <Boxes className="w-5 h-5 mb-0.5" />
          <span>المخزون</span>
        </NavLink>

        {mode === 'sales' ? (
          <NavLink
            to="/invoices"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-16 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white font-semibold' : 'text-slate-500 hover:text-brand-800'
              }`
            }
          >
            <Receipt className="w-5 h-5 mb-0.5" />
            <span>الفواتير</span>
          </NavLink>
        ) : (
          <>
            <NavLink
              to="/purchase"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-16 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white font-semibold' : 'text-slate-500 hover:text-brand-800'
                }`
              }
            >
              <PackagePlus className="w-5 h-5 mb-0.5" />
              <span>إضافة بضاعة</span>
            </NavLink>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`flex flex-col items-center justify-center w-16 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                mobileMenuOpen ? 'bg-brand-600 text-white font-semibold' : 'text-slate-500 hover:text-brand-800'
              }`}
            >
              <Menu className="w-5 h-5 mb-0.5" />
              <span>المزيد</span>
            </button>
          </>
        )}
      </nav>

      {/* Admin Unlock Modal */}
      <Modal
        isOpen={unlockModalOpen}
        onClose={() => {
          setUnlockModalOpen(false);
          setAdminPasswordInput('');
          setAdminPasswordError(null);
        }}
        title="فتح وضع الإدارة (موبايل)"
      >
        <form onSubmit={handleConfirmAdminUnlock} className="space-y-4">
          {adminPasswordError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{adminPasswordError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              كلمة سر وضع الإدارة
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl border border-brand-200 bg-brand-50/70 focus:bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setUnlockModalOpen(false);
                setAdminPasswordInput('');
                setAdminPasswordError(null);
              }}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="accent" size="sm">
              تأكيد
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const AppShell: React.FC = () => {
  return (
    <UiModeProvider>
      <AppShellContent />
    </UiModeProvider>
  );
};
