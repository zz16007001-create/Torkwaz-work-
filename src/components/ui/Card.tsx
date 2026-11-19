import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`rounded-2xl border border-brand-100 bg-white p-5 shadow-xs transition-shadow print:border-slate-300 print:shadow-none ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const GREEN_CARD_INPUT_CLASS =
  'bg-white border border-brand-200/80 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-400/70 transition-all';

export const GREEN_CARD_BTN_CLASS =
  'bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors';

export const GREEN_CARD_CHIP_ACTIVE_CLASS =
  'bg-accent-500 text-slate-900 font-bold shadow-xs';

export const GREEN_CARD_CHIP_INACTIVE_CLASS =
  'bg-white/15 hover:bg-white/25 text-white font-medium';

export const GreenCard: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`rounded-2xl border border-brand-700 bg-gradient-to-br from-brand-600 to-brand-700 text-white p-4 shadow-sm print:bg-none print:bg-white print:text-slate-900 print:border-slate-300 print:shadow-none ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
