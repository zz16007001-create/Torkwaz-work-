import { useEffect, useRef } from 'react';

// أقصى فاصل زمني بالمللي ثانية بين حرفين لاعتباره مسحًا من السكانر
const MAX_GAP_MS = 40;
// أقل طول للكود لاعتباره مسحًا صالحًا
const MIN_LENGTH = 4;

export interface UseBarcodeScannerOptions {
  enabled: boolean;
  onScan: (code: string) => void;
}

const IGNORED_MODIFIER_KEYS = new Set(['Shift', 'CapsLock', 'NumLock', 'ScrollLock']);

function restoreInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  originalValue: string,
  selectionStart: number | null,
  selectionEnd: number | null
): void {
  if (el.value === originalValue) return;

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (nativeSetter) {
    nativeSetter.call(el, originalValue);
  } else {
    el.value = originalValue;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));

  try {
    if (selectionStart !== null && selectionEnd !== null) {
      el.setSelectionRange(selectionStart, selectionEnd);
    }
  } catch {
    // بعض أنواع الحقول (مثل number) لا تدعم setSelectionRange
  }
}

export function useBarcodeScanner({ enabled, onScan }: UseBarcodeScannerOptions): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let lastTime = 0;
    let isScanning = false;
    let targetEl: HTMLInputElement | HTMLTextAreaElement | null = null;
    let snapshotValue = '';
    let snapshotStart: number | null = null;
    let snapshotEnd: number | null = null;

    const resetState = () => {
      buffer = '';
      lastTime = 0;
      isScanning = false;
      targetEl = null;
      snapshotValue = '';
      snapshotStart = null;
      snapshotEnd = null;
    };

    const captureTargetSnapshot = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        targetEl = active;
        snapshotValue = active.value;
        try {
          snapshotStart = active.selectionStart;
          snapshotEnd = active.selectionEnd;
        } catch {
          snapshotStart = null;
          snapshotEnd = null;
        }
      } else {
        targetEl = null;
        snapshotValue = '';
        snapshotStart = null;
        snapshotEnd = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // تجاهل المسح عند وجود نافذة حوار مفتوحة
      if (document.querySelector('[role="dialog"]') !== null) {
        resetState();
        return;
      }

      // تجاهل أي اختصارات مع Ctrl أو Alt أو Meta
      if (e.ctrlKey || e.altKey || e.metaKey) {
        resetState();
        return;
      }

      // عدم مقاطعة مفاتيح التعديل مثل Shift التي يرسلها السكانر قبل الأحرف الكبيرة
      if (IGNORED_MODIFIER_KEYS.has(e.key)) {
        return;
      }

      const now = performance.now();

      if (e.key === 'Enter') {
        const gap = now - lastTime;
        if (buffer.length >= MIN_LENGTH && gap <= MAX_GAP_MS) {
          e.preventDefault();
          e.stopPropagation();

          const scannedCode = buffer;
          const capturedEl = targetEl;
          const capturedVal = snapshotValue;
          const capturedStart = snapshotStart;
          const capturedEnd = snapshotEnd;

          resetState();

          if (capturedEl) {
            restoreInputValue(capturedEl, capturedVal, capturedStart, capturedEnd);
          }

          onScanRef.current(scannedCode);
          return;
        }

        resetState();
        return;
      }

      // تجاهل المفاتيح غير النصية (الأسهم، Tab، Backspace، إلخ)
      if (e.key.length !== 1) {
        resetState();
        return;
      }

      if (buffer.length === 0 || now - lastTime > MAX_GAP_MS) {
        // بداية تسلسل محتمل: نلتقط قيمة الخانة النشطة قبل دخول الحرف الأول
        resetState();
        captureTargetSnapshot();
        buffer = e.key;
        lastTime = now;
        return;
      }

      // تم تأكيد السرعة العالية (≤ MAX_GAP_MS): هذا مسح باركود
      isScanning = true;
      buffer += e.key;
      lastTime = now;

      if (isScanning) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled]);
}
