const SERVICE_TYPES = new Set(['Service', 'Charge']);

export function isServiceProductType(productType: string) {
  return SERVICE_TYPES.has(productType);
}

export type ProductKindFilter = '' | 'goods' | 'service';

export function matchesProductKindFilter(productType: string, filter: ProductKindFilter) {
  if (!filter) return true;
  const isService = isServiceProductType(productType);
  return filter === 'service' ? isService : !isService;
}
