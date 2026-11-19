/**
 * Data Access Layer for «محلي»
 * 
 * Rules:
 * - NO runTransaction or serverTimestamp used anywhere.
 * - Single writeBatch for atomic multi-document writes.
 * - Real UTC dates via getCairoDate.
 * - Unified search keywords via normalizeAr.
 * - Item codes generated via makeCode.
 */

import { trackPending, reportRejectedInvoice } from './pending';
import {
  writeBatch,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  increment,
  updateDoc,
  deleteField,
  FieldPath,
  getDocFromCache,
  getDocFromServer,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * حارس لمنع العمليات الحساسة التي تتطلب اتصالاً بالإنترنت لتفادي تعليق الشاشة أوفلاين
 */
export function requireOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('هذه العملية تحتاج اتصال بالإنترنت');
  }
}

/**
 * التحقق من وجود اتصال فعلي بالسيرفر (كشف الواي فاي المتصل بدون إنترنت حقيقي):
 * - يستدعي requireOnline() أولاً للتأكد من عدم وجود وضع عدم اتصال صريح
 * - يحاول قراءة مستند صغير (stats/wallets) بـ getDocFromServer مع مهلة 4 ثوانٍ
 * - عند الفشل أو انتهاء المهلة يرمي: "لا يوجد اتصال فعلي بالإنترنت. حاول لاحقًا"
 */
