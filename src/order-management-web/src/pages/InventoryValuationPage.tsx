import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { inventoryApi, type InventoryValuationReport } from '../api/inventory';
import { useAuth } from '../context/AuthContext';
import { DateInput } from '../components/DateInput';
import { ProductCodeCell } from '../components/products/ProductCodeCell';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { BidiText } from '../components/BidiText';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import { formatInventoryLotSource } from '../lib/inventoryLotLabel';
import {
  INVENTORY_VALUATION_COLUMN_CLASS,
  INVENTORY_VALUATION_COLUMN_WIDTHS_KEY,
  INVENTORY_VALUATION_DEFAULT_WIDTHS,
  visibleInventoryValuationColumns,
  type InventoryValuationColumnKey,
} from '../lib/inventoryValuationColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { INVENTORY_VALUATION_REPORT_RESIZE } from '../lib/resizablePanelKeys';
import { buildReportPdfFileName, tHe } from '../lib/pdfDownload';
import type { InventoryValuationLine } from '../api/inventory';

import '../styles/purchase-receipts.css';
import '../styles/inventory.css';

export function InventoryValuationPage() {
  usePersistReportsCategory();
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
  const [pdfDownloadFileName, setPdfDownloadFileName] = useState('');
  const pdfParamsRef = useRef<{ asOfDate: string; detailed: boolean } | undefined>(undefined);

  const showLotColumns = report?.detailed ?? detailed;
  const visibleColumns = useMemo(
    () => visibleInventoryValuationColumns(showLotColumns),
    [showLotColumns]
  );

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    INVENTORY_VALUATION_COLUMN_WIDTHS_KEY,
    INVENTORY_VALUATION_DEFAULT_WIDTHS
  );

  const lines = report?.lines ?? [];
  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(
    lines,
    [showLotColumns]
  );

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
    setPdfDownloadFileName(
      buildReportPdfFileName('reports.pdfFileName_valuation', {
        asOf: params.asOfDate,
        suffix: params.detailed ? tHe('inventory.valuationDetailed') : undefined,
      })
    );
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


  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const r = await inventoryApi.valuation(token, asOfDate, detailed);
      setReport(r);
      setPage(0);
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

  const columnLabel = (key: InventoryValuationColumnKey): string => {
    switch (key) {
      case 'warehouse':
        return t('purchaseReceipts.warehouse');
      case 'article':
        return t('products.articleCol');
      case 'product':
        return t('purchaseReceipts.product');
      case 'lotDate':
        return t('inventory.lotReceivedAt');
      case 'lotSource':
        return t('inventory.lotSource');
      case 'qty':
        return t('purchaseReceipts.quantity');
      case 'cost':
        return t('inventory.unitCostIls');
      case 'total':
        return t('purchaseReceipts.lineSum');
      default:
        return key;
    }
  };

  const renderHeaderCell = (colKey: InventoryValuationColumnKey) =>
    renderDataTableHeaderCell(
      colKey,
      columnLabel(colKey),
      INVENTORY_VALUATION_COLUMN_CLASS[colKey],
      onResizeHandleMouseDown,
      t('products.resizeColumn'),
      colKey === 'product',
      'inv'
    );

  const renderCell = (colKey: InventoryValuationColumnKey, line: InventoryValuationLine) => {
    const className = INVENTORY_VALUATION_COLUMN_CLASS[colKey];
    switch (colKey) {
      case 'warehouse':
        return (
          <td key={colKey} className={className}>
            <BidiText>{line.warehouseName}</BidiText>
          </td>
        );
      case 'article':
        return (
          <td key={colKey} className={className}>
            <ProductCodeCell articleCode={line.articleCode} legacySku={line.legacySku} />
          </td>
        );
      case 'product':
        return (
          <td key={colKey} className={className}>
            <BidiText>{line.productName}</BidiText>
          </td>
        );
      case 'lotDate':
        return (
          <td key={colKey} className={className}>
            {line.receivedAt ?? '—'}
          </td>
        );
      case 'lotSource':
        return (
          <td key={colKey} className={className}>
            <BidiText>{formatInventoryLotSource(line.sourceLabel, t)}</BidiText>
          </td>
        );
      case 'qty':
        return (
          <td key={colKey} className={className}>
            {line.quantity}
          </td>
        );
      case 'cost':
        return (
          <td key={colKey} className={className}>
            {line.unitCostIls.toFixed(2)}
          </td>
        );
      case 'total':
        return (
          <td key={colKey} className={className}>
            {line.totalValueIls.toFixed(2)} ₪
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page inventory-page">
      <header className="inventory-page-header">
        <Link to="/reports" className="btn-link inventory-back-link">
          ← {t('inventory.backToReports')}
        </Link>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {report && (
        <DataTablePanel
          resize={INVENTORY_VALUATION_REPORT_RESIZE}
          toolbar={
            <>
              <div className="dt-panel__toolbar-row">
                <DataTablePanelHeading
                  title={t('inventory.valuationTitle')}
                  count={t('products.results', { count: lines.length })}
                />
                <div className="dt-panel__toolbar-actions">
                  <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                    {loading ? t('settings.saving') : t('inventory.runValuation')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={loading || !report}
                    onClick={() => void openPdfPreview()}
                  >
                    {t('reports.viewPdf')}
                  </button>
                </div>
              </div>
              <label className="inventory-detailed-toggle inventory-detailed-toggle--inline checkbox-row">
                <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
                <span>
                  {t('inventory.valuationDetailed')} ({t('inventory.valuationDetailedHint')})
                </span>
              </label>
            </>
          }
          toolbarSecondary={
            <>
              <label className="pr-field pr-field--date inventory-toolbar-date">
                <span>{t('inventory.asOfDate')}</span>
                <DateInput value={asOfDate} onChange={setAsOfDate} />
              </label>
              <p className="muted dt-panel__hint" style={{ margin: 0 }}>
                {t('inventory.valuationHint')}
              </p>
            </>
          }
          summary={
            <>
              {t('inventory.valuationSummary', {
                method: report.costMethod,
                total: report.grandTotalIls.toFixed(2),
              })}
              {report.detailed ? ` · ${t('inventory.valuationDetailed')}` : ''}
            </>
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
          <div className="inv-report-wrap">
            <table
              className={`inv-report-table${showLotColumns ? ' inv-report-table--detailed' : ''}`}
              style={{ minWidth: tableMinWidth }}
            >
              <colgroup>
                {visibleColumns.map((key) => (
                  <col key={key} className={INVENTORY_VALUATION_COLUMN_CLASS[key]} style={{ width: widths[key] }} />
                ))}
              </colgroup>
              <thead>
                <tr>{visibleColumns.map((key) => renderHeaderCell(key))}</tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="inv-report-empty muted">
                      {t('inventory.valuationEmpty')}
                    </td>
                  </tr>
                ) : (
                  pageItems.map((line) => (
                    <tr key={line.lotId ?? `${line.productId}-${line.warehouseId}`}>
                      {visibleColumns.map((key) => renderCell(key, line))}
                    </tr>
                  ))
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={visibleColumns.length - 1} className="inv-report-tfoot-label">
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
        </DataTablePanel>
      )}

      {!report && !loading && (
        <DataTablePanel
          resize={INVENTORY_VALUATION_REPORT_RESIZE}
          toolbar={
            <>
              <div className="dt-panel__toolbar-row">
                <DataTablePanelHeading title={t('inventory.valuationTitle')} />
                <div className="dt-panel__toolbar-actions">
                  <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                    {loading ? t('settings.saving') : t('inventory.runValuation')}
                  </button>
                </div>
              </div>
              <label className="inventory-detailed-toggle inventory-detailed-toggle--inline checkbox-row">
                <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
                <span>
                  {t('inventory.valuationDetailed')} ({t('inventory.valuationDetailedHint')})
                </span>
              </label>
            </>
          }
          toolbarSecondary={
            <>
              <label className="pr-field pr-field--date inventory-toolbar-date">
                <span>{t('inventory.asOfDate')}</span>
                <DateInput value={asOfDate} onChange={setAsOfDate} />
              </label>
              <p className="muted dt-panel__hint" style={{ margin: 0 }}>
                {t('inventory.valuationHint')}
              </p>
            </>
          }
        >
          <p className="muted dt-panel-empty">{t('inventory.valuationEmpty')}</p>
        </DataTablePanel>
      )}

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('inventory.valuationPdfTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        downloadFileName={pdfDownloadFileName}
      />
    </div>
  );
}
