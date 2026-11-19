import React, { createContext, useContext, useState, useCallback } from 'react';

export type UiMode = 'sales' | 'admin';

const ADMIN_PASSWORD = '6771';
const STORAGE_KEY = 'mahally_ui_mode';

function readStoredMode(): UiMode {
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    if (val === 'sales' || val === 'admin') {
      return val;
    }
  } catch {
    // Ignore storage errors
  }
  return 'sales';
}

function writeStoredMode(mode: UiMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

export function isPathAllowedInSales(pathname: string): boolean {
  if (pathname === '/cashier' || pathname === '/invoices' || pathname === '/items') {
    return true;
  }
  if (pathname.startsWith('/invoices/')) {
    return true;
  }
  return false;
}

interface UiModeContextValue {
  mode: UiMode;
  switchToSales: () => void;
  tryUnlockAdmin: (password: string) => boolean;
}

const UiModeContext = createContext<UiModeContextValue | null>(null);

export const UiModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<UiMode>(() => readStoredMode());

  const switchToSales = useCallback(() => {
    setMode('sales');
    writeStoredMode('sales');
  }, []);

  const tryUnlockAdmin = useCallback((password: string): boolean => {
    if (password === ADMIN_PASSWORD) {
      setMode('admin');
      writeStoredMode('admin');
      return true;
    }
    return false;
  }, []);

  return (
    <UiModeContext.Provider value={{ mode, switchToSales, tryUnlockAdmin }}>
      {children}
    </UiModeContext.Provider>
  );
};

export function useUiMode(): UiModeContextValue {
  const ctx = useContext(UiModeContext);
  if (!ctx) {
    throw new Error('useUiMode must be used within a UiModeProvider');
  }
  return ctx;
}
