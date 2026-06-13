/** Human-readable document reference from StockMovement.Notes. */
export function formatStockMovementDocument(notes: string | undefined | null): string {
  const raw = notes?.trim();
  if (!raw) return '—';

  const grMatch = /^GR\s+(GR-\d+)/i.exec(raw);
  if (grMatch) return grMatch[1];

  const chargeBom = /^(\d+)\s+\(BOM/i.exec(raw);
  if (chargeBom) return chargeBom[1];

  if (/^opening balance/i.test(raw)) return raw.split('\n')[0].slice(0, 48);

  if (/^\d+$/.test(raw)) return raw;

  const slashIdx = raw.indexOf(' · ');
  if (slashIdx > 0) return raw.slice(0, slashIdx).trim();

  return raw.length > 56 ? `${raw.slice(0, 53)}…` : raw;
}
