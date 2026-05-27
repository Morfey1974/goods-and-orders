const STOCK_TYPES = ['ComponentPart', 'FinishedGood', 'Bundle', 'Spare'];

export function productTypeCanTrackStock(productType: string) {
  return STOCK_TYPES.includes(productType);
}

export function productTracksStock(product: { productType: string; trackInventory?: boolean }) {
  const track = product.trackInventory ?? true;
  return track && productTypeCanTrackStock(product.productType);
}
