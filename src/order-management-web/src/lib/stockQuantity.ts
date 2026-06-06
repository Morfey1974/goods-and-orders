/** Stock is counted in whole units (pieces), not fractional. */
export function normalizeStockQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/** Integer digits only while the user edits a quantity field. */
export function sanitizeQuantityDraft(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Commit quantity draft text to a valid whole quantity (default min 1). */
export function finalizeQuantityDraft(raw: string, min = 1): number {
  const n = normalizeStockQuantity(Number(raw));
  return Math.max(min, n || min);
}

/** Decimal price text while editing (allows empty and partial input). */
export function sanitizePriceDraft(raw: string): string {
  const normalized = raw.replace(',', '.');
  if (normalized === '' || /^\d*\.?\d*$/.test(normalized)) return normalized;
  return normalized.slice(0, -1);
}

export function finalizePriceDraft(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function formatStockQuantity(value: number | null | undefined): string {
  return String(normalizeStockQuantity(value ?? 0));
}
