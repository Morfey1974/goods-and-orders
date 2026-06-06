import { RESIZABLE_PANEL_KEYS } from './resizablePanelKeys';

export const PRODUCTS_CATALOG_COLUMN_WIDTHS_KEY = RESIZABLE_PANEL_KEYS.productsCatalogColumns;

export const PRODUCTS_CATALOG_COLUMN_KEYS = [
  'image',
  'articleCode',
  'name',
  'kind',
  'type',
  'groups',
  'warehouse',
  'unitPrice',
  'trackInventory',
  'stockQuantity',
  'isActive',
  'actions',
] as const;

export type ProductsCatalogColumnKey = (typeof PRODUCTS_CATALOG_COLUMN_KEYS)[number];

export const PRODUCTS_CATALOG_DEFAULT_WIDTHS: Record<ProductsCatalogColumnKey, number> = {
  image: 64,
  articleCode: 112,
  name: 240,
  kind: 88,
  type: 128,
  groups: 150,
  warehouse: 130,
  unitPrice: 96,
  trackInventory: 108,
  stockQuantity: 88,
  isActive: 96,
  actions: 52,
};