export async function requireServerReachable(): Promise<void> {
  requireOnline();
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('timeout'));
    }, 4000);
    if (typeof timer?.unref === 'function') {
      timer.unref();
    }
  });

  try {
    const pingRef = currentFirestoreAdapter.doc(db, 'stats', 'wallets');
    const readFn = currentFirestoreAdapter.getDocFromServer || currentFirestoreAdapter.getDoc;
    const serverRead = readFn(pingRef);
    await Promise.race([serverRead, timeoutPromise]);
  } catch (err: any) {
    throw new Error('لا يوجد اتصال فعلي بالإنترنت. حاول لاحقًا');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * إصلاح جوهري: set({merge:true}) لا يفهم النقطة كمسار، فكان المفتاح 'balances.cash'
 * يُنشئ حقلاً حرفياً بهذا الاسم ولا يُحدّث balances.cash الذي تقرؤه الشاشات.
 * هذه الدالة تحوّل أي مفتاح يبدأ بـ 'balances.' إلى كائن متداخل تلقائياً.
 */
function nestBalances(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('balances.')) {
      out.balances = out.balances || {};
      out.balances[k.slice('balances.'.length)] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

interface FirestoreAdapter {
  getDoc: typeof getDoc;
  getDocFromCache: typeof getDocFromCache;
  getDocFromServer: typeof getDocFromServer;
  getDocs: typeof getDocs;
  doc: typeof doc;
  collection: typeof collection;
  writeBatch: typeof writeBatch;
}

const defaultFirestoreAdapter: FirestoreAdapter = {
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  doc,
  collection,
  writeBatch,
};

let currentFirestoreAdapter = defaultFirestoreAdapter;

export function _setFirestoreAdapterForTesting(adapter?: Partial<FirestoreAdapter> | null) {
  if (adapter) {
    currentFirestoreAdapter = {
      ...defaultFirestoreAdapter,
      ...adapter,
      getDocFromServer:
        adapter.getDocFromServer ||
        adapter.getDoc ||
        (async () => ({ exists: () => true, data: () => ({ balances: {} }) } as any)),
      getDocFromCache:
        adapter.getDocFromCache ||
        (adapter.getDoc
          ? adapter.getDoc
          : (async () => ({ exists: () => false, data: () => undefined } as any))),
    };
  } else {
    currentFirestoreAdapter = defaultFirestoreAdapter;
  }
}

/**
 * تنفيذ batch.commit() مع مهلة 10 ثوانٍ لتأكيد السيرفر.
 * عند انتهاء المهلة، ترمي خطأ صريحاً يوضح أن العملية محفوظة محلياً وستُرفع تلقائياً
 * مع تنبيه المستخدم بعدم تكرار العملية وضرورة مراجعة الحركات.
 */
export async function commitWithAck(batch: ReturnType<typeof newBatch>): Promise<void> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          'لم يصل تأكيد السيرفر. العملية محفوظة على الجهاز وستُرفع تلقائيًا عند عودة الاتصال، لا تكررها وراجع الحركات'
        )
      );
    }, 10000);
    if (typeof timer?.unref === 'function') {
      timer.unref();
    }
  });

  try {
    await Promise.race([batch.commit(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/** بديل writeBatch(db) يطبّق nestBalances على كل set. */
function newBatch() {
  const b = currentFirestoreAdapter.writeBatch(db);
  const origSet = b.set.bind(b) as any;
  (b as any).set = (ref: any, data: any, opts?: any) =>
    opts === undefined ? origSet(ref, nestBalances(data)) : origSet(ref, nestBalances(data), opts);
  return b;
}

/**
 * حفظ الدفعة بدون تعليق الشاشة أوفلاين: فايرستور لا يُنهي commit إلا بعد تأكيد السيرفر.
 * لو لا يوجد اتصال أو تأخر التأكيد أكثر من 5 ثوانٍ، تُعتبر العملية محفوظة محلياً (queued).
 */
async function commitOrQueue(batch: ReturnType<typeof newBatch>, invoiceNumber?: string): Promise<boolean> {
  const p = batch.commit();
  trackPending(p);
  p.catch((err) => {
    if (invoiceNumber) {
      reportRejectedInvoice({
        invoiceNumber,
        errorMessage: err?.message || 'تم رفض كتابة الفاتورة من قبل السيرفر',
        timestamp: Date.now(),
      });
    }
  });
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const r = await Promise.race([
    p.then(() => 'ok'),
    new Promise<string>((res) => setTimeout(() => res('timeout'), 5000)),
  ]);
  return r === 'timeout';
}

/**
 * ترحيل لمرة واحدة: لو كانت هناك حقول حرفية قديمة مثل "balances.cash" في stats/wallets
 * (نتيجة الخطأ السابق) تُدمج في الكائن المتداخل ثم تُحذف. آمنة للتكرار.
 */
export async function migrateWalletKeys(): Promise<void> {
  const ref = doc(db, 'stats', 'wallets');
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const literal = Object.keys(data).filter((k) => k.startsWith('balances.'));
  if (literal.length === 0) return;
  const merged: Record<string, number> = { ...(data.balances || {}) };
  for (const k of literal) {
    const w = k.slice('balances.'.length);
    merged[w] = round2((Number(merged[w]) || 0) + (Number(data[k]) || 0));
  }
  await updateDoc(ref, { balances: merged });
  for (const k of literal) {
    await updateDoc(ref, new FieldPath(k), deleteField());
  }
}
import { getCairoDate, getDayKey, getMonthKey } from '../domain/dates';
import { makeCode, getDevicePrefix } from '../domain/codes';
import { normalizeAr } from '../domain/arabic';
import { round2, normalizePhone } from '../domain/money';
import { WalletId } from '../domain/types';
import { calculateInvoiceTotals, allocateInvoiceLines, calculateLineReturn } from '../domain/invoice';
import { distributeCollection, distributeBadDebt } from '../domain/payment';

export interface CreatePurchaseItemInput {
  name: string;
  category: 'shoes' | 'bags' | 'general' | string;
  color?: string;
  size?: number | string;
  quantity: number;
  purchaseCost: number;
  sellPrice: number;
  wholesalePrice?: number;
  unit?: string;
  minStockAlert?: number;
  colorLetter?: string; // حرف اللون اللاتيني للكود (من الإعدادات)
}

export interface CreatePurchaseInput {
  supplierId?: string;
  supplierName?: string;
  paymentSource: WalletId | 'pocket'; // الدفع من خزينة معينة أو من الجيب الشخصي
  paidAmount: number;
  notes?: string;
  items: CreatePurchaseItemInput[];
}

export interface CreatePurchaseResult {
  purchaseId: string;
  purchaseNumber: string;
  modelNo: number;
  itemIds: string[];
  codes: string[]; // الأكواد الفعلية المحفوظة (نفس ترتيب البنود) وتُستخدم للطباعة
}

/**
 * حساب رقم الموديل التالي تلقائياً
 */
export async function getNextModelNumber(): Promise<number> {
  try {
    const purchasesRef = currentFirestoreAdapter.collection(db, 'purchases');
    const q = query(purchasesRef, orderBy('modelNo', 'desc'), limit(1));
    const snapshot = await currentFirestoreAdapter.getDocs(q);

    if (!snapshot.empty) {
      const topData = snapshot.docs[0].data();
      const current = typeof topData.modelNo === 'number' ? topData.modelNo : 0;
      return current + 1;
    }
  } catch (err: any) {
    throw new Error('تعذر قراءة آخر رقم موديل، تأكد من الاتصال وأعد المحاولة');
  }
  return 1;
}

/**
 * دالة إنشاء فاتورة الشراء والأصناف التابعة لها:
 * - تحسب modelNo تلقائياً.
 * - تستخدم getCairoDate للتاريخ، وتستخرج dayKey و monthKey منه مرة واحدة.
 * - تولد الأكواد بـ makeCode وتحسب حقل search بـ normalizeAr.
 * - تنشئ سجل Purchase وسجلات Item داخل writeBatch واحد.
 * - لو الدفع من خزينة، تستخدم increment بالسالب في مستند stats/wallets.
 * - لو الدفع من الجيب (pocket)، تنشئ Transaction (نوع capital_in).
 * - خالية تماماً من runTransaction ومن serverTimestamp.
 */
export async function createPurchase(input: CreatePurchaseInput): Promise<CreatePurchaseResult> {
  await requireServerReachable();
  // توحيد المفاتيح: 'instapay' يعني خزينة 'bank' (نفس مفتاح المبيعات)
  const paySrc = (input.paymentSource as string) === 'instapay' ? 'bank' : input.paymentSource;
  const modelNo = await getNextModelNumber();

  // الحصول على التاريخ بصيغة UTC ISO واستخراج المفاتيح
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);
  const monthKey = getMonthKey(cairoDateIso);
  const nowTimestamp = Date.now();

  const batch = newBatch();

  // إعداد مستند فاتورة الشراء الجديد
  const purchaseRef = doc(collection(db, 'purchases'));
  const purchaseId = purchaseRef.id;
  const purchaseNumber = `PUR-${nowTimestamp.toString().slice(-6)}`;

  let subtotal = 0;
  const createdItemIds: string[] = [];
  const createdCodes: string[] = [];
  const usedCodes = new Set<string>();
  const purchaseItemsData = [];

  if (!input.items || input.items.length === 0) {
    throw new Error('يجب إضافة بند واحد على الأقل في فاتورة الشراء');
  }

  // التحقق من صحة الكميات وأسعار الشراء: رفض الكميات الصفرية والسالبة
  for (let i = 0; i < input.items.length; i++) {
    const raw = input.items[i];
    if (typeof raw.quantity !== 'number' || isNaN(raw.quantity) || raw.quantity <= 0) {
      throw new Error(`الكمية في السطر ${i + 1} (${raw.name || 'غير محدد'}) يجب أن تكون أكبر من صفر`);
    }
    if (typeof raw.purchaseCost !== 'number' || isNaN(raw.purchaseCost) || raw.purchaseCost < 0) {
      throw new Error(`سعر الشراء في السطر ${i + 1} لا يمكن أن يكون سالباً`);
    }
    if (typeof raw.sellPrice !== 'number' || isNaN(raw.sellPrice) || raw.sellPrice < 0) {
      throw new Error(`سعر البيع في السطر ${i + 1} لا يمكن أن يكون سالباً`);
    }
  }

  for (let i = 0; i < input.items.length; i++) {
    const rawItem = input.items[i];
    const qty = rawItem.quantity;
    const cost = round2(rawItem.purchaseCost);
    const lineTotal = round2(qty * cost);
    subtotal = round2(subtotal + lineTotal);

    // توليد الكود وفق التصنيف
    let code = makeCode(rawItem.category, {
      modelNumber: modelNo,
      color: rawItem.color,
      colorLetter: rawItem.colorLetter,
      size: rawItem.size,
      seq: i + 1,
    });
    // منع تكرار الكود داخل نفس الفاتورة (نفس اللون/المقاس مكرر)
    if (usedCodes.has(code)) {
      let n = 2;
      while (usedCodes.has(`${code}-${n}`)) n++;
      code = `${code}-${n}`;
    }
    usedCodes.add(code);
    createdCodes.push(code);

    // توليد حقل البحث الموحد
    const searchTokens = [
      code,
      rawItem.name,
      rawItem.color || '',
      String(rawItem.size || ''),
      rawItem.category,
      input.supplierName || '',
    ]
      .filter(Boolean)
      .map((token) => normalizeAr(token))
      .join(' ');

    const itemRef = doc(collection(db, 'items'));
    const itemId = itemRef.id;
    createdItemIds.push(itemId);

    const itemDoc = {
      id: itemId,
      barcode: code,
      code,
      modelNo,
      name: rawItem.name,
      category: rawItem.category,
      categoryId: rawItem.category,
      color: rawItem.color || '',
      size: rawItem.size || '',
      costPrice: cost,
      sellPrice: round2(rawItem.sellPrice),
      wholesalePrice: rawItem.wholesalePrice ? round2(rawItem.wholesalePrice) : round2(rawItem.sellPrice),
      currentStock: qty,
      initialQty: qty,
      minStockAlert: rawItem.minStockAlert ?? 5,
      unit: rawItem.unit || 'قطعة',
      search: searchTokens,
      purchaseId,
      supplierId: input.supplierId || '',
      supplierName: input.supplierName || '',
      isActive: true,
      dayKey,
      monthKey,
      createdAtIso: cairoDateIso,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    };

    batch.set(itemRef, itemDoc);

    purchaseItemsData.push({
      itemId,
      code,
      name: rawItem.name,
      color: rawItem.color || '',
      size: rawItem.size || '',
      quantity: qty,
      purchaseCost: cost,
      total: lineTotal,
    });
  }

  const paidAmount = round2(input.paidAmount);
  const remainingAmount = round2(Math.max(0, subtotal - paidAmount));

  // سجل فاتورة الشراء
  const purchaseDoc = {
    id: purchaseId,
    purchaseNumber,
    modelNo,
    dateIso: cairoDateIso,
    dayKey,
    monthKey,
    supplierId: input.supplierId || '',
    supplierName: input.supplierName || '',
    items: purchaseItemsData,
    subtotal,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: subtotal,
    paidAmount,
    remainingAmount,
    paymentSource: paySrc,
    notes: input.notes || '',
    status: 'received',
    createdAt: nowTimestamp,
  };

  batch.set(purchaseRef, purchaseDoc);

  // معالجة الدفع: خزينة أم جيب شخصي
  if (paidAmount > 0) {
    if (paySrc === 'pocket') {
      // دفع من الجيب الشخصي: ينشئ Transaction (نوع capital_in / تمويل رأسمالي شخصي)
      const txRef = doc(collection(db, 'transactions'));
      const txDoc = {
        id: txRef.id,
        dateIso: cairoDateIso,
        dayKey,
        monthKey,
        type: 'capital_in',
        amount: paidAmount,
        walletId: 'pocket',
        description: `تمويل مشتريات من الجيب الشخصي (فاتورة ${purchaseNumber} - موديل ${modelNo})`,
        partyId: input.supplierId || '',
        partyName: input.supplierName || '',
        referenceNumber: purchaseNumber,
        createdAt: nowTimestamp,
      };
      batch.set(txRef, txDoc);
    } else {
      // دفع من خزينة: استخدام increment بالسالب في مستند stats/wallets
      const walletsStatsRef = doc(db, 'stats', 'wallets');
      const walletKey = `balances.${paySrc}`;
      batch.set(
        walletsStatsRef,
        {
          [walletKey]: increment(-paidAmount),
          lastUpdated: nowTimestamp,
        },
        { merge: true }
      );

      // تسجيل حركة الصرف في المعاملات المالية
      const txRef = doc(collection(db, 'transactions'));
      const txDoc = {
        id: txRef.id,
        dateIso: cairoDateIso,
        dayKey,
        monthKey,
        type: 'purchase_payment',
        amount: paidAmount,
        walletId: paySrc,
        description: `سداد مشتريات (فاتورة ${purchaseNumber} - موديل ${modelNo})`,
        partyId: input.supplierId || '',
        partyName: input.supplierName || '',
        referenceNumber: purchaseNumber,
        createdAt: nowTimestamp,
      };
      batch.set(txRef, txDoc);
    }
  }

  // تنفيذ الباتش دفعة واحدة
  await commitWithAck(batch);

  return {
    purchaseId,
    purchaseNumber,
    modelNo,
    itemIds: createdItemIds,
    codes: createdCodes,
  };
}

export interface UpdateItemDetailsInput {
  name?: string;
  color?: string;
  size?: number | string;
  sellPrice?: number;
  minStockAlert?: number;
}

/**
 * تعديل بيانات الصنف المسموح بتعديلها فقط (الوصف، اللون، المقاس، سعر البيع، حد التنبيه)
 * ممنوع تعديل سعر الشراء أو الكود للحفاظ على سلامة الحسابات والأرشفة
 */
export async function updateItemDetails(
  id: string,
  updates: UpdateItemDetailsInput
): Promise<void> {
  await requireServerReachable();
  const itemRef = doc(db, 'items', id);
  const itemSnap = await getDoc(itemRef);

  if (!itemSnap.exists()) {
    throw new Error('الصنف غير موجود في قاعدة البيانات');
  }

  const currentData = itemSnap.data();
  const newName = updates.name !== undefined ? updates.name.trim() : currentData.name;
  const newColor = updates.color !== undefined ? updates.color.trim() : (currentData.color || '');
  const newSize = updates.size !== undefined ? updates.size : (currentData.size || '');
  const newSellPrice = updates.sellPrice !== undefined ? round2(updates.sellPrice) : currentData.sellPrice;
  const newMinStock = updates.minStockAlert !== undefined ? Number(updates.minStockAlert) : currentData.minStockAlert;

  // إعادة بناء حقل البحث الموحد
  const searchTokens = [
    currentData.code || currentData.barcode || '',
    newName,
    newColor,
    String(newSize),
    currentData.category || '',
    currentData.supplierName || '',
  ]
    .filter(Boolean)
    .map((token) => normalizeAr(token))
    .join(' ');

  const batch = newBatch();
  batch.update(itemRef, {
    name: newName,
    color: newColor,
    size: newSize,
    sellPrice: newSellPrice,
    minStockAlert: newMinStock,
    search: searchTokens,
    updatedAt: Date.now(),
  });

  await batch.commit();
}

/**
 * أرشفة الصنف (تحويله لغير نشط ومؤرشف)
 * يشترط أن تكون الكمية الحالية صفر تماماً (qty === 0)
 */
export async function archiveItem(id: string): Promise<void> {
  await requireServerReachable();
  const itemRef = doc(db, 'items', id);
  const itemSnap = await getDoc(itemRef);

  if (!itemSnap.exists()) {
    throw new Error('الصنف غير موجود');
  }

  const currentStock = itemSnap.data().currentStock ?? 0;
  if (currentStock !== 0) {
    throw new Error('لا يمكن أرشفة الصنف لوجود رصيد متاح في المخزن. يجب تصفير الكمية أولاً');
  }

  const batch = newBatch();
  batch.update(itemRef, {
    archived: true,
    isActive: false,
    updatedAt: Date.now(),
  });

  await batch.commit();
}

export interface AdjustStockResult {
  differenceQty: number;
  totalCostImpact: number;
}

/**
 * تسوية الجرد الفعلي للصنف:
 * - حساب الفرق بين المعدود والمسجل (counted - system)
 * - تحديث كمية الصنف في المخزن بـ increment
 * - إنشاء سجل StockAdjustment في نفس الـ writeBatch
 */
export async function adjustStock(
  itemId: string,
  countedQty: number,
  note: string = ''
): Promise<AdjustStockResult> {
  await requireServerReachable();
  const itemRef = doc(db, 'items', itemId);
  const itemSnap = await getDoc(itemRef);

  if (!itemSnap.exists()) {
    throw new Error('الصنف غير موجود');
  }

  const itemData = itemSnap.data();
  const currentStock = Number(itemData.currentStock ?? 0);
  const costPrice = Number(itemData.costPrice ?? 0);

  const counted = Math.max(0, Number(countedQty));
  const differenceQty = round2(counted - currentStock);
  const totalCostImpact = round2(differenceQty * costPrice);

  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);
  const monthKey = getMonthKey(cairoDateIso);
  const now = Date.now();

  const batch = newBatch();

  // تحديث كمية الصنف باستخدام increment بالفرق
  batch.update(itemRef, {
    currentStock: increment(differenceQty),
    updatedAt: now,
  });

  // إنشاء سجل تسوية الجرد
  const adjRef = doc(collection(db, 'stock_adjustments'));
  const adjType = differenceQty >= 0 ? 'settlement_plus' : 'settlement_minus';

  const adjDoc = {
    id: adjRef.id,
    adjustmentNumber: `ADJ-${now.toString().slice(-6)}`,
    dateIso: cairoDateIso,
    dayKey,
    monthKey,
    type: adjType,
    itemId,
    itemName: itemData.name || '',
    code: itemData.code || itemData.barcode || '',
    oldStock: currentStock,
    adjustedStock: counted,
    differenceQty,
    unitCost: costPrice,
    totalCostImpact,
    reason: note.trim() || 'تسوية جرد دورية',
    createdAt: now,
  };

  batch.set(adjRef, adjDoc);

  await batch.commit();

  return {
    differenceQty,
    totalCostImpact,
  };
}

export interface CreateInvoiceItemInput {
  itemId: string;
  code?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  discount?: number;
}

export interface WalletPaymentSplit {
  cash?: number;
  instapay?: number;
  wallet?: number;
}

export interface CreateInvoiceInput {
  invoiceId?: string;
  items: CreateInvoiceItemInput[];
  overallDiscount?: number;
  taxRate?: number;
  payments: WalletPaymentSplit;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  allowNegativeStock?: boolean;
}

export interface CreateInvoiceResult {
  /** true = حُفظت محلياً وستُرفع عند عودة الاتصال */
  queued?: boolean;
  invoiceId: string;
  invoiceNumber: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
}

/**
 * توليد معرّف فريد وثابت للفاتورة يُربط بالسلة لمنع تكرار الحفظ
 */
export function generateInvoiceId(): string {
  return currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'invoices')).id;
}

/**
 * توليد معرّف فريد وثابت للحركة المالية لمنع التكرار
 */
export function generateTransactionId(): string {
  return currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'transactions')).id;
}

/**
 * توليد معرّف فريد وثابت لمستند المرتجع لمنع التكرار
 */
export function generateReturnId(): string {
  return currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'returns')).id;
}

/**
 * حساب رقم الفاتورة التالي بناءً على بادئة الجهاز وعدد الفواتير
 */
