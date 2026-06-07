import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { purchaseReceiptsApi, type PurchaseReceiptListItem } from '../api/purchaseReceipts';
import { suppliersApi, type Supplier } from '../api/suppliers';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import {
  PURCHASE_RECEIPTS_COLUMN_CLASS,
  PURCHASE_RECEIPTS_COLUMN_KEYS,
  PURCHASE_RECEIPTS_COLUMN_WIDTHS_KEY,
  PURCHASE_RECEIPTS_DEFAULT_WIDTHS,
  PURCHASE_RECEIPTS_TEXT_START_COLUMNS,
  type PurchaseReceiptsColumnKey,
} from '../lib/listTableColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { PURCHASE_RECEIPTS_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import '../styles/purchase-receipts.css';

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function PurchaseReceiptsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<PurchaseReceiptListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    PURCHASE_RECEIPTS_COLUMN_WIDTHS_KEY,
    PURCHASE_RECEIPTS_DEFAULT_WIDTHS
  );

  const load = useCallback(() => {
    if (!token) return;
    purchaseReceiptsApi
      .list(token, {
        supplierId: supplierId || undefined,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      .then(setList)
      .catch((e) => setError(e.message));
  }, [token, supplierId, status, from, to]);

  useEffect(() => {
    if (!token) return;
    suppliersApi.list(token).then(setSuppliers).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(list, [
    supplierId,
    status,
    from,
    to,
  ]);

  const columnLabel = (key: PurchaseReceiptsColumnKey): string => {
    switch (key) {
      case 'number':
        return t('purchaseReceipts.colNumber');
      case 'supplier':
        return t('purchaseReceipts.colSupplier');
      case 'date':
        return t('purchaseReceipts.colDate');
      case 'amount':
        return t('purchaseReceipts.colAmount');
      case 'status':
        return t('purchaseReceipts.colStatus');
      case 'document':
        return t('purchaseReceipts.colDocument');
      default:
        return key;
    }
  };

  const cellClass = (key: PurchaseReceiptsColumnKey) =>
    `${PURCHASE_RECEIPTS_COLUMN_CLASS[key]}${PURCHASE_RECEIPTS_TEXT_START_COLUMNS.has(key) ? ' dt-col-text-start' : ''}`;

  return (
    <div className="page purchase-receipts-page">
      {error && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={PURCHASE_RECEIPTS_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('purchaseReceipts.title')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
              <Link to="/purchase-receipts/new" className="btn btn-primary">
                + {t('purchaseReceipts.add')}
              </Link>
            </div>
          </div>
        }
        toolbarSecondary={
          <div className="dt-panel-filters">
            <label>
              <span>{t('purchaseReceipts.filterSupplier')}</span>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">{t('purchaseReceipts.allSuppliers')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('purchaseReceipts.filterStatus')}</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t('purchaseReceipts.allStatuses')}</option>
                <option value="Draft">{t('purchaseReceipts.statusDraft')}</option>
                <option value="Posted">{t('purchaseReceipts.statusPosted')}</option>
              </select>
            </label>
            <label>
              <span>{t('purchaseReceipts.dateFrom')}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              <span>{t('purchaseReceipts.dateTo')}</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <table className="dt-panel-table" style={{ minWidth: tableMinWidth }}>
          <colgroup>
            {PURCHASE_RECEIPTS_COLUMN_KEYS.map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {PURCHASE_RECEIPTS_COLUMN_KEYS.map((key) =>
                renderDataTableHeaderCell(
                  key,
                  columnLabel(key),
                  PURCHASE_RECEIPTS_COLUMN_CLASS[key],
                  onResizeHandleMouseDown,
                  t('products.resizeColumn'),
                  PURCHASE_RECEIPTS_TEXT_START_COLUMNS.has(key)
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={PURCHASE_RECEIPTS_COLUMN_KEYS.length} className="dt-panel-empty muted">
                  {t('purchaseReceipts.empty')}
                </td>
              </tr>
            ) : (
              pageItems.map((r) => (
                <tr
                  key={r.id}
                  className="dt-panel-row-clickable"
                  onClick={() => navigate(`/purchase-receipts/${r.id}`)}
                >
                  <td className={cellClass('number')}>{r.receiptNumber}</td>
                  <td className={`${cellClass('supplier')} bidi-auto`}>{r.supplierName}</td>
                  <td className={cellClass('date')}>{formatDate(r.documentDate)}</td>
                  <td className={cellClass('amount')}>
                    {r.totalAmount != null ? `${r.totalAmount.toFixed(2)} ${r.currency}` : '—'}
                  </td>
                  <td className={cellClass('status')}>
                    <span className={`pr-status pr-status--${r.status.toLowerCase()}`}>
                      {r.status === 'Posted'
                        ? t('purchaseReceipts.statusPosted')
                        : t('purchaseReceipts.statusDraft')}
                    </span>
                  </td>
                  <td className={cellClass('document')}>
                    {r.documentCount > 0
                      ? Array.from({ length: r.documentCount }, (_, i) => (
                          <span key={i} className="pr-doc-clip" aria-hidden="true">
                            📎
                          </span>
                        ))
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>
    </div>
  );
}
