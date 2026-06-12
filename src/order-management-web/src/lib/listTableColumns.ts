import { RESIZABLE_PANEL_KEYS } from './resizablePanelKeys';

export const ORDERS_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.ordersColumns;
export const ORDERS_COLUMN_KEYS = [
  'number',
  'customer',
  'status',
  'chargeInvoice',
  'total',
  'stock',
  'actions',
] as const;
export type OrdersColumnKey = (typeof ORDERS_COLUMN_KEYS)[number];
export const ORDERS_DEFAULT_WIDTHS: Record<OrdersColumnKey, number> = {
  number: 108,
  customer: 220,
  status: 120,
  chargeInvoice: 120,
  total: 100,
  stock: 100,
  actions: 200,
};
export const ORDERS_COLUMN_CLASS: Record<OrdersColumnKey, string> = {
  number: 'dt-col-number',
  customer: 'dt-col-customer',
  status: 'dt-col-status',
  chargeInvoice: 'dt-col-charge',
  total: 'dt-col-total',
  stock: 'dt-col-stock',
  actions: 'dt-col-actions',
};
export const ORDERS_TEXT_START_COLUMNS = new Set<OrdersColumnKey>(['customer']);

export const CUSTOMERS_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.customersColumns;
export const CUSTOMERS_COLUMN_KEYS = [
  'name',
  'documentName',
  'mobile',
  'id',
  'paymentTerms',
  'discount',
  'created',
  'actions',
] as const;
export type CustomersColumnKey = (typeof CUSTOMERS_COLUMN_KEYS)[number];
export const CUSTOMERS_DEFAULT_WIDTHS: Record<CustomersColumnKey, number> = {
  name: 220,
  documentName: 180,
  mobile: 120,
  id: 140,
  paymentTerms: 120,
  discount: 80,
  created: 100,
  actions: 88,
};
export const CUSTOMERS_COLUMN_CLASS: Record<CustomersColumnKey, string> = {
  name: 'dt-col-name',
  documentName: 'dt-col-doc-name',
  mobile: 'dt-col-mobile',
  id: 'dt-col-id',
  paymentTerms: 'dt-col-terms',
  discount: 'dt-col-discount',
  created: 'dt-col-created',
  actions: 'dt-col-actions',
};
export const CUSTOMERS_TEXT_START_COLUMNS = new Set<CustomersColumnKey>(['name', 'documentName']);

export const SUPPLIERS_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.suppliersColumns;
export const SUPPLIERS_COLUMN_KEYS = [
  'name',
  'status',
  'country',
  'taxId',
  'currency',
  'contact',
  'actions',
] as const;
export type SuppliersColumnKey = (typeof SUPPLIERS_COLUMN_KEYS)[number];
export const SUPPLIERS_DEFAULT_WIDTHS: Record<SuppliersColumnKey, number> = {
  name: 220,
  status: 100,
  country: 72,
  taxId: 120,
  currency: 80,
  contact: 160,
  actions: 72,
};
export const SUPPLIERS_COLUMN_CLASS: Record<SuppliersColumnKey, string> = {
  name: 'dt-col-name',
  status: 'dt-col-status',
  country: 'dt-col-country',
  taxId: 'dt-col-tax',
  currency: 'dt-col-currency',
  contact: 'dt-col-contact',
  actions: 'dt-col-actions',
};
export const SUPPLIERS_TEXT_START_COLUMNS = new Set<SuppliersColumnKey>(['name', 'contact']);

export const PURCHASE_RECEIPTS_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.purchaseReceiptsColumns;
export const PURCHASE_RECEIPTS_SORT_STORAGE_KEY = 'ordermgmt.purchase-receipts-sort';

export type TableSortDirection = 'asc' | 'desc';

export type PersistedTableSort<K extends string> = {
  key: K;
  dir: TableSortDirection;
};

const PURCHASE_RECEIPTS_SORTABLE = new Set<string>([
  'number',
  'supplier',
  'date',
  'amount',
  'status',
  'document',
]);

export function loadPurchaseReceiptsSort(
  fallback: PersistedTableSort<PurchaseReceiptsColumnKey>
): PersistedTableSort<PurchaseReceiptsColumnKey> {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(PURCHASE_RECEIPTS_SORT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { key?: string; dir?: string };
    if (
      parsed.key &&
      PURCHASE_RECEIPTS_SORTABLE.has(parsed.key) &&
      (parsed.dir === 'asc' || parsed.dir === 'desc')
    ) {
      return { key: parsed.key as PurchaseReceiptsColumnKey, dir: parsed.dir };
    }
  } catch {
    // ignore corrupt storage
  }
  return fallback;
}