async function getNextInvoiceNumber(): Promise<string> {
  const prefix = getDevicePrefix();
  try {
    const invRef = collection(db, 'invoices');
    const q = query(invRef, orderBy('createdAt', 'desc'), limit(1));
    const snap = await currentFirestoreAdapter.getDocs(q);

    let nextSeq = 1;
    if (!snap.empty) {
      const topData = snap.docs[0].data();
      if (typeof topData.seqNumber === 'number') {
        nextSeq = topData.seqNumber + 1;
      } else if (topData.invoiceNumber) {
        const parts = String(topData.invoiceNumber).split('-');
        const parsed = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }
    return `${prefix}-${String(nextSeq).padStart(4, '0')}`;
  } catch (err) {
    console.warn('Error reading next invoice number, generating timestamp fallback:', err);
    return `${prefix}-${Date.now().toString().slice(-4)}`;
  }
}

/**
 * دالة إنشاء فاتورة بيع جديدة:
 * - توليد رقم فاتورة تسلسلي (A-0001)
 * - حساب الإجماليات باستخدام calculateInvoiceTotals
 * - حفظ مستند Invoice جديد
 * - خصم الكميات من items بـ increment بالسالب
 * - زيادة أرصدة الخزائن في stats/wallets
 * - إذا كان هناك آجل (credit > 0)، فحص العميل برقم الهاتف وإنشاؤه إن لم يوجد، وزيادة رصيده
 * - استخدام writeBatch واحد بدون runTransaction وبدون serverTimestamp
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  if (!input.items || input.items.length === 0) {
    throw new Error('لا يمكن حفظ فاتورة بيع فارغة');
  }

  // التحقق من المدفوعات والخصومات: منع القيم السالبة
  if (input.payments) {
    if (typeof input.payments.cash === 'number' && input.payments.cash < 0) {
      throw new Error('مبلغ الدفع نقداً لا يمكن أن يكون سالباً');
    }
    if (typeof input.payments.instapay === 'number' && input.payments.instapay < 0) {
      throw new Error('مبلغ الدفع عبر إنستاباي لا يمكن أن يكون سالباً');
    }
    if (typeof input.payments.wallet === 'number' && input.payments.wallet < 0) {
      throw new Error('مبلغ الدفع عبر المحفظة لا يمكن أن يكون سالباً');
    }
  }

  if (typeof input.overallDiscount === 'number' && input.overallDiscount < 0) {
    throw new Error('الخصم الإجمالي لا يمكن أن يكون سالباً');
  }

  // التحقق من صحة الكميات والأسعار قبل أي عملية: رفض الكميات الصفرية والسالبة
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    if (typeof it.quantity !== 'number' || isNaN(it.quantity) || it.quantity <= 0) {
      throw new Error(`الكمية في البند ${i + 1} (${it.name || 'غير محدد'}) يجب أن تكون أكبر من صفر`);
    }
    if (typeof it.unitPrice !== 'number' || isNaN(it.unitPrice) || it.unitPrice < 0) {
      throw new Error(`سعر الوحدة في البند ${i + 1} لا يمكن أن يكون سالباً`);
    }
    if (typeof it.discount === 'number' && it.discount < 0) {
      throw new Error(`خصم البند ${i + 1} (${it.name || 'غير محدد'}) لا يمكن أن يكون سالباً`);
    }
    const lineGross = it.unitPrice * it.quantity;
    if (typeof it.discount === 'number' && it.discount > lineGross + 0.0001) {
      throw new Error(`خصم البند ${i + 1} (${it.name || 'غير محدد'}) لا يمكن أن يتجاوز إجمالي البند`);
    }
  }

  // حساب المدفوع عبر المحافظ المختلفة
  const cashPaid = round2(input.payments.cash || 0);
  const instapayPaid = round2(input.payments.instapay || 0);
  const walletPaid = round2(input.payments.wallet || 0);
  const totalPaid = round2(cashPaid + instapayPaid + walletPaid);

  // إعداد بنود الفاتورة وحساب الإجماليات
  const formattedItems = input.items.map((it) => {
    const qty = it.quantity;
    const unitPrice = round2(it.unitPrice);
    const discount = round2(it.discount || 0);
    const lineTotal = round2((unitPrice * qty) - discount);

    return {
      itemId: it.itemId,
      code: it.code || '',
      name: it.name,
      quantity: qty,
      unitPrice,
      costPrice: round2(it.costPrice || 0),
      discount,
      total: lineTotal,
    };
  });

  const totals = calculateInvoiceTotals({
    items: formattedItems as any,
    overallDiscount: input.overallDiscount || 0,
    taxRate: input.taxRate || 0,
    paidAmount: totalPaid,
  });

  // الباقي للعميل: لا يدخل الخزينة. يُخصم من النقدي فقط.
  const changeDue = round2(Math.max(0, totalPaid - totals.grandTotal));
  if (changeDue > cashPaid + 0.001) {
    throw new Error('المدفوع أكبر من الفاتورة، ولا يمكن رد الزيادة إلا من النقدي. عدّل المبالغ.');
  }
  const cashKept = round2(cashPaid - changeDue);
  const paidAmountReal = round2(totalPaid - changeDue);

  // توزيع الخصم الإجمالي والضريبة على البنود (لتصحيح المرتجعات لاحقاً)
  const finalItems = allocateInvoiceLines(formattedItems, input.overallDiscount || 0, input.taxRate || 0, totals.taxTotal);

  // التحقق من الاسم في حال وجود آجل
  if (totals.remainingAmount > 0.01) {
    if (!input.customerName || !input.customerName.trim()) {
      throw new Error('اسم العميل إلزامي عند وجود مبلغ آجل أو متبقٍ');
    }
  }

  // تحديد معرّف الفاتورة الثابت للسلة
  const targetInvoiceId = input.invoiceId || doc(collection(db, 'invoices')).id;

  // فحص الكاش المحلي أولاً بـ getDocFromCache داخل try/catch لمنع التكرار في حال إعادة المحاولة
  // الفحص يتم قبل إنشاء الـ batch وقبل أي increment وقبل إنشاء عميل جديد
  try {
    const cachedRef = doc(db, 'invoices', targetInvoiceId);
    const cachedSnap = await currentFirestoreAdapter.getDocFromCache(cachedRef);
    if (cachedSnap && cachedSnap.exists()) {
      const cachedData = cachedSnap.data() as any;
      return {
        queued: true,
        invoiceId: targetInvoiceId,
        invoiceNumber: cachedData.invoiceNumber || '',
        grandTotal: Number(cachedData.grandTotal || 0),
        paidAmount: Number(cachedData.paidAmount || 0),
        remainingAmount: Number(cachedData.remainingAmount || 0),
      };
    }
  } catch {
    // لم توجد الوثيقة في الكاش أو حدث خطأ، نكمل طبيعياً
  }

  const invoiceNumber = await getNextInvoiceNumber();
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);
  const monthKey = getMonthKey(cairoDateIso);
  const now = Date.now();

  const batch = newBatch();

  // معالجة حساب العميل (ربط الفواتير النقدية والآجلة بملف العميل)
  let customerId = '';
  let customerName = input.customerName?.trim() || '';
  const customerPhone = normalizePhone(input.customerPhone);

  if (customerPhone) {
    // البحث عن العميل برقم الهاتف
    try {
      const custRef = collection(db, 'customers');
      const q = query(custRef, where('phone', '==', customerPhone), limit(1));
      const custSnap = await currentFirestoreAdapter.getDocs(q);

      if (!custSnap.empty) {
        const docSnap = custSnap.docs[0];
        customerId = docSnap.id;
        customerName = docSnap.data().name || customerName;

        // زيادة رصيد العميل فقط في حال وجود آجل
        if (totals.remainingAmount > 0.01) {
          batch.update(doc(db, 'customers', customerId), {
            currentBalance: increment(totals.remainingAmount),
            updatedAt: now,
          });
        }
      }
    } catch (err) {
      console.warn('Could not query customer by phone:', err);
    }
  }

  // إذا لم يتم العثور على العميل وكان هناك متبقي آجل، ننشئ عميلاً جديداً
  if (!customerId && totals.remainingAmount > 0.01) {
    const newCustRef = doc(collection(db, 'customers'));
    customerId = newCustRef.id;

    batch.set(newCustRef, {
      id: customerId,
      name: customerName,
      phone: customerPhone,
      currentBalance: totals.remainingAmount,
      createdAt: now,
      updatedAt: now,
    });
  }

  // تجميع الكميات المطلوبة لكل صنف فريد لضمان سلامة الحسابات وتحديث المخزون
  const stockDeltas = new Map<string, number>();
  for (const it of finalItems) {
    if (it.itemId) {
      stockDeltas.set(it.itemId, (stockDeltas.get(it.itemId) || 0) + it.quantity);
    }
  }

  // التحقق من كفاية المخزون إذا لم يكن البيع بالسالب مسموحاً به
  if (!input.allowNegativeStock) {
    for (const [itemId, totalQty] of stockDeltas.entries()) {
      const itemDocRef = doc(db, 'items', itemId);
      const itemSnap = await currentFirestoreAdapter.getDoc(itemDocRef);
      if (itemSnap.exists()) {
        const avail = Number(itemSnap.data()?.currentStock ?? 0);
        if (avail < totalQty) {
          const itName = finalItems.find((x) => x.itemId === itemId)?.name || itemId;
          throw new Error(`الرصيد المتاح من (${itName}) هو ${avail} فقط، والكمية المطلوبة ${totalQty}`);
        }
      }
    }
  }

  // مستند الفاتورة
  const invoiceRef = doc(db, 'invoices', targetInvoiceId);
  const invoiceId = targetInvoiceId;

  const invoiceDoc = {
    id: invoiceId,
    invoiceNumber,
    dateIso: cairoDateIso,
    dayKey,
    monthKey,
    items: finalItems,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
    paidAmount: paidAmountReal,
    remainingAmount: totals.remainingAmount,
    initialRemaining: totals.remainingAmount,
    changeDue,
    payments: {
      cash: cashKept,
      instapay: instapayPaid,
      wallet: walletPaid,
    },
    customerId,
    customerName,
    customerPhone,
    notes: input.notes || '',
    status: 'completed',
    createdAt: now,
  };

  batch.set(invoiceRef, invoiceDoc);

  // خصم الكميات المجمعة من المخزون بـ increment بالسالب (مرة واحدة لكل صنف فريد)
  for (const [itemId, totalQty] of stockDeltas.entries()) {
    const itemDocRef = doc(db, 'items', itemId);
    batch.update(itemDocRef, {
      currentStock: increment(-totalQty),
      updatedAt: now,
    });
  }

  // زيادة أرصدة الخزائن في stats/wallets
  const walletUpdates: Record<string, any> = { lastUpdated: now };
  if (cashKept > 0) {
    walletUpdates['balances.cash'] = increment(cashKept);
  }
  if (instapayPaid > 0) {
    walletUpdates['balances.bank'] = increment(instapayPaid);
  }
  if (walletPaid > 0) {
    walletUpdates['balances.wallet'] = increment(walletPaid);
  }

  if (cashKept > 0 || instapayPaid > 0 || walletPaid > 0) {
    const walletsStatsRef = doc(db, 'stats', 'wallets');
    batch.set(walletsStatsRef, walletUpdates, { merge: true });
  }

  const queued = await commitOrQueue(batch, invoiceNumber);

  return {
    queued,
    invoiceId,
    invoiceNumber,
    grandTotal: totals.grandTotal,
    paidAmount: paidAmountReal,
    remainingAmount: totals.remainingAmount,
  };
}

export interface ReturnLineInput {
  itemId: string;
  quantity: number;
  lineIndex?: number;
}

export interface CreateReturnResult {
  returnDocId: string;
  totalReturnValue: number;
  appliedToDebt: number;
  cashRefundAmount: number;
}

// أقفال متسلسلة لكل فاتورة لمنع القراءة المتقادمة والتسابق عند تزامن طلبات المرتجع
const invoiceReturnLocks = new Map<string, Promise<unknown>>();

// ذاكرة للمرتجعات الجارية والمتكررة لمنع الازدواجية عند إعادة الإرسال بعد نتيجة غير مؤكدة
const inFlightReturns = new Map<string, Promise<CreateReturnResult>>();
const recentCompletedReturns = new Map<string, { result: CreateReturnResult; timestamp: number }>();
const inFlightCollections = new Map<string, Promise<CollectPaymentResult>>();
const inFlightTransactions = new Map<string, Promise<CreateTransactionResult>>();

/**
 * تسجيل مرتجع على فاتورة بيع:
 * - استخدام calculateReturn لحساب unitNet وقيمة المرتجع بالمليم بدقة
 * - دعم الأصناف المكررة في أكثر من سطر بالفاتورة باستهلاكها تسلسلياً أو برقم السطر
 * - تجميع تحديثات المخزون لكل صنف فريد
 * - إنشاء مستند ReturnDoc (النوع 'return')
 * - زيادة كميات الأصناف المرتجعة في المخزن (increment)
 * - خصم appliedToDebt من دين الفاتورة ومن رصيد العميل
 * - خصم cashRefundAmount من الخزينة المختارة
 * - حماية تسلسلية تمنع القراءة المتقادمة عند تزامن طلبات المرتجع لنفس الفاتورة
 * - حماية من تكرار المرتجع عند إعادة الإرسال بعد نتيجة غير مؤكدة عبر idempotencyKey والتفادي التلقائي
 */
export async function createReturn(
  invoiceId: string,
  returnLines: ReturnLineInput[],
  refundWallet: WalletId = 'cash',
  idempotencyKey?: string
): Promise<CreateReturnResult> {
  const cleanKey = idempotencyKey?.trim();

  // فحص الكاش لمنع التكرار في حال إعادة إرسال نفس المعرف
  if (cleanKey) {
    try {
      const returnCheckRef = currentFirestoreAdapter.doc(db, 'returns', cleanKey);
      const cachedSnap = await currentFirestoreAdapter.getDocFromCache(returnCheckRef);
      if (cachedSnap && cachedSnap.exists()) {
        const data = cachedSnap.data() as any;
        return {
          returnDocId: cachedSnap.id,
          totalReturnValue: Number(data.totalRefund) || 0,
          appliedToDebt: Number(data.appliedToDebt) || 0,
          cashRefundAmount: Number(data.cashRefundAmount) || 0,
        };
      }
    } catch {
      // ليس في الكاش، نكمل
    }
  }

  await requireServerReachable();
  const requestSignature = `${invoiceId}:${refundWallet}:${cleanKey || JSON.stringify(
    returnLines.map((l) => ({ id: l.itemId, q: l.quantity, idx: l.lineIndex }))
  )}`;

  // 1. إذا كان نفس الطلب بالضبط قيد التنفيذ حالياً، نربطه بنفس الوعد لمنع الازدواجية
  const existingInFlight = inFlightReturns.get(requestSignature);
  if (existingInFlight) {
    return existingInFlight;
  }

  // 2. إذا لم يُمرر idempotencyKey وكان نفس الطلب قد اكتمل بنجاح للتو (خلال 10 ثوانٍ)، نرجع النتيجة السابقة
  if (!cleanKey) {
    const recent = recentCompletedReturns.get(requestSignature);
    if (recent && Date.now() - recent.timestamp < 10000) {
      return recent.result;
    }
  }

  // 3. تسلسل تنفيذ المرتجعات لنفس الفاتورة لمنع القراءة المتقادمة (Stale Read)
  const prevLock = invoiceReturnLocks.get(invoiceId) || Promise.resolve();
  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  invoiceReturnLocks.set(invoiceId, currentLock);

  const executionPromise = (async () => {
    // ننتظر انتهاء أي عملية مرتجع سابقة على نفس الفاتورة
    await prevLock.catch(() => {});
    return await doCreateReturn(invoiceId, returnLines, refundWallet, cleanKey);
  })();

  inFlightReturns.set(requestSignature, executionPromise);

  try {
    const result = await executionPromise;
    recentCompletedReturns.set(requestSignature, { result, timestamp: Date.now() });
    if (recentCompletedReturns.size > 50) {
      const threshold = Date.now() - 30000;
      for (const [k, v] of recentCompletedReturns.entries()) {
        if (v.timestamp < threshold) recentCompletedReturns.delete(k);
      }
    }
    return result;
  } finally {
    inFlightReturns.delete(requestSignature);
    releaseLock!();
    if (invoiceReturnLocks.get(invoiceId) === currentLock) {
      invoiceReturnLocks.delete(invoiceId);
    }
  }
}

async function doCreateReturn(
  invoiceId: string,
  returnLines: ReturnLineInput[],
  refundWallet: WalletId = 'cash',
  cleanKey?: string
): Promise<CreateReturnResult> {
  // التحقق من مفتاح عدم التكرار (Idempotency Key) في الكاش أو قاعدة البيانات
  if (cleanKey) {
    try {
      const returnCheckRef = currentFirestoreAdapter.doc(db, 'returns', cleanKey);
      const returnCheckSnap = await currentFirestoreAdapter.getDocFromCache(returnCheckRef);
      if (returnCheckSnap && returnCheckSnap.exists()) {
        const data = returnCheckSnap.data() as any;
        return {
          returnDocId: returnCheckSnap.id,
          totalReturnValue: Number(data.totalRefund) || 0,
          appliedToDebt: Number(data.appliedToDebt) || 0,
          cashRefundAmount: Number(data.cashRefundAmount) || 0,
        };
      }
    } catch {
      // ليس في الكاش، نحاول جلبه من السيرفر
      try {
        const returnCheckRef = currentFirestoreAdapter.doc(db, 'returns', cleanKey);
        const returnCheckSnap = await currentFirestoreAdapter.getDoc(returnCheckRef);
        if (returnCheckSnap && returnCheckSnap.exists()) {
          const data = returnCheckSnap.data() as any;
          return {
            returnDocId: returnCheckSnap.id,
            totalReturnValue: Number(data.totalRefund) || 0,
            appliedToDebt: Number(data.appliedToDebt) || 0,
            cashRefundAmount: Number(data.cashRefundAmount) || 0,
          };
        }
      } catch {}
    }
  }

  const invRef = currentFirestoreAdapter.doc(db, 'invoices', invoiceId);
  const invSnap = await currentFirestoreAdapter.getDoc(invRef);

  if (!invSnap.exists()) {
    throw new Error('الفاتورة غير موجودة');
  }

  const invData = invSnap.data();
  if (invData.status === 'cancelled') {
    throw new Error('لا يمكن عمل مرتجع على فاتورة ملغاة');
  }

  const now = Date.now();
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);
  const monthKey = getMonthKey(cairoDateIso);

  let totalReturnValue = 0;
  const processedReturnItems: any[] = [];
  const updatedInvoiceItems = [...(invData.items || [])];
  const sumItemTotals = updatedInvoiceItems.reduce(
    (sum: number, it: any) => sum + (Number(it.total) || Number(it.unitPrice) * Number(it.quantity) || 0),
    0
  );
  const legacyFactor = sumItemTotals > 0 ? (Number(invData.grandTotal) || sumItemTotals) / sumItemTotals : 1;

  for (const rLine of returnLines) {
    if (rLine.quantity <= 0) continue;

    let qtyToReturn = rLine.quantity;

    // العثور على الأسطر المطابقة لهذا الصنف
    let candidateIndices: number[] = [];
    if (rLine.lineIndex !== undefined && updatedInvoiceItems[rLine.lineIndex]?.itemId === rLine.itemId) {
      candidateIndices = [rLine.lineIndex];
    } else {
      candidateIndices = updatedInvoiceItems
        .map((it, idx) => (it.itemId === rLine.itemId ? idx : -1))
        .filter((idx) => idx !== -1);
    }

    if (candidateIndices.length === 0) {
      throw new Error(`الصنف ${rLine.itemId} غير موجود في بنود الفاتورة`);
    }

    const totalAvailable = candidateIndices.reduce((sum, idx) => {
      const it = updatedInvoiceItems[idx];
      return sum + Math.max(0, (Number(it.quantity) || 0) - (Number(it.returnedQty) || 0));
    }, 0);

    if (qtyToReturn > totalAvailable) {
      const itName = updatedInvoiceItems[candidateIndices[0]]?.name || rLine.itemId;
      throw new Error(`الكمية المرتجعة للصنف (${itName}) تتجاوز المتاح للإرجاع (${totalAvailable})`);
    }

    for (const idx of candidateIndices) {
      if (qtyToReturn <= 0) break;
      const item = updatedInvoiceItems[idx];
      const soldQty = Number(item.quantity) || 0;
      const returnedSoFar = Number(item.returnedQty) || 0;
      const returnable = Math.max(0, soldQty - returnedSoFar);
      if (returnable <= 0) continue;

      const takeQty = Math.min(returnable, qtyToReturn);
      const lineNet =
        item.lineGrand !== undefined && item.lineGrand !== null
          ? Number(item.lineGrand)
          : round2(((Number(item.total) || Number(item.unitPrice) * soldQty)) * legacyFactor);
      const returnedAmountSoFar = Number(item.returnedAmount) || 0;
      const { unitNet, refundAmount } = calculateLineReturn(lineNet, soldQty, takeQty, returnedSoFar, returnedAmountSoFar);

      totalReturnValue = round2(totalReturnValue + refundAmount);

      processedReturnItems.push({
        itemId: item.itemId,
        code: item.code || '',
        name: item.name,
        quantity: takeQty,
        unitNet,
        refundAmount,
        costPrice: Number(item.costPrice) || 0,
      });

      updatedInvoiceItems[idx] = {
        ...item,
        returnedQty: returnedSoFar + takeQty,
        returnedAmount: round2(returnedAmountSoFar + refundAmount),
      };

      qtyToReturn -= takeQty;
    }
  }

  if (processedReturnItems.length === 0 || totalReturnValue <= 0) {
    throw new Error('يرجى تحديد كميات مرتجعة صالحة أكبر من صفر');
  }

  // توزيع المرتجع: تسديد الدين الآجل أولاً ثم رد الباقي كاش
  const currentDebt = round2(Number(invData.remainingAmount) || 0);
  const appliedToDebt = round2(Math.min(currentDebt, totalReturnValue));
  const cashRefundAmount = round2(totalReturnValue - appliedToDebt);
  const newRemainingDebt = round2(currentDebt - appliedToDebt);

  const batch = newBatch();

  // 1. إنشاء مستند ReturnDoc
  const returnRef = cleanKey
    ? currentFirestoreAdapter.doc(db, 'returns', cleanKey)
    : currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'returns'));
  const returnDocId = returnRef.id;

  const returnDoc = {
    id: returnDocId,
    idempotencyKey: cleanKey || undefined,
    returnNumber: `RET-${now.toString().slice(-6)}`,
    invoiceId,
    invoiceNumber: invData.invoiceNumber,
    type: 'return',
    dateIso: cairoDateIso,
    dayKey,
    monthKey,
    customerId: invData.customerId || '',
    customerName: invData.customerName || '',
    items: processedReturnItems,
    totalRefund: totalReturnValue,
    appliedToDebt,
    cashRefundAmount,
    refundWalletId: refundWallet,
    createdAt: now,
  };

  batch.set(returnRef, returnDoc);

  // 2. تحديث الفاتورة (قائمة البنود والمتبقي الآجل)
  batch.update(invRef, {
    items: updatedInvoiceItems,
    remainingAmount: newRemainingDebt,
    updatedAt: now,
  });

  // 3. إعادة الكميات للمخزون (مجمعة لكل صنف فريد)
  const returnStockDeltas = new Map<string, number>();
  for (const rItem of processedReturnItems) {
    if (rItem.itemId) {
      returnStockDeltas.set(rItem.itemId, (returnStockDeltas.get(rItem.itemId) || 0) + rItem.quantity);
    }
  }
  for (const [itemId, qty] of returnStockDeltas.entries()) {
    const itemDocRef = currentFirestoreAdapter.doc(db, 'items', itemId);
    batch.update(itemDocRef, {
      currentStock: increment(qty),
      updatedAt: now,
    });
  }

  // 4. خصم appliedToDebt من رصيد العميل إن وجد
  if (appliedToDebt > 0 && invData.customerId) {
    const customerRef = currentFirestoreAdapter.doc(db, 'customers', invData.customerId);
    batch.update(customerRef, {
      currentBalance: increment(-appliedToDebt),
      updatedAt: now,
    });
  }

  // 5. خصم المبلغ المسترد كاش من الخزينة المختارة
  if (cashRefundAmount > 0 && refundWallet) {
    const walletsStatsRef = currentFirestoreAdapter.doc(db, 'stats', 'wallets');
    batch.set(
      walletsStatsRef,
      {
        [`balances.${refundWallet}`]: increment(-cashRefundAmount),
        lastUpdated: now,
      },
      { merge: true }
    );

    // تسجيل حركة الصرف في المعاملات
    const txRef = currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'transactions'));
    batch.set(txRef, {
      id: txRef.id,
      dateIso: cairoDateIso,
      dayKey,
      monthKey,
      type: 'refund',
      amount: cashRefundAmount,
      walletId: refundWallet,
      description: `رد مرتجع فاتورة رقم ${invData.invoiceNumber}`,
      partyId: invData.customerId || '',
      partyName: invData.customerName || '',
      referenceNumber: invData.invoiceNumber,
      createdAt: now,
    });
  }

  await commitWithAck(batch);

  return {
    returnDocId,
    totalReturnValue,
    appliedToDebt,
    cashRefundAmount,
  };
}

