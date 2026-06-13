import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { assembliesApi, type AssemblyListItem } from '../api/assemblies';
import { DateInput } from '../components/DateInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { BidiText } from '../components/BidiText';
import '../styles/assemblies.css';
import '../styles/purchase-receipts.css';
import { ASSEMBLIES_PANEL_RESIZE } from '../lib/resizablePanelKeys';

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function AssembliesPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<AssemblyListItem[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    assembliesApi
      .list(token, {
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      .then(setList)
      .catch((e) => setError(e.message));
  }, [token, status, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => {
      const statusLabel =
        a.status === 'Posted'
          ? t('assemblies.statusPosted')
          : t('assemblies.statusDraft');
      return (
        a.assemblyNumber.toLowerCase().includes(q) ||
        a.outputArticleCode.toLowerCase().includes(q) ||
        a.outputProductName.toLowerCase().includes(q) ||
        statusLabel.toLowerCase().includes(q)
      );
    });
  }, [list, search, t]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const d = b.assemblyDate.localeCompare(a.assemblyDate);
        if (d !== 0) return d;
        return b.assemblyNumber.localeCompare(a.assemblyNumber, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }),
    [filtered]
  );

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(
    sorted,
    [status, from, to, search]
  );

  const deleteTarget = deleteId
    ? pageItems.find((a) => a.id === deleteId) ?? list.find((a) => a.id === deleteId)
    : null;

  const performListDelete = async () => {
    if (!token || !deleteId) return;
    setDeleteBusy(true);
    setError('');
    try {
      await assembliesApi.delete(token, deleteId);
      setDeleteId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="page assemblies-page">
      {error && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={ASSEMBLIES_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('assemblies.title')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
              <Link to="/assemblies/new" className="btn btn-primary">
                + {t('assemblies.add')}
              </Link>
            </div>
          </div>
        }
        toolbarSecondary={
          <div className="dt-panel-filters asm-list-filters">
            <label className="dt-panel-search asm-list-filter asm-list-filter--search">
              <span>{t('assemblies.search')}</span>
              <input
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('assemblies.searchPlaceholder')}
              />
            </label>
            <label className="asm-list-filter asm-list-filter--status">
              <span>{t('assemblies.filterStatus')}</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t('assemblies.allStatuses')}</option>
                <option value="Draft">{t('assemblies.statusDraft')}</option>
                <option value="Posted">{t('assemblies.statusPosted')}</option>
              </select>
            </label>
            <label className="asm-list-filter asm-list-filter--date">
              <span>{t('assemblies.dateFrom')}</span>
              <DateInput value={from} onChange={setFrom} />
            </label>
            <label className="asm-list-filter asm-list-filter--date">
              <span>{t('assemblies.dateTo')}</span>
              <DateInput value={to} onChange={setTo} />
            </label>
          </div>
        }
        pagination={{
          page,
          pageCount,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      >
        <table className="data-table asm-list-table">
          <thead>
            <tr>
              <th>{t('assemblies.colNumber')}</th>
              <th>{t('assemblies.colDate')}</th>
              <th>{t('assemblies.colOutput')}</th>
              <th>{t('assemblies.colQty')}</th>
              <th>{t('assemblies.colAdditionalCost')}</th>
              <th>{t('assemblies.colStatus')}</th>
              <th className="asm-list-col-actions" aria-label={t('products.actions')} />
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  {t('assemblies.empty')}
                </td>
              </tr>
            ) : (
              pageItems.map((a) => (
                <tr
                  key={a.id}
                  className="clickable-row"
                  onClick={() => navigate(`/assemblies/${a.id}`)}
                >
                  <td>
                    <Link to={`/assemblies/${a.id}`} onClick={(e) => e.stopPropagation()}>
                      {a.assemblyNumber}
                    </Link>
                  </td>
                  <td>{formatDate(a.assemblyDate)}</td>
                  <td>
                    <code>{a.outputArticleCode}</code>{' '}
                    <BidiText as="span">{a.outputProductName}</BidiText>
                  </td>
                  <td>{a.outputQuantity}</td>
                  <td>{a.additionalCostIls > 0 ? `${a.additionalCostIls.toFixed(2)} ₪` : '—'}</td>
                  <td>
                    <span className={`pr-status pr-status--${a.status.toLowerCase()}`}>
                      {a.status === 'Posted'
                        ? t('assemblies.statusPosted')
                        : t('assemblies.statusDraft')}
                    </span>
                  </td>
                  <td
                    className="table-actions-cell asm-list-col-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.status === 'Draft' && (
                      <button
                        type="button"
                        className="pr-line-remove"
                        title={t('products.actionDelete')}
                        aria-label={t('products.actionDelete')}
                        onClick={() => setDeleteId(a.id)}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>

      <ConfirmDialog
        open={deleteId !== null}
        title={t('assemblies.deleteConfirmTitle')}
        message={t('assemblies.listDeleteConfirm', {
          number: deleteTarget?.assemblyNumber ?? '',
        })}
        confirmLabel={t('products.actionDelete')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleteBusy}
        onConfirm={() => void performListDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
