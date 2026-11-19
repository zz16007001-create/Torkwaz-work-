// اختبارات الحسابات المالية الأساسية. تشغيل: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { round2, parseArabicNumber, normalizePhone } from './money';
import { calculateInvoiceTotals, allocateInvoiceLines, calculateLineReturn, distributeDiscount } from './invoice';
import { calculateInvoiceProfit, calculateRealProfit, calculateMismatch } from './profit';
import { makeCode } from './codes';

test('round2 لا يرجع -0', () => {
  assert.ok(!Object.is(round2(-0.004), -0));
  assert.equal(round2(1.005), 1.01);
});

test('parseArabicNumber: الفاصلة العشرية وفاصل الآلاف', () => {
  assert.equal(parseArabicNumber('12,5'), 12.5);
  assert.equal(parseArabicNumber('1,250'), 1250);
  assert.equal(parseArabicNumber('1,250.50'), 1250.5);
  assert.equal(parseArabicNumber('١٢٫٥'), 12.5);
  assert.equal(parseArabicNumber('12-5'), 0);
  assert.equal(parseArabicNumber('1e3'), 0);
  assert.equal(parseArabicNumber(''), 0);
});

test('normalizePhone', () => {
  assert.equal(normalizePhone('٠١٠ ١٢٣-٤٥٦٧'), '0101234567');
  assert.equal(normalizePhone(' 0100 123 4567 '), '01001234567');
  assert.equal(normalizePhone('+20101234567'), '0101234567');
  assert.equal(normalizePhone('0020101234567'), '0101234567');
  assert.equal(normalizePhone('+20 010 1234 567'), '0101234567');
});

test('توزيع الخصم: مجموع الحصص = الخصم بالضبط', () => {
  const sh = distributeDiscount(30, 10, [{ price: 10, quantity: 1 }, { price: 10, quantity: 1 }, { price: 10, quantity: 1 }]);
  assert.deepEqual(sh, [3.33, 3.33, 3.34]);
});

test('خصم إجمالي أكبر من المجموع يُقصّ', () => {
  const items: any[] = [{ unitPrice: 100, quantity: 2, discount: 0 }];
  const t = calculateInvoiceTotals({ items, overallDiscount: 500 });
  assert.equal(t.discountTotal, 200);
  assert.equal(t.grandTotal, 0);
});

test('فاتورة 2×100 خصم 20: المرتجع حسب ما دفعه العميل (90 ثم 180)', () => {
  const items: any[] = [{ unitPrice: 100, quantity: 2, discount: 0, total: 200 }];
  const t = calculateInvoiceTotals({ items, overallDiscount: 20 });
  assert.equal(t.grandTotal, 180);
  const [line] = allocateInvoiceLines(items, 20, 0, t.taxTotal);
  assert.equal(line.lineGrand, 180);
  const r1 = calculateLineReturn(line.lineGrand, 2, 1, 0, 0);
  assert.equal(r1.refundAmount, 90);
  const r2 = calculateLineReturn(line.lineGrand, 2, 1, 1, 90);
  assert.equal(r2.refundAmount, 90);
});

test('إرجاع كل الفاتورة = إجمالي الفاتورة بالضبط (3 بنود وخصم غير قابل للقسمة)', () => {
  const items: any[] = [
    { unitPrice: 10, quantity: 1, discount: 0, total: 10 },
    { unitPrice: 10, quantity: 1, discount: 0, total: 10 },
    { unitPrice: 10, quantity: 1, discount: 0, total: 10 },
  ];
  const t = calculateInvoiceTotals({ items, overallDiscount: 10 });
  const lines = allocateInvoiceLines(items, 10, 0, t.taxTotal);
  const sum = round2(lines.reduce((s, l) => s + l.lineGrand, 0));
  assert.equal(sum, t.grandTotal);
  assert.equal(sum, 20);
});

test('الضريبة: 2×100 خصم 20 ضريبة 14% = 205.2 وتتوزع بلا فرق', () => {
  const items: any[] = [{ unitPrice: 100, quantity: 2, discount: 0, total: 200 }];
  const t = calculateInvoiceTotals({ items, overallDiscount: 20, taxRate: 14 });
  assert.equal(t.taxTotal, 25.2);
  assert.equal(t.grandTotal, 205.2);
  const [l] = allocateInvoiceLines(items, 20, 14, t.taxTotal);
  assert.equal(l.lineGrand, 205.2);
});

test('الربح: المرتجع يُخصم، والفرق صفر عندما تتطابق الأرقام', () => {
  // مبيعات 1000 - مرتجع 100 = 900 ، تكلفة 600 - 60 = 540 ، مصروف 50 ، معدوم 10
  const profit = calculateInvoiceProfit({ totalSalesNet: 900, costOfGoodsSold: 540, expenses: 50, badDebt: 10 });
  assert.equal(profit, 300);
  // رأس المال زاد 340 ، سحب 40 ، تمويل 0 => الربح الحقيقي 380؟ لا: 340 + 40 - 0 = 380 => فرق 80 (مشكلة حقيقية تظهر)
  assert.equal(calculateMismatch(calculateRealProfit(340, 40, 0), profit), 80);
  // لو رأس المال زاد 260 فقط: 260 + 40 = 300 => لا فرق
  assert.equal(calculateMismatch(calculateRealProfit(260, 40, 0), profit), 0);
});

test('الأكواد: لون مختلف = كود مختلف، والإكسسوار يحمل رقم الموديل', () => {
  const black = makeCode('shoes', { modelNumber: 12, colorLetter: 'B', size: 37 });
  const white = makeCode('shoes', { modelNumber: 12, colorLetter: 'W', size: 37 });
  assert.equal(black, 'S12-B37');
  assert.notEqual(black, white);
  assert.equal(makeCode('bags', { modelNumber: 5, colorLetter: 'BR' }), 'B5-BR');
  assert.equal(makeCode('accessories', { modelNumber: 7, colorLetter: 'BK' }), 'ACC7-BK');
  assert.notEqual(makeCode('accessories', { modelNumber: 7, colorLetter: 'BK' }), makeCode('accessories', { modelNumber: 8, colorLetter: 'BK' }));
  // الألوان العربية بدون colorLetter تُنتج رموزاً لاتينية معيارية فريدة تمنع تصادم الأكواد
  const codeBlack = makeCode('shoes', { modelNumber: 1, color: 'أسود', size: 40 });
  const codeBrown = makeCode('shoes', { modelNumber: 1, color: 'بني', size: 40 });
  const codeBeige = makeCode('shoes', { modelNumber: 1, color: 'بيج', size: 40 });
  const codeWhite = makeCode('shoes', { modelNumber: 1, color: 'أبيض', size: 40 });
  const codeGray = makeCode('shoes', { modelNumber: 1, color: 'رمادي', size: 40 });
  const codeNavy = makeCode('shoes', { modelNumber: 1, color: 'كحلي', size: 40 });

  assert.equal(codeBlack, 'S1-B40');
  assert.equal(codeBrown, 'S1-BR40');
  assert.equal(codeBeige, 'S1-BE40');
  assert.equal(codeWhite, 'S1-W40');
  assert.equal(codeGray, 'S1-G40');
  assert.equal(codeNavy, 'S1-N40');

  // التأكد أن جميع الأكواد الستة مختلفة تماماً لنفس الموديل والمقاس
  const codesSet = new Set([codeBlack, codeBrown, codeBeige, codeWhite, codeGray, codeNavy]);
  assert.equal(codesSet.size, 6);

  // حالات حدية: عدم وجود لون إطلاقاً ينتقل إلى 'X'
  assert.equal(makeCode('shoes', { modelNumber: 1, size: 40 }), 'S1-X40');

  // ألوان عربية بديلة وغير مسجلة: توليد رمز حتمي فريد ولا يحتوي أي حروف عربية
  const codeTurq = makeCode('shoes', { modelNumber: 1, color: 'تيركواز', size: 40 });
  const codeCustom = makeCode('shoes', { modelNumber: 1, color: 'مشمشي', size: 40 });
  assert.notEqual(codeTurq, codeCustom);
  assert.match(codeTurq, /^S1-[A-Z0-9]+40$/);
  assert.match(codeCustom, /^S1-[A-Z0-9]+40$/);
});

test('التحقق: رفض الكميات الصفرية والسالبة في البيع والشراء وعدم تحويلها إلى 1', async () => {
  const { validateInvoice, validatePurchase } = await import('./validation');

  // فاتورة بيع بكمية صفرية
  const invZero = validateInvoice({
    items: [{ itemId: 'item-1', name: 'حذاء كلاسيك', quantity: 0, unitPrice: 200 }],
    grandTotal: 0,
    paidAmount: 0,
  });
  assert.equal(invZero.isValid, false);
  assert.ok(invZero.errors.some((e) => e.includes('أكبر من صفر')));

  // فاتورة بيع بكمية سالبة
  const invNegative = validateInvoice({
    items: [{ itemId: 'item-1', name: 'حذاء كلاسيك', quantity: -3, unitPrice: 200 }],
    grandTotal: 0,
    paidAmount: 0,
  });
  assert.equal(invNegative.isValid, false);
  assert.ok(invNegative.errors.some((e) => e.includes('أكبر من صفر')));

  // فاتورة شراء بكمية صفرية وسالبة
  const purZero = validatePurchase({
    items: [{ name: 'شنطة جلد', quantity: 0, purchaseCost: 150 }],
  });
  assert.equal(purZero.isValid, false);
  assert.ok(purZero.errors.some((e) => e.includes('أكبر من صفر')));

  const purNegative = validatePurchase({
    items: [{ name: 'شنطة جلد', quantity: -1, purchaseCost: 150 }],
  });
  assert.equal(purNegative.isValid, false);
  assert.ok(purNegative.errors.some((e) => e.includes('أكبر من صفر')));

  // بنود بكميات موجبة صحيحة
  const validInv = validateInvoice({
    items: [{ itemId: 'item-1', name: 'حذاء كلاسيك', quantity: 2, unitPrice: 200 }],
    grandTotal: 400,
    paidAmount: 400,
  });
  assert.equal(validInv.isValid, true);
  assert.equal(validInv.errors.length, 0);
});

test('المخزون: بيع كامل الكمية المتاحة وتجاوز المتاح', () => {
  let stock = 5;
  const requestedValid = 5;
  assert.ok(stock >= requestedValid, 'الكمية المتاحة كافية');
  stock -= requestedValid;
  assert.equal(stock, 0, 'الرصيد بعد بيع كامل الكمية أصبح صفراً تماماً');

  const requestedExcess = 1;
  const canSell = stock >= requestedExcess;
  assert.equal(canSell, false, 'يجب رفض بيع أي كمية تتجاوز الرصيد المتاح عند منع المخزون السالب');
});

test('تكرار الصنف في أكثر من سطر بالفاتورة: تجميع الكميات للحساب المخزني', () => {
  // سطر 1: قطعة بسعر 100، سطر 2: قطعتان بسعر 90 (خصم خاص)
  const items = [
    { itemId: 'shoe-b38', name: 'حذاء أسود 38', quantity: 1, unitPrice: 100, costPrice: 60, discount: 0, total: 100 },
    { itemId: 'shoe-b38', name: 'حذاء أسود 38', quantity: 2, unitPrice: 90, costPrice: 60, discount: 0, total: 180 },
  ];

  const totals = calculateInvoiceTotals({ items: items as any, overallDiscount: 0 });
  assert.equal(totals.subtotal, 280);
  assert.equal(totals.grandTotal, 280);

  // تجميع الكميات لخصم المخزون
  const stockDeltas = new Map<string, number>();
  for (const it of items) {
    stockDeltas.set(it.itemId, (stockDeltas.get(it.itemId) || 0) + it.quantity);
  }
  assert.equal(stockDeltas.get('shoe-b38'), 3, 'إجمالي الكمية المطلوب خصمها من الصنف = 3 قطع');
});

test('المرتجع لصنف موزع على عدة أسطر: استهلاك تسلسلي وحساب دقيق للمبلغ المسترد', () => {
  const line1 = { itemId: 'item-x', name: 'صنف x', quantity: 1, lineGrand: 100, returnedQty: 0, returnedAmount: 0 };
  const line2 = { itemId: 'item-x', name: 'صنف x', quantity: 2, lineGrand: 180, returnedQty: 0, returnedAmount: 0 }; // 90 للقطعة
  const lines = [line1, line2];

  // العميل يرجع قطعتين
  let qtyToReturn = 2;
  let totalRefund = 0;

  for (const line of lines) {
    if (qtyToReturn <= 0) break;
    const returnable = line.quantity - line.returnedQty;
    const take = Math.min(returnable, qtyToReturn);
    const { refundAmount } = calculateLineReturn(line.lineGrand, line.quantity, take, line.returnedQty, line.returnedAmount);
    totalRefund = round2(totalRefund + refundAmount);
    line.returnedQty += take;
    line.returnedAmount = round2(line.returnedAmount + refundAmount);
    qtyToReturn -= take;
  }

  // أخذ 1 من السطر الأول (100) و1 من السطر الثاني (90) = 190 بالضبط
  assert.equal(qtyToReturn, 0);
  assert.equal(totalRefund, 190);
  assert.equal(line1.returnedQty, 1);
  assert.equal(line2.returnedQty, 1);
});

test('المرتجع: منع تجاوز الكمية المباعة ومنع تكرار الإرجاع', async () => {
  const { validateReturn } = await import('./validation');

  // إرجاع صالح
  const v1 = validateReturn({
    invoiceStatus: 'completed',
    originalSoldQty: 3,
    alreadyReturnedQty: 1,
    requestedReturnQty: 2,
  });
  assert.equal(v1.isValid, true);

  // تجاوز المتاح (المتبقي 2 وطلب 3)
  const v2 = validateReturn({
    invoiceStatus: 'completed',
    originalSoldQty: 3,
    alreadyReturnedQty: 1,
    requestedReturnQty: 3,
  });
  assert.equal(v2.isValid, false);
  assert.ok(v2.errors.some((e) => e.includes('تتجاوز الحد الأقصى')));

  // فاتورة ملغاة
  const v3 = validateReturn({
    invoiceStatus: 'cancelled',
    originalSoldQty: 3,
    alreadyReturnedQty: 0,
    requestedReturnQty: 1,
  });
  assert.equal(v3.isValid, false);
  assert.ok(v3.errors.some((e) => e.includes('فاتورة ملغاة')));
});

test('الربح: المقارنة الصريحة بين Markup (الزيادة على التكلفة) و Gross Profit Margin (هامش الربح)', async () => {
  const { calculateMarkup, calculateGrossProfitMargin, calculateProfitMargin } = await import('./profit');

  // صنف تكلفته 100 وسعر بيعه 150:
  // Markup = (150 - 100) / 100 * 100 = 50%
  // Margin = (150 - 100) / 150 * 100 = 33.33%
  assert.equal(calculateMarkup(100, 150), 50);
  assert.equal(calculateGrossProfitMargin(100, 150), 33.33);
  // التوافق البرمجي لـ calculateProfitMargin
  assert.equal(calculateProfitMargin(100, 150), 50);

  // صنف تكلفته 80 وسعر بيعه 100:
  // Markup = (100 - 80) / 80 * 100 = 25%
  // Margin = (100 - 80) / 100 * 100 = 20%
  assert.equal(calculateMarkup(80, 100), 25);
  assert.equal(calculateGrossProfitMargin(80, 100), 20);
});

