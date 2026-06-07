import { RESIZABLE_PANEL_KEYS } from './resizablePanelKeys';

export const INVENTORY_VALUATION_COLUMN_WIDTHS_KEY =
  RESIZABLE_PANEL_KEYS.inventoryValuationColumns;

export const INVENTORY_VALUATION_COLUMN_KEYS = [
  'warehouse',
  'article',
  'product',
  'lotDate',
  'lotSource',
  'qty',
  'cost',
  'total',
] as const;

export type InventoryValuationColumnKey = (typeof INVENTORY_VALUATION_COLUMN_KEYS)[number];

export const INVENTORY_VALUATION_DEFAULT_WIDTHS: Record<InventoryValuationColumnKey, number> = {
  warehouse: 140,
  article: 100,
  product: 280,
  lotDate: 100,
  lotSource: 180,
  qty: 72,
  cost: 96,
  total: 108,
};

export const INVENTORY_VALUATION_COLUMN_CLASS: Record<InventoryValuationColumnKey, string> = {
  warehouse: 'inv-col-warehouse',
  article: 'inv-col-article',
  product: 'inv-col-product',
  lotDate: 'inv-col-lot-date',
  lotSource: 'inv-col-lot-source',
  qty: 'inv-col-qty',
  cost: 'inv-col-cost',
  total: 'inv-col-total',
};

export function visibleInventoryValuationColumns(
  detailed: boolean
): InventoryValuationColumnKey[] {
  const cols: InventoryValuationColumnKey[] = ['warehouse', 'article', 'product'];
  if (detailed) {
    cols.push('lotDate', 'lotSource');
  }
  cols.push('qty', 'cost', 'total');
  return cols;
}
