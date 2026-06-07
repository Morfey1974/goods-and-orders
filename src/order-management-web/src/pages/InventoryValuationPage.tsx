import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { Link } from 'react-router-dom';

import { inventoryApi, type InventoryValuationReport } from '../api/inventory';

import { useAuth } from '../context/AuthContext';

import { ProductCodeCell } from '../components/products/ProductCodeCell';

import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';

import { formatInventoryLotSource } from '../lib/inventoryLotLabel';

import '../styles/purchase-receipts.css';

import '../styles/inventory.css';



export function InventoryValuationPage() {

  const { t } = useTranslation();

  const { token } = useAuth();

  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));

  const [detailed, setDetailed] = useState(false);

  const [report, setReport] = useState<InventoryValuationReport | null>(null);

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);

  const [pdfOpen, setPdfOpen] = useState(false);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);

  const [pdfError, setPdfError] = useState<string | null>(null);

  const pdfParamsRef = useRef<{ asOfDate: string; detailed: boolean } | undefined>(undefined);



  const revokePdfUrl = useCallback(() => {

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);

    setPdfUrl(null);

  }, [pdfUrl]);



  const buildPdfParams = useCallback(

    () => ({ asOfDate, detailed }),

    [asOfDate, detailed]

  );



  const closePdf = () => {

    setPdfOpen(false);

    revokePdfUrl();

    setPdfError(null);

    setPdfLoading(false);

  };



  const openPdfPreview = async () => {

    if (!token) return;

    const params = buildPdfParams();

    pdfParamsRef.current = params;

    setPdfOpen(true);

    setPdfLoading(true);

    setPdfError(null);

    revokePdfUrl();

    try {

      const blob = await inventoryApi.fetchValuationPdfBlob(token, params.asOfDate, params.detailed);

      setPdfUrl(URL.createObjectURL(blob));

    } catch (err) {

      setPdfError(err instanceof Error ? err.message : 'Error');

    } finally {

      setPdfLoading(false);

    }

  };



  const onDownloadPdf = async () => {

    if (!token) return;

    const params = pdfParamsRef.current ?? buildPdfParams();

    try {

      await inventoryApi.downloadValuationPdf(token, params.asOfDate, params.detailed);

    } catch (err) {

      setPdfError(err instanceof Error ? err.message : 'Error');

    }

  };



  const load = async () => {

    if (!token) return;

    setLoading(true);

    setError('');

    try {

      const r = await inventoryApi.valuation(token, asOfDate, detailed);

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



  const showLotColumns = report?.detailed ?? detailed;

  const colSpan = showLotColumns ? 8 : 6;



  return (

    <div className="page inventory-page">

      <header className="inventory-page-header">

        <Link to="/reports" className="btn-link inventory-back-link">

          ← {t('inventory.backToReports')}

        </Link>

        <h1>{t('inventory.valuationTitle')}</h1>

        <p className="muted">{t('inventory.valuationHint')}</p>

      </header>



      <div className="card inventory-toolbar">

        <label className="pr-field pr-field--date">

          <span>{t('inventory.asOfDate')}</span>

          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />

        </label>

        <label className="inventory-detailed-toggle checkbox-row">

          <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />

          <span>

            {t('inventory.valuationDetailed')}

            <span className="muted inventory-detailed-hint">{t('inventory.valuationDetailedHint')}</span>

          </span>

        </label>

        <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>

          {loading ? t('settings.saving') : t('inventory.runValuation')}

        </button>

        <button

          type="button"

          className="btn btn-secondary"

          disabled={loading || !report}

          onClick={() => void openPdfPreview()}

        >

          {t('reports.preview')}

        </button>

        <button

          type="button"

          className="btn btn-secondary"

          disabled={loading || !report}

          onClick={() => void onDownloadPdf()}

        >

          {t('reports.download')}

        </button>

      </div>



      {error && <div className="error-banner">{error}</div>}



      {report && (

        <div className="card inventory-report-card">

          <p className="inventory-report-summary">

            <span>

              {t('inventory.valuationSummary', {

                method: report.costMethod,

                total: report.grandTotalIls.toFixed(2),

              })}

              {report.detailed ? ` · ${t('inventory.valuationDetailed')}` : ''}

            </span>

          </p>

          <div className="inv-report-wrap">

            <table
              className={`inv-report-table${showLotColumns ? ' inv-report-table--detailed' : ''}`}
            >

              <colgroup>

                <col className="inv-col-warehouse" />

                <col className="inv-col-article" />

                <col className="inv-col-product" />

                {showLotColumns && <col className="inv-col-lot-date" />}

                {showLotColumns && <col className="inv-col-lot-source" />}

                <col className="inv-col-qty" />

                <col className="inv-col-cost" />

                <col className="inv-col-total" />

              </colgroup>

              <thead>

                <tr>

                  <th className="inv-col-warehouse">{t('purchaseReceipts.warehouse')}</th>

                  <th className="inv-col-article">{t('products.articleCol')}</th>

                  <th className="inv-col-product">{t('purchaseReceipts.product')}</th>

                  {showLotColumns && (

                    <th className="inv-col-lot-date">{t('inventory.lotReceivedAt')}</th>

                  )}

                  {showLotColumns && (

                    <th className="inv-col-lot-source">{t('inventory.lotSource')}</th>

                  )}

                  <th className="inv-col-qty">{t('purchaseReceipts.quantity')}</th>

                  <th className="inv-col-cost">{t('inventory.unitCostIls')}</th>

                  <th className="inv-col-total">{t('purchaseReceipts.lineSum')}</th>

                </tr>

              </thead>

              <tbody>

                {report.lines.length === 0 ? (

                  <tr>

                    <td colSpan={colSpan} className="inv-report-empty muted">

                      {t('inventory.valuationEmpty')}

                    </td>

                  </tr>

                ) : (

                  report.lines.map((line) => (

                    <tr key={line.lotId ?? `${line.productId}-${line.warehouseId}`}>

                      <td className="inv-col-warehouse">{line.warehouseName}</td>

                      <td className="inv-col-article">

                        <ProductCodeCell articleCode={line.articleCode} legacySku={line.legacySku} />

                      </td>

                      <td className="inv-col-product">{line.productName}</td>

                      {showLotColumns && (

                        <td className="inv-col-lot-date">{line.receivedAt ?? '—'}</td>

                      )}

                      {showLotColumns && (

                        <td className="inv-col-lot-source">

                          {formatInventoryLotSource(line.sourceLabel, t)}

                        </td>

                      )}

                      <td className="inv-col-qty">{line.quantity}</td>

                      <td className="inv-col-cost">{line.unitCostIls.toFixed(2)}</td>

                      <td className="inv-col-total">{line.totalValueIls.toFixed(2)} ₪</td>

                    </tr>

                  ))

                )}

              </tbody>

              {report.lines.length > 0 && (

                <tfoot>

                  <tr>

                    <td colSpan={colSpan - 1} className="text-end">

                      {t('purchaseReceipts.lineTotal')}

                    </td>

                    <td className="inv-col-total">

                      <strong>{report.grandTotalIls.toFixed(2)} ₪</strong>

                    </td>

                  </tr>

                </tfoot>

              )}

            </table>

          </div>

        </div>

      )}

      <DocumentPdfPreviewModal

        open={pdfOpen}

        title={t('inventory.valuationPdfTitle')}

        pdfUrl={pdfUrl}

        loading={pdfLoading}

        error={pdfError}

        onClose={closePdf}

        onDownload={() => void onDownloadPdf()}

      />

    </div>

  );

}

