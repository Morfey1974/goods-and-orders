import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { inventoryApi, type InventoryValuationReport } from '../api/inventory';
import { useAuth } from '../context/AuthContext';

export function InventoryValuationPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<InventoryValuationReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const r = await inventoryApi.valuation(token, asOfDate);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <Link to="/reports" className="muted page-back">
            {t('inventory.backToReports')}
          </Link>
          <h1>{t('inventory.valuationTitle')}</h1>
          <p className="muted">{t('inventory.valuationHint')}</p>
        </div>
      </div>

      <div className="card inventory-valuation-toolbar">
        <label>
          <span>{t('inventory.asOfDate')}</span>
          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void load()}>
          {loading ? t('settings.saving') : t('inventory.runValuation')}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {report && (
        <div className="card">
          <p className="inventory-valuation-summary">
            {t('inventory.valuationSummary', {
              method: report.costMethod,
              total: report.grandTotalIls.toFixed(2),
            })}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('purchaseReceipts.warehouse')}</th>
                  <th>{t('products.articleCol')}</th>
                  <th>{t('purchaseReceipts.product')}</th>
                  <th>{t('purchaseReceipts.quantity')}</th>
                  <th>{t('inventory.unitCostIls')}</th>
                  <th>{t('purchaseReceipts.lineSum')}</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      {t('inventory.valuationEmpty')}
                    </td>
                  </tr>
                ) : (
                  report.lines.map((line) => (
                    <tr key={`${line.productId}-${line.warehouseId}`}>
                      <td>{line.warehouseName}</td>
                      <td>
                        <code>{line.articleCode}</code>
                      </td>
                      <td>{line.productName}</td>
                      <td>{line.quantity}</td>
                      <td>{line.unitCostIls.toFixed(2)}</td>
                      <td>{line.totalValueIls.toFixed(2)} ₪</td>
                    </tr>
                  ))
                )}
              </tbody>
              {report.lines.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={5} className="text-end">
                      <strong>{t('purchaseReceipts.lineTotal')}</strong>
                    </td>
                    <td>
                      <strong>{report.grandTotalIls.toFixed(2)} ₪</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