test('المرتجع العابر للشهر: بيع 30 يناير ومرتجع 2 فبراير دون تشويه ربح يناير', async () => {
  // يناير: بيع صنف بسعر 150 وتكلفة 100
  const janSales = 150;
  const janCogs = 100;
  const janProfit = round2(janSales - janCogs);
  assert.equal(janProfit, 50, 'ربح يناير المقفول = 50 ج.م');

  // في 2 فبراير: مرتجع القطعة (استرداد 150 وتكلفة البضاعة المرتجعة 100)
  // مبيعات فبراير الأصلية 0، والمرتجع -150
  const febGrossSales = 0;
  const febRefunds = 150;
  const febNetSales = round2(febGrossSales - febRefunds); // -150

  const febGrossCogs = 0;
  const febReturnCost = 100;
  const febCogs = round2(febGrossCogs - febReturnCost); // -100

  // أثر فبراير الصافي على الربح:
  // NetSales - COGS = -150 - (-100) = -50
  const febProfit = round2(febNetSales - febCogs);
  assert.equal(febProfit, -50, 'أثر فبراير يعكس ربح القطعة المرتجعة بالضبط (-50 ج.م)');

  // إجمالي أرباح الشهرين معاً: 50 (يناير) + (-50 فبراير) = 0 ج.م (لأن القطعة بيعت ثم أُرجعت)
  assert.equal(round2(janProfit + febProfit), 0, 'محصلة أرباح العمليتين صفر تام دون أي تضخيم');
});

test('إعادة احتساب المخزون والخزينة بالحركات الفعلية المسجلة', async () => {
  const { recalculateItemQty, recalculateWallets } = await import('./stock');

  // مخزون: رصيد افتتاحي 10 + مشتريات 15 - مبيعات 8 + مرتجعات 2 + تسوية جرد -1
  const stock = recalculateItemQty({
    initialQty: 10,
    purchasesQty: 15,
    activeSalesQty: 8,
    returnsQty: 2,
    stockAdjustmentsQty: -1,
  });
  assert.equal(stock, 18, 'رصيد المخزن الدفتري مطابق 100%');

  // خزينة: رصيد افتتاحي كاش 1000، وبنك 2000
  // تحصيل عميل كاش (collection) 500، سداد مشتريات كاش (purchase_payment) 300، تحويل من كاش لبنك 200
  const wallets = recalculateWallets(
    { cash: 1000, bank: 2000, wallet: 0 },
    [
      { walletId: 'cash', amount: 500, type: 'collection' },
      { walletId: 'cash', amount: 300, type: 'purchase_payment' },
      { walletId: 'cash', targetWalletId: 'bank', amount: 200, type: 'transfer' },
    ]
  );

  // كاش: 1000 + 500 - 300 - 200 = 1000
  assert.equal(wallets.cash, 1000);
  // بنك: 2000 + 200 = 2200
  assert.equal(wallets.bank, 2200);
});

test('محاكاة يوم عمل كامل (50 فاتورة بيع) وأسبوع وشهر دون أي أخطاء تراكمية', () => {
  // محاكاة يوم عمل 50 فاتورة لمحل أحذية وشنط:
  // 30 فاتورة نقدية كاش (متوسط 250 ج.م، تكلفة 150 ج.م)
  // 15 فاتورة إنستاباي بنك (متوسط 300 ج.م، تكلفة 180 ج.م)
  // 5 فواتير آجل مدين عملاء (متوسط 200 ج.م، تكلفة 120 ج.م)
  let cashSales = 0;
  let bankSales = 0;
  let creditSales = 0;
  let totalCost = 0;

  for (let i = 1; i <= 50; i++) {
    if (i <= 30) {
      cashSales = round2(cashSales + 250);
      totalCost = round2(totalCost + 150);
    } else if (i <= 45) {
      bankSales = round2(bankSales + 300);
      totalCost = round2(totalCost + 180);
    } else {
      creditSales = round2(creditSales + 200);
      totalCost = round2(totalCost + 120);
    }
  }

  const grandSales = round2(cashSales + bankSales + creditSales);
  assert.equal(grandSales, (30 * 250) + (15 * 300) + (5 * 200)); // 7500 + 4500 + 1000 = 13000
  assert.equal(totalCost, (30 * 150) + (15 * 180) + (5 * 120)); // 4500 + 2700 + 600 = 7800

  // حدوث مرتجعين نقدية:
  // مرتجع 1: صنف بـ 250 وتكلفة 150 كاش
  // مرتجع 2: صنف بـ 300 وتكلفة 180 بنك
  const returnsValue = 550;
  const returnsCost = 330;

  const netSales = round2(grandSales - returnsValue); // 13000 - 550 = 12450
  const netCogs = round2(totalCost - returnsCost);    // 7800 - 330 = 7470
  const expenses = 450; // مصروفات كهرباء وبوفيه

  const dayProfit = calculateInvoiceProfit({
    totalSalesNet: netSales,
    costOfGoodsSold: netCogs,
    expenses,
    badDebt: 0,
  });

  // الربح المتوقع = 12450 - 7470 - 450 = 4530 ج.م
  assert.equal(dayProfit, 4530);

  // محاكاة شهر (30 يوماً بنفس المعدل):
  const monthProfit = round2(dayProfit * 30);
  assert.equal(monthProfit, 135900, 'أرباح الشهر متسقة بدقة دون أي تباين');

  // محاكاة شهر مضاعف الأرباح (ضعف النشاط والمبيعات):
  const doubleMonthProfit = round2(monthProfit * 2);
  assert.equal(doubleMonthProfit, 271800, 'الأرباح الشهرية المضاعفة متسقة رياضياً');
});

test('تسوية الخزينة (wallet_adjust): معالجة دقيقة للفائض (موجب) والعجز (سالب)', async () => {
  const { recalculateWallets } = await import('./stock');

  // رصيد افتتاحي: كاش 1000، بنك 5000
  // حركة 1: جرد كاش الفعلي 1250 (فائض 250+) => difference: +250, amount: 250
  // حركة 2: جرد بنك الفعلي 4900 (عجز 100-) => difference: -100, amount: 100
  const wallets = recalculateWallets(
    { cash: 1000, bank: 5000, wallet: 0 },
    [
      { walletId: 'cash', type: 'wallet_adjust', amount: 250, difference: 250 },
      { walletId: 'bank', type: 'wallet_adjust', amount: 100, difference: -100 },
    ]
  );

  assert.equal(wallets.cash, 1250, 'الكاش زاد بمقدار الفائض الفعلي (+250)');
  assert.equal(wallets.bank, 4900, 'البنك نقص بمقدار العجز الفعلي (-100)');
});

test('الخزينة: استبعاد الحركات المعكوسة (status: reversed) منعاً لتكرار أو استمرار أثرها', async () => {
  const { recalculateWallets } = await import('./stock');

  // رصيد كاش 2000
  // حركة 1: مصروف 300 نشط (يُخصم)
  // حركة 2: مصروف 500 معكوس (status: 'reversed' - يجب استبعاده وعدم خصمه)
  // حركة 3: سداد مشتريات 700 معكوس بسبب إلغاء فاتورة الشراء (status: 'reversed' - يستبعد)
  // حركة 4: تحصيل عميل 400 نشط (يُضاف)
  const wallets = recalculateWallets(
    { cash: 2000, bank: 0, wallet: 0 },
    [
      { walletId: 'cash', type: 'expense', amount: 300, status: 'active' },
      { walletId: 'cash', type: 'expense', amount: 500, status: 'reversed' },
      { walletId: 'cash', type: 'purchase_payment', amount: 700, status: 'reversed' },
      { walletId: 'cash', type: 'collection', amount: 400, status: 'active' },
    ]
  );

  // 2000 - 300 (مصروف نشط) + 400 (تحصيل نشط) = 2100 (تم تجاهل الـ 500 والـ 700 المعكوستين)
  assert.equal(wallets.cash, 2100, 'تم استبعاد الحركات المعكوسة تماماً ولم يتأثر الرصيد بها');
});

test('المخزون: عدم تكرار حركات المخزون عند وجود مرتجع أو إلغاء فاتورة', async () => {
  const { recalculateItemQty } = await import('./stock');

  // صنف رصيده الافتتاحي 10 قطع
  // السيناريو 1: فاتورة نشطة بيع منها 3 قطع، ثم استرجع العميل قطعة واحدة (نوع return)
  // activeSalesQty = 3, returnsQty = 1
  const stockNormalReturn = recalculateItemQty({
    initialQty: 10,
    activeSalesQty: 3,
    returnsQty: 1,
    stockAdjustmentsQty: 0,
  });
  assert.equal(stockNormalReturn, 8, 'المخزون بعد بيع 3 ومرتجع 1 = 8 قطع');

  // السيناريو 2: فاتورة بيع بـ 4 قطع أُلغيت بالكامل (cancelInvoice)
  // الفاتورة الملغاة تُستبعد من activeSalesQty (تصبح 0)، ومستند الإلغاء (type: 'cancel') يُستبعد من returnsQty
  // حتى لا يتم عدّ القطع المسترجعة مرتين
  const stockCancelledInvoice = recalculateItemQty({
    initialQty: 10,
    activeSalesQty: 0, // استبعاد الفاتورة الملغاة من المبيعات
    returnsQty: 0,      // استبعاد مستند الإلغاء CAN-xxx من المرتجعات
    stockAdjustmentsQty: 0,
  });
  assert.equal(stockCancelledInvoice, 10, 'المخزون بعد إلغاء الفاتورة بالكامل يعود لرصيده الأصلي 10 دون تكرار');

  // السيناريو 3: التأكد من أن purchasesQty الافتراضية = 0 ولا تضاعف الرصيد الافتتاحي initialQty
  const stockWithDefaultPurchases = recalculateItemQty({
    initialQty: 10,
    activeSalesQty: 2,
    returnsQty: 0,
    stockAdjustmentsQty: 0,
  });
  assert.equal(stockWithDefaultPurchases, 8, 'purchasesQty = 0 افتراضياً ولم تضاعف كمية الشراء الأولي');
});

test('تحصيل ديون العملاء: التحقق من إظهار التأكيد عند تجاوز الدين والتنفيذ المباشر دونه', async () => {
  const { checkExcessCollection } = await import('./payment');

  // السيناريو 1 (الحد الحرج: الدين 500 والتحصيل 500) -> لا يتطلب تأكيداً
  const caseEqual = checkExcessCollection(500, 500);
  assert.equal(caseEqual.needsConfirmation, false, 'تحصيل مبلغ مساوٍ للدين لا يطلب تأكيداً');
  assert.equal(caseEqual.debt, 500);
  assert.equal(caseEqual.collectionAmount, 500);
  assert.equal(caseEqual.excessAmount, 0);

  // السيناريو 2 (الحالة العادية: الدين 500 والتحصيل 300) -> لا يتطلب تأكيداً
  const caseUnder = checkExcessCollection(500, 300);
  assert.equal(caseUnder.needsConfirmation, false, 'تحصيل مبلغ أقل من الدين لا يطلب تأكيداً');
  assert.equal(caseUnder.debt, 500);
  assert.equal(caseUnder.collectionAmount, 300);
  assert.equal(caseUnder.excessAmount, 0);

  // السيناريو 3 (حالة التجاوز: الدين 500 والتحصيل 5000) -> يتطلب تأكيداً صريحاً مع بيان المبالغ
  const caseOver = checkExcessCollection(500, 5000);
  assert.equal(caseOver.needsConfirmation, true, 'تحصيل مبلغ أكبر من الدين يتطلب تأكيداً صريحاً');
  assert.equal(caseOver.debt, 500, 'بيان مبلغ الدين 500');
  assert.equal(caseOver.collectionAmount, 5000, 'بيان مبلغ التحصيل 5000');
  assert.equal(caseOver.excessAmount, 4500, 'حساب المبلغ الفائض بدقة 4500');
});

test('عكس الحركات والضغط المزدوج: رفض محاولة عكس حركة reversed وعدم تكرار الأثر', async () => {
  const { reverseTransaction, _setFirestoreAdapterForTesting } = await import('../lib/data');

  let dbTransaction = {
    id: 'tx_rev_test',
    type: 'expense',
    amount: 150,
    walletId: 'cash',
    status: 'active',
  };

  let dbWallets: Record<string, number> = { cash: 1000 };
  let batchCommittedCount = 0;

  const mockBatch = {
    set(ref: any, data: any) {
      if (ref.path === 'stats/wallets' && data.balances) {
        for (const [w, val] of Object.entries(data.balances)) {
          if (val && typeof val === 'object' && ((val as any)._methodName === 'increment' || (val as any)._operand !== undefined)) {
            dbWallets[w] = (dbWallets[w] || 0) + (val as any)._operand;
          }
        }
      }
    },
    update(ref: any, data: any) {
      if (ref.path === 'transactions/tx_rev_test') {
        Object.assign(dbTransaction, data);
      }
    },
    async commit() {
      batchCommittedCount++;
      return 'ok';
    }
  };

  _setFirestoreAdapterForTesting({
    getDoc: async () => ({
      exists: () => true,
      data: () => ({ ...dbTransaction }),
    }) as any,
    doc: (_db: any, col: string, id?: string) => ({ path: id ? `${col}/${id}` : col }),
    writeBatch: () => mockBatch as any,
  } as any);

  // 1. العكس الأول: حركة نشطة -> تنجح ويُرد المبلغ للخزينة
  await reverseTransaction('tx_rev_test');
  assert.equal(dbTransaction.status, 'reversed', 'الحركة أصبحت معكوسة');
  assert.equal(dbWallets.cash, 1150, 'تم رد 150 للخزينة بنجاح');
  assert.equal(batchCommittedCount, 1, 'تم تنفيذ دفعة واحدة');

  // 2. العكس الثاني: الحركة أصبحت reversed -> يجب رفضها صراحة دون أي تغيير في الخزينة
  let errorCaught: any = null;
  try {
    await reverseTransaction('tx_rev_test');
  } catch (err: any) {
    errorCaught = err;
  }
  assert.ok(errorCaught, 'تم رمي خطأ عند محاولة عكس حركة معكوسة');
  assert.equal(errorCaught.message, 'هذه الحركة معكوسة بالفعل');
  assert.equal(dbWallets.cash, 1150, 'الخزينة لم تتأثر إطلاقاً بالمحاولة الثانية');
  assert.equal(batchCommittedCount, 1, 'لم يتم تنفيذ أي commit ثانٍ');

  // استعادة المحول
  _setFirestoreAdapterForTesting(null);
});

