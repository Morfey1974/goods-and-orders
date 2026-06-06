import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductGroup } from '../../api/productGroups';

type Props = {
  groups: ProductGroup[];
  selectedGroupIds: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
};

export function ProductGroupsMultiSelect({ groups, selectedGroupIds, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | undefined>(undefined);

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

  const selectedNames = useMemo(
    () => groups.filter((g) => selectedGroupIds.has(g.id)).map((g) => g.name),
    [groups, selectedGroupIds]
  );

  const triggerLabel =
    selectedNames.length === 0
      ? t('products.groupsCardPlaceholder')
      : selectedNames.length <= 2
        ? selectedNames.join(', ')
        : t('products.groupsCardSelectedMany', {
            names: selectedNames.slice(0, 2).join(', '),
            count: selectedNames.length - 2,
          });

  useLayoutEffect(() => {
    if (!open) {
      setPanelWidth(undefined);
      return;
    }
    const trigger = rootRef.current?.querySelector<HTMLElement>('.product-groups-select-trigger');
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    setPanelWidth(Math.max(trigger.offsetWidth, menu.scrollWidth));
  }, [open, groups, selectedNames, triggerLabel]);

  const toggleGroup = (groupId: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    onChange(next);
  };

  if (groups.length === 0) {
    return (
      <div className="product-groups-select-field">
        <span className="product-groups-select-label">{t('products.groupsCardTitle')}</span>
        <p className="muted product-groups-select-empty">{t('products.groupsCardEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="product-groups-select-field">
      <span className="product-groups-select-label">{t('products.groupsCardTitle')}</span>
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
          <span className={selectedNames.length === 0 ? 'product-groups-select-placeholder' : undefined}>
            {triggerLabel}
          </span>
          <span className="product-groups-select-chevron" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div
            ref={menuRef}
            className="product-groups-select-menu"
            role="listbox"
            aria-multiselectable="true"
          >
            {groups.map((g) => (
              <label key={g.id} className="product-groups-select-option">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.has(g.id)}
                  onChange={() => toggleGroup(g.id)}
                />
                <span className="product-groups-select-option-name">{g.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