/**
 * إلغاء فاتورة بيع بالكامل:
 * - تجلب الفاتورة وتحدد الكميات المتبقية غير المرتجعة لكل بند
 * - تنشئ مستند ReturnDoc (النوع 'cancel') لكل المتبقي
 * - تعكس تأثير الفاتورة بالكامل (إرجاع الكميات للمخزون، تصفية دين العميل، سحب المدفوعات من الخزائن)
 * - تحديث حالة الفاتورة إلى 'cancelled'
 */
export async function cancelInvoice(invoiceId: string): Promise<void> {
  await requireServerReachable();
  const invRef = doc(db, 'invoices', invoiceId);
  const invSnap = await getDoc(invRef);

  if (!invSnap.exists()) {
    throw new Error('الفاتورة غير موجودة');
  }

  const invData = invSnap.data();
  if (invData.status === 'cancelled') {
    throw new Error('الفاتورة ملغاة بالفعل');
  }

  // فاتورة عليها مرتجع لا تُلغى (تفادياً لرد المبلغ مرتين). المرتجع الأكبر يتم بمرتجع كامل.
  if ((invData.items || []).some((it: any) => (Number(it.returnedQty) || 0) > 0)) {
    throw new Error('لا يمكن إلغاء فاتورة عليها مرتجع. أرجع باقي البنود بمرتجع بدلاً من الإلغاء.');
  }

  const now = Date.now();
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);
  const monthKey = getMonthKey(cairoDateIso);

  const batch = newBatch();

  // حساب الكميات المتبقية التي لم يتم إرجاعها مسبقاً
  const remainingReturnItems: any[] = [];
  const cancelStockDeltas = new Map<string, number>();
  const items = invData.items || [];

  for (const it of items) {
    const soldQty = Number(it.quantity) || 0;
    const returnedSoFar = Number(it.returnedQty) || 0;
    const unreturnedQty = Math.max(0, soldQty - returnedSoFar);

    if (unreturnedQty > 0) {
      remainingReturnItems.push({
        itemId: it.itemId,
        code: it.code || '',
        name: it.name,
        quantity: unreturnedQty,
        unitPrice: Number(it.unitPrice) || 0,
        costPrice: Number(it.costPrice) || 0,
      });

      if (it.itemId) {
        cancelStockDeltas.set(it.itemId, (cancelStockDeltas.get(it.itemId) || 0) + unreturnedQty);
      }
    }
  }

  // إرجاع الكمية غير المرتجعة إلى المخزون (تحديث واحد لكل صنف فريد)
  for (const [itemId, qty] of cancelStockDeltas.entries()) {
    const itemDocRef = doc(db, 'items', itemId);
    batch.update(itemDocRef, {
      currentStock: increment(qty),
      updatedAt: now,
    });
  }

  // إنشاء مستند ReturnDoc بنوع cancel
  const cancelDocRef = doc(collection(db, 'returns'));
  batch.set(cancelDocRef, {
    id: cancelDocRef.id,
    returnNumber: `CAN-${now.toString().slice(-6)}`,
    invoiceId,
    invoiceNumber: invData.invoiceNumber,
    type: 'cancel',
    dateIso: cairoDateIso,
    dayKey,
    monthKey,
    customerId: invData.customerId || '',
    customerName: invData.customerName || '',
    items: remainingReturnItems,
    notes: 'إلغاء كامل للفاتورة',
    createdAt: now,
  });

  // تصفية دين العميل المرتبط بالمتبقي في هذه الفاتورة
  // نعكس الدين الأصلي وقت البيع. أي مبلغ حُصِّل بعده يتحول تلقائياً لرصيد دائن للعميل.
  const debtOnInvoice = round2(
    invData.initialRemaining !== undefined ? Number(invData.initialRemaining) || 0 : Number(invData.remainingAmount) || 0
  );
  if (debtOnInvoice > 0 && invData.customerId) {
    const customerRef = doc(db, 'customers', invData.customerId);
    batch.update(customerRef, {
      currentBalance: increment(-debtOnInvoice),
      updatedAt: now,
    });
  }

  // سحب المبالغ المدفوعة في الفاتورة من الخزائن ذات الصلة
  const payments = invData.payments || {};
  const cashPaid = round2(Number(payments.cash) || 0);
  const bankPaid = round2(Number(payments.instapay) || 0);
  const walletPaid = round2(Number(payments.wallet) || 0);

  const walletUpdates: Record<string, any> = { lastUpdated: now };
  if (cashPaid > 0) walletUpdates['balances.cash'] = increment(-cashPaid);
  if (bankPaid > 0) walletUpdates['balances.bank'] = increment(-bankPaid);
  if (walletPaid > 0) walletUpdates['balances.wallet'] = increment(-walletPaid);

  if (cashPaid > 0 || bankPaid > 0 || walletPaid > 0) {
    const walletsStatsRef = doc(db, 'stats', 'wallets');
    batch.set(walletsStatsRef, walletUpdates, { merge: true });

    // تسجيل حركة سحب بسبب الإلغاء، حركة لكل خزينة بمفتاحها الصحيح
    const perWallet: [string, number][] = [['cash', cashPaid], ['bank', bankPaid], ['wallet', walletPaid]];
    for (const [wId, amt] of perWallet) {
      if (amt <= 0) continue;
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id,
        dateIso: cairoDateIso,
        dayKey,
        monthKey,
        type: 'refund',
        amount: amt,
        walletId: wId,
        description: `استرداد مدفوعات بسبب إلغاء فاتورة رقم ${invData.invoiceNumber}`,
        partyId: invData.customerId || '',
        partyName: invData.customerName || '',
        referenceNumber: invData.invoiceNumber,
        createdAt: now,
      });
    }
  }

  // تحديث حالة الفاتورة إلى ملغاة وتصفية باقي دينها
  batch.update(invRef, {
    status: 'cancelled',
    remainingAmount: 0,
    cancelledAt: now,
    updatedAt: now,
  });

  await commitWithAck(batch);
}