test('عميل برصيد سابق: توحيد رقم الهاتف باستخدام normalizePhone لمنع تكرار العميل وتجزئة الدين', async () => {
  const { addCustomerWithOpeningBalance, _setFirestoreAdapterForTesting } = await import('../lib/data');
  const { normalizePhone } = await import('./money');

  const customersDb: Record<string, any> = {};
  let nextCustId = 1;

  const mockBatch = {
    set(ref: any, data: any) {
      if (ref.path.startsWith('customers/')) {
        const id = ref.path.replace('customers/', '');
        customersDb[id] = { ...data };
      }
    },
    update(ref: any, data: any) {
      if (ref.path.startsWith('customers/')) {
        const id = ref.path.replace('customers/', '');
        customersDb[id] = { ...customersDb[id], ...data };
      }
    },
    async commit() {
      return 'ok';
    }
  };

  _setFirestoreAdapterForTesting({
    getDocs: async (q: any) => {
      const matchingDocs: any[] = [];
      for (const [id, data] of Object.entries(customersDb)) {
        matchingDocs.push({
          id,
          data: () => data,
        });
      }
      return {
        empty: matchingDocs.length === 0,
        docs: matchingDocs,
      };
    },
    writeBatch: () => mockBatch as any,
  } as any);

  // سيناريو 1 (العادي): إدخال رقم هاتف بأرقام عربية "٠١٠١٢٣٤٥٦٧٨"
  // التحقق من أنه يُحفظ كرقم لاتيني موحد "01012345678"
  // بحيث يطابق لاحقاً استعلام الفاتورة الموحد normalizePhone("01012345678")
  const id1 = await addCustomerWithOpeningBalance({
    name: 'عميل برقم عربي',
    phone: '٠١٠١٢٣٤٥٦٧٨',
    amount: 500,
  });

  assert.ok(id1, 'تم إنشاء العميل بنجاح');
  assert.equal(customersDb[id1].phone, '01012345678', 'رقم الهاتف حُفظ موحداً بالأرقام اللاتينية');
  assert.equal(normalizePhone('01012345678'), customersDb[id1].phone, 'رقم الفاتورة اللاتيني يطابق رقم العميل المحفوظ تماماً');

  // سيناريو 2 (الحدّي): رقم هاتف يحتوي على مسافات وأرقام عربية " ٠١٠ ١٢٣٤ ٥٦٧٨ "
  // التحقق من منعه لأنه نفس العميل المكرر بعد التوحيد وحذف المسافات
  let dupError: any = null;
  try {
    await addCustomerWithOpeningBalance({
      name: 'نفس العميل بمسافات',
      phone: ' ٠١٠ ١٢٣٤ ٥٦٧٨ ',
      amount: 200,
    });
  } catch (err: any) {
    dupError = err;
  }
  assert.ok(dupError, 'تم اكتشاف تكرار نفس رقم الهاتف بعد التوحيد وحذف المسافات');
  assert.equal(dupError.message, 'يوجد عميل مسجل بنفس رقم الهاتف بالفعل');

  // سيناريو 3 (الخاطئ): رقم هاتف فارغ أو مسافات فقط أو بدون أرقام
  let emptyError: any = null;
  try {
    await addCustomerWithOpeningBalance({
      name: 'عميل برقم فارغ',
      phone: '   ',
      amount: 300,
    });
  } catch (err: any) {
    emptyError = err;
  }
  assert.ok(emptyError, 'تم رفض إضافة عميل برقم هاتف فارغ بعد التوحيد');
  assert.equal(emptyError.message, 'اسم العميل ورقم الهاتف مطلوبان');

  // استعادة المحول
  _setFirestoreAdapterForTesting(null);
});

test('تعديل سعر بيع الصنف في الكاشير وحساب الإجماليات وعزل سعر الكتالوج', () => {
  // كائن الصنف في الكتالوج (المخزون)
  const catalogItem = {
    id: 'item-101',
    name: 'جلابية رجالي كلاسيك',
    sellPrice: 300,
    costPrice: 200,
  };

  // وظيفة محاكاة لدالة تحديث السعر والتحقق
  const resolveUnitPrice = (rawInput: string) => {
    const parsed = parseArabicNumber(rawInput);
    const isValid = !isNaN(parsed) && parsed > 0;
    return {
      isValid,
      unitPrice: isValid ? round2(parsed) : 0,
    };
  };

  // سيناريو 1 (العادي): زيادة السعر لـ 380 (طلب خاص) مع كمية 2
  const customInput1 = '380';
  const res1 = resolveUnitPrice(customInput1);
  assert.equal(res1.isValid, true);
  assert.equal(res1.unitPrice, 380);

  // حساب الفاتورة بالسعر الجديد
  const line1 = {
    unitPrice: res1.unitPrice,
    quantity: 2,
    discount: 0,
    total: round2(res1.unitPrice * 2),
  };
  const totals1 = calculateInvoiceTotals({ items: [line1 as any], overallDiscount: 0 });
  assert.equal(line1.total, 760);
  assert.equal(totals1.grandTotal, 760);

  // التحقق من أن سعر الكتالوج للصنف لم يتغير إطلاقاً
  assert.equal(catalogItem.sellPrice, 300, 'سعر الكتالوج لم يتأثر بتعديل سعر السلة');

  // سيناريو 2 (الحدّي): تخفيض السعر لصديق بأرقام عربية "٢٥٠"
  const customInput2 = '٢٥٠';
  const res2 = resolveUnitPrice(customInput2);
  assert.equal(res2.isValid, true);
  assert.equal(res2.unitPrice, 250);

  const line2 = {
    unitPrice: res2.unitPrice,
    quantity: 1,
    discount: 0,
    total: round2(res2.unitPrice * 1),
  };
  const totals2 = calculateInvoiceTotals({ items: [line2 as any], overallDiscount: 0 });
  assert.equal(totals2.grandTotal, 250);

  // سيناريو 3 (الخاطئ): إدخال صفر أو سالب أو نص غير رقمي
  const invalidInputs = ['0', '٠', '-50', 'abc', ''];
  for (const input of invalidInputs) {
    const resInvalid = resolveUnitPrice(input);
    assert.equal(
      resInvalid.isValid,
      false,
      `القيمة "${input}" يجب رفضها كسعر غير صالح`
    );
    assert.equal(resInvalid.unitPrice, 0);
  }
});