export function savePurchaseReceiptsSort(sort: PersistedTableSort<PurchaseReceiptsColumnKey>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PURCHASE_RECEIPTS_SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    // ignore quota / private mode
  }
}
export const PURCHASE_RECEIPTS_COLUMN_KEYS = [
  'number',
  'supplier',
  'date',
  'amount',
  'status',
  'document',
] as const;
export type PurchaseReceiptsColumnKey = (typeof PURCHASE_RECEIPTS_COLUMN_KEYS)[number];
export const PURCHASE_RECEIPTS_DEFAULT_WIDTHS: Record<PurchaseReceiptsColumnKey, number> = {
  number: 108,
  supplier: 220,
  date: 100,
  amount: 140,
  status: 100,
  document: 80,
};
export const PURCHASE_RECEIPTS_COLUMN_CLASS: Record<PurchaseReceiptsColumnKey, string> = {
  number: 'dt-col-number',
  supplier: 'dt-col-supplier',
  date: 'dt-col-date',
  amount: 'dt-col-amount',
  status: 'dt-col-status',
  document: 'dt-col-document',
};
export const PURCHASE_RECEIPTS_TEXT_START_COLUMNS = new Set<PurchaseReceiptsColumnKey>(['supplier']);

export const DOCUMENTS_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.documentsColumns;
export const DOCUMENTS_COLUMN_KEYS = [
  'number',
  'status',
  'type',
  'customer',
  'clientOrder',
  'description',
  'payment',
  'date',
  'due',
  'amount',
  'actions',
] as const;
export type DocumentsColumnKey = (typeof DOCUMENTS_COLUMN_KEYS)[number];
export const DOCUMENTS_DEFAULT_WIDTHS: Record<DocumentsColumnKey, number> = {
  number: 88,
  status: 88,
  type: 100,
  customer: 160,
  clientOrder: 80,
  description: 200,
  payment: 100,
  date: 96,
  due: 96,
  amount: 100,
  actions: 120,
};
export const DOCUMENTS_COLUMN_CLASS: Record<DocumentsColumnKey, string> = {
  number: 'dt-col-number',
  status: 'dt-col-status',
  type: 'dt-col-type',
  customer: 'dt-col-customer',
  clientOrder: 'dt-col-client-order',
  description: 'dt-col-description',
  payment: 'dt-col-payment',
  date: 'dt-col-date',
  due: 'dt-col-due',
  amount: 'dt-col-amount',
  actions: 'dt-col-actions',
};
export const DOCUMENTS_TEXT_START_COLUMNS = new Set<DocumentsColumnKey>([
  'customer',
  'description',
]);

export const BUSINESS_EXPENSES_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.businessExpensesColumns;
export const BUSINESS_EXPENSES_COLUMN_KEYS = [
  'date',
  'type',
  'notes',
  'vendor',
  'amount',
  'recognized',
  'docs',
  'actions',
] as const;
export type BusinessExpensesColumnKey = (typeof BUSINESS_EXPENSES_COLUMN_KEYS)[number];
export const BUSINESS_EXPENSES_DEFAULT_WIDTHS: Record<BusinessExpensesColumnKey, number> = {
  date: 110,
  type: 140,
  notes: 180,
  vendor: 200,
  amount: 100,
  recognized: 120,
  docs: 56,
  actions: 300,
};
export const BUSINESS_EXPENSES_COLUMN_CLASS: Record<BusinessExpensesColumnKey, string> = {
  date: 'dt-col-date',
  type: 'dt-col-type',
  notes: 'dt-col-notes',
  vendor: 'dt-col-vendor',
  amount: 'dt-col-amount',
  recognized: 'dt-col-recognized',
  docs: 'dt-col-docs',
  actions: 'dt-col-actions',
};
export const BUSINESS_EXPENSES_TEXT_START_COLUMNS = new Set<BusinessExpensesColumnKey>([
  'type',
  'notes',
  'vendor',
]);

export const FIXED_ASSETS_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.fixedAssetsColumns;
export const FIXED_ASSETS_COLUMN_KEYS = [
  'name',
  'category',
  'purchaseDate',
  'cost',
  'annualRate',
  'annualDepreciation',
  'status',
  'actions',
] as const;
export type FixedAssetsColumnKey = (typeof FIXED_ASSETS_COLUMN_KEYS)[number];
export const FIXED_ASSETS_DEFAULT_WIDTHS: Record<FixedAssetsColumnKey, number> = {
  name: 180,
  category: 200,
  purchaseDate: 110,
  cost: 100,
  annualRate: 88,
  annualDepreciation: 100,
  status: 120,
  actions: 200,
};
export const FIXED_ASSETS_COLUMN_CLASS: Record<FixedAssetsColumnKey, string> = {
  name: 'dt-col-name',
  category: 'dt-col-category',
  purchaseDate: 'dt-col-date',
  cost: 'dt-col-amount',
  annualRate: 'dt-col-rate',
  annualDepreciation: 'dt-col-amount',
  status: 'dt-col-status',
  actions: 'dt-col-actions',
};
export const FIXED_ASSETS_TEXT_START_COLUMNS = new Set<FixedAssetsColumnKey>(['name', 'category']);
