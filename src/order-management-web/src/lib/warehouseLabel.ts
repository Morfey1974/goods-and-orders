import type { TFunction } from 'i18next';

export function warehouseLabelForProductType(productType: string, t: TFunction): string {
  if (productType === 'FinishedGood' || productType === 'Bundle') {
    return t('warehouse.finishedGoods');
  }
  if (productType === 'ComponentPart' || productType === 'Spare') {
    return t('warehouse.components');
  }
  return '—';
}