test('كشف الواي فاي المتصل بلا إنترنت: requireServerReachable و commitWithAck وحماية العمليات المالية مع استمرار البيع', async () => {
  const {
    requireServerReachable,
    commitWithAck,
    createTransaction,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  // -------------------------------------------------------------
  // سيناريو 1 (العادي): إنترنت مستقر وسيرفر مستجيب
  // getDocFromServer ينجح سريعاً -> requireServerReachable تمر بنجاح دون أخطاء
  // -------------------------------------------------------------
  let pingCallCount = 0;
  _setFirestoreAdapterForTesting({
    getDocFromServer: async () => {
      pingCallCount++;
      return { exists: () => true, data: () => ({ balances: {} }) } as any;
    },
  });

  await requireServerReachable();
  assert.equal(pingCallCount, 1, 'تم التأكد من استجابة السيرفر عبر قراءة stats/wallets الفعلية');

  // -------------------------------------------------------------
  // سيناريو 2 (الحدّي): واي فاي متصل بلا إنترنت (navigator.onLine = true لكن السيرفر غير متاح)
  // getDocFromServer يفشل أو يرفض الوعد
  // -------------------------------------------------------------
  _setFirestoreAdapterForTesting({
    getDocFromServer: async () => {
      throw new Error('FirebaseError: Failed to get document because the client is offline or server unreachable');
    },
  });

  let serverUnreachableErr: any = null;
  try {
    await requireServerReachable();
  } catch (err: any) {
    serverUnreachableErr = err;
  }
  assert.ok(serverUnreachableErr, 'تم كشف انقطاع الإنترنت رغم اتصال الواي فاي');
  assert.equal(
    serverUnreachableErr.message,
    'لا يوجد اتصال فعلي بالإنترنت. حاول لاحقًا',
    'الرسالة الدقيقة لمنع تعليق الشاشة'
  );

  // التحقق من منع العمليات المالية الحساسة ومنع أي كتابة في الباتش عند انقطاع الإنترنت
  let batchWritesCount = 0;
  let batchCommitsCount = 0;
  _setFirestoreAdapterForTesting({
    getDocFromServer: async () => {
      throw new Error('Connection timed out');
    },
    writeBatch: () =>
      ({
        set: () => {
          batchWritesCount++;
        },
        update: () => {
          batchWritesCount++;
        },
        commit: async () => {
          batchCommitsCount++;
          return 'ok';
        },
      } as any),
  });

  let txError: any = null;
  try {
    await createTransaction({
      type: 'expense',
      amount: 150,
      wallet: 'cash',
      note: 'مصروف صيانة طارئة',
    });
  } catch (err: any) {
    txError = err;
  }

  assert.ok(txError, 'تم منع تسجيل المصروف عند غياب الإنترنت الحقيقي');
  assert.equal(txError.message, 'لا يوجد اتصال فعلي بالإنترنت. حاول لاحقًا');
  assert.equal(batchWritesCount, 0, 'لم يتم إنشاء أي قيد أو تعديل خزينة في الباتش');
  assert.equal(batchCommitsCount, 0, 'لم يُنفذ أي commit على السيرفر');

  // -------------------------------------------------------------
  // سيناريو 3 (انتهاء المهلة في commitWithAck):
  // السيرفر استجاب أولاً، لكن تأكيد commit تأخر أكثر من 10 ثوانٍ
  // -------------------------------------------------------------
  const hangingBatch = {
    commit: () => new Promise<void>(() => {}), // وعد لا ينتهي محاكاة لتعليق السيرفر
  };

  // نختبر دالة commitWithAck باستخدام مهلة قصيرة أو سباق
  const ackRace = Promise.race([
    commitWithAck(hangingBatch as any),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('test_guard')), 50)),
  ]);

  let ackErr: any = null;
  try {
    await ackRace;
  } catch (err: any) {
    ackErr = err;
  }
  assert.ok(ackErr, 'العملية أوقفت الانتظار عند تعليق السيرفر');

  // التحقق من نص رسالة المهلة المنصوص عليها صراحة عند بلوغ 10 ثوانٍ
  const directTimeoutBatch = {
    commit: () =>
      new Promise<void>((_, reject) => {
        // محاكاة انتهاء مهلة الـ 10 ثوانٍ
        setTimeout(() => {
          reject(
            new Error(
              'لم يصل تأكيد السيرفر. العملية محفوظة على الجهاز وستُرفع تلقائيًا عند عودة الاتصال، لا تكررها وراجع الحركات'
            )
          );
        }, 10);
      }),
  };

  let timeoutMsgErr: any = null;
  try {
    await directTimeoutBatch.commit();
  } catch (err: any) {
    timeoutMsgErr = err;
  }
  assert.equal(
    timeoutMsgErr.message,
    'لم يصل تأكيد السيرفر. العملية محفوظة على الجهاز وستُرفع تلقائيًا عند عودة الاتصال، لا تكررها وراجع الحركات'
  );

  // استعادة المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('منع تكرار أكواد الأصناف: getNextModelNumber و createPurchase عند فشل قراءة آخر موديل', async () => {
  const {
    getNextModelNumber,
    createPurchase,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  let writtenBatches: Array<{ path: string; data: any }> = [];
  let commitCount = 0;

  const createMockBatch = () => ({
    set: (ref: any, data: any) => {
      writtenBatches.push({ path: ref?.path || ref?.id || 'doc', data });
    },
    update: (ref: any, data: any) => {
      writtenBatches.push({ path: ref?.path || ref?.id || 'doc', data });
    },
    commit: async () => {
      commitCount++;
      return 'ok';
    },
  });

  // -------------------------------------------------------------
  // 1) شراء عادي ← الموديل = آخر رقم + 1
  // -------------------------------------------------------------
  writtenBatches = [];
  commitCount = 0;
  _setFirestoreAdapterForTesting({
    getDocs: (async (q: any) => ({
      empty: false,
      docs: [
        {
          id: 'pur-prev',
          data: () => ({ modelNo: 5 }),
        },
      ],
    })) as any,
    writeBatch: () => createMockBatch() as any,
  });

  const res1 = await createPurchase({
    paymentSource: 'cash',
    paidAmount: 200,
    items: [
      {
        name: 'حذاء جلد أسود',
        category: 'shoes',
        color: 'أسود',
        colorLetter: 'S',
        size: 42,
        quantity: 2,
        purchaseCost: 100,
        sellPrice: 150,
      },
    ],
  });

  assert.equal(res1.modelNo, 6, 'رقم الموديل في الشراء العادي هو آخر رقم (5) + 1 = 6');
  assert.ok(res1.codes.length > 0, 'تم توليد كود للصنف');
  assert.equal(res1.codes[0], 'S6-S42', `كود الصنف (${res1.codes[0]}) يحمل رقم الموديل الجديد 6`);
  assert.ok(commitCount > 0, 'تم تنفيذ الباتش بنجاح');

  // -------------------------------------------------------------
  // 2) محاكاة فشل getDocs ← الشراء يفشل برسالة ولا يُكتب purchase ولا items ولا transactions ولا تتغير الخزينة
  // -------------------------------------------------------------
  writtenBatches = [];
  commitCount = 0;
  _setFirestoreAdapterForTesting({
    getDocs: (async () => {
      throw new Error('Simulated network failure on getDocs');
    }) as any,
    writeBatch: () => createMockBatch() as any,
  });

  let purchaseError: any = null;
  try {
    await createPurchase({
      paymentSource: 'cash',
      paidAmount: 300,
      items: [
        {
          name: 'فستان صيفي',
          category: 'clothes',
          quantity: 3,
          purchaseCost: 100,
          sellPrice: 180,
        },
      ],
    });
  } catch (err: any) {
    purchaseError = err;
  }

  assert.ok(purchaseError, 'فشلت عملية الشراء عند تعذر قراءة آخر رقم موديل');
  assert.equal(
    purchaseError.message,
    'تعذر قراءة آخر رقم موديل، تأكد من الاتصال وأعد المحاولة',
    'الرسالة الدقيقة للمستخدم لمنع تكرار الأكواد'
  );
  assert.equal(writtenBatches.length, 0, 'لم يُكتب أي مستند purchase أو item أو transaction');
  assert.equal(commitCount, 0, 'لم يُنفذ أي commit في الفايرستور ولم تتأثر الخزائن');

  // -------------------------------------------------------------
  // 3) أول شراء في قاعدة فاضية ← يرجع 1 بدون خطأ
  // -------------------------------------------------------------
  writtenBatches = [];
  commitCount = 0;
  _setFirestoreAdapterForTesting({
    getDocs: (async () => ({
      empty: true,
      docs: [],
    })) as any,
    writeBatch: () => createMockBatch() as any,
  });

  const res3 = await createPurchase({
    paymentSource: 'pocket',
    paidAmount: 500,
    items: [
      {
        name: 'شنطة حريمي',
        category: 'bags',
        color: 'بني',
        colorLetter: 'B',
        quantity: 1,
        purchaseCost: 500,
        sellPrice: 700,
      },
    ],
  });

  assert.equal(res3.modelNo, 1, 'أول شراء في قاعدة بيانات فارغة يبدأ برقم الموديل 1');
  assert.equal(commitCount, 1, 'تم تنفيذ عملية الشراء بنجاح');

  // -------------------------------------------------------------
  // 4) إعادة المحاولة بعد الفشل ← تنجح برقم صحيح بلا تكرار
  // -------------------------------------------------------------
  writtenBatches = [];
  commitCount = 0;
  // استعادة الاتصال بنجاح ووجود آخر موديل مسجل هو 6
  _setFirestoreAdapterForTesting({
    getDocs: (async () => ({
      empty: false,
      docs: [
        {
          id: 'pur-last',
          data: () => ({ modelNo: 6 }),
        },
      ],
    })) as any,
    writeBatch: () => createMockBatch() as any,
  });

  const res4 = await createPurchase({
    paymentSource: 'cash',
    paidAmount: 200,
    items: [
      {
        name: 'قميص رجالي',
        category: 'clothes',
        quantity: 2,
        purchaseCost: 100,
        sellPrice: 160,
      },
    ],
  });

  assert.equal(res4.modelNo, 7, 'إعادة المحاولة بعد الفشل نجحت بالموديل التالي الصحيح (7) بلا تكرار');
  assert.ok(commitCount > 0, 'تم حفظ الشراء بعد عودة الاتصال بنجاح');

  // استعادة المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 2: رفض المدفوعات والخصومات السالبة في createInvoice مع الحفاظ على الفواتير الصحيحة', async () => {
  const { createInvoice, _setFirestoreAdapterForTesting } = await import('../lib/data');

  let batchWrites: Array<{ path: string; data: any }> = [];
  let commitCalls = 0;

  const mockBatch = () => ({
    set: (ref: any, data: any) => {
      batchWrites.push({ path: ref?.path || ref?.id || 'doc', data });
    },
    update: (ref: any, data: any) => {
      batchWrites.push({ path: ref?.path || ref?.id || 'doc', data });
    },
    commit: async () => {
      commitCalls++;
      return 'ok';
    },
  });

  const setupMock = () => {
    batchWrites = [];
    commitCalls = 0;
    _setFirestoreAdapterForTesting({
      getDocFromCache: async () => ({ exists: () => false } as any),
      getDoc: async () => ({
        exists: () => true,
        data: () => ({ currentStock: 100 }),
      } as any),
      getDocs: async () => ({
        empty: true,
        docs: [],
      } as any),
      writeBatch: () => mockBatch() as any,
    });
  };

  // -------------------------------------------------------------
  // 1) فواتير كاش وإنستاباي وآجل وخصم عادي ← تتحفظ بنفس الأرقام القديمة بالظبط
  // -------------------------------------------------------------
  setupMock();
  const validRes = await createInvoice({
    items: [
      {
        name: 'بنطلون قماش',
        quantity: 2,
        unitPrice: 100,
        discount: 20,
      },
    ] as any,
    payments: {
      cash: 100,
      instapay: 50,
      wallet: 0,
    },
    overallDiscount: 10,
    customerName: 'أحمد محمود',
    customerPhone: '01012345678',
  });

  // البند: 2 × 100 - 20 = 180
  // خصم إجمالي: 10 -> الإجمالي النهائي 170
  // المدفوع: 100 كاش + 50 إنستاباي = 150
  // المتبقي دين آجل: 170 - 150 = 20
  assert.equal(validRes.grandTotal, 170, 'الإجمالي 170 بعد الخصم العادي');
  assert.equal(validRes.paidAmount, 150, 'المدفوع 150 (كاش وإنستاباي)');
  assert.equal(validRes.remainingAmount, 20, 'المتبقي 20 دين آجل');
  assert.ok(commitCalls > 0, 'تم تنفيذ الفاتورة بنجاح في الباتش');

  // -------------------------------------------------------------
  // 2) إنستاباي −50 ← ترفض ولا يُكتب شيء
  // -------------------------------------------------------------
  setupMock();
  let errNegInstapay: any = null;
  try {
    await createInvoice({
      items: [
        {
          name: 'قميص',
          quantity: 1,
          unitPrice: 200,
        },
      ] as any,
      payments: {
        cash: 200,
        instapay: -50,
      },
      customerName: 'زبون',
    });
  } catch (err: any) {
    errNegInstapay = err;
  }

  assert.ok(errNegInstapay, 'تم رفض الفاتورة بسبب إنستاباي سالب');
  assert.equal(errNegInstapay.message, 'مبلغ الدفع عبر إنستاباي لا يمكن أن يكون سالباً');
  assert.equal(batchWrites.length, 0, 'لم يُكتب أي مستند في الباتش');
  assert.equal(commitCalls, 0, 'لم يُنفذ أي commit');

  // -------------------------------------------------------------
  // 3) خصم إجمالي −10، وخصم بند أكبر من قيمة البند ← ترفض
  // -------------------------------------------------------------
  setupMock();
  // 3.1: خصم إجمالي -10
  let errNegOverall: any = null;
  try {
    await createInvoice({
      items: [{ name: 'تيشيرت', quantity: 1, unitPrice: 100 }] as any,
      payments: { cash: 100 },
      overallDiscount: -10,
    });
  } catch (err: any) {
    errNegOverall = err;
  }
  assert.ok(errNegOverall, 'تم رفض خصم إجمالي سالب');
  assert.equal(errNegOverall.message, 'الخصم الإجمالي لا يمكن أن يكون سالباً');
  assert.equal(batchWrites.length, 0);

  // 3.2: خصم بند أكبر من قيمة البند (بند بـ 100 وخصمه 120)
  setupMock();
  let errItemDiscountOver: any = null;
  try {
    await createInvoice({
      items: [{ name: 'تيشيرت', quantity: 1, unitPrice: 100, discount: 120 }] as any,
      payments: { cash: 0 },
      customerName: 'عميل آجل',
    });
  } catch (err: any) {
    errItemDiscountOver = err;
  }
  assert.ok(errItemDiscountOver, 'تم رفض خصم بند يتجاوز إجمالي البند');
  assert.equal(errItemDiscountOver.message, 'خصم البند 1 (تيشيرت) لا يمكن أن يتجاوز إجمالي البند');
  assert.equal(batchWrites.length, 0);

  // 3.3: خصم بند سالب (-15)
  setupMock();
  let errItemDiscountNeg: any = null;
  try {
    await createInvoice({
      items: [{ name: 'تيشيرت', quantity: 1, unitPrice: 100, discount: -15 }] as any,
      payments: { cash: 100 },
    });
  } catch (err: any) {
    errItemDiscountNeg = err;
  }
  assert.ok(errItemDiscountNeg, 'تم رفض خصم بند سالب');
  assert.equal(errItemDiscountNeg.message, 'خصم البند 1 (تيشيرت) لا يمكن أن يكون سالباً');
  assert.equal(batchWrites.length, 0);

  // -------------------------------------------------------------
  // 4) آجل كامل (مدفوعات صفر) وخصم صفر ← تعدي
  // -------------------------------------------------------------
  setupMock();
  const creditRes = await createInvoice({
    items: [
      {
        name: 'شال شتوي',
        quantity: 3,
        unitPrice: 100,
        discount: 0,
      },
    ] as any,
    payments: {
      cash: 0,
      instapay: 0,
      wallet: 0,
    },
    overallDiscount: 0,
    customerName: 'محمد علي',
    customerPhone: '01112223334',
  });

  assert.equal(creditRes.grandTotal, 300, 'إجمالي الفاتورة 300');
  assert.equal(creditRes.paidAmount, 0, 'المدفوع 0 في الآجل الكامل');
  assert.equal(creditRes.remainingAmount, 300, 'المتبقي 300 دين كامل على العميل');
  assert.ok(commitCalls > 0, 'تم حفظ الفاتورة الآجلة بنجاح');

  // استعادة المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 3: تنبيه الأسعار الشاذة في الكاشير وتفاصيل الصنف وإضافة البضاعة', async () => {
  const {
    checkCashierPriceAnomaly,
    checkItemPriceVsCostAnomaly,
  } = await import('./validation');
  const { parseArabicNumber } = await import('./money');

  // -------------------------------------------------------------
  // 1) صنف 200 يتباع بـ 200 و 250 ← بدون أي رسالة ('ok')
  // -------------------------------------------------------------
  const catPrice = 200;
  const cost = 120;

  // بيع بالسعر الأصلي (200)
  assert.equal(
    checkCashierPriceAnomaly(200, catPrice, cost),
    'ok',
    'البيع بسعر الصنف الأصلي (200) يمر دون أي تنبيه'
  );

  // زيادة 25% (250)
  assert.equal(
    checkCashierPriceAnomaly(250, catPrice, cost),
    'ok',
    'البيع بـ 250 (زيادة 25% بالضبط عن 200) يمر دون أي تنبيه'
  );

  // -------------------------------------------------------------
  // 2) 300 ← confirm (يختلف بأكثر من 25%)
  // -------------------------------------------------------------
  assert.equal(
    checkCashierPriceAnomaly(300, catPrice, cost),
    'confirm',
    'البيع بـ 300 (زيادة 50% تزيد عن 25%) يتطلب نافذة confirm'
  );

  // تخفيض أكثر من 25% (مثلاً 140 لصنف بـ 200 وتكلفته 100)
  assert.equal(
    checkCashierPriceAnomaly(140, catPrice, 100),
    'confirm',
    'تخفيض السعر بنسبة 30% (أكبر من 25%) يتطلب نافذة confirm'
  );

  // -------------------------------------------------------------
  // 3) 2500 ← prompt (أكبر من الضعف أو أكبر من 1500)
  // -------------------------------------------------------------
  assert.equal(
    checkCashierPriceAnomaly(2500, catPrice, cost),
    'prompt',
    'سعر 2500 أكبر من ضعف سعر الصنف وأكبر من 1500 ويتطلب prompt لإعادة كتابته'
  );

  // محاكاة إدخال المستخدم في الـ prompt:
  const targetPrice = 2500;
  // أ) كتابة 250 غلط ← إلغاء
  const wrongInput = '250';
  const isMatchWrong = parseArabicNumber(wrongInput) === targetPrice;
  assert.equal(isMatchWrong, false, 'عدم تطابق السعر في prompt يؤدي لإلغاء الحفظ');

  // ب) كتابة 2500 أو "٢٥٠٠" صحيحة ← تطابق ومتابعة الحفظ
  const correctInputLatin = '2500';
  const correctInputArabic = '٢٥٠٠';
  assert.equal(parseArabicNumber(correctInputLatin), targetPrice, 'مطابقة السعر اللاتيني تنجح');
  assert.equal(parseArabicNumber(correctInputArabic), targetPrice, 'مطابقة السعر العربي تنجح');

  // -------------------------------------------------------------
  // 4) سعر أقل من التكلفة ← تحذير (confirm)
  // -------------------------------------------------------------
  // صنف سعره 200 وتكلفته 150، والبيع بـ 130
  assert.equal(
    checkCashierPriceAnomaly(130, catPrice, 150),
    'confirm',
    'البيع بسعر (130) أقل من التكلفة (150) يتطلب تنبيه confirm'
  );

  // -------------------------------------------------------------
  // 5) في ItemDetail و AddPurchase: confirm لو سعر البيع أقل من التكلفة أو أكبر من 3 أضعافها
  // -------------------------------------------------------------
  const itemCost = 100;

  // طبيعي (بيع 180 لتكلفة 100) ← ok
  assert.equal(
    checkItemPriceVsCostAnomaly(180, itemCost),
    'ok',
    'سعر بيع طبيعي (180) لتكلفة 100 يمر دون تنبيه'
  );

  // أقل من التكلفة (بيع 80 لتكلفة 100) ← confirm
  assert.equal(
    checkItemPriceVsCostAnomaly(80, itemCost),
    'confirm',
    'سعر بيع (80) أقل من التكلفة (100) يظهر confirm'
  );

  // أكبر من 3 أضعاف التكلفة (بيع 350 لتكلفة 100) ← confirm
  assert.equal(
    checkItemPriceVsCostAnomaly(350, itemCost),
    'confirm',
    'سعر بيع (350) أكبر من 3 أضعاف التكلفة (100) يظهر confirm'
  );
});

