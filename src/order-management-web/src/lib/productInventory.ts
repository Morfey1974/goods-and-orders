const STOCK_TYPES = ['ComponentPart', 'FinishedGood', 'Bundle', 'Spare'];

export function productTypeCanTrackStock(productType: string) {
  return STOCK_TYPES.includes(productType);
}

export function isFixedAssetProductType(productType: string) {
  return productType === 'FixedAsset';
}

export function isConsumableProductType(productType: string) {
  return productType === 'Consumable';
}

export function productTracksStock(product: { productType: string; trackInventory?: boolean }) {
  const track = product.trackInventory ?? false;
  return track && productTypeCanTrackStock(product.productType);
}
