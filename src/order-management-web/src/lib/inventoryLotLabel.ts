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
  if (sourceLabel.startsWith('assembly:')) {
    const number = sourceLabel.slice('assembly:'.length);
    return number
      ? t('inventory.lotSourceAssembly', { number })
      : t('inventory.lotSourceAssemblyUnknown');
  }
  return sourceLabel;
}

/** Source kind without receipt number (number shown in a separate column). */
export function formatInventoryLotSourceKind(
  lot: { sourceType: string; sourceLabel?: string | null; receivedAt: string },
  t: (key: string, opts?: Record<string, string>) => string
): string {
  if (lot.sourceType === 'OpeningBalance' || lot.sourceLabel?.startsWith('opening:')) {
    const date = lot.sourceLabel?.startsWith('opening:')
      ? lot.sourceLabel.slice('opening:'.length)
      : lot.receivedAt;
    return t('inventory.lotSourceOpening', { date });
  }
  if (lot.sourceType === 'PurchaseReceipt' || lot.sourceLabel?.startsWith('receipt:')) {
    return t('inventory.lotSourceReceiptUnknown');
  }
  if (lot.sourceType === 'Assembly' || lot.sourceLabel?.startsWith('assembly:')) {
    return t('inventory.lotSourceAssemblyUnknown');
  }
  return formatInventoryLotSource(lot.sourceLabel, t);
}
