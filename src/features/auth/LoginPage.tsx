import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, subscribeToAuth } from '../../lib/auth';
import { isFirebaseConfigured } from '../../lib/firebase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Lock, Mail, Store, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToAuth((user) => {
      if (user) {
        navigate('/', { replace: true });
      }
    });
    return unsub;
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!password) {
      setErrorMessage('يرجى إدخال كلمة المرور');
      return;
    }

    try {
      setIsLoading(true);
      await signIn(email, password);
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تسجيل الدخول');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-page flex flex-col">
      {/* القسم العلوي الأخضر الغامق */}
      <div className="bg-gradient-to-b from-brand-600 to-brand-700 pt-10 pb-20 px-4 text-center text-white">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-500 text-brand-900 mb-3 shadow-md">
          <Store className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">نظام محلي</h1>
        <p className="text-sm text-brand-100 mt-1">إدارة مبيعات ومخزون الأحذية والشنط</p>
      </div>

      {/* كارت تسجيل الدخول */}
      <div className="w-full max-w-md mx-auto px-4 -mt-12 pb-8 flex-1">
        <Card className="shadow-lg border-brand-100 rounded-2xl">
          <h2 className="text-lg font-semibold text-brand-800 mb-6 text-center">
            تسجيل الدخول للنظام
          </h2>

          {!isFirebaseConfigured && (
            <div className="mb-5 p-3 rounded-xl bg-accent-50 border border-accent-400 text-accent-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-accent-600" />
              <span>يرجى ضبط متغيرات البيئة الخاصة بـ Firebase لتفعيل تسجيل الدخول وقاعدة البيانات.</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label="البريد الإلكتروني"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <div className="absolute left-3 top-9 text-slate-400 pointer-events-none">
                <Mail className="w-4 h-4" />
              </div>
            </div>

            <div className="relative">
              <Input
                label="كلمة المرور"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <div className="absolute left-3 top-9 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="accent"
                isLoading={isLoading}
                className="w-full text-base py-3"
              >
                تسجيل الدخول
              </Button>
            </div>
          </form>
        </Card>

        <p className="text-xs text-center text-slate-500 mt-6">
          «محلي» &bull; مصمم للعمل دون اتصال بالإنترنت (Offline-First)
        </p>
      </div>
    </div>
  );
};