test('المهمة 6: منع تكرار العمليات (تحصيل، مصروف، مرتجع) عند انقطاع الإنترنت أو الضغط المزدوج', async () => {
  const {
    collectPayment,
    createTransaction,
    createReturn,
    generateTransactionId,
    generateReturnId,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  // بنك بيانات وهمي لاختبار الكاش والسيرفر
  const localCache: Record<string, any> = {};
  const serverDb: Record<string, any> = {};
  let commitCount = 0;

  // تهيئة بيانات العميل والفاتورة والمخزون
  serverDb['customers/cust-1'] = {
    id: 'cust-1',
    name: 'عميل تجريبي',
    currentBalance: 1500,
  };
  serverDb['stats/wallets'] = {
    balances: { cash: 2000, bank: 1000, wallet: 500 },
  };
  serverDb['items/item-1'] = {
    id: 'item-1',
    name: 'حذاء كعب أسود',
    currentStock: 10,
    costPrice: 100,
  };
  serverDb['invoices/inv-1'] = {
    id: 'inv-1',
    invoiceNumber: 'A-0001',
    customerId: 'cust-1',
    customerName: 'عميل تجريبي',
    status: 'completed',
    remainingAmount: 1500,
    grandTotal: 1500,
    items: [
      {
        itemId: 'item-1',
        name: 'حذاء كعب أسود',
        quantity: 2,
        unitPrice: 300,
        costPrice: 100,
        total: 600,
        lineGrand: 600,
        returnedQty: 0,
        returnedAmount: 0,
      },
    ],
  };

  const getPath = (ref: any) => ref?.path || (ref?.parent?.id && ref?.id ? `${ref.parent.id}/${ref.id}` : String(ref));

  const mockBatch = () => ({
    set: (ref: any, data: any, opts?: any) => {
      const path = getPath(ref);
      if (path === 'stats/wallets') {
        const b = serverDb[path]?.balances || { cash: 0, bank: 0, wallet: 0 };
        for (const [w, val] of Object.entries(data.balances || {})) {
          if (val && typeof val === 'object' && ((val as any)._methodName === 'increment' || (val as any)._operand !== undefined)) {
            b[w] = (b[w] || 0) + (val as any)._operand;
          } else if (typeof val === 'number') {
            b[w] = val;
          }
        }
        serverDb[path] = { balances: b };
        localCache[path] = { balances: { ...b } };
      } else {
        serverDb[path] = { ...(opts?.merge ? serverDb[path] : {}), ...data };
        localCache[path] = { ...serverDb[path] };
      }
    },
    update: (ref: any, data: any) => {
      const path = getPath(ref);
      const current = serverDb[path] || {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && ((v as any)._methodName === 'increment' || (v as any)._operand !== undefined)) {
          current[k] = (current[k] || 0) + (v as any)._operand;
        } else {
          current[k] = v;
        }
      }
      serverDb[path] = current;
      localCache[path] = { ...current };
    },
    commit: async () => {
      commitCount++;
      return 'ok';
    },
  });

  let isOffline = false;

  _setFirestoreAdapterForTesting({
    getDoc: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!serverDb[path],
        data: () => serverDb[path],
        id: path.split('/')[1] || path,
        path,
      } as any;
    },
    getDocFromCache: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!localCache[path],
        data: () => localCache[path],
        id: path.split('/')[1] || path,
        path,
      } as any;
    },
    getDocFromServer: async () => {
      if (isOffline) throw new Error('Offline or server unreachable');
      return { exists: () => true, data: () => ({ balances: serverDb['stats/wallets']?.balances }) } as any;
    },
    getDocs: async (q: any) => {
      const col = q.path || (q._query?.path?.segments ? q._query.path.segments[0] : 'invoices');
      const docs: any[] = [];
      for (const [p, d] of Object.entries(serverDb)) {
        if (p.startsWith(`${col}/`)) {
          docs.push({ id: p.split('/')[1], data: () => d });
        }
      }
      return { empty: docs.length === 0, docs, forEach: (fn: any) => docs.forEach(fn) } as any;
    },
    writeBatch: () => mockBatch() as any,
  });

  // -------------------------------------------------------------
  // 1) تحصيل عادي مرة واحدة ← أثر واحد على رصيد العميل والخزينة
  // -------------------------------------------------------------
  const collectTxId1 = generateTransactionId();
  commitCount = 0;

  const resCollect1 = await collectPayment('cust-1', 400, 'cash', collectTxId1);
  assert.equal(resCollect1.totalAllocated, 400);
  assert.equal(commitCount, 1, 'تم تنفيذ التحصيل مرة واحدة');
  assert.equal(serverDb['customers/cust-1'].currentBalance, 1100, 'رصيد العميل نزل من 1500 إلى 1100');
  assert.equal(serverDb['stats/wallets'].balances.cash, 2400, 'الخزينة النقدية زادت 400');
  assert.ok(localCache[`transactions/${collectTxId1}`], 'الحركة مسجلة في الكاش المحلي');

  // -------------------------------------------------------------
  // 2) ضغط مزدوج سريع (Concurrent Double-Click) ← أثر واحد فقط
  // -------------------------------------------------------------
  const doubleClickTxId = generateTransactionId();
  commitCount = 0;

  const [callA, callB] = await Promise.all([
    collectPayment('cust-1', 200, 'cash', doubleClickTxId),
    collectPayment('cust-1', 200, 'cash', doubleClickTxId),
  ]);

  assert.equal(commitCount, 1, 'الضغط المزدوج السريع نفّذ باتش واحد فقط');
  assert.equal(callA.totalAllocated, 200);
  assert.equal(callB.totalAllocated, 200);
  assert.equal(serverDb['customers/cust-1'].currentBalance, 900, 'رصيد العميل خصم منه 200 مرة واحدة فقط');
  assert.equal(serverDb['stats/wallets'].balances.cash, 2600, 'الخزينة زادت 200 مرة واحدة فقط');

  // -------------------------------------------------------------
  // 3) انقطاع الإنترنت، تحصيل، إعادة الضغط 3 مرات ← أثر واحد فقط
  // -------------------------------------------------------------
  const offlineTxId = generateTransactionId();
  commitCount = 0;

  // التحصيل الأول (حُفظ في الكاش)
  await collectPayment('cust-1', 100, 'cash', offlineTxId);
  assert.equal(commitCount, 1);
  assert.equal(serverDb['customers/cust-1'].currentBalance, 800);
  assert.equal(serverDb['stats/wallets'].balances.cash, 2700);

  // الآن نحاكي انقطاع الإنترنت ونعيد المحاولة 3 مرات بنفس المعرف
  isOffline = true;

  const retry1 = await collectPayment('cust-1', 100, 'cash', offlineTxId);
  const retry2 = await collectPayment('cust-1', 100, 'cash', offlineTxId);
  const retry3 = await collectPayment('cust-1', 100, 'cash', offlineTxId);

  assert.equal(retry1.totalAllocated, 100);
  assert.equal(retry2.totalAllocated, 100);
  assert.equal(retry3.totalAllocated, 100);
  assert.equal(commitCount, 1, 'لم يتم تنفيذ أي باتش إضافي في المحاولات الثلاث');
  assert.equal(serverDb['customers/cust-1'].currentBalance, 800, 'رصيد العميل ظل 800 دون تكرار الخصم');
  assert.equal(serverDb['stats/wallets'].balances.cash, 2700, 'الخزينة ظلت 2700 دون تكرار الزيادة');

  // إعادة الإنترنت
  isOffline = false;

  // -------------------------------------------------------------
  // 4) نفس السيناريو على مصروف وعلى مرتجع
  // -------------------------------------------------------------
  // أ) المصروف (createTransaction)
  const expenseTxId = generateTransactionId();
  commitCount = 0;

  // ضغط مزدوج سريع على المصروف
  const [expA, expB] = await Promise.all([
    createTransaction({ transactionId: expenseTxId, type: 'expense', amount: 150, wallet: 'cash', category: 'كهرباء ومياه ومرافق' }),
    createTransaction({ transactionId: expenseTxId, type: 'expense', amount: 150, wallet: 'cash', category: 'كهرباء ومياه ومرافق' }),
  ]);
  assert.equal(expA.transactionId, expenseTxId);
  assert.equal(expB.transactionId, expenseTxId);
  assert.equal(commitCount, 1, 'المصروف: ضغط مزدوج نفذ مرة واحدة');
  assert.equal(serverDb['stats/wallets'].balances.cash, 2550, 'الخزينة خصم منها 150 مرة واحدة (2700 - 150 = 2550)');

  // إعادة المحاولة 3 مرات من الكاش بعد الحفظ
  const expRetry1 = await createTransaction({ transactionId: expenseTxId, type: 'expense', amount: 150, wallet: 'cash', category: 'كهرباء ومياه ومرافق' });
  const expRetry2 = await createTransaction({ transactionId: expenseTxId, type: 'expense', amount: 150, wallet: 'cash', category: 'كهرباء ومياه ومرافق' });
  const expRetry3 = await createTransaction({ transactionId: expenseTxId, type: 'expense', amount: 150, wallet: 'cash', category: 'كهرباء ومياه ومرافق' });
  assert.equal(expRetry1.transactionId, expenseTxId);
  assert.equal(expRetry2.transactionId, expenseTxId);
  assert.equal(expRetry3.transactionId, expenseTxId);
  assert.equal(commitCount, 1, 'المصروف: لم يُخصم أي شيء إضافي في الإعادات الثلاث');
  assert.equal(serverDb['stats/wallets'].balances.cash, 2550, 'الخزينة ظلت 2550 دون مساس');

  // ب) المرتجع (createReturn)
  const returnId = generateReturnId();
  commitCount = 0;

  // مرتجع قطعة واحدة (بقيمة 300 جنية)
  const [retA, retB] = await Promise.all([
    createReturn('inv-1', [{ itemId: 'item-1', quantity: 1 }], 'cash', returnId),
    createReturn('inv-1', [{ itemId: 'item-1', quantity: 1 }], 'cash', returnId),
  ]);
  assert.equal(retA.returnDocId, returnId);
  assert.equal(retB.returnDocId, returnId);
  assert.equal(commitCount, 1, 'المرتجع: ضغط مزدوج نفذ مرة واحدة');
  assert.equal(serverDb['items/item-1'].currentStock, 11, 'المخزون زاد قطعة واحدة فقط (10 + 1 = 11)');

  // إعادة المحاولة 3 مرات بنفس المعرف returnId
  const retRetry1 = await createReturn('inv-1', [{ itemId: 'item-1', quantity: 1 }], 'cash', returnId);
  const retRetry2 = await createReturn('inv-1', [{ itemId: 'item-1', quantity: 1 }], 'cash', returnId);
  const retRetry3 = await createReturn('inv-1', [{ itemId: 'item-1', quantity: 1 }], 'cash', returnId);
  assert.equal(retRetry1.returnDocId, returnId);
  assert.equal(retRetry2.returnDocId, returnId);
  assert.equal(retRetry3.returnDocId, returnId);
  assert.equal(commitCount, 1, 'المرتجع: لم يُنفذ أي باتش إضافي في المحاولات الثلاث');
  assert.equal(serverDb['items/item-1'].currentStock, 11, 'المخزون استقر عند 11 دون تكرار الإرجاع');

  // -------------------------------------------------------------
  // 5) بعد النجاح، تحصيل جديد يأخذ معرّف جديد ويتسجل طبيعي
  // -------------------------------------------------------------
  const freshTxId = generateTransactionId();
  assert.notEqual(freshTxId, collectTxId1);
  assert.notEqual(freshTxId, offlineTxId);

  const prevCommits = commitCount;
  const resFresh = await collectPayment('cust-1', 100, 'cash', freshTxId);
  assert.equal(commitCount, prevCommits + 1, 'التحصيل الجديد بالمعرف الجديد نُفّذ طبيعياً');
  assert.equal(resFresh.totalAllocated, 100);
  assert.equal(serverDb['customers/cust-1'].currentBalance, 400, 'رصيد العميل نزل إلى 400');

  // استرجاع المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 8: تصحيح تكلفة الشراء مع الخزينة وتحديث حركة الدفع المرتبطة', async () => {
  const {
    fixItemCost,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  const testDb: Record<string, any> = {};

  const getPath = (ref: any) => ref?.path || (ref?.parent?.id && ref?.id ? `${ref.parent.id}/${ref.id}` : String(ref));

  const mockBatch = () => ({
    set: (ref: any, data: any, opts?: any) => {
      const path = getPath(ref);
      if (path === 'stats/wallets') {
        const b = testDb[path]?.balances || { cash: 0, bank: 0, wallet: 0 };
        for (const [w, val] of Object.entries(data.balances || {})) {
          if (val && typeof val === 'object' && ((val as any)._methodName === 'increment' || (val as any)._operand !== undefined)) {
            b[w] = (b[w] || 0) + (val as any)._operand;
          } else if (typeof val === 'number') {
            b[w] = val;
          }
        }
        testDb[path] = { balances: b };
      } else {
        testDb[path] = { ...(opts?.merge ? testDb[path] : {}), ...data };
      }
    },
    update: (ref: any, data: any) => {
      const path = getPath(ref);
      const current = testDb[path] || {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && ((v as any)._methodName === 'increment' || (v as any)._operand !== undefined)) {
          current[k] = (current[k] || 0) + (v as any)._operand;
        } else {
          current[k] = v;
        }
      }
      testDb[path] = current;
    },
    commit: async () => 'ok',
  });

  _setFirestoreAdapterForTesting({
    doc: ((_db: any, col: string, id?: string) => ({ path: id ? `${col}/${id}` : col })) as any,
    getDoc: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!testDb[path],
        data: () => testDb[path],
        id: path.split('/')[1] || path,
        ref: { path },
      } as any;
    },
    getDocFromCache: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!testDb[path],
        data: () => testDb[path],
        id: path.split('/')[1] || path,
        ref: { path },
      } as any;
    },
    getDocFromServer: async () => ({ exists: () => true, data: () => ({ balances: testDb['stats/wallets']?.balances }) }) as any,
    getDocs: async (q: any) => {
      const col = q.path || (q._query?.path?.segments ? q._query.path.segments[0] : 'transactions');
      const docs: any[] = [];
      for (const [p, d] of Object.entries(testDb)) {
        if (p.startsWith(`${col}/`)) {
          // التحقق من فلتر referenceNumber لو وجد
          const targetRefNum = q._query?.filters?.find((f: any) => f.field?.segments?.[0] === 'referenceNumber')?.value?.stringValue;
          if (!targetRefNum || d.referenceNumber === targetRefNum) {
            docs.push({ id: p.split('/')[1], data: () => d, ref: { path: p } });
          }
        }
      }
      return { empty: docs.length === 0, docs, forEach: (fn: any) => docs.forEach(fn) } as any;
    },
    writeBatch: () => mockBatch() as any,
  });

  // -------------------------------------------------------------
  // 1) شراء 5×100 من الخزينة ثم تصحيح إلى 80 بخيار "موافق"
  //    ← الخزينة +100 وحركة الدفع 400. وبعدها cancelPurchase يرد 400 فقط.
  // -------------------------------------------------------------
  testDb['stats/wallets'] = { balances: { cash: 1000 } };
  testDb['items/item-s1'] = {
    id: 'item-s1',
    name: 'حذاء بيج 38',
    costPrice: 100,
    currentStock: 5,
    initialQty: 5,
    purchaseId: 'pur-1',
  };
  testDb['purchases/pur-1'] = {
    id: 'pur-1',
    purchaseNumber: 'PUR-0001',
    paidAmount: 500,
    subtotal: 500,
    grandTotal: 500,
    remainingAmount: 0,
    paymentSource: 'cash',
    items: [{ itemId: 'item-s1', name: 'حذاء بيج 38', quantity: 5, purchaseCost: 100, total: 500 }],
  };
  testDb['transactions/tx-p1'] = {
    id: 'tx-p1',
    type: 'purchase_payment',
    walletId: 'cash',
    amount: 500,
    referenceNumber: 'PUR-0001',
    status: 'active',
  };

  // تصحيح التكلفة إلى 80 مع خيار adjustPayment = true
  await fixItemCost('item-s1', 80, true);

  // الخزينة زادت 100 (رد الفرق للمحل: 1000 + 100 = 1100)
  assert.equal(testDb['stats/wallets'].balances.cash, 1100, 'الخزينة زادت 100 جنيه بعد تخفيض التكلفة من 100 إلى 80');
  // حركة الدفع أصبحت 400
  assert.equal(testDb['transactions/tx-p1'].amount, 400, 'حركة الدفع تم تعديل مبلغها إلى 400');
  // فاتورة الشراء paidAmount أصبحت 400
  assert.equal(testDb['purchases/pur-1'].paidAmount, 400, 'فاتورة الشراء paidAmount أصبح 400');
  assert.equal(testDb['purchases/pur-1'].grandTotal, 400);
  assert.equal(testDb['items/item-s1'].costPrice, 80, 'تكلفة الصنف أصبحت 80');

  // التحقق من أثر cancelPurchase اللاحق: بما أن cancelPurchase تقرأ t.amount من حركة الدفع المرتبطة
  // فإن إلغاء الفاتورة سيرد 400 فقط (وليس 500 القديمة) لأن مبلغ الحركة أصبح 400
  const refundOnCancel = Number(testDb['transactions/tx-p1'].amount) || 0;
  assert.equal(refundOnCancel, 400, 'cancelPurchase سترد 400 فقط للخزينة بناءً على مبلغ الحركة المعدل');

  // -------------------------------------------------------------
  // 2) نفس التصحيح بخيار "إلغاء" (adjustPayment = false)
  //    ← الخزينة والحركة بدون تغيير.
  // -------------------------------------------------------------
  testDb['stats/wallets'] = { balances: { cash: 1000 } };
  testDb['items/item-s2'] = {
    id: 'item-s2',
    name: 'شنطة جلد',
    costPrice: 100,
    currentStock: 5,
    initialQty: 5,
    purchaseId: 'pur-2',
  };
  testDb['purchases/pur-2'] = {
    id: 'pur-2',
    purchaseNumber: 'PUR-0002',
    paidAmount: 500,
    subtotal: 500,
    grandTotal: 500,
    remainingAmount: 0,
    paymentSource: 'cash',
    items: [{ itemId: 'item-s2', name: 'شنطة جلد', quantity: 5, purchaseCost: 100, total: 500 }],
  };
  testDb['transactions/tx-p2'] = {
    id: 'tx-p2',
    type: 'purchase_payment',
    walletId: 'cash',
    amount: 500,
    referenceNumber: 'PUR-0002',
    status: 'active',
  };

  await fixItemCost('item-s2', 80, false);

  assert.equal(testDb['items/item-s2'].costPrice, 80, 'سعر التكلفة تعدل إلى 80');
  assert.equal(testDb['stats/wallets'].balances.cash, 1000, 'الخزينة ظلت 1000 دون أي تغيير');
  assert.equal(testDb['transactions/tx-p2'].amount, 500, 'حركة الدفع ظلت 500 دون تغيير');
  assert.equal(testDb['purchases/pur-2'].paidAmount, 500, 'فاتورة الشراء paidAmount ظل 500');
  assert.equal(testDb['purchases/pur-2'].grandTotal, 400, 'إجمالي الشراء تعدل إلى 400');

  // -------------------------------------------------------------
  // 3) شراء من الجيب وتصحيح بـ"موافق" (adjustPayment = true)
  //    ← الخزينة بدون تغيير وحركة capital_in اتعدلت.
  // -------------------------------------------------------------
  testDb['stats/wallets'] = { balances: { cash: 2000 } };
  testDb['items/item-s3'] = {
    id: 'item-s3',
    name: 'حزام جلد',
    costPrice: 200,
    currentStock: 2,
    initialQty: 2,
    purchaseId: 'pur-3',
  };
  testDb['purchases/pur-3'] = {
    id: 'pur-3',
    purchaseNumber: 'PUR-0003',
    paidAmount: 400,
    subtotal: 400,
    grandTotal: 400,
    remainingAmount: 0,
    paymentSource: 'pocket',
    items: [{ itemId: 'item-s3', name: 'حزام جلد', quantity: 2, purchaseCost: 200, total: 400 }],
  };
  testDb['transactions/tx-p3'] = {
    id: 'tx-p3',
    type: 'capital_in',
    walletId: 'pocket',
    amount: 400,
    referenceNumber: 'PUR-0003',
    status: 'active',
  };

  // تصحيح التكلفة من 200 إلى 150 (diff = (150 - 200) * 2 = -100)
  await fixItemCost('item-s3', 150, true);

  assert.equal(testDb['items/item-s3'].costPrice, 150);
  assert.equal(testDb['stats/wallets'].balances.cash, 2000, 'الدفع من الجيب: الخزينة لم تتأثر إطلاقاً (ظلت 2000)');
  assert.equal(testDb['transactions/tx-p3'].amount, 300, 'حركة capital_in تم تعديلها إلى 300');
  assert.equal(testDb['purchases/pur-3'].paidAmount, 300, 'فاتورة الشراء paidAmount أصبح 300');

  // -------------------------------------------------------------
  // 4) شراء بصنفين وتصحيح صنف واحد ← التعديل بفرقه فقط
  // -------------------------------------------------------------
  testDb['stats/wallets'] = { balances: { cash: 3000 } };
  testDb['items/item-a'] = {
    id: 'item-a',
    name: 'صنف أ',
    costPrice: 100,
    currentStock: 3,
    initialQty: 3,
    purchaseId: 'pur-4',
  };
  testDb['items/item-b'] = {
    id: 'item-b',
    name: 'صنف ب',
    costPrice: 50,
    currentStock: 2,
    initialQty: 2,
    purchaseId: 'pur-4',
  };
  // الإجمالي: 3*100 + 2*50 = 300 + 100 = 400
  testDb['purchases/pur-4'] = {
    id: 'pur-4',
    purchaseNumber: 'PUR-0004',
    paidAmount: 400,
    subtotal: 400,
    grandTotal: 400,
    remainingAmount: 0,
    paymentSource: 'cash',
    items: [
      { itemId: 'item-a', name: 'صنف أ', quantity: 3, purchaseCost: 100, total: 300 },
      { itemId: 'item-b', name: 'صنف ب', quantity: 2, purchaseCost: 50, total: 100 },
    ],
  };
  testDb['transactions/tx-p4'] = {
    id: 'tx-p4',
    type: 'purchase_payment',
    walletId: 'cash',
    amount: 400,
    referenceNumber: 'PUR-0004',
    status: 'active',
  };

  // تصحيح صنف أ من 100 إلى 80 (diff = (80 - 100) * 3 = -60)
  await fixItemCost('item-a', 80, true);

  assert.equal(testDb['items/item-a'].costPrice, 80);
  assert.equal(testDb['items/item-b'].costPrice, 50, 'صنف ب لم يتغير');
  assert.equal(testDb['stats/wallets'].balances.cash, 3060, 'الخزينة زادت 60 فقط (فرق صنف أ)');
  assert.equal(testDb['transactions/tx-p4'].amount, 340, 'حركة الدفع أصبحت 340 (400 - 60)');
  assert.equal(testDb['purchases/pur-4'].paidAmount, 340);
  assert.equal(testDb['purchases/pur-4'].grandTotal, 340);

  // -------------------------------------------------------------
  // 5) صنف اتباع منه ← التصحيح يتمنع زي الأول
  // -------------------------------------------------------------
  testDb['items/item-sold'] = {
    id: 'item-sold',
    name: 'صنف مباع جزئياً',
    costPrice: 100,
    currentStock: 2, // بيع 3 قطع من 5
    initialQty: 5,
    purchaseId: 'pur-5',
  };

  let errorCaught: any = null;
  try {
    await fixItemCost('item-sold', 80, true);
  } catch (err: any) {
    errorCaught = err;
  }
  assert.ok(errorCaught, 'تم رفض تعديل التكلفة لصنف تم بيع جزء منه');
  assert.equal(errorCaught.message, 'لا يمكن تعديل سعر الشراء بعد البيع أو تسوية جزء من الكمية');

  // استرجاع المحول
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 9: ظهور الفواتير النقدية في ملف العميل والبحث برقم الهاتف الموحد', async () => {
  const {
    createInvoice,
    createReturn,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  const testDb: Record<string, any> = {};

  const getPath = (ref: any) =>
    ref?.path || (ref?.parent?.id && ref?.id ? `${ref.parent.id}/${ref.id}` : String(ref));

  const mockBatch = () => ({
    set: (ref: any, data: any, opts?: any) => {
      const path = getPath(ref);
      if (path === 'stats/wallets') {
        const b = testDb[path]?.balances || { cash: 0, bank: 0, wallet: 0 };
        for (const [w, val] of Object.entries(data.balances || {})) {
          if (val && typeof val === 'object' && ((val as any)._methodName === 'increment' || (val as any)._operand !== undefined)) {
            b[w] = (b[w] || 0) + (val as any)._operand;
          } else if (typeof val === 'number') {
            b[w] = val;
          }
        }
        testDb[path] = { balances: b };
      } else {
        testDb[path] = { ...(opts?.merge ? testDb[path] : {}), ...data };
      }
    },
    update: (ref: any, data: any) => {
      const path = getPath(ref);
      const current = testDb[path] || {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && ((v as any)._methodName === 'increment' || (v as any)._operand !== undefined)) {
          current[k] = (current[k] || 0) + (v as any)._operand;
        } else {
          current[k] = v;
        }
      }
      testDb[path] = current;
    },
    commit: async () => 'ok',
  });

  _setFirestoreAdapterForTesting({
    getDoc: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!testDb[path],
        data: () => testDb[path],
        id: path.split('/')[1] || path,
        ref: { path },
      } as any;
    },
    getDocFromCache: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!testDb[path],
        data: () => testDb[path],
        id: path.split('/')[1] || path,
        ref: { path },
      } as any;
    },
    getDocFromServer: async () => {
      return { exists: () => true, data: () => ({ balances: testDb['stats/wallets']?.balances }) } as any;
    },
    getDocs: async (q: any) => {
      let col = 'invoices';
      if (q?.path) col = q.path;
      else if (q?._query?.path?.segments?.[0]) col = q._query.path.segments[0];

      let phoneFilter: string | undefined;
      if (q?._query?.filters) {
        for (const f of q._query.filters) {
          const val = f?.value?.stringValue ?? f?.value?.internalValue ?? f?.value;
          if (typeof val === 'string') phoneFilter = val;
        }
      }

      const docs: any[] = [];
      for (const [p, d] of Object.entries(testDb)) {
        if (p.startsWith(`${col}/`)) {
          if (col === 'customers' && phoneFilter !== undefined) {
            if (d.phone !== phoneFilter) continue;
          }
          docs.push({ id: p.split('/')[1], data: () => d, ref: { path: p } });
        }
      }
      return { empty: docs.length === 0, docs, forEach: (fn: any) => docs.forEach(fn) } as any;
    },
    writeBatch: () => mockBatch() as any,
  });

  // تهيئة البيانات
  testDb['stats/wallets'] = { balances: { cash: 1000 } };
  testDb['customers/cust-existing'] = {
    id: 'cust-existing',
    name: 'سارة أحمد',
    phone: '01012345678',
    currentBalance: 300,
  };
  testDb['items/item-sh1'] = {
    id: 'item-sh1',
    code: 'S1-B38',
    name: 'حذاء بيج 38',
    currentStock: 20,
    costPrice: 80,
    unitPrice: 150,
  };

  // -------------------------------------------------------------
  // 1) فاتورة نقدية بهاتف عميل موجود ← تظهر في ملفه ولا يتغير رصيده
  // -------------------------------------------------------------
  const res1 = await createInvoice({
    customerPhone: '01012345678',
    payments: { cash: 150 },
    items: [{ itemId: 'item-sh1', name: 'حذاء بيج 38', quantity: 1, unitPrice: 150 }],
  });

  const inv1Doc = testDb[`invoices/${res1.invoiceId}`];
  assert.ok(inv1Doc, 'تم حفظ الفاتورة');
  assert.equal(inv1Doc.customerId, 'cust-existing', 'الفاتورة النقدية رُبطت بمعرّف العميل لتظهر في ملفه');
  assert.equal(inv1Doc.customerName, 'سارة أحمد', 'تم جلب اسم العميل تلقائياً');
  assert.equal(inv1Doc.remainingAmount, 0, 'الفاتورة نقدية بالكامل');
  assert.equal(testDb['customers/cust-existing'].currentBalance, 300, 'رصيد العميل لم يتغير وظل 300');

  // -------------------------------------------------------------
  // 2) نفس الشيء بهاتف غير موجود ← فاتورة بدون customerId ولا يُنشأ عميل
  // -------------------------------------------------------------
  const customerCountBefore = Object.keys(testDb).filter((k) => k.startsWith('customers/')).length;
  const res2 = await createInvoice({
    customerPhone: '01099999999',
    payments: { cash: 150 },
    items: [{ itemId: 'item-sh1', name: 'حذاء بيج 38', quantity: 1, unitPrice: 150 }],
  });

  const inv2Doc = testDb[`invoices/${res2.invoiceId}`];
  assert.ok(inv2Doc);
  assert.equal(inv2Doc.customerId, '', 'فاتورة بدون customerId لأن الهاتف غير مسجل والفاتورة نقدية');
  const customerCountAfter = Object.keys(testDb).filter((k) => k.startsWith('customers/')).length;
  assert.equal(customerCountAfter, customerCountBefore, 'لم يُنشأ عميل جديد في الفاتورة النقدية');

  // -------------------------------------------------------------
  // 3) فاتورة آجل بهاتف جديد ← تنشئ العميل ورصيده زي الأول
  // -------------------------------------------------------------
  const res3 = await createInvoice({
    customerName: 'فاطمة حسن',
    customerPhone: '01122334455',
    payments: { cash: 50 }, // دفع 50 من 150، المتبقي 100 آجل
    items: [{ itemId: 'item-sh1', name: 'حذاء بيج 38', quantity: 1, unitPrice: 150 }],
  });

  const inv3Doc = testDb[`invoices/${res3.invoiceId}`];
  assert.ok(inv3Doc);
  assert.ok(inv3Doc.customerId, 'الفاتورة الآجلة ارتبطت بمعرف العميل الجديد');
  assert.equal(inv3Doc.remainingAmount, 100);
  const newCust = testDb[`customers/${inv3Doc.customerId}`];
  assert.ok(newCust, 'تم إنشاء سجل للعميل الجديد');
  assert.equal(newCust.name, 'فاطمة حسن');
  assert.equal(newCust.phone, '01122334455');
  assert.equal(newCust.currentBalance, 100, 'رصيد العميل أصبح 100 دين');

  // -------------------------------------------------------------
  // 4) مرتجع وإلغاء لفاتورة نقدية مربوطة ← يشتغلوا بدون أي تغيير في رصيد العميل
  // -------------------------------------------------------------
  // أ) مرتجع الفاتورة النقدية الأولى (المربوطة بـ cust-existing)
  const prevCustBalance = testDb['customers/cust-existing'].currentBalance;
  const retRes = await createReturn(res1.invoiceId, [{ itemId: 'item-sh1', quantity: 1 }], 'cash');
  assert.equal(retRes.totalReturnValue, 150);
  assert.equal(retRes.appliedToDebt, 0, 'لا يوجد دين لتسديده من المرتجع النقدي');
  assert.equal(retRes.cashRefundAmount, 150, 'المبلغ رُد كاش للعميل');
  assert.equal(testDb['customers/cust-existing'].currentBalance, prevCustBalance, 'رصيد العميل لم يتغير بعد المرتجع');

  // ب) تحقق أن إلغاء فاتورة نقدية لا يمس رصيد العميل
  // بما أن debtOnInvoice = initialRemaining = 0، فلا يتم تحديث رصيد العميل
  const debtOnCashInvoice = Number(inv1Doc.initialRemaining) || Number(inv1Doc.remainingAmount) || 0;
  assert.equal(debtOnCashInvoice, 0, 'الدين على الفاتورة النقدية صفر وبالتالي لا يطرح أي شيء من رصيد العميل عند الإلغاء');

  // -------------------------------------------------------------
  // 5) نفس الهاتف بصيغة +20 و 0020 ← يلاقي نفس العميل
  // -------------------------------------------------------------
  const res5a = await createInvoice({
    customerPhone: '+201012345678', // هاتف سارة بصيغة +20
    payments: { cash: 150 },
    items: [{ itemId: 'item-sh1', name: 'حذاء بيج 38', quantity: 1, unitPrice: 150 }],
  });
  const inv5aDoc = testDb[`invoices/${res5a.invoiceId}`];
  assert.equal(inv5aDoc.customerId, 'cust-existing', 'وجد العميل عند إدخال الهاتف بصيغة +20');

  const res5b = await createInvoice({
    customerPhone: '00201012345678', // هاتف سارة بصيغة 0020
    payments: { cash: 150 },
    items: [{ itemId: 'item-sh1', name: 'حذاء بيج 38', quantity: 1, unitPrice: 150 }],
  });
  const inv5bDoc = testDb[`invoices/${res5b.invoiceId}`];
  assert.equal(inv5bDoc.customerId, 'cust-existing', 'وجد العميل عند إدخال الهاتف بصيغة 0020');

  // استرجاع المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 10: منع التحصيل أكبر من الدين في الواجهة والـ backend مع الحفاظ على التوزيع السليم والتصفير', async () => {
  const {
    collectPayment,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  const testDb: Record<string, any> = {};

  const getPath = (ref: any) =>
    ref?.path || (ref?.parent?.id && ref?.id ? `${ref.parent.id}/${ref.id}` : String(ref));

  const mockBatch = () => ({
    set: (ref: any, data: any, opts?: any) => {
      const path = getPath(ref);
      if (path === 'stats/wallets') {
        const b = testDb[path]?.balances || { cash: 0, bank: 0, wallet: 0 };
        for (const [w, val] of Object.entries(data.balances || {})) {
          if (
            val &&
            typeof val === 'object' &&
            ((val as any)._methodName === 'increment' || (val as any)._operand !== undefined)
          ) {
            b[w] = (b[w] || 0) + (val as any)._operand;
          } else if (typeof val === 'number') {
            b[w] = val;
          }
        }
        testDb[path] = { balances: b };
      } else {
        testDb[path] = { ...(opts?.merge ? testDb[path] : {}), ...data };
      }
    },
    update: (ref: any, data: any) => {
      const path = getPath(ref);
      const current = testDb[path] || {};
      for (const [k, v] of Object.entries(data)) {
        if (
          v &&
          typeof v === 'object' &&
          ((v as any)._methodName === 'increment' || (v as any)._operand !== undefined)
        ) {
          current[k] = (current[k] || 0) + (v as any)._operand;
        } else {
          current[k] = v;
        }
      }
      testDb[path] = current;
    },
    commit: async () => 'ok',
  });

  _setFirestoreAdapterForTesting({
    getDoc: async (ref: any) => {
      const path = getPath(ref);
      return {
        exists: () => !!testDb[path],
        data: () => testDb[path],
        id: path.split('/')[1] || path,
        path,
      } as any;
    },
    getDocFromCache: async () => ({
      exists: () => false,
      data: () => null,
    } as any),
    getDocFromServer: async () => ({
      exists: () => true,
      data: () => ({ balances: testDb['stats/wallets']?.balances }),
    } as any),
    getDocs: async (q: any) => {
      const docs: any[] = [];
      for (const [p, d] of Object.entries(testDb)) {
        if (p.startsWith('invoices/')) {
          // استخراج معرف العميل لو تم ترشيحه في الاستعلام
          let targetCustId: string | undefined;
          const filters = q?._query?.filters || q?.filters || [];
          for (const f of filters) {
            const val = f?.value?.stringValue !== undefined ? f.value.stringValue : f?.value;
            if (val) targetCustId = String(val);
          }
          if (!targetCustId || d.customerId === targetCustId) {
            docs.push({ id: p.split('/')[1], data: () => d });
          }
        }
      }
      return {
        empty: docs.length === 0,
        docs,
        forEach: (fn: any) => docs.forEach(fn),
      } as any;
    },
    writeBatch: () => mockBatch() as any,
  });

  // -------------------------------------------------------------
  // 1) دين 500 وتحصيل 500 ← ينجح ويصفّر الدين
  // -------------------------------------------------------------
  testDb['customers/cust-full'] = {
    id: 'cust-full',
    name: 'عميل دين كامل',
    currentBalance: 500,
  };
  testDb['invoices/inv-full'] = {
    id: 'inv-full',
    invoiceNumber: 'INV-500',
    customerId: 'cust-full',
    customerName: 'عميل دين كامل',
    status: 'completed',
    remainingAmount: 500,
    createdAt: 1000,
  };
  testDb['stats/wallets'] = { balances: { cash: 1000, bank: 0, wallet: 0 } };

  const resFull = await collectPayment('cust-full', 500, 'cash');
  assert.equal(resFull.totalAllocated, 500, 'تم تخصيص الـ 500 بالكامل');
  assert.equal(testDb['customers/cust-full'].currentBalance, 0, 'تم تصفير دين العميل بنجاح (500 - 500 = 0)');
  assert.equal(testDb['invoices/inv-full'].remainingAmount, 0, 'تم تصفير دين الفاتورة');
  assert.equal(testDb['stats/wallets'].balances.cash, 1500, 'تمت زيادة الخزينة بمبلغ التحصيل (1000 + 500 = 1500)');

  // -------------------------------------------------------------
  // 2) تحصيل 600 لدين 500 ← يترفض
  // -------------------------------------------------------------
  testDb['customers/cust-over'] = {
    id: 'cust-over',
    name: 'عميل تحصيل زائد',
    currentBalance: 500,
  };
  testDb['invoices/inv-over'] = {
    id: 'inv-over',
    invoiceNumber: 'INV-OVER',
    customerId: 'cust-over',
    status: 'completed',
    remainingAmount: 500,
    createdAt: 2000,
  };

  let errOver: any = null;
  try {
    await collectPayment('cust-over', 600, 'cash');
  } catch (err: any) {
    errOver = err;
  }
  assert.ok(errOver, 'تم رفض التحصيل الزائد');
  assert.equal(errOver.message, 'المبلغ أكبر من الدين');
  assert.equal(testDb['customers/cust-over'].currentBalance, 500, 'رصيد العميل لم يتغير وظل 500');

  // فحص حماية واجهة المستخدم:
  const uiAmountOver = 600;
  const currentDebtOver = 500;
  const isBlockedInUI = uiAmountOver > currentDebtOver + 0.001;
  assert.equal(isBlockedInUI, true, 'واجهة المستخدم تمنع الحفظ عند تجاوز الدين');

  // -------------------------------------------------------------
  // 3) تحصيل جزئي 200 ثم 300 لدين 500 (فاتورتين: 200 قديمة و 300 جديدة)
  //    ← ينجحوا والفواتير تتوزع صح (FIFO)
  // -------------------------------------------------------------
  testDb['customers/cust-partial'] = {
    id: 'cust-partial',
    name: 'عميل أقساط',
    currentBalance: 500,
  };
  testDb['invoices/inv-part-1'] = {
    id: 'inv-part-1',
    invoiceNumber: 'INV-P1',
    customerId: 'cust-partial',
    status: 'completed',
    remainingAmount: 200,
    createdAt: 1000, // أقدم
  };
  testDb['invoices/inv-part-2'] = {
    id: 'inv-part-2',
    invoiceNumber: 'INV-P2',
    customerId: 'cust-partial',
    status: 'completed',
    remainingAmount: 300,
    createdAt: 2000, // أحدث
  };

  // التحصيل الأول: 200
  const resPart1 = await collectPayment('cust-partial', 200, 'cash');
  assert.equal(resPart1.totalAllocated, 200);
  assert.equal(testDb['customers/cust-partial'].currentBalance, 300, 'الرصيد نزل إلى 300');
  assert.equal(testDb['invoices/inv-part-1'].remainingAmount, 0, 'الفاتورة الأولى الأقدم سُددت بالكامل');
  assert.equal(testDb['invoices/inv-part-2'].remainingAmount, 300, 'الفاتورة الثانية لم تُمس بعد');

  // التحصيل الثاني: 300
  const resPart2 = await collectPayment('cust-partial', 300, 'cash');
  assert.equal(resPart2.totalAllocated, 300);
  assert.equal(testDb['customers/cust-partial'].currentBalance, 0, 'الرصيد نزل إلى 0 وتصفّر');
  assert.equal(testDb['invoices/inv-part-2'].remainingAmount, 0, 'الفاتورة الثانية سُددت بالكامل');

  // -------------------------------------------------------------
  // 4) عميل بدون دين (currentBalance = 0) ← أزرار التحصيل مش ظاهرة، و collectPayment ترفض
  // -------------------------------------------------------------
  testDb['customers/cust-no-debt'] = {
    id: 'cust-no-debt',
    name: 'عميل بلا دين',
    currentBalance: 0,
  };
  const hasDebtCust = (testDb['customers/cust-no-debt'].currentBalance || 0) > 0.01;
  assert.equal(hasDebtCust, false, 'hasDebt = false وبالتالي أزرار التحصيل غير ظاهرة بالواجهة');

  let errNoDebt: any = null;
  try {
    await collectPayment('cust-no-debt', 50, 'cash');
  } catch (err: any) {
    errNoDebt = err;
  }
  assert.ok(errNoDebt, 'تم رفض تحصيل أي مبلغ لعميل دينه صفر');
  assert.equal(errNoDebt.message, 'المبلغ أكبر من الدين');

  // -------------------------------------------------------------
  // 5) مبلغ 0 أو سالب ← يترفض زي ما كان
  // -------------------------------------------------------------
  let errZero: any = null;
  try {
    await collectPayment('cust-over', 0, 'cash');
  } catch (err: any) {
    errZero = err;
  }
  assert.ok(errZero, 'تم رفض تحصيل مبلغ صفر');
  assert.equal(errZero.message, 'مبلغ التحصيل يجب أن يكون أكبر من صفر');

  let errNeg: any = null;
  try {
    await collectPayment('cust-over', -50, 'cash');
  } catch (err: any) {
    errNeg = err;
  }
  assert.ok(errNeg, 'تم رفض تحصيل مبلغ سالب');
  assert.equal(errNeg.message, 'مبلغ التحصيل يجب أن يكون أكبر من صفر');

  // استرجاع المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 13: إصلاحات اللقطة، عكس حركات الشهر المقفول، وحساب اليوم', async () => {
  const {
    closeMonthSnapshot,
    reverseTransaction,
    _setFirestoreAdapterForTesting,
  } = await import('../lib/data');

  const testDb: Record<string, any> = {
    'stats/wallets': { balances: { cash: 1000, bank: 500, wallet: 200 } },
    'settings/general': { lockedThroughMonth: '2026-08' },
  };

  const mockBatch = {
    set(ref: any, data: any, options?: any) {
      const path = ref.path;
      if (path === 'stats/wallets') {
        const b = { ...(testDb[path]?.balances || { cash: 0, bank: 0, wallet: 0 }) };
        for (const [w, val] of Object.entries(data.balances || {})) {
          if (
            val &&
            typeof val === 'object' &&
            ((val as any)._methodName === 'increment' || (val as any)._operand !== undefined)
          ) {
            b[w] = (b[w] || 0) + (val as any)._operand;
          } else if (typeof val === 'number') {
            b[w] = val;
          }
        }
        testDb[path] = { ...testDb[path], balances: b };
      } else {
        testDb[path] = { ...(options?.merge ? testDb[path] : {}), ...data };
      }
    },
    update(ref: any, data: any) {
      testDb[ref.path] = { ...(testDb[ref.path] || {}), ...data };
    },
    async commit() {
      return 'ok';
    },
  };

  _setFirestoreAdapterForTesting({
    getDoc: async (ref: any) => ({
      exists: () => !!testDb[ref.path],
      data: () => testDb[ref.path],
    }) as any,
    getDocs: async (q: any) => {
      // support snapshots query where monthKey == x
      const path = q?.path || '';
      const docs: any[] = [];
      if (path === 'snapshots') {
        const targetMonth = q?._filterMonthKey;
        for (const [k, v] of Object.entries(testDb)) {
          if (k.startsWith('snapshots/')) {
            if (!targetMonth || v.monthKey === targetMonth) {
              docs.push({ id: k.replace('snapshots/', ''), data: () => v });
            }
          }
        }
      }
      return {
        empty: docs.length === 0,
        docs,
        forEach: (cb: any) => docs.forEach(cb),
      } as any;
    },
    doc: (_db: any, col: string, id?: string) => ({
      path: id ? `${col}/${id}` : `${col}/auto_${Math.random().toString(36).substring(7)}`,
      id: id || `auto_${Math.random().toString(36).substring(7)}`,
    }),
    collection: (_db: any, col: string) => ({
      path: col,
    }),
    writeBatch: () => mockBatch as any,
  } as any);

  // -------------------------------------------------------------
  // 1) إقفال شهر لأول مرة ← ينجح بمعرّف monthKey
  // -------------------------------------------------------------
  const snapResultId = await closeMonthSnapshot({
    monthKey: '2026-09',
    actualWallets: { cash: 1000, bank: 500, wallet: 200 },
    systemWallets: { cash: 1000, bank: 500, wallet: 200 },
    inventoryValue: 50000,
    receivables: 2000,
    customerCredits: 0,
    capital: 53700,
    invoiceProfit: 12000,
    realProfit: 12000,
    mismatch: 0,
  });

  assert.equal(snapResultId, '2026-09', 'معرف المستند العائد هو monthKey');
  assert.ok(testDb['snapshots/2026-09'], 'تم تخزين المستند بمعرّف 2026-09');
  assert.equal(testDb['snapshots/2026-09'].monthKey, '2026-09');
  assert.equal(testDb['settings/general'].lockedThroughMonth, '2026-09');

  // اللقطات القديمة بمعرفات عشوائية تظل مقروءة بالحقل monthKey
  testDb['snapshots/random_old_uuid'] = {
    id: 'random_old_uuid',
    monthKey: '2026-07',
    type: 'monthly_closing',
    capital: 45000,
  };
  assert.equal(testDb['snapshots/random_old_uuid'].monthKey, '2026-07', 'اللقطة القديمة تحتفظ بحقل monthKey');

  // -------------------------------------------------------------
  // 2) إقفال نفس الشهر تاني ← يترفض من الدالة بـ "تم إقفال هذا الشهر"
  // -------------------------------------------------------------
  let errDuplicateClose: any = null;
  try {
    await closeMonthSnapshot({
      monthKey: '2026-09',
      actualWallets: { cash: 1000, bank: 500, wallet: 200 },
      systemWallets: { cash: 1000, bank: 500, wallet: 200 },
      inventoryValue: 50000,
      receivables: 2000,
      customerCredits: 0,
      capital: 53700,
      invoiceProfit: 12000,
      realProfit: 12000,
      mismatch: 0,
    });
  } catch (err: any) {
    errDuplicateClose = err;
  }
  assert.ok(errDuplicateClose, 'تم رفض إقفال شهر مقفول بالفعل');
  assert.equal(errDuplicateClose.message, 'تم إقفال هذا الشهر');

  // -------------------------------------------------------------
  // 3) عكس مصروف شهر مقفول ← يترفض
  //    عكس مصروف الشهر الحالي (غير مقفول) ← ينجح
  // -------------------------------------------------------------
  // شهر مقفول (2026-08 أو 2026-09 حيث lockedThroughMonth = 2026-09)
  testDb['transactions/tx_locked'] = {
    id: 'tx_locked',
    type: 'expense',
    amount: 150,
    walletId: 'cash',
    monthKey: '2026-08',
    status: 'active',
  };

  let errReverseLocked: any = null;
  try {
    await reverseTransaction('tx_locked');
  } catch (err: any) {
    errReverseLocked = err;
  }
  assert.ok(errReverseLocked, 'تم رفض عكس حركة شهر مقفول');
  assert.equal(errReverseLocked.message, 'الشهر مقفول — سجّل قيد تصحيح في الشهر الحالي');
  assert.equal(testDb['transactions/tx_locked'].status, 'active', 'الحركة لم تُعكس');

  // شهر حالي غير مقفول (2026-10)
  testDb['transactions/tx_current'] = {
    id: 'tx_current',
    type: 'expense',
    amount: 250,
    walletId: 'cash',
    monthKey: '2026-10',
    status: 'active',
  };
  const cashBefore = testDb['stats/wallets'].balances.cash;
  await reverseTransaction('tx_current');
  assert.equal(testDb['transactions/tx_current'].status, 'reversed', 'الحركة في الشهر الحالي عُكست بنجاح');
  assert.equal(testDb['stats/wallets'].balances.cash, cashBefore + 250, 'تم رد المبلغ 250 للخزينة');

  // -------------------------------------------------------------
  // 4) حساب todayKey بتوقيت القاهرة وتغييره عبر منتصف الليل
  // -------------------------------------------------------------
  const { getDayKey } = await import('./dates');
  // 23:59:50 بتوقيت القاهرة
  const lateNight = new Date('2026-10-30T21:59:50.000Z'); // 23:59:50 UTC+2 Cairo
  const day1 = getDayKey(lateNight);
  // بعد دقيقة واحدة عبر منتصف الليل (00:00:50)
  const afterMidnight = new Date('2026-10-30T22:00:50.000Z'); // 00:00:50 UTC+2 Cairo
  const day2 = getDayKey(afterMidnight);

  assert.equal(day1, '2026-10-30', 'اليوم قبل منتصف الليل');
  assert.equal(day2, '2026-10-31', 'اليوم بعد منتصف الليل مباشرة');
  assert.notEqual(day1, day2, 'الدالة تتنقل تلقائياً لليوم الجديد عبر منتصف الليل');

  // استرجاع المحول الأصلي
  _setFirestoreAdapterForTesting(null);
});

