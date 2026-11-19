import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'card' | 'sub';
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = false,
  variant = 'card',
  className = '',
  headerClassName = '',
  bodyClassName = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const containerClasses =
    variant === 'card'
      ? `rounded-2xl border border-brand-100 bg-white shadow-xs overflow-hidden transition-all ${className}`
      : `rounded-xl border border-brand-100 bg-brand-50/50 overflow-hidden transition-all ${className}`;

  return (
    <div className={containerClasses}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
          variant === 'card'
            ? 'px-3.5 py-2.5 hover:bg-brand-50/60'
            : 'px-3 py-2 hover:bg-brand-100/60'
        } ${headerClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-bold text-brand-900 truncate">
              {title}
            </div>
            {subtitle && (
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <ChevronDown
            className={`w-4 h-4 text-brand-600 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      <div
        className={
          isOpen
            ? `block border-t border-brand-100 transition-opacity duration-200 ${
                variant === 'card' ? 'p-3.5' : 'p-3 bg-white/80'
              } ${bodyClassName}`
            : 'hidden'
        }
      >
        {children}
      </div>
    </div>
  );
};
