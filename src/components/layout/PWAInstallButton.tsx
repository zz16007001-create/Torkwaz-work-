import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Share, X, Smartphone } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // إذا كان التطبيق مثبتاً ويعمل في وضع standalone، نخفي الزر
  if (isInstalled) {
    return null;
  }

  // أندرويد وكروم والحواسيب (يدعم beforeinstallprompt)
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-accent-500 text-brand-900 hover:bg-accent-400 shadow-xs transition-colors"
        title="تثبيت التطبيق على جهازك"
      >
        <Download className="w-3.5 h-3.5" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  // هواتف آيفون (iOS Safari)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-accent-400 text-brand-900 bg-accent-500 hover:bg-accent-400 transition-colors"
          title="تثبيت التطبيق على آيفون"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>تثبيت على آيفون</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-brand-100 text-right">
              <div className="flex items-center justify-between pb-3 border-b border-brand-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-brand-800">تثبيت التطبيق على آيفون</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <p>
                    اضغط على زر <strong>المشاركة (Share)</strong> <Share className="w-3.5 h-3.5 inline mx-1 text-blue-600" /> في شريط متصفح Safari بالأسفل.
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <p>
                    مرر لأسفل واختر <strong>«إضافة إلى الصفحة الرئيسية» (Add to Home Screen)</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <p>
                    اضغط <strong>«إضافة» (Add)</strong> في أعلى الشاشة ليظهر التطبيق بأيقونة تركواز الرسمية على شاشة هاتفك.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs hover:bg-brand-700 transition-colors"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