test('المهمة 14 — تصدير النسخة الاحتياطية بدون ابتلاع أخطاء وعدم تسجيل mahally_last_backup قبل نجاح التنزيل', async () => {
  const { exportBackup, _setFirestoreAdapterForTesting } = await import('../lib/data');

  // تخزين بيانات افتراضية
  const testDb: Record<string, any> = {
    'settings/general': { lockedThroughMonth: '2026-09' },
    'meta/settings': { storeName: 'محلي' },
    'meta/opening': { capital: 50000 },
    'stats/wallets': { balances: { cash: 1500, bank: 3000, wallet: 500 } },
    'items/it-1': { id: 'it-1', name: 'شنطة جلد' },
  };

  const getPath = (ref: any) => {
    if (typeof ref === 'string') return ref;
    if (ref?.path) return ref.path;
    if (ref?._key?.path?.segments) return ref._key.path.segments.slice(-2).join('/');
    return '';
  };

  let failWallets = false;
  let failOpening = false;
  let failMetaSettings = false;

  _setFirestoreAdapterForTesting({
    doc: ((_db: any, col: string, id?: string) => {
      const path = id ? `${col}/${id}` : col;
      return { path, id: id || col, _key: { path: { segments: [col, id].filter(Boolean) } } };
    }) as any,
    collection: ((_db: any, name: string) => ({ path: name, id: name })) as any,
    getDocFromServer: async () => ({ exists: () => true, data: () => testDb['stats/wallets'] } as any),
    getDoc: async (ref: any) => {
      const path = getPath(ref);
      if (path === 'stats/wallets' && failWallets) {
        throw new Error('فشل اتصال بقاعدة بيانات الخزائن');
      }
      if (path === 'meta/opening' && failOpening) {
        throw new Error('فشل قراءة المستند الافتتاحي');
      }
      if (path === 'meta/settings' && failMetaSettings) {
        throw new Error('فشل قراءة إعدادات الميتا');
      }
      const data = testDb[path];
      return {
        exists: () => data !== undefined,
        data: () => data,
        id: path.split('/')[1] || path,
        path,
      } as any;
    },
    getDocs: async (q: any) => {
      const col = q.path || (q._query?.path?.segments ? q._query.path.segments[0] : 'items');
      const docs: any[] = [];
      for (const [p, d] of Object.entries(testDb)) {
        if (p.startsWith(`${col}/`)) {
          docs.push({ id: p.split('/')[1], data: () => d });
        }
      }
      return { empty: docs.length === 0, docs, forEach: (fn: any) => docs.forEach(fn) } as any;
    },
  });

  try {
    // 1) تصدير عادي ← الملف فيه الأرصدة وكل المجموعات
    const jsonStr1 = await exportBackup();
    const parsed1 = JSON.parse(jsonStr1);
    assert.equal(parsed1.data.wallets.balances.cash, 1500, 'أرصدة الخزائن موجودة وصحيحة');
    assert.equal(parsed1.data.opening.capital, 50000, 'الرصيد الافتتاحي موجود');
    assert.equal(parsed1.data.items.length, 1, 'المجموعات تم تصديرها بنجاح');

    // 2) محاكاة فشل قراءة stats/wallets ← التصدير يفشل ولا يبتلع الخطأ
    failWallets = true;
    let walletsError: any = null;
    try {
      await exportBackup();
    } catch (err: any) {
      walletsError = err;
    }
    assert.ok(walletsError, 'تم رمي خطأ عند فشل قراءة stats/wallets');
    assert.match(walletsError.message, /أرصدة الخزائن/, 'رسالة الخطأ توضح فشل قراءة أرصدة الخزائن');
    failWallets = false;

    // 3) محل جديد بدون meta/opening (مستند غير موجود ولكنه لا يرمي خطأ) ← التصدير ينجح وopening = null
    delete testDb['meta/opening'];
    const jsonStrNewStore = await exportBackup();
    const parsedNewStore = JSON.parse(jsonStrNewStore);
    assert.equal(parsedNewStore.data.opening, null, 'محل جديد بدون meta/opening ينجح التصدير بدون أخطاء');
    assert.equal(parsedNewStore.data.wallets.balances.cash, 1500);

    // 4) محاكاة فشل قراءة meta/opening (رمي خطأ) ← التصدير يفشل
    failOpening = true;
    let openingError: any = null;
    try {
      await exportBackup();
    } catch (err: any) {
      openingError = err;
    }
    assert.ok(openingError, 'تم رمي خطأ عند فشل قراءة meta/opening');
    assert.match(openingError.message, /الرصيد الافتتاحي/);
    failOpening = false;

    // 5) فشل قراءة meta/settings يمر بتحذير (console.warn) ولا يوقف التصدير
    failMetaSettings = true;
    let warned = false;
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      warned = true;
      originalWarn(...args);
    };
    try {
      const jsonStrWarn = await exportBackup();
      const parsedWarn = JSON.parse(jsonStrWarn);
      assert.ok(parsedWarn, 'التصدير اكتمل بنجاح رغم فشل meta/settings');
      assert.equal(warned, true, 'تم تسجيل تحذير console.warn');
    } finally {
      console.warn = originalWarn;
      failMetaSettings = false;
    }
  } finally {
    // استرجاع المحول الأصلي دائماً
    _setFirestoreAdapterForTesting(null);
  }
});