export interface CollectPaymentResult {
  totalAllocated: number;
  unallocated: number;
  allocationsCount: number;
}

/**
 * تحصيل دفعة نقدية من حساب العميل:
 * - استخدام distributeCollection لتوزيع المبلغ على الفواتير المستحقة من الأقدم للأحدث
 * - إنشاء Transaction جديدة (نوع collection)
 * - خصم المبلغ من balance العميل
 * - تقليل debtRemaining للفواتير بناءً على التوزيع
 * - زيادة رصيد الخزينة المختارة في stats/wallets
 */
export async function collectPayment(
  customerId: string,
  amount: number,
  walletId: WalletId = 'cash',
  transactionId?: string
): Promise<CollectPaymentResult> {
  const cleanAmount = round2(amount);
  if (cleanAmount <= 0) {
    throw new Error('مبلغ التحصيل يجب أن يكون أكبر من صفر');
  }

  const targetTxId =
    transactionId ||
    currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'transactions')).id;

  // فحص الكاش لمنع التكرار في حال إعادة إرسال نفس المعرف
  try {
    const cachedRef = currentFirestoreAdapter.doc(db, 'transactions', targetTxId);
    const cachedSnap = await currentFirestoreAdapter.getDocFromCache(cachedRef);
    if (cachedSnap && cachedSnap.exists()) {
      const cachedData = cachedSnap.data() as any;
      return {
        totalAllocated: Number(
          cachedData.totalAllocated !== undefined ? cachedData.totalAllocated : cleanAmount
        ),
        unallocated: Number(cachedData.unallocated || 0),
        allocationsCount: Number(cachedData.allocationsCount || 0),
      };
    }
  } catch {
    // ليس في الكاش، نكمل طبيعياً
  }

  // منع التكرار في حال تزامن الضغط (Double click)
  const existingInFlight = inFlightCollections.get(targetTxId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const executionPromise = (async () => {
    await requireServerReachable();

    const custRef = currentFirestoreAdapter.doc(db, 'customers', customerId);
    const custSnap = await currentFirestoreAdapter.getDoc(custRef);

    if (!custSnap.exists()) {
      throw new Error('العميل غير موجود');
    }

    const custData = custSnap.data();

    // حماية إضافية: منع تحصيل أكبر من الدين الحالي للعميل
    const currentDebt = round2(Number(custData.currentBalance) || 0);
    if (cleanAmount > currentDebt + 0.01) {
      throw new Error('المبلغ أكبر من الدين');
    }

    // جلب فواتير العميل المستحقة
    const invRef = currentFirestoreAdapter.collection(db, 'invoices');
    const q = query(invRef, where('customerId', '==', customerId));
    const snap = await currentFirestoreAdapter.getDocs(q);

    const customerInvoices: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status !== 'cancelled' && (Number(data.remainingAmount) || 0) > 0) {
        customerInvoices.push({
          id: docSnap.id,
          invoiceNumber: data.invoiceNumber,
          date: data.createdAt || 0,
          remainingAmount: Number(data.remainingAmount) || 0,
          status: data.status,
        });
      }
    });

    // توزيع التحصيل على الفواتير
    const { allocations, totalAllocated, unallocated } = distributeCollection(
      customerInvoices,
      cleanAmount
    );

    const now = Date.now();
    const cairoDateIso = getCairoDate();
    const dayKey = getDayKey(cairoDateIso);
    const monthKey = getMonthKey(cairoDateIso);

    const batch = newBatch();

    // 1. تسجيل معاملة التحصيل بالمعرف الثابت
    const txRef = currentFirestoreAdapter.doc(db, 'transactions', targetTxId);
    batch.set(txRef, {
      id: targetTxId,
      dateIso: cairoDateIso,
      dayKey,
      monthKey,
      type: 'collection',
      amount: cleanAmount,
      walletId,
      description: `تحصيل دفعة حساب من العميل: ${custData.name}`,
      partyId: customerId,
      partyName: custData.name,
      totalAllocated,
      unallocated,
      allocationsCount: allocations.length,
      createdAt: now,
    });

    // 2. خصم المبلغ المسدد من رصيد العميل الحالي
    batch.update(custRef, {
      currentBalance: increment(-cleanAmount),
      updatedAt: now,
    });

    // 3. تقليل debtRemaining للفواتير الموزع عليها
    for (const alloc of allocations) {
      const invoiceDocRef = currentFirestoreAdapter.doc(db, 'invoices', alloc.invoiceId);
      batch.update(invoiceDocRef, {
        remainingAmount: increment(-alloc.allocatedAmount),
        updatedAt: now,
      });
    }

    // 4. زيادة رصيد الخزينة المختارة
    const walletsStatsRef = currentFirestoreAdapter.doc(db, 'stats', 'wallets');
    batch.set(
      walletsStatsRef,
      {
        [`balances.${walletId}`]: increment(cleanAmount),
        lastUpdated: now,
      },
      { merge: true }
    );

    await commitWithAck(batch);

    return {
      totalAllocated,
      unallocated,
      allocationsCount: allocations.length,
    };
  })();

  inFlightCollections.set(targetTxId, executionPromise);
  try {
    return await executionPromise;
  } finally {
    inFlightCollections.delete(targetTxId);
  }
}

