import type { Warehouse } from '../api/warehouse';

export function isFinishedGoodsProductType(productType: string): boolean {
  return productType === 'FinishedGood' || productType === 'Bundle';
}

export function defaultWarehouseForProductType(productType: string, warehouses: Warehouse[]): string {
  const targetKind = isFinishedGoodsProductType(productType) ? 'FinishedGoods' : 'Components';
  const match = warehouses.find((w) => w.kind === targetKind && w.isActive);
  if (match) return match.id;
  return warehouses.find((w) => w.isActive)?.id ?? '';
}

export function resolveProductWarehouseId(
  productType: string,
  warehouses: Warehouse[],
  explicitWarehouseId?: string | null
): string {
  if (explicitWarehouseId && warehouses.some((w) => w.id === explicitWarehouseId)) {
    return explicitWarehouseId;
  }
  return defaultWarehouseForProductType(productType, warehouses);
}
