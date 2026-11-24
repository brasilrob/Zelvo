import { addDays, addMonths, addWeeks, differenceInMinutes, isBefore, parseISO } from 'date-fns';
import type { QuoteItem } from '../types/database';

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface QuoteTotals {
  items: QuoteItem[];
  subtotal: number;
  vat_total: number;
  total: number;
  vatBreakdown: Array<{ rate: number; base: number; tax: number }>;
}

/**
 * Computes exact Subtotal, VAT total (supporting mixed VAT rates e.g. 23%, 6%, 0%),
 * and Grand Total rounded accurately to 2 decimal places (TC-07).
 */
export function calculateQuoteTotals(
  rawItems: Array<Omit<QuoteItem, 'total'> & { total?: number }>
): QuoteTotals {
  let subtotal = 0;
  let vatTotal = 0;
  const breakdownMap = new Map<number, { base: number; tax: number }>();

  const items: QuoteItem[] = rawItems.map((item) => {
    const lineSubtotal = roundCurrency(item.qty * item.unit_price);
    const lineVat = roundCurrency(lineSubtotal * (item.vat_rate / 100));
    subtotal = roundCurrency(subtotal + lineSubtotal);
    vatTotal = roundCurrency(vatTotal + lineVat);

    const existing = breakdownMap.get(item.vat_rate) ?? { base: 0, tax: 0 };
    breakdownMap.set(item.vat_rate, {
      base: roundCurrency(existing.base + lineSubtotal),
      tax: roundCurrency(existing.tax + lineVat),
    });

    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      unit_price: roundCurrency(item.unit_price),
      vat_rate: item.vat_rate,
      total: lineSubtotal,
    };
  });

  const total = roundCurrency(subtotal + vatTotal);
  const vatBreakdown = Array.from(breakdownMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, values]) => ({ rate, base: values.base, tax: values.tax }));

  return {
    items,
    subtotal,
    vat_total: vatTotal,
    total,
    vatBreakdown,
  };
}

/**
 * Generates future occurrence start/end timestamps for the next 90 days
 * from an iCal RRULE string (FREQ=WEEKLY;INTERVAL=1, FREQ=WEEKLY;INTERVAL=2, FREQ=MONTHLY;INTERVAL=1).
 * Returns the subsequent occurrences (excluding the initial parent job date).
 */
export function generateRecurrenceOccurrences(
  startIso: string,
  endIso: string | null,
  recurrenceRule: string,
  horizonDays = 90
): Array<{ scheduled_start: string; scheduled_end: string | null }> {
  const startDate = parseISO(startIso);
  const durationMinutes = endIso ? Math.max(30, differenceInMinutes(parseISO(endIso), startDate)) : 60;
  const horizonDate = addDays(startDate, horizonDays);

  const isWeekly = recurrenceRule.includes('FREQ=WEEKLY');
  const isMonthly = recurrenceRule.includes('FREQ=MONTHLY');
  const intervalMatch = recurrenceRule.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? Math.max(1, Number(intervalMatch[1])) : 1;

  if (!isWeekly && !isMonthly) return [];

  const occurrences: Array<{ scheduled_start: string; scheduled_end: string | null }> = [];
  let step = 1;

  while (step <= 20) {
    const nextStart = isWeekly
      ? addWeeks(startDate, step * interval)
      : addMonths(startDate, step * interval);

    if (!isBefore(nextStart, horizonDate) && nextStart.getTime() !== horizonDate.getTime()) {
      break;
    }

    const nextEnd = new Date(nextStart.getTime() + durationMinutes * 60 * 1000);
    occurrences.push({
      scheduled_start: nextStart.toISOString(),
      scheduled_end: endIso ? nextEnd.toISOString() : null,
    });
    step += 1;
  }

  return occurrences;
}

export interface CompressedImageResult {
  dataUrl: string;
  sizeKb: number;
  width: number;
  height: number;
}

/**
 * Compresses an uploaded image file via HTML5 Canvas to <= 500 KB and max width 1280px (TC-11).
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1280,
  maxBytes = 500 * 1024
): Promise<CompressedImageResult> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      image.src = objectUrl;
    });

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto gráfico indisponível para compressão.');
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let quality = 0.72;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);

    const estimateBytes = (url: string): number => {
      const base64 = url.split(',')[1] ?? '';
      return Math.ceil((base64.length * 3) / 4);
    };

    while (estimateBytes(dataUrl) > maxBytes && quality > 0.25) {
      quality = Math.max(0.25, quality - 0.12);
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    const sizeKb = Math.max(1, Math.round(estimateBytes(dataUrl) / 1024));

    return {
      dataUrl,
      sizeKb,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generatePublicToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 24; i += 1) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function buildMapsUrl(address: string, latitude?: number | null, longitude?: number | null): string {
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('351') ? digits : `351${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function isQuoteExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const endOfValidDay = parseISO(`${validUntil}T23:59:59`);
  return endOfValidDay.getTime() < Date.now();
}
