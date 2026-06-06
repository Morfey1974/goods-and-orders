import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Warehouse } from '../../api/warehouse';

type Props = {
  warehouses: Warehouse[];
  value: string;
  onChange: (warehouseId: string) => void;
  disabled?: boolean;
};

export function ProductWarehouseSelect({ warehouses, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | undefined>(undefined);

  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.isActive),
    [warehouses]
  );

  const selected = activeWarehouses.find((w) => w.id === value);

  const triggerLabel = selected?.name ?? t('products.warehouseCardPlaceholder');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelWidth(undefined);
      return;
    }
    const trigger = rootRef.current?.querySelector<HTMLElement>('.product-groups-select-trigger');
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    setPanelWidth(Math.max(trigger.offsetWidth, menu.scrollWidth));
  }, [open, activeWarehouses, triggerLabel]);

  if (activeWarehouses.length === 0) {
    return (
      <div className="product-groups-select-field">
        <span className="product-groups-select-label">{t('products.warehouseCardTitle')}</span>
        <p className="muted product-groups-select-empty">{t('products.warehouseCardEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="product-groups-select-field">
      <span className="product-groups-select-label">{t('products.warehouseCardTitle')}</span>
      <div
        className={`product-groups-select${open ? ' is-open' : ''}`}
        ref={rootRef}
        style={panelWidth ? { minWidth: panelWidth } : undefined}
      >
        <button
          type="button"
          className="product-groups-select-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={!selected ? 'product-groups-select-placeholder' : undefined}>{triggerLabel}</span>
          <span className="product-groups-select-chevron" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div ref={menuRef} className="product-groups-select-menu" role="listbox">
            {activeWarehouses.map((w) => (
              <label key={w.id} className="product-groups-select-option">
                <input
                  type="radio"
                  name="product-warehouse"
                  checked={value === w.id}
                  onChange={() => {
                    onChange(w.id);
                    setOpen(false);
                  }}
                />
                <span className="product-groups-select-option-name">{w.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