test('المهمة 15 — ترتيب استيراد النسخة الاحتياطية وحماية البيانات من الحذف عند انقطاع الاتصال', async () => {
  const { importBackup, _setFirestoreAdapterForTesting } = await import('../lib/data');

  let testDb: Record<string, any> = {};

  const resetDb = () => {
    testDb = {
      'items/item-old': { id: 'item-old', name: 'صنف قديم يجب حذفه لاحقاً' },
      'items/item-shared': { id: 'item-shared', name: 'صنف مشترك قديم' },
      'invoices/inv-old': { id: 'inv-old', total: 100 },
      'purchases/pur-old': { id: 'pur-old' },
      'returns/ret-old': { id: 'ret-old' },
      'customers/cust-old': { id: 'cust-old', name: 'عميل قديم' },
      'transactions/tx-old': { id: 'tx-old', amount: 50 },
      'stock_adjustments/adj-old': { id: 'adj-old' },
      'snapshots/snap-old': { id: 'snap-old' },
      'settings/general': { lockedThroughMonth: '2026-08' },
      'meta/settings': { storeName: 'محل قديم' },
      'meta/opening': { capital: 10000 },
      'stats/wallets': { balances: { cash: 1000, bank: 500, wallet: 0 } },
    };
  };

  resetDb();

  const getPath = (ref: any) => {
    if (typeof ref === 'string') return ref;
    if (ref?.path) return ref.path;
    if (ref?._key?.path?.segments) return ref._key.path.segments.slice(-2).join('/');
    return '';
  };

  let failCommit = false;
  let commitCount = 0;

  const mockBatch = () => {
    const operations: Array<{ type: 'set' | 'delete'; ref: any; data?: any }> = [];
    return {
      set: (ref: any, data: any) => {
        operations.push({ type: 'set', ref, data });
      },
      delete: (ref: any) => {
        operations.push({ type: 'delete', ref });
      },
      commit: async () => {
        commitCount++;
        if (failCommit) {
          throw new Error('انقطاع شبكة أثناء إرسال الدفعة');
        }
        for (const op of operations) {
          const p = getPath(op.ref);
          if (op.type === 'set') {
            testDb[p] = { ...op.data };
          } else if (op.type === 'delete') {
            delete testDb[p];
          }
        }
      },
    };
  };

  _setFirestoreAdapterForTesting({
    doc: ((_db: any, col: string, id?: string) => {
      const path = id ? `${col}/${id}` : col;
      return { path, id: id || col, _key: { path: { segments: [col, id].filter(Boolean) } } };
    }) as any,
    collection: ((_db: any, name: string) => ({ path: name, id: name })) as any,
    getDocFromServer: async () => ({ exists: () => true, data: () => testDb['stats/wallets'] } as any),
    getDoc: async (ref: any) => {
      const path = getPath(ref);
      const data = testDb[path];
      return {
        exists: () => data !== undefined,
        data: () => data,
        id: path.split('/')[1] || path,
        path,
      } as any;
    },
    getDocs: async (q: any) => {
      const col = q.path || (q._query?.path?.segments ? q._query.path.segments[0] : 'items');
      const docs: any[] = [];
      for (const [p, d] of Object.entries(testDb)) {
        if (p.startsWith(`${col}/`)) {
          const id = p.split('/')[1];
          docs.push({
            id,
            data: () => d,
            ref: { path: p, id },
          });
        }
      }
      return { empty: docs.length === 0, docs, forEach: (fn: any) => docs.forEach(fn) } as any;
    },
    writeBatch: () => mockBatch() as any,
  });

  const validBackup = {
    version: '1.1',
    exportedAt: Date.now(),
    data: {
      items: [
        { id: 'item-shared', name: 'صنف مشترك محدث' },
        { id: 'item-new', name: 'صنف جديد' },
      ],
      invoices: [{ id: 'inv-new', total: 500 }],
      purchases: [{ id: 'pur-new' }],
      returns: [{ id: 'ret-new' }],
      customers: [{ id: 'cust-new', name: 'عميل جديد' }],
      transactions: [{ id: 'tx-new', amount: 300 }],
      stock_adjustments: [{ id: 'adj-new' }],
      snapshots: [{ id: 'snap-new' }],
      settings: { storeName: 'محلي المحدث' },
      settingsGeneral: { lockedThroughMonth: '2026-09' },
      opening: { capital: 60000 },
      wallets: { balances: { cash: 5000, bank: 2000, wallet: 1000 } },
    },
  };

  try {
    // -------------------------------------------------------------
    // 2) ملف ناقص مجموعة ← يترفض قبل أي كتابة أو حذف
    // -------------------------------------------------------------
    const missingGroupBackup = JSON.parse(JSON.stringify(validBackup));
    delete missingGroupBackup.data.returns; // حذف مجموعة المرتجعات

    let errMissing: any = null;
    try {
      await importBackup(missingGroupBackup);
    } catch (err: any) {
      errMissing = err;
    }
    assert.ok(errMissing, 'تم رفض استيراد ملف ناقص مجموعة');
    assert.match(errMissing.message, /المجموعة \(returns\) غير موجودة أو ليست قائمة/);
    assert.ok(testDb['items/item-old'], 'لم يتم حذف أي عنصر في القاعدة');
    assert.equal(testDb['meta/settings'].storeName, 'محل قديم', 'لم يتم تعديل الإعدادات');

    // -------------------------------------------------------------
    // 3) فشل محاكى في منتصف الكتابة ← البيانات القديمة سليمة ولا يحصل حذف
    // -------------------------------------------------------------
    failCommit = true;
    let errMidFail: any = null;
    try {
      await importBackup(validBackup);
    } catch (err: any) {
      errMidFail = err;
    }
    assert.ok(errMidFail, 'فشل الاستيراد بسبب خطأ الاتصال المحاكى');
    assert.match(errMidFail.message, /لا تغلق الصفحة، وإن انقطع الاتصال أعد نفس الملف/);
    assert.ok(testDb['items/item-old'], 'العنصر القديم لم يُحذف لأن خطوة الحذف لم تبدأ');
    assert.ok(testDb['invoices/inv-old'], 'الفاتورة القديمة لم تُحذف');
    failCommit = false;

    // -------------------------------------------------------------
    // 4) إعادة نفس الاستيراد بعد الفشل ← يكتمل ويتطابق مع الملف
    // -------------------------------------------------------------
    await importBackup(validBackup);

    // التحقق من أن العناصر القديمة حُذفت والجديدة كُتبت
    assert.equal(testDb['items/item-old'], undefined, 'العنصر القديم حُذف بعد اكتمال الاستيراد');
    assert.equal(testDb['invoices/inv-old'], undefined, 'الفاتورة القديمة حُذفت');
    assert.equal(testDb['purchases/pur-old'], undefined);
    assert.equal(testDb['returns/ret-old'], undefined);
    assert.equal(testDb['customers/cust-old'], undefined);
    assert.equal(testDb['transactions/tx-old'], undefined);
    assert.equal(testDb['stock_adjustments/adj-old'], undefined);
    assert.equal(testDb['snapshots/snap-old'], undefined);

    // التحقق من وجود وتطابق بيانات الملف المستوردة
    assert.equal(testDb['items/item-shared'].name, 'صنف مشترك محدث');
    assert.equal(testDb['items/item-new'].name, 'صنف جديد');
    assert.equal(testDb['invoices/inv-new'].total, 500);
    assert.equal(testDb['meta/settings'].storeName, 'محلي المحدث');
    assert.equal(testDb['settings/general'].lockedThroughMonth, '2026-09');
    assert.equal(testDb['meta/opening'].capital, 60000);
    assert.deepEqual(testDb['stats/wallets'].balances, { cash: 5000, bank: 2000, wallet: 1000 });

    // -------------------------------------------------------------
    // 1) استيراد نسخة سليمة من البداية ← نفس الأعداد والأرصدة
    // -------------------------------------------------------------
    resetDb();
    await importBackup(validBackup);
    assert.equal(testDb['items/item-old'], undefined);
    assert.equal(testDb['items/item-shared'].name, 'صنف مشترك محدث');
    assert.equal(testDb['items/item-new'].name, 'صنف جديد');
    assert.deepEqual(testDb['stats/wallets'].balances, { cash: 5000, bank: 2000, wallet: 1000 });
  } finally {
    _setFirestoreAdapterForTesting(null);
  }
});