/**
 * إعدام جزء أو كل دين العميل (ديون معدومة Bad Debt):
 * - استخدام distributeBadDebt لتوزيع المبلغ على الفواتير
 * - إنشاء Transaction جديدة (نوع bad_debt)
 * - خصم المبلغ من رصيد العميل وتقليل debtRemaining للفواتير
 * - لا تؤثر نهائياً على الخزائن
 */
export async function writeOffDebt(
  customerId: string,
  amount: number
): Promise<CollectPaymentResult> {
  await requireServerReachable();
  const cleanAmount = round2(amount);
  if (cleanAmount <= 0) {
    throw new Error('مبلغ الدين المعدوم يجب أن يكون أكبر من صفر');
  }

  const custRef = doc(db, 'customers', customerId);
  const custSnap = await getDoc(custRef);

  if (!custSnap.exists()) {
    throw new Error('العميل غير موجود');
  }

  const custData = custSnap.data();

  // لا يُعدم أكثر من دين العميل الفعلي (وإلا ينشأ رصيد دائن وهمي)
  const currentDebt = round2(Number(custData.currentBalance) || 0);
  if (cleanAmount > currentDebt + 0.01) {
    throw new Error(`المبلغ أكبر من دين العميل الحالي (${currentDebt})`);
  }

  // جلب فواتير العميل المستحقة
  const invRef = collection(db, 'invoices');
  const q = query(invRef, where('customerId', '==', customerId));
  const snap = await getDocs(q);

  const customerInvoices: any[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.status !== 'cancelled' && (Number(data.remainingAmount) || 0) > 0) {
      customerInvoices.push({
        id: docSnap.id,
        invoiceNumber: data.invoiceNumber,
        date: data.createdAt || 0,
        remainingAmount: Number(data.remainingAmount) || 0,
        status: data.status,
      });
    }
  });

  const { allocations, totalAllocated, unallocated } = distributeBadDebt(
    customerInvoices,
    cleanAmount
  );

  const now = Date.now();
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);
  const monthKey = getMonthKey(cairoDateIso);

  const batch = newBatch();

  // 1. تسجيل قيد الدين المعدوم
  const txRef = doc(collection(db, 'transactions'));
  batch.set(txRef, {
    id: txRef.id,
    dateIso: cairoDateIso,
    dayKey,
    monthKey,
    type: 'bad_debt',
    amount: cleanAmount,
    walletId: 'none',
    description: `إعدام دين للعميل: ${custData.name}`,
    partyId: customerId,
    partyName: custData.name,
    createdAt: now,
  });

  // 2. خصم المبلغ من رصيد العميل
  batch.update(custRef, {
    currentBalance: increment(-cleanAmount),
    updatedAt: now,
  });

  // 3. تقليل debtRemaining للفواتير الموزع عليها
  for (const alloc of allocations) {
    const invoiceDocRef = doc(db, 'invoices', alloc.invoiceId);
    batch.update(invoiceDocRef, {
      remainingAmount: increment(-alloc.allocatedAmount),
      updatedAt: now,
    });
  }

  // بدون أي تأثير على stats/wallets!
  await commitWithAck(batch);

  return {
    totalAllocated,
    unallocated,
    allocationsCount: allocations.length,
  };
}

export type TransactionActionType = 'expense' | 'withdrawal' | 'capital_in' | 'transfer';

export interface CreateTransactionInput {
  transactionId?: string;
  type: TransactionActionType;
  amount: number;
  wallet: WalletId;
  toWallet?: WalletId;
  category?: string;
  note?: string;
  date?: string | number | Date;
}

export interface CreateTransactionResult {
  transactionId: string;
}

/**
 * تسجيل حركة مالية (مصروف، سحب شخصي، رأس مال مضاف، تحويل بين الخزن):
 * - تنشئ مستند Transaction جديد بحالة active
 * - تحديث مستند stats/wallets:
 *   - expense و withdrawal: تخصم من الخزينة (increment بالسالب)
 *   - capital_in: تزيد الخزينة (increment بالموجب)
 *   - transfer: تخصم من wallet وتزيد في toWallet
 * - استخدام writeBatch
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<CreateTransactionResult> {
  const cleanAmount = round2(input.amount);
  if (cleanAmount <= 0) {
    throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  }

  if (input.type === 'transfer') {
    if (!input.toWallet) {
      throw new Error('يجب اختيار الخزينة المحول إليها');
    }
    if (input.wallet === input.toWallet) {
      throw new Error('لا يمكن التحويل إلى نفس الخزينة');
    }
  }

  const targetTxId =
    input.transactionId ||
    currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'transactions')).id;

  // فحص الكاش لمنع التكرار في حال إعادة إرسال نفس المعرف
  try {
    const cachedRef = currentFirestoreAdapter.doc(db, 'transactions', targetTxId);
    const cachedSnap = await currentFirestoreAdapter.getDocFromCache(cachedRef);
    if (cachedSnap && cachedSnap.exists()) {
      return { transactionId: targetTxId };
    }
  } catch {
    // ليس في الكاش، نكمل طبيعياً
  }

  // منع التكرار في حال تزامن الضغط (Double click)
  const existingInFlight = inFlightTransactions.get(targetTxId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const executionPromise = (async () => {
    await requireServerReachable();

    const now = Date.now();
    const cairoDateIso = getCairoDate(input.date);
    const dayKey = getDayKey(cairoDateIso);
    const monthKey = getMonthKey(cairoDateIso);

    const batch = newBatch();

    // مستند الحركة بالمعرف الثابت
    const txRef = currentFirestoreAdapter.doc(db, 'transactions', targetTxId);
    const transactionId = targetTxId;

    const txDoc = {
      id: transactionId,
      dateIso: cairoDateIso,
      dayKey,
      monthKey,
      type: input.type,
      amount: cleanAmount,
      walletId: input.wallet,
      targetWalletId: input.toWallet || null,
      category:
        input.category ||
        (input.type === 'withdrawal'
          ? 'مسحوبات شخصية'
          : input.type === 'capital_in'
          ? 'تمويل رأس مال'
          : 'تحويل نقدية'),
      description: input.note || '',
      status: 'active',
      createdAt: now,
    };

    batch.set(txRef, txDoc);

    // تحديث أرصدة الخزائن في stats/wallets
    const walletsStatsRef = currentFirestoreAdapter.doc(db, 'stats', 'wallets');

    if (input.type === 'expense' || input.type === 'withdrawal') {
      batch.set(
        walletsStatsRef,
        {
          [`balances.${input.wallet}`]: increment(-cleanAmount),
          lastUpdated: now,
        },
        { merge: true }
      );
    } else if (input.type === 'capital_in') {
      batch.set(
        walletsStatsRef,
        {
          [`balances.${input.wallet}`]: increment(cleanAmount),
          lastUpdated: now,
        },
        { merge: true }
      );
    } else if (input.type === 'transfer' && input.toWallet) {
      batch.set(
        walletsStatsRef,
        {
          [`balances.${input.wallet}`]: increment(-cleanAmount),
          [`balances.${input.toWallet}`]: increment(cleanAmount),
          lastUpdated: now,
        },
        { merge: true }
      );
    }

    await commitWithAck(batch);

    return { transactionId };
  })();

  inFlightTransactions.set(targetTxId, executionPromise);
  try {
    return await executionPromise;
  } finally {
    inFlightTransactions.delete(targetTxId);
  }
}

export interface CloseMonthSnapshotInput {
  monthKey: string;
  actualWallets: Record<WalletId, number>;
  systemWallets: Record<WalletId, number>;
  inventoryValue: number;
  receivables: number;
  customerCredits: number;
  capital: number;
  invoiceProfit: number;
  realProfit: number;
  mismatch: number;
  notes?: string;
}

/**
 * قفل الشهر وإنشاء صورة للمحل (Snapshot):
 * - حساب فروق الخزائن وتسجيل حركات wallet_adjust
 * - تعديل أرصدة الخزائن في stats/wallets لتطابق الفعلي
 * - حفظ مستند Snapshot في مجموعة snapshots
 * - تحديث settings.lockedThroughMonth بالشهر المغلق
 * - استخدام writeBatch
 */
export async function closeMonthSnapshot(
  input: CloseMonthSnapshotInput
): Promise<string> {
  await requireServerReachable();

  const snapRef = currentFirestoreAdapter.doc(db, 'snapshots', input.monthKey);
  const existingSnap = await currentFirestoreAdapter.getDoc(snapRef);
  if (existingSnap.exists()) {
    throw new Error('تم إقفال هذا الشهر');
  }

  const qExisting = await currentFirestoreAdapter.getDocs(
    query(
      collection(db, 'snapshots'),
      where('monthKey', '==', input.monthKey),
      limit(1)
    )
  );
  if (!qExisting.empty) {
    throw new Error('تم إقفال هذا الشهر');
  }

  const now = Date.now();
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);

  const batch = newBatch();

  // 1. حساب فروق الخزائن وتسجيل قيود التسوية وتحديث stats/wallets
  const walletUpdates: Record<string, any> = { lastUpdated: now };

  for (const [wId, actual] of Object.entries(input.actualWallets)) {
    const sys = round2(input.systemWallets[wId] || 0);
    const act = round2(actual);
    const diff = round2(act - sys);

    if (Math.abs(diff) > 0.01) {
      walletUpdates[`balances.${wId}`] = increment(diff);

      const txRef = currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id,
        dateIso: cairoDateIso,
        dayKey,
        monthKey: input.monthKey,
        type: 'wallet_adjust',
        amount: Math.abs(diff),
        walletId: wId,
        category: 'تسوية رصيد خزينة',
        description: `تسوية جرد خزينة عند قفل شهر ${input.monthKey} (الفرق: ${diff > 0 ? '+' : ''}${diff})`,
        difference: diff,
        status: 'active',
        createdAt: now,
      });
    }
  }

  const walletsStatsRef = currentFirestoreAdapter.doc(db, 'stats', 'wallets');
  batch.set(walletsStatsRef, walletUpdates, { merge: true });

  // 2. إنشاء مستند Snapshot بمعرّف monthKey
  const snapshotDoc = {
    id: input.monthKey,
    type: 'monthly_closing',
    monthKey: input.monthKey,
    dateIso: cairoDateIso,
    timestamp: now,
    capital: input.capital,
    wallets: input.actualWallets,
    inventoryValuation: input.inventoryValue,
    totalReceivables: input.receivables,
    totalCustomerCredits: input.customerCredits,
    invoiceProfit: input.invoiceProfit,
    realProfit: input.realProfit,
    mismatch: input.mismatch,
    notes: input.notes || '',
    createdAt: now,
  };

  batch.set(snapRef, snapshotDoc);

  // 3. تحديث settings/general بقفل الشهر
  const settingsRef = currentFirestoreAdapter.doc(db, 'settings', 'general');
  batch.set(
    settingsRef,
    {
      lockedThroughMonth: input.monthKey,
      lastLockedAt: now,
    },
    { merge: true }
  );

  await commitWithAck(batch);

  return input.monthKey;
}

