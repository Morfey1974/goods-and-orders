/** Stock is counted in whole units (pieces), not fractional. */
export function normalizeStockQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function formatStockQuantity(value: number | null | undefined): string {
  return String(normalizeStockQuantity(value ?? 0));
}
