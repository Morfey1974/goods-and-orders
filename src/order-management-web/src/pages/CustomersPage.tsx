import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { catalogApi, type Customer } from '../api/catalog';
import { useAuth } from '../context/AuthContext';
import '../styles/customers.css';

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function idDisplay(c: Customer) {
  const parts = [c.osekNumber, c.teudatZehut].filter(Boolean);
  return parts.length ? parts.join(' / ') : '—';
}

export function CustomersPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    catalogApi.customers
      .list(token, includeInactive)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [token, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.documentName ?? '').toLowerCase().includes(q) ||
          (c.mobilePhone ?? '').includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.externalKey ?? '').toLowerCase().includes(q) ||
          (c.city ?? '').toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [list, search]);

  return (
    <div className="page customers-page">
      <div className="customers-page-toolbar">
        <div className="customers-page-title-row">
          <h1>{t('nav.customers')}</h1>
          <span className="customers-count-badge">
            {t('customers.resultsCount', { count: filtered.length })}
          </span>
        </div>
        <Link to="/customers/new" className="btn btn-primary customers-add-btn">
          + {t('customers.add')}
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="customers-filters card">
        <label className="customers-search">
          <span className="sr-only">{t('customers.search')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('customers.searchPlaceholder')}
          />
        </label>
        <label className="customers-filter-active">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          {t('customers.showInactive')}
        </label>
      </div>

      <div className="card customers-table-wrap">
        <table className="customers-table">
          <thead>
            <tr>
              <th>{t('customers.colName')}</th>
              <th>{t('customers.documentName')}</th>
              <th>{t('customers.externalKey')}</th>
              <th>{t('customers.colMobile')}</th>
              <th>{t('customers.colId')}</th>
              <th>{t('customers.paymentTerms')}</th>
              <th>{t('customers.discount')}</th>
              <th>{t('customers.colCreated')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className={!c.isActive ? 'customers-row--inactive' : ''}
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <td className="customers-cell-name">
                  <span className="customers-name-link">{c.name}</span>
                  {c.isActive ? (
                    <span className="customers-badge customers-badge--active">{t('customers.active')}</span>
                  ) : (
                    <span className="customers-badge customers-badge--inactive">{t('customers.inactive')}</span>
                  )}
                </td>
                <td>{c.documentName || c.name}</td>
                <td>{c.externalKey || '—'}</td>
                <td>{c.mobilePhone || c.phone || '—'}</td>
                <td>{idDisplay(c)}</td>
                <td>{c.paymentTerms || '—'}</td>
                <td>{c.defaultDiscountPercent > 0 ? `${c.defaultDiscountPercent}%` : '—'}</td>
                <td>{formatDate(c.createdAt)}</td>
                <td className="customers-cell-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/customers/${c.id}`);
                    }}
                  >
                    {t('customers.edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted customers-empty">{t('customers.empty')}</p>}
      </div>
    </div>
  );
}
