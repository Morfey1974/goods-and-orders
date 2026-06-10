import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductGroup } from '../../api/productGroups';

type Props = {
  groups: ProductGroup[];
  selectedGroupIds: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  onCreateGroup?: (name: string) => Promise<ProductGroup | null>;
};

export function ProductGroupsMultiSelect({
  groups,
  selectedGroupIds,
  onChange,
  disabled,
  onCreateGroup,
}: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [panelWidth, setPanelWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewName('');
        setCreateError('');
      }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setAdding(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (adding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [adding]);

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
  }, [open, groups, selectedNames, triggerLabel, adding, newName]);

  const toggleGroup = (groupId: string) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    onChange(next);
    setOpen(false);
  };

  const startAdding = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    setCreateError('');
    setNewName('');
  };

  const cancelAdding = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(false);
    setNewName('');
    setCreateError('');
  };

  const submitCreate = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onCreateGroup || !newName.trim() || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const created = await onCreateGroup(newName.trim());
      if (!created) return;
      const next = new Set(selectedGroupIds);
      next.add(created.id);
      onChange(next);
      setNewName('');
      setAdding(false);
      setOpen(true);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCreating(false);
    }
  };

  const showAddGroup = Boolean(onCreateGroup) && !disabled;

  return (
    <div className="product-groups-select-field">
      <span className="product-groups-select-label">{t('products.groupsCardTitle')}</span>
      {groups.length === 0 && !adding && (
        <p className="muted product-groups-select-empty">{t('products.groupsCardEmpty')}</p>
      )}
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
            onClick={(e) => e.stopPropagation()}
          >
            {groups.length === 0 && !adding && (
              <p className="muted product-groups-select-menu-empty">{t('products.groupsEmpty')}</p>
            )}
            {groups.map((g) => (
              <label
                key={g.id}
                className="product-groups-select-option"
                onClick={(e) => {
                  e.preventDefault();
                  toggleGroup(g.id);
                }}
              >
                <input
                  type="checkbox"
                  readOnly
                  tabIndex={-1}
                  checked={selectedGroupIds.has(g.id)}
                />
                <span className="product-groups-select-option-name">{g.name}</span>
              </label>
            ))}
            {showAddGroup && (
              <div className="product-groups-select-add">
                {!adding ? (
                  <button type="button" className="product-groups-select-add-btn" onClick={startAdding}>
                    + {t('products.groupsCardAdd')}
                  </button>
                ) : (
                  <div
                    className="product-groups-select-add-form"
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={addInputRef}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('products.groupsNamePlaceholder')}
                      autoComplete="off"
                      disabled={creating}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void submitCreate(e);
                        }
                      }}
                    />
                    <div className="product-groups-select-add-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={creating || !newName.trim()}
                        onClick={(e) => void submitCreate(e)}
                      >
                        {creating ? t('settings.saving') : t('products.groupsCardCreate')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost-inline btn-sm"
                        disabled={creating}
                        onClick={cancelAdding}
                      >
                        {t('settings.cancel')}
                      </button>
                    </div>
                    {createError && <p className="product-groups-select-add-error">{createError}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