export interface BackupPayload {
  version: string;
  exportedAt: number;
  exportedAtIso: string;
  data: {
    items: any[];
    invoices: any[];
    purchases: any[];
    returns: any[];
    customers: any[];
    transactions: any[];
    stock_adjustments: any[];
    snapshots: any[];
    settings?: any;
    settingsGeneral?: any;
    opening?: any;
    wallets?: any;
  };
}

/**
 * تصدير كافة بيانات النظام في ملف JSON
 */
export async function exportBackup(): Promise<string> {
  await requireServerReachable();

  const collectionsToExport = [
    'items',
    'invoices',
    'purchases',
    'returns',
    'customers',
    'transactions',
    'stock_adjustments',
    'snapshots',
  ];

  const backupData: Record<string, any[]> = {};

  for (const colName of collectionsToExport) {
    try {
      const snap = await currentFirestoreAdapter.getDocs(collection(db, colName));
      const list: any[] = [];
      snap.forEach((d) => list.push({ _id: d.id, ...d.data() }));
      backupData[colName] = list;
    } catch (err) {
      // لا نكتب [] بصمت: نسخة ناقصة أخطر من عدم وجود نسخة
      throw new Error(`فشل تصدير مجموعة (${colName}). لم يتم إنشاء النسخة الاحتياطية. تأكد من الاتصال وحاول مرة أخرى.`);
    }
  }

  // قراءة المستندات الخاصة
  let settingsDoc: any = null;
  let openingDoc: any = null;
  let walletsDoc: any = null;
  let settingsGeneralDoc: any = null;

  try {
    const gSnap = await currentFirestoreAdapter.getDoc(currentFirestoreAdapter.doc(db, 'settings', 'general'));
    if (gSnap.exists()) settingsGeneralDoc = gSnap.data();
  } catch (err: any) {
    throw new Error(`فشل قراءة الإعدادات أثناء النسخ الاحتياطي: ${err?.message || err}`);
  }

  try {
    const sSnap = await currentFirestoreAdapter.getDoc(currentFirestoreAdapter.doc(db, 'meta', 'settings'));
    if (sSnap.exists()) settingsDoc = sSnap.data();
  } catch (err) {
    console.warn('فشل قراءة إعدادات النظام أثناء التصدير:', err);
  }

  try {
    const oSnap = await currentFirestoreAdapter.getDoc(currentFirestoreAdapter.doc(db, 'meta', 'opening'));
    if (oSnap.exists()) openingDoc = oSnap.data();
  } catch (err: any) {
    throw new Error(`فشل قراءة الرصيد الافتتاحي أثناء النسخ الاحتياطي: ${err?.message || err}`);
  }

  try {
    const wSnap = await currentFirestoreAdapter.getDoc(currentFirestoreAdapter.doc(db, 'stats', 'wallets'));
    if (wSnap.exists()) walletsDoc = wSnap.data();
  } catch (err: any) {
    throw new Error(`فشل قراءة أرصدة الخزائن أثناء النسخ الاحتياطي: ${err?.message || err}`);
  }

  const payload: BackupPayload = {
    version: '1.1',
    exportedAt: Date.now(),
    exportedAtIso: getCairoDate(),
    data: {
      items: backupData['items'] || [],
      invoices: backupData['invoices'] || [],
      purchases: backupData['purchases'] || [],
      returns: backupData['returns'] || [],
      customers: backupData['customers'] || [],
      transactions: backupData['transactions'] || [],
      stock_adjustments: backupData['stock_adjustments'] || [],
      snapshots: backupData['snapshots'] || [],
      settings: settingsDoc,
      settingsGeneral: settingsGeneralDoc,
      opening: openingDoc,
      wallets: walletsDoc,
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * استيراد نسخة احتياطية واستبدال البيانات:
 * مهم جداً: تقسيم عمليات الحذف والكتابة إلى دفعات (chunks) بحجم 400 عملية كحد أقصى
 * لتفادي تجاوز حد الـ 500 عملية في باتش الفايرستور الواحد.
 */
export async function importBackup(rawJson: string | object): Promise<void> {
  await requireServerReachable();
  let parsed: any;
  if (typeof rawJson === 'string') {
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error('صيغة ملف النسخة الاحتياطية غير صالحة');
    }
  } else {
    parsed = rawJson;
  }

  const data = parsed && typeof parsed === 'object' ? parsed.data : null;
  if (!data || typeof data !== 'object') {
    throw new Error('الملف ليس نسخة احتياطية صالحة (لا يوجد قسم data)');
  }

  const collectionsList = [
    'items',
    'invoices',
    'purchases',
    'returns',
    'customers',
    'transactions',
    'stock_adjustments',
    'snapshots',
  ] as const;

  // 1. تحقق شامل: كل المجموعات الثماني موجودة كمصفوفات قبل أي كتابة أو حذف
  for (const col of collectionsList) {
    if (!Array.isArray(data[col])) {
      throw new Error(`الملف ناقص أو تالف: المجموعة (${col}) غير موجودة أو ليست قائمة`);
    }
    for (const d of data[col]) {
      if (!d || typeof d !== 'object' || !(d._id || d.id)) {
        throw new Error(`الملف تالف: مستند بدون معرّف في (${col})`);
      }
    }
  }

  // 2. نسخة أمان من البيانات الحالية تُنزَّل قبل أي تعديل. لو فشلت يتوقف الاستيراد.
  const safetyJson = await exportBackup();
  if (typeof document !== 'undefined') {
    const blob = new Blob([safetyJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة-امان-قبل-الاستعادة-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const BATCH_CHUNK_SIZE = 400;

  try {
    // 3. كتابة كافة المستندات المستوردة بـ set أولاً قبل حذف أي شيء
    for (const colName of collectionsList) {
      const docsToWrite = data[colName];

      for (let i = 0; i < docsToWrite.length; i += BATCH_CHUNK_SIZE) {
        const chunk = docsToWrite.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = newBatch();

        for (const docObj of chunk) {
          const docId = docObj._id || docObj.id;
          const ref = docId
            ? currentFirestoreAdapter.doc(db, colName, docId)
            : currentFirestoreAdapter.doc(currentFirestoreAdapter.collection(db, colName));
          const cleanObj = { ...docObj };
          delete cleanObj._id;
          batch.set(ref, cleanObj);
        }
        await batch.commit();
      }
    }

    // 4. حذف المستندات الموجودة في القاعدة وليست موجودة في ملف النسخة الاحتياطية
    for (const colName of collectionsList) {
      const snap = await currentFirestoreAdapter.getDocs(collection(db, colName));
      const incomingIds = new Set(data[colName].map((d: any) => d._id || d.id));
      const docsToDelete = (snap.docs || []).filter((d: any) => !incomingIds.has(d.id));

      for (let i = 0; i < docsToDelete.length; i += BATCH_CHUNK_SIZE) {
        const chunk = docsToDelete.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = newBatch();
        for (const d of chunk) {
          const docRef = d.ref || currentFirestoreAdapter.doc(db, colName, d.id);
          batch.delete(docRef);
        }
        await batch.commit();
      }
    }

    // 5. كتابة المستندات المنفردة (settings, opening, wallets)
    const singleBatch = newBatch();

    if (data.settings) {
      singleBatch.set(currentFirestoreAdapter.doc(db, 'meta', 'settings'), data.settings, { merge: true });
      // نسخ قديمة (بدون settingsGeneral): نستخدم نفس الإعدادات للمستند الآخر كما كان
      if (!data.settingsGeneral) {
        singleBatch.set(currentFirestoreAdapter.doc(db, 'settings', 'general'), data.settings, { merge: true });
      }
    }
    if (data.settingsGeneral) {
      singleBatch.set(currentFirestoreAdapter.doc(db, 'settings', 'general'), data.settingsGeneral, { merge: true });
    }

    if (data.opening) {
      singleBatch.set(currentFirestoreAdapter.doc(db, 'meta', 'opening'), data.opening, { merge: true });
    }

    if (data.wallets) {
      // استبدال كامل (بدون merge) حتى لا تبقى مفاتيح قديمة
      singleBatch.set(currentFirestoreAdapter.doc(db, 'stats', 'wallets'), data.wallets);
    }

    await singleBatch.commit();
  } catch (err: any) {
    throw new Error(
      `فشل استيراد النسخة الاحتياطية (${err?.message || err}). لا تغلق الصفحة، وإن انقطع الاتصال أعد نفس الملف.`
    );
  }
}

export interface OpeningBalanceInput {
  cash: number;
  bank: number;
  wallet: number;
  inventoryValue: number;
  receivables: number;
  liabilities?: number;
  notes?: string;
}

/**
 * تأسيس بداية جديدة للأرصدة الافتتاحية للمحل:
 * - إنشاء مستند meta/opening
 * - حساب رأس المال الافتتاحي: capital = wallets + inventoryValue + receivables - liabilities
 * - تحديث stats/wallets بالأرصدة الافتتاحية
 */
export async function createOpening(input: OpeningBalanceInput): Promise<number> {
  await requireServerReachable();
  // حماية: البداية الجديدة تستبدل أرصدة الخزائن، فلا تُسمح بعد بدء التشغيل الفعلي
  if (await hasOperationalActivity()) {
    throw new Error(
      'لا يمكن تنفيذ «بداية جديدة» بعد تسجيل فواتير أو حركات أو قفل شهر، لأنها تستبدل أرصدة الخزائن وتضيّع الحركة. ' +
        'لإضافة دين عميل قديم استخدم «إضافة عميل برصيد سابق» من شاشة العملاء.'
    );
  }
  const cash = round2(input.cash || 0);
  const bank = round2(input.bank || 0);
  const wallet = round2(input.wallet || 0);
  const inventoryValue = round2(input.inventoryValue || 0);
  const receivables = round2(input.receivables || 0);
  const liabilities = round2(input.liabilities || 0);

  const totalWallets = round2(cash + bank + wallet);
  const capital = round2(totalWallets + inventoryValue + receivables - liabilities);

  const now = Date.now();
  const cairoDateIso = getCairoDate();
  const dayKey = getDayKey(cairoDateIso);

  const batch = newBatch();

  // 1. مستند meta/opening
  const openingDoc = {
    dateIso: cairoDateIso,
    dayKey,
    initialCashBalances: {
      cash,
      bank,
      wallet,
    },
    initialInventoryValue: inventoryValue,
    initialReceivables: receivables,
    initialLiabilities: liabilities,
    capital,
    notes: input.notes || 'تأسيس رصيد افتتاحي لبداية جديدة',
    createdAt: now,
    updatedAt: now,
  };

  batch.set(doc(db, 'meta', 'opening'), openingDoc);

  // 2. تحديث الخزائن في stats/wallets
  const walletsDoc = {
    balances: {
      cash,
      bank,
      wallet,
    },
    lastUpdated: now,
  };

  batch.set(doc(db, 'stats', 'wallets'), walletsDoc);

  await batch.commit();

  return capital;
}

/* ============================================================
 * تصحيح الأخطاء: عكس الحركات، تصحيح تكلفة الشراء، إلغاء فاتورة شراء
 * (دوال مضافة فقط، لا تغيّر أي دالة سابقة)
 * ============================================================ */

/**
 * عكس مصروف / سحب / تمويل / تحويل: يُرجع أثره على الخزائن ويعلّم الحركة status='reversed'
 * (الشاشات تتجاهل الحركات المعكوسة في الحسابات).
 */
export async function reverseTransaction(txId: string): Promise<void> {
  await requireServerReachable();
  const ref = currentFirestoreAdapter.doc(db, 'transactions', txId);
  const snap = await currentFirestoreAdapter.getDoc(ref);
  if (!snap.exists()) throw new Error('الحركة غير موجودة');
  const t: any = snap.data();

  if (t.status === 'reversed') throw new Error('هذه الحركة معكوسة بالفعل');
  if (
    !['expense', 'withdrawal', 'capital_in', 'transfer'].includes(t.type) ||
    t.walletId === 'pocket' ||
    t.referenceNumber
  ) {
    throw new Error('لا يمكن عكس هذه الحركة من هنا (مرتبطة بفاتورة أو تسوية)');
  }

  const settingsRef = currentFirestoreAdapter.doc(db, 'settings', 'general');
  const settingsSnap = await currentFirestoreAdapter.getDoc(settingsRef);
  const lockedThroughMonth = settingsSnap.exists() ? settingsSnap.data()?.lockedThroughMonth : null;
  const txMonth = t.monthKey || (t.dateIso ? getMonthKey(t.dateIso) : (t.createdAt ? getMonthKey(t.createdAt) : null));
  if (lockedThroughMonth && txMonth && txMonth <= lockedThroughMonth) {
    throw new Error('الشهر مقفول — سجّل قيد تصحيح في الشهر الحالي');
  }

  const amt = round2(Number(t.amount) || 0);
  const now = Date.now();
  const delta: Record<string, any> = { lastUpdated: now };

  if (t.type === 'expense' || t.type === 'withdrawal') {
    delta[`balances.${t.walletId}`] = increment(amt);
  } else if (t.type === 'capital_in') {
    delta[`balances.${t.walletId}`] = increment(-amt);
  } else if (t.type === 'transfer' && t.targetWalletId) {
    delta[`balances.${t.walletId}`] = increment(amt);
    delta[`balances.${t.targetWalletId}`] = increment(-amt);
  }

  const batch = newBatch();
  batch.set(currentFirestoreAdapter.doc(db, 'stats', 'wallets'), delta, { merge: true });
  batch.update(ref, { status: 'reversed', reversedAt: now });
  await commitWithAck(batch);
}

/**
 * تصحيح سعر شراء صنف: مسموح فقط لو لم يُبع منه ولم تُجرَ عليه تسوية (المخزون = الكمية الأصلية).
 * يحدّث الصنف وبند فاتورة الشراء وإجمالياتها.
 */
export async function fixItemCost(
  itemId: string,
  newCostRaw: number,
  adjustPayment: boolean = false
): Promise<void> {
  await requireServerReachable();
  const cost = round2(newCostRaw);
  if (!(cost > 0)) throw new Error('أدخل سعر شراء صحيح أكبر من صفر');

  const itemRef = currentFirestoreAdapter.doc(db, 'items', itemId);
  const itemSnap = await currentFirestoreAdapter.getDoc(itemRef);
  if (!itemSnap.exists()) throw new Error('الصنف غير موجود');
  const it: any = itemSnap.data();

  const stock = Number(it.currentStock) || 0;
  const initial = it.initialQty !== undefined ? Number(it.initialQty) : stock;
  if (stock !== initial) {
    throw new Error('لا يمكن تعديل سعر الشراء بعد البيع أو تسوية جزء من الكمية');
  }

  const oldCost = round2(Number(it.costPrice) || 0);
  const diff = round2((cost - oldCost) * initial);

  const now = Date.now();
  const batch = newBatch();
  batch.update(itemRef, { costPrice: cost, updatedAt: now });

  if (it.purchaseId) {
    const pRef = currentFirestoreAdapter.doc(db, 'purchases', it.purchaseId);
    const pSnap = await currentFirestoreAdapter.getDoc(pRef);
    if (pSnap.exists()) {
      const p: any = pSnap.data();
      const lines = (p.items || []).map((l: any) =>
        l.itemId === itemId
          ? { ...l, purchaseCost: cost, total: round2(cost * (Number(l.quantity) || 0)) }
          : l
      );
      const subtotal = round2(lines.reduce((s: number, l: any) => s + (Number(l.total) || 0), 0));
      const oldPaid = Number(p.paidAmount) || 0;

      if (adjustPayment) {
        const newPaid = round2(oldPaid + diff);
        batch.update(pRef, {
          items: lines,
          subtotal,
          grandTotal: subtotal,
          paidAmount: newPaid,
          remainingAmount: round2(Math.max(0, subtotal - newPaid)),
        });

        if (Math.abs(diff) > 0.0001 && p.purchaseNumber) {
          const txSnap = await currentFirestoreAdapter.getDocs(
            query(
              currentFirestoreAdapter.collection(db, 'transactions'),
              where('referenceNumber', '==', p.purchaseNumber)
            )
          );
          txSnap.forEach((d: any) => {
            const t: any = d.data();
            if (t.status === 'reversed') return;
            const oldTxAmt = round2(Number(t.amount) || 0);
            const newTxAmt = round2(Math.max(0, oldTxAmt + diff));
            batch.update(d.ref, { amount: newTxAmt, updatedAt: now });

            if (t.type === 'purchase_payment' && t.walletId && t.walletId !== 'pocket') {
              const walletsStatsRef = currentFirestoreAdapter.doc(db, 'stats', 'wallets');
              batch.set(
                walletsStatsRef,
                {
                  [`balances.${t.walletId}`]: increment(-diff),
                  lastUpdated: now,
                },
                { merge: true }
              );
            }
          });
        }
      } else {
        batch.update(pRef, {
          items: lines,
          subtotal,
          grandTotal: subtotal,
          remainingAmount: round2(Math.max(0, subtotal - oldPaid)),
        });
      }
    }
  }

  await commitWithAck(batch);
}

/**
 * إلغاء فاتورة شراء كاملة: مسموح فقط لو لم يُبع/يُسوَّ أي صنف منها.
 * تصفّر أصنافها وتؤرشفها، وتُرجع المبلغ المدفوع للخزينة، وتعلّم حركات الدفع معكوسة.
 */
export async function cancelPurchase(purchaseId: string): Promise<void> {
  await requireServerReachable();
  const pRef = doc(db, 'purchases', purchaseId);
  const pSnap = await getDoc(pRef);
  if (!pSnap.exists()) throw new Error('فاتورة الشراء غير موجودة');
  const p: any = pSnap.data();
  if (p.status === 'cancelled') throw new Error('فاتورة الشراء ملغاة بالفعل');

  const itemRefs: any[] = [];
  for (const line of p.items || []) {
    const r = doc(db, 'items', line.itemId);
    const s = await getDoc(r);
    if (!s.exists()) continue;
    const d: any = s.data();
    const stock = Number(d.currentStock) || 0;
    const initial = d.initialQty !== undefined ? Number(d.initialQty) : stock;
    if (stock !== initial) {
      throw new Error(`لا يمكن إلغاء الفاتورة: الصنف (${d.name}) تم بيع جزء منه أو تسويته`);
    }
    itemRefs.push(r);
  }

  const now = Date.now();
  const batch = newBatch();

  for (const r of itemRefs) {
    batch.update(r, { currentStock: 0, isActive: false, archived: true, updatedAt: now });
  }
  batch.update(pRef, { status: 'cancelled', cancelledAt: now });

  const txSnap = await getDocs(
    query(collection(db, 'transactions'), where('referenceNumber', '==', p.purchaseNumber))
  );
  txSnap.forEach((d) => {
    const t: any = d.data();
    if (t.status === 'reversed') return;
    batch.update(d.ref, { status: 'reversed', reversedAt: now });
    if (t.type === 'purchase_payment') {
      batch.set(
        doc(db, 'stats', 'wallets'),
        { [`balances.${t.walletId}`]: increment(Number(t.amount) || 0), lastUpdated: now },
        { merge: true }
      );
    }
  });

  await commitWithAck(batch);
}

/* ============================================================
 * بيانات البداية: عميل برصيد سابق + حماية البداية الجديدة
 * ============================================================ */

/**
 * إضافة عميل قديم عليه دين من الدفتر.
 * - ينشئ العميل برصيد مدين (يدخل تلقائياً في ديون العملاء ورأس المال).
 * - يسجّل حركة capital_in بدون خزينة بنفس المبلغ، حتى لا يظهر الدين كربح في الربح الحقيقي.
 * - التحصيل منه لاحقاً يتم من شاشة العملاء بشكل عادي.
 */
export async function addCustomerWithOpeningBalance(input: {
  name: string;
  phone: string;
  amount: number;
  notes?: string;
}): Promise<string> {
  await requireServerReachable();
  const name = (input.name || '').trim();
  const phone = normalizePhone(input.phone);
  const amount = round2(input.amount);
  if (!name || !phone) throw new Error('اسم العميل ورقم الهاتف مطلوبان');
  if (!(amount > 0)) throw new Error('أدخل مبلغ الدين السابق (أكبر من صفر)');

  const dup = await currentFirestoreAdapter.getDocs(
    query(collection(db, 'customers'), where('phone', '==', phone), limit(1))
  );
  if (!dup.empty) throw new Error('يوجد عميل مسجل بنفس رقم الهاتف بالفعل');

  const now = Date.now();
  const cairoDateIso = getCairoDate();
  const batch = newBatch();

  const custRef = doc(collection(db, 'customers'));
  batch.set(custRef, {
    id: custRef.id,
    name,
    phone,
    currentBalance: amount,
    openingBalance: amount,
    notes: input.notes || 'رصيد سابق من الدفتر',
    createdAt: now,
    updatedAt: now,
  });

  const txRef = doc(collection(db, 'transactions'));
  batch.set(txRef, {
    id: txRef.id,
    dateIso: cairoDateIso,
    dayKey: getDayKey(cairoDateIso),
    monthKey: getMonthKey(cairoDateIso),
    type: 'capital_in',
    amount,
    walletId: 'none',
    category: 'رصيد افتتاحي لعميل',
    description: `رصيد سابق للعميل: ${name}`,
    partyId: custRef.id,
    partyName: name,
    referenceNumber: `OPENING-${custRef.id}`,
    status: 'active',
    createdAt: now,
  });

  await commitWithAck(batch);
  return custRef.id;
}

/** هل بدأ التشغيل الفعلي (فواتير أو حركات أو قفل شهر)؟ تُستخدم لقفل «البداية الجديدة». */
export async function hasOperationalActivity(): Promise<boolean> {
  for (const col of ['invoices', 'transactions', 'snapshots']) {
    const s = await getDocs(query(collection(db, col), limit(1)));
    if (!s.empty) return true;
  }
  return false;
}
