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
