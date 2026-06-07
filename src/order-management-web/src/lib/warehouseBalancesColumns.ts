import { RESIZABLE_PANEL_KEYS } from './resizablePanelKeys';

export const WAREHOUSE_BALANCE_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.warehouseBalancesColumns;

export const WAREHOUSE_BALANCE_COLUMN_KEYS = ['warehouse', 'article', 'product', 'qty'] as const;

export type WarehouseBalanceColumnKey = (typeof WAREHOUSE_BALANCE_COLUMN_KEYS)[number];

export const WAREHOUSE_BALANCE_DEFAULT_WIDTHS: Record<WarehouseBalanceColumnKey, number> = {
  warehouse: 160,
  article: 112,
  product: 360,
  qty: 88,
};

export const WAREHOUSE_BALANCE_COLUMN_CLASS: Record<WarehouseBalanceColumnKey, string> = {
  warehouse: 'inv-col-warehouse',
  article: 'inv-col-article',
  product: 'inv-col-product',
  qty: 'inv-col-qty',
};

export function visibleWarehouseBalanceColumns(
  showWarehouse: boolean
): WarehouseBalanceColumnKey[] {
  const cols: WarehouseBalanceColumnKey[] = [];
  if (showWarehouse) cols.push('warehouse');
  cols.push('article', 'product', 'qty');
  return cols;
}
