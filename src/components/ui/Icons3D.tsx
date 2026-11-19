import React, { useId } from 'react';

export type Icon3DName =
  | 'capital'
  | 'wallets'
  | 'cash'
  | 'instapay'
  | 'vodafone'
  | 'inventory'
  | 'receivables'
  | 'credit'
  | 'today'
  | 'lowStock'
  | 'netSales'
  | 'grossProfit'
  | 'netProfit'
  | 'invoices'
  | 'piecesSold'
  | 'expenses'
  | 'stagnant'
  | 'closings'
  | 'customer'
  | 'shoe'
  | 'bag'
  | 'ring';

interface Icon3DProps {
  name: Icon3DName;
  size?: number;
  className?: string;
}

export const Icon3D: React.FC<Icon3DProps> = ({ name, size = 40, className = '' }) => {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const gGreen = `${uid}-green`;
  const gGreenDark = `${uid}-green-dark`;
  const gGreenLight = `${uid}-green-light`;
  const gGold = `${uid}-gold`;
  const gGoldLight = `${uid}-gold-light`;
  const gPaper = `${uid}-paper`;
  const gRed = `${uid}-red`;
  const gSlate = `${uid}-slate`;
  const gShadow = `${uid}-shadow`;
  const gGloss = `${uid}-gloss`;

  const renderShape = () => {
    switch (name) {
      case 'capital':
        // خزنة مجسمة
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.6" fill={`url(#${gShadow})`} />
            <rect x="10" y="38" width="5" height="4" rx="1.5" fill={`url(#${gGreenDark})`} />
            <rect x="33" y="38" width="5" height="4" rx="1.5" fill={`url(#${gGreenDark})`} />
            <rect x="7" y="8" width="34" height="31" rx="7" fill={`url(#${gGreen})`} />
            <rect x="10.5" y="11.5" width="27" height="24" rx="4.5" fill={`url(#${gGreenDark})`} opacity="0.45" />
            <rect x="9" y="9.5" width="30" height="10" rx="5" fill={`url(#${gGloss})`} />
            <circle cx="24" cy="23.5" r="7.5" fill={`url(#${gGold})`} />
            <circle cx="24" cy="23.5" r="4.2" fill={`url(#${gGoldLight})`} />
            <circle cx="24" cy="23.5" r="2" fill="#285045" />
            <rect x="10" y="16" width="3" height="5" rx="1.5" fill={`url(#${gGold})`} />
            <rect x="10" y="25" width="3" height="5" rx="1.5" fill={`url(#${gGold})`} />
          </g>
        );

      case 'wallets':
        // محفظة مجسمة
        return (
          <g>
            <ellipse cx="24" cy="42" rx="16" ry="2.6" fill={`url(#${gShadow})`} />
            <rect x="9" y="10" width="28" height="14" rx="4" fill={`url(#${gGold})`} transform="rotate(-6 23 17)" />
            <rect x="6" y="14" width="36" height="25" rx="6.5" fill={`url(#${gGreen})`} />
            <rect x="8" y="15" width="32" height="9" rx="4.5" fill={`url(#${gGloss})`} />
            <rect x="27" y="22" width="16" height="9" rx="4.5" fill={`url(#${gGreenDark})`} />
            <circle cx="32" cy="26.5" r="2.6" fill={`url(#${gGoldLight})`} />
          </g>
        );

      case 'cash':
        // أوراق نقدية متراصة
        return (
          <g>
            <ellipse cx="24" cy="42" rx="16.5" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="8" y="19" width="32" height="19" rx="4" fill={`url(#${gGreenDark})`} />
            <rect x="6.5" y="14.5" width="35" height="19" rx="4" fill={`url(#${gGreen})`} />
            <rect x="8.5" y="16" width="31" height="6" rx="3" fill={`url(#${gGloss})`} />
            <rect x="19" y="14.5" width="10" height="19" rx="2" fill={`url(#${gGold})`} />
            <circle cx="24" cy="24" r="3.2" fill={`url(#${gGoldLight})`} />
          </g>
        );

      case 'instapay':
        // كارت بنكي مجسم
        return (
          <g>
            <ellipse cx="24" cy="41.5" rx="16" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="5" y="11" width="38" height="26" rx="5.5" fill={`url(#${gGreen})`} />
            <rect x="5" y="16" width="38" height="5.5" fill={`url(#${gGreenDark})`} opacity="0.6" />
            <rect x="7" y="12.5" width="34" height="8" rx="4" fill={`url(#${gGloss})`} />
            <rect x="10" y="24" width="9" height="7" rx="2" fill={`url(#${gGold})`} />
            <rect x="24" y="27" width="13" height="3" rx="1.5" fill={`url(#${gGreenLight})`} />
          </g>
        );

      case 'vodafone':
        // موبايل عليه محفظة
        return (
          <g>
            <ellipse cx="24" cy="43" rx="12" ry="2.3" fill={`url(#${gShadow})`} />
            <rect x="12" y="6" width="24" height="35" rx="5.5" fill={`url(#${gGreenDark})`} />
            <rect x="14.5" y="9" width="19" height="26" rx="3.5" fill={`url(#${gPaper})`} />
            <rect x="14.5" y="9" width="19" height="8" rx="3" fill={`url(#${gGloss})`} />
            <rect x="20.5" y="37" width="7" height="2" rx="1" fill={`url(#${gGreenLight})`} />
            <rect x="17" y="16" width="14" height="11" rx="3" fill={`url(#${gGold})`} />
            <circle cx="27" cy="21.5" r="2" fill="#285045" />
          </g>
        );

      case 'inventory':
        // صندوق بضاعة مجسم
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="7" y="14" width="34" height="25" rx="5" fill={`url(#${gGreen})`} />
            <rect x="5.5" y="9" width="37" height="9" rx="3.5" fill={`url(#${gGreenLight})`} />
            <rect x="7" y="10" width="34" height="4" rx="2" fill={`url(#${gGloss})`} />
            <rect x="20" y="9" width="8" height="30" rx="1.5" fill={`url(#${gGold})`} />
            <rect x="12" y="29" width="6" height="3" rx="1.5" fill="#FFFFFF" opacity="0.55" />
          </g>
        );

      case 'receivables':
        // دفتر/إيصال عليه ساعة
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="8" y="8" width="26" height="31" rx="5" fill={`url(#${gPaper})`} />
            <rect x="8" y="8" width="26" height="8" rx="4" fill={`url(#${gGreen})`} />
            <rect x="12.5" y="20" width="13" height="2.6" rx="1.3" fill={`url(#${gSlate})`} opacity="0.55" />
            <rect x="12.5" y="26" width="9" height="2.6" rx="1.3" fill={`url(#${gSlate})`} opacity="0.4" />
            <circle cx="32.5" cy="31.5" r="9.5" fill={`url(#${gGold})`} />
            <circle cx="32.5" cy="31.5" r="6.5" fill="#FFFDF7" />
            <path d="M32.5 28v3.8l2.5 1.5" stroke="#285045" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </g>
        );

      case 'credit':
        // عملة ذهبية مع سهم إيداع أخضر
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <circle cx="24" cy="24.5" r="15.5" fill={`url(#${gGold})`} />
            <circle cx="24" cy="24.5" r="11.5" fill={`url(#${gGoldLight})`} />
            <ellipse cx="20" cy="17" rx="7" ry="3.5" fill={`url(#${gGloss})`} />
            <path d="M24 17v11m0 0l-4.5-4.5M24 28l4.5-4.5" stroke="#285045" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        );

      case 'today':
        // شنطة تسوق مجسمة
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="14.5" ry="2.5" fill={`url(#${gShadow})`} />
            <path d="M17 15v-2.5a7 7 0 0114 0V15" stroke="#285045" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <rect x="8" y="14" width="32" height="25.5" rx="6" fill={`url(#${gGreen})`} />
            <rect x="10" y="15.5" width="28" height="8" rx="4" fill={`url(#${gGloss})`} />
            <circle cx="24" cy="27" r="5.5" fill={`url(#${gGoldLight})`} />
          </g>
        );

      case 'lowStock':
        // صندوق عليه علامة تحذير
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="7" y="13" width="28" height="24" rx="5" fill={`url(#${gGreen})`} />
            <rect x="5.5" y="9" width="31" height="7.5" rx="3.2" fill={`url(#${gGreenLight})`} />
            <rect x="17" y="9" width="7" height="28" rx="1.5" fill={`url(#${gGold})`} opacity="0.85" />
            <circle cx="33.5" cy="31.5" r="9.5" fill={`url(#${gRed})`} />
            <rect x="32.2" y="25.8" width="2.6" height="6.8" rx="1.3" fill="#FFFFFF" />
            <circle cx="33.5" cy="35.3" r="1.5" fill="#FFFFFF" />
          </g>
        );

      case 'netSales':
        // شنطة تسوق مع سهم صاعد
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <path d="M16 14v-2a6 6 0 0112 0v2" stroke="#285045" strokeWidth="3" strokeLinecap="round" fill="none" />
            <rect x="7.5" y="13.5" width="29" height="24.5" rx="5.5" fill={`url(#${gGreen})`} />
            <rect x="9.5" y="15" width="25" height="7" rx="3.5" fill={`url(#${gGloss})`} />
            <circle cx="34" cy="31" r="9" fill={`url(#${gGold})`} />
            <path d="M34 35v-8m0 0l-3.5 3.5M34 27l3.5 3.5" stroke="#1E3C34" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        );

      case 'grossProfit':
        // عملات متراصة مع سهم صاعد
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <ellipse cx="19" cy="34" rx="11" ry="4.5" fill={`url(#${gGold})`} />
            <ellipse cx="19" cy="28" rx="11" ry="4.5" fill={`url(#${gGoldLight})`} />
            <ellipse cx="19" cy="22" rx="11" ry="4.5" fill={`url(#${gGold})`} />
            <ellipse cx="19" cy="16" rx="11" ry="4.5" fill={`url(#${gGoldLight})`} />
            <circle cx="34" cy="24" r="9.5" fill={`url(#${gGreen})`} />
            <path d="M34 28.5v-8.5m0 0l-3.5 3.5M34 20l3.5 3.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        );

      case 'netProfit':
        // عملة/محفظة عليها علامة صح
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <circle cx="24" cy="23.5" r="16" fill={`url(#${gGreen})`} />
            <circle cx="24" cy="23.5" r="12" fill={`url(#${gGold})`} />
            <ellipse cx="20" cy="15.5" rx="7.5" ry="3.5" fill={`url(#${gGloss})`} />
            <path d="M18.5 24l3.8 3.8 7.5-8" stroke="#1E3C34" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        );

      case 'invoices':
        // إيصال/فاتورة مجسمة
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="14" ry="2.4" fill={`url(#${gShadow})`} />
            <path
              d="M11 10a4 4 0 014-4h18a4 4 0 014 4v28.5l-3.5-2.5-3.5 2.5-3.5-2.5-3.5 2.5-3.5-2.5-3.5 2.5-3.5-2.5-1.5 1V10z"
              fill={`url(#${gPaper})`}
            />
            <rect x="11" y="6" width="26" height="9" rx="4" fill={`url(#${gGreen})`} />
            <rect x="15.5" y="19.5" width="17" height="2.8" rx="1.4" fill={`url(#${gSlate})`} opacity="0.55" />
            <rect x="15.5" y="25" width="12" height="2.8" rx="1.4" fill={`url(#${gSlate})`} opacity="0.4" />
            <rect x="15.5" y="30.5" width="15" height="2.8" rx="1.4" fill={`url(#${gGold})`} />
          </g>
        );

      case 'piecesSold':
        // صندوق صغير مجسم
        return (
          <g>
            <ellipse cx="24" cy="42" rx="14" ry="2.4" fill={`url(#${gShadow})`} />
            <rect x="9" y="15" width="30" height="22" rx="5" fill={`url(#${gGold})`} />
            <rect x="7.5" y="10" width="33" height="8" rx="3.2" fill={`url(#${gGoldLight})`} />
            <rect x="20.5" y="10" width="7" height="27" rx="1.5" fill={`url(#${gGreen})`} />
            <rect x="9" y="11" width="30" height="3.5" rx="1.7" fill={`url(#${gGloss})`} />
          </g>
        );

      case 'expenses':
        // إيصال عليه علامة ناقص حمراء
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="8.5" y="7" width="25" height="31" rx="4.5" fill={`url(#${gPaper})`} />
            <rect x="8.5" y="7" width="25" height="8" rx="4" fill={`url(#${gSlate})`} />
            <rect x="13" y="19" width="14" height="2.6" rx="1.3" fill={`url(#${gSlate})`} opacity="0.45" />
            <rect x="13" y="24.5" width="10" height="2.6" rx="1.3" fill={`url(#${gSlate})`} opacity="0.35" />
            <circle cx="32.5" cy="31.5" r="9.5" fill={`url(#${gRed})`} />
            <rect x="27" y="30.1" width="11" height="2.8" rx="1.4" fill="#FFFFFF" />
          </g>
        );

      case 'stagnant':
        // ساعة رملية مجسمة
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="13" ry="2.4" fill={`url(#${gShadow})`} />
            <rect x="12" y="7" width="24" height="4.5" rx="2.2" fill={`url(#${gGreen})`} />
            <rect x="12" y="36.5" width="24" height="4.5" rx="2.2" fill={`url(#${gGreen})`} />
            <path d="M15 11.5h18c0 7-6.5 10.5-9 12.5 2.5 2 9 5.5 9 12.5H15c0-7 6.5-10.5 9-12.5-2.5-2-9-5.5-9-12.5z" fill={`url(#${gPaper})`} />
            <path d="M17.5 13.5h13c-.6 4.5-4.3 7.3-6.5 8.8-2.2-1.5-5.9-4.3-6.5-8.8z" fill={`url(#${gGoldLight})`} />
            <path d="M17.5 34.5h13c-.4-3.3-3.4-5.4-6.5-6.7-3.1 1.3-6.1 3.4-6.5 6.7z" fill={`url(#${gGold})`} />
          </g>
        );

      case 'closings':
        // تقويم عليه قفل مجسم
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.5" fill={`url(#${gShadow})`} />
            <rect x="7.5" y="10" width="29" height="28" rx="5" fill={`url(#${gPaper})`} />
            <rect x="7.5" y="10" width="29" height="9" rx="4" fill={`url(#${gGreen})`} />
            <rect x="14" y="6.5" width="3.5" height="6.5" rx="1.7" fill={`url(#${gGreenDark})`} />
            <rect x="26.5" y="6.5" width="3.5" height="6.5" rx="1.7" fill={`url(#${gGreenDark})`} />
            <rect x="12.5" y="23" width="11" height="2.6" rx="1.3" fill={`url(#${gSlate})`} opacity="0.45" />
            <path d="M29.5 26v-2.2a3.8 3.8 0 017.6 0V26" stroke="#285045" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            <rect x="25.8" y="25.5" width="15" height="12.5" rx="3.5" fill={`url(#${gGold})`} />
            <circle cx="33.3" cy="31.5" r="1.8" fill="#285045" />
          </g>
        );

      case 'customer':
        // أيقونة عميل مجسمة
        return (
          <g>
            <ellipse cx="24" cy="43" rx="14" ry="2.4" fill={`url(#${gShadow})`} />
            <path
              d="M9.5 39c1-7.8 6.8-12 14.5-12s13.5 4.2 14.5 12c.2 1.6-1.1 2.8-2.7 2.8H12.2c-1.6 0-2.9-1.2-2.7-2.8z"
              fill={`url(#${gGold})`}
            />
            <path
              d="M12.5 34.5c2.2-3.5 6.4-5.5 11.5-5.5 4.2 0 7.7 1.3 10 3.7"
              stroke={`url(#${gGloss})`}
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="24" cy="17" r="8.5" fill={`url(#${gPaper})`} />
            <ellipse cx="21.5" cy="13.5" rx="4.2" ry="2.2" fill={`url(#${gGloss})`} />
            <circle cx="24" cy="17" r="8.5" stroke={`url(#${gGold})`} strokeWidth="1.4" fill="none" />
          </g>
        );

      case 'shoe':
        // حذاء رياضي مجسم
        return (
          <g>
            <ellipse cx="24" cy="41.5" rx="16.5" ry="2.4" fill={`url(#${gShadow})`} />
            <path
              d="M7 33.5h33.5c1.5 0 2.5 1.1 2.5 2.5 0 1.7-1.2 3-3 3H9.5c-2 0-3.5-1.3-3.5-3.2 0-1.3.4-2.3 1-2.3z"
              fill={`url(#${gPaper})`}
            />
            <path
              d="M8.5 33.5c.2-5.8.8-11 2.2-14.2.7-1.5 2.4-1.7 3.6-.5 2.4 2.4 5.2 3.2 8.2 1.5l1.6-1c.8-.5 1.9-.2 2.4.6 1.5 2.4 4.2 4.3 8.2 5.2 4 .9 6.3 2.8 6.8 5.6.2 1.5-.6 2.8-2.2 2.8H8.5z"
              fill={`url(#${gGreen})`}
            />
            <path
              d="M11 21c1.8 2 4.8 3.2 8.5 2.5"
              stroke={`url(#${gGloss})`}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <rect x="24" y="23.5" width="4.5" height="2" rx="1" fill={`url(#${gGoldLight})`} transform="rotate(-22 24 23.5)" />
            <rect x="27" y="25.8" width="4.5" height="2" rx="1" fill={`url(#${gGoldLight})`} transform="rotate(-22 27 25.8)" />
            <path d="M12.5 33.5c1.5-2.5 3.6-4.5 6.5-5.5" stroke={`url(#${gGold})`} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>
        );

      case 'bag':
        // شنطة يد مجسمة
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="15" ry="2.4" fill={`url(#${gShadow})`} />
            <path
              d="M17.5 16.5v-3.2a6.5 6.5 0 0113 0v3.2"
              stroke={`url(#${gGold})`}
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M9 17.5a3.5 3.5 0 013.5-3.5h23a3.5 3.5 0 013.5 3.5l1.5 18a4.5 4.5 0 01-4.5 4.8H12a4.5 4.5 0 01-4.5-4.8l1.5-18z"
              fill={`url(#${gGreen})`}
            />
            <path
              d="M9.5 16.5h29l-1.5 9.2c-.3 1.8-1.8 3.1-3.6 3.1H14.6c-1.8 0-3.3-1.3-3.6-3.1l-1.5-9.2z"
              fill={`url(#${gGreenLight})`}
            />
            <rect x="11.5" y="16" width="25" height="4.5" rx="2.2" fill={`url(#${gGloss})`} />
            <rect x="21" y="25.5" width="6" height="5.5" rx="2" fill={`url(#${gGold})`} />
            <circle cx="24" cy="28.3" r="1.3" fill="#285045" />
          </g>
        );

      case 'ring':
        // خاتم ذهب مجسم بفص لامع
        return (
          <g>
            <ellipse cx="24" cy="42.5" rx="13.5" ry="2.3" fill={`url(#${gShadow})`} />
            <circle cx="24" cy="27.5" r="12.5" stroke={`url(#${gGold})`} strokeWidth="5.2" fill="none" />
            <path
              d="M15 21.5a11.5 11.5 0 0114-3"
              stroke={`url(#${gGoldLight})`}
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <polygon points="24,6.5 30.5,11.5 27.5,16.5 20.5,16.5 17.5,11.5" fill={`url(#${gPaper})`} stroke={`url(#${gGold})`} strokeWidth="1.5" />
            <polygon points="24,6.5 27.5,11.5 24,16 20.5,11.5" fill={`url(#${gGreenLight})`} opacity="0.65" />
            <path d="M12 10.5l1.2-2.5 1.2 2.5 2.5 1.2-2.5 1.2-1.2 2.5-1.2-2.5-2.5-1.2z" fill={`url(#${gGoldLight})`} />
          </g>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={gGreen} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5AA18E" />
          <stop offset="55%" stopColor="#3F7869" />
          <stop offset="100%" stopColor="#285045" />
        </linearGradient>
        <linearGradient id={gGreenDark} x1="8" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#336254" />
          <stop offset="100%" stopColor="#1E3C34" />
        </linearGradient>
        <linearGradient id={gGreenLight} x1="8" y1="8" x2="40" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#77B8A6" />
          <stop offset="100%" stopColor="#4E8B7A" />
        </linearGradient>
        <linearGradient id={gGold} x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8D26A" />
          <stop offset="55%" stopColor="#F2B636" />
          <stop offset="100%" stopColor="#C88E1A" />
        </linearGradient>
        <linearGradient id={gGoldLight} x1="10" y1="10" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCEBBD" />
          <stop offset="100%" stopColor="#F5C150" />
        </linearGradient>
        <linearGradient id={gPaper} x1="10" y1="6" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DDEAE5" />
        </linearGradient>
        <linearGradient id={gRed} x1="22" y1="20" x2="42" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
        <linearGradient id={gSlate} x1="10" y1="8" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
        <radialGradient id={gShadow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1E3C34" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#1E3C34" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gGloss} x1="8" y1="8" x2="32" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {renderShape()}
    </svg>
  );
};
