import { RESIZABLE_PANEL_KEYS } from './resizablePanelKeys';

export const PURCHASE_RECEIPT_LINES_COLUMN_WIDTHS_KEY =
  RESIZABLE_PANEL_KEYS.purchaseReceiptLinesColumns;

export const PURCHASE_RECEIPT_LINE_COLUMN_KEYS = [
  'product',
  'warehouse',
  'qty',
  'usdTotal',
  'ilsTotal',
  'unitCost',
  'actions',
] as const;

export type PurchaseReceiptLineColumnKey = (typeof PURCHASE_RECEIPT_LINE_COLUMN_KEYS)[number];

export type PurchaseReceiptCurrencyMode = 'USD' | 'ILS';

export const PURCHASE_RECEIPT_LINE_DEFAULT_WIDTHS: Record<PurchaseReceiptLineColumnKey, number> = {
  product: 300,
  warehouse: 130,
  qty: 72,
  usdTotal: 88,
  ilsTotal: 88,
  unitCost: 88,
  actions: 64,
};

export function visiblePurchaseReceiptLineColumns(
  currencyMode: PurchaseReceiptCurrencyMode,
  isDraft: boolean
): PurchaseReceiptLineColumnKey[] {
  const cols: PurchaseReceiptLineColumnKey[] = ['product', 'warehouse', 'qty'];
  if (currencyMode === 'USD') {
    cols.push('usdTotal', 'ilsTotal');
  } else {
    cols.push('ilsTotal');
  }
  cols.push('unitCost');
  if (isDraft) cols.push('actions');
  return cols;
}

export const PURCHASE_RECEIPT_LINE_COLUMN_CLASS: Record<PurchaseReceiptLineColumnKey, string> = {
  product: 'pr-col-product',
  warehouse: 'pr-col-warehouse',
  qty: 'pr-col-qty',
  usdTotal: 'pr-col-usd-total',
  ilsTotal: 'pr-col-ils-total',
  unitCost: 'pr-col-unit-cost',
  actions: 'pr-col-actions',
};

export function purchaseReceiptCurrencyMode(currency: string): PurchaseReceiptCurrencyMode {
  const c = currency.trim().toUpperCase();
  if (c === 'ILS' || c === 'NIS' || c === '₪') return 'ILS';
  return 'USD';
}
