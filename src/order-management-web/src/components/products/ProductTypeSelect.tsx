import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRODUCT_TYPES } from '../../api/catalog';

type Props = {
  value: string;
  onChange: (productType: string) => void;
  disabled?: boolean;
};

export function ProductTypeSelect({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [hintType, setHintType] = useState(value);

  useEffect(() => {
    setHintType(value);
  }, [value]);

  return (
    <label className="type-select-field">
      <span>{t('products.type')}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setHintType(e.target.value);
        }}
        onMouseMove={(e) => {
          const sel = e.currentTarget;
          const opt = sel.options[sel.selectedIndex];
          if (opt?.value) setHintType(opt.value);
        }}
        onFocus={(e) => {
          const opt = e.currentTarget.options[e.currentTarget.selectedIndex];
          if (opt?.value) setHintType(opt.value);
        }}
      >
        {PRODUCT_TYPES.map((pt) => (
          <option key={pt} value={pt} title={t(`products.typeHints.${pt}`)}>
            {t(`products.types.${pt}`)}
          </option>
        ))}
      </select>
      <div className="type-hint-box" role="note">
        {t(`products.typeHints.${hintType}`)}
      </div>
    </label>
  );
}
