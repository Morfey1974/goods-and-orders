export function formatInventoryLotSource(
  sourceLabel: string | null | undefined,
  t: (key: string, opts?: Record<string, string>) => string
): string {
  if (!sourceLabel) return '—';
  if (sourceLabel.startsWith('opening:')) {
    return t('inventory.lotSourceOpening', { date: sourceLabel.slice('opening:'.length) });
  }
  if (sourceLabel.startsWith('receipt:')) {
    const number = sourceLabel.slice('receipt:'.length);
    return number
      ? t('inventory.lotSourceReceipt', { number })
      : t('inventory.lotSourceReceiptUnknown');
  }
  return sourceLabel;
}
