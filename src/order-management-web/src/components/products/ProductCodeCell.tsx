import { useTranslation } from 'react-i18next';

type Props = {
  articleCode: string;
  legacySku?: string | null;
  className?: string;
};

export function ProductCodeCell({ articleCode, legacySku, className }: Props) {
  const { t } = useTranslation();
  const rootClass = className ? `product-code-cell ${className}` : 'product-code-cell';

  return (
    <div className={rootClass}>
      <code>{articleCode}</code>
      {legacySku ? (
        <span className="product-legacy-sku" title={t('products.legacySku')}>
          {legacySku}
        </span>
      ) : null}
    </div>
  );
}
