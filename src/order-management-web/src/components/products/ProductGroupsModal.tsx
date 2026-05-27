import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Product } from '../../api/catalog';
import { productGroupsApi, type ProductGroup } from '../../api/productGroups';
import { useAuth } from '../../context/AuthContext';
import { AppModal } from '../ui/AppModal';

type Props = {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onChanged: () => void;
};

export function ProductGroupsModal({ open, products, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [memberDraft, setMemberDraft] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    productGroupsApi
      .list(token)
      .then((g) => {
        setGroups(g);
        setActiveId((prev) => (prev && g.some((x) => x.id === prev) ? prev : g[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (open) {
      setError('');
      setNewName('');
      setSearch('');
      load();
    }
  }, [open, load]);

  const active = groups.find((g) => g.id === activeId);

  useEffect(() => {
    if (!active) {
      setMemberDraft(new Set());
      return;
    }
    setMemberDraft(new Set(active.productIds));
  }, [active?.id, active?.productIds.join(',')]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = [...products].filter((p) => p.isActive).sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return items;
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.articleCode.toLowerCase().includes(q) ||
        (p.legacySku?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search]);

  const onCreateGroup = async () => {
    if (!token || !newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const g = await productGroupsApi.create(token, newName.trim());
      setNewName('');
      await load();
      setActiveId(g.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteGroup = async (id: string) => {
    if (!token || !window.confirm(t('products.groupsDeleteConfirm'))) return;
    setBusy(true);
    try {
      await productGroupsApi.delete(token, id);
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const onSaveMembers = async () => {
    if (!token || !active) return;
    setBusy(true);
    setError('');
    try {
      await productGroupsApi.setMembers(token, active.id, [...memberDraft]);
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const toggleMember = (productId: string) => {
    setMemberDraft((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  return (
    <AppModal open={open} onClose={onClose} size="xl" labelledBy="product-groups-title">
      <h2 id="product-groups-title" className="app-modal__title">
        {t('products.groupsTitle')}
      </h2>
      {error && <div className="error-banner">{error}</div>}

      <div className="product-groups-layout">
        <aside className="product-groups-sidebar">
          <div className="product-groups-new">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('products.groupsNamePlaceholder')}
              autoComplete="off"
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !newName.trim()} onClick={() => void onCreateGroup()}>
              +
            </button>
          </div>
          <ul className="product-groups-list">
            {groups.length === 0 && <li className="muted">{t('products.groupsEmpty')}</li>}
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className={`product-groups-item${g.id === activeId ? ' is-active' : ''}`}
                  onClick={() => setActiveId(g.id)}
                >
                  <span>{g.name}</span>
                  <span className="muted">({g.productIds.length})</span>
                </button>
                <button
                  type="button"
                  className="product-groups-delete"
                  title={t('products.groupsDelete')}
                  onClick={() => void onDeleteGroup(g.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="product-groups-members">
          {!active ? (
            <p className="muted">{t('products.groupsPickOrCreate')}</p>
          ) : (
            <>
              <h3 className="product-groups-members-title">{t('products.groupsMembers', { name: active.name })}</h3>
              <input
                type="search"
                className="product-groups-search"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('products.searchPlaceholder')}
              />
              <div className="product-groups-checklist">
                {filteredProducts.map((p) => (
                  <label key={p.id} className="product-groups-check">
                    <input
                      type="checkbox"
                      checked={memberDraft.has(p.id)}
                      onChange={() => toggleMember(p.id)}
                    />
                    <code>{p.articleCode}</code>
                    <span>{p.name}</span>
                    <span className="muted product-groups-check-type">{t(`products.types.${p.productType}`)}</span>
                  </label>
                ))}
              </div>
              <div className="product-groups-members-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSaveMembers()}>
                  {t('products.groupsSaveMembers')}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </AppModal>
  );
}
