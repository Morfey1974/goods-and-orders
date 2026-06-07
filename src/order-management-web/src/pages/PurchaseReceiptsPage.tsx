import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { purchaseReceiptsApi, type PurchaseReceiptListItem } from '../api/purchaseReceipts';
import { suppliersApi, type Supplier } from '../api/suppliers';
import { useAuth } from '../context/AuthContext';
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

  return (
    <div className="page purchase-receipts-page">
      <div className="purchase-receipts-toolbar">
        <h1>{t('purchaseReceipts.title')}</h1>
        <Link to="/purchase-receipts/new" className="btn btn-primary">
          + {t('purchaseReceipts.add')}
        </Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card purchase-receipts-filters">
        <label>
          <span>{t('purchaseReceipts.filterSupplier')}</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{t('purchaseReceipts.allSuppliers')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
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

      <div className="card purchase-receipts-table-wrap">
        <table className="purchase-receipts-table">
          <thead>
            <tr>
              <th>{t('purchaseReceipts.colNumber')}</th>
              <th>{t('purchaseReceipts.colSupplier')}</th>
              <th>{t('purchaseReceipts.colDate')}</th>
              <th>{t('purchaseReceipts.colAmount')}</th>
              <th>{t('purchaseReceipts.colStatus')}</th>
              <th>{t('purchaseReceipts.colDocument')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/purchase-receipts/${r.id}`)}>
                <td>{r.receiptNumber}</td>
                <td className="bidi-auto">{r.supplierName}</td>
                <td>{formatDate(r.documentDate)}</td>
                <td>
                  {r.totalAmount != null ? `${r.totalAmount.toFixed(2)} ${r.currency}` : '—'}
                </td>
                <td>
                  <span className={`pr-status pr-status--${r.status.toLowerCase()}`}>
                    {r.status === 'Posted'
                      ? t('purchaseReceipts.statusPosted')
                      : t('purchaseReceipts.statusDraft')}
                  </span>
                </td>
                <td>
                  {r.documentCount > 0
                    ? Array.from({ length: r.documentCount }, (_, i) => (
                        <span key={i} className="pr-doc-clip" aria-hidden="true">📎</span>
                      ))
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <p className="muted purchase-receipts-empty">{t('purchaseReceipts.empty')}</p>
        )}
      </div>
    </div>
  );
}
