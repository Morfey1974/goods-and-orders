import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { warehouseApi, type WarehouseReportPdfParams } from '../api/warehouse';

import { WAREHOUSE_MOVEMENTS_RESIZE } from '../lib/resizablePanelKeys';

import { formatStockQuantity } from '../lib/stockQuantity';

import { DocumentPdfPreviewModal } from './documents/DocumentPdfPreviewModal';

import { AppModal } from './ui/AppModal';



type Props = {

  open: boolean;

  onClose: () => void;

  token: string;

  warehouseId?: string;

  showWarehouseColumn: boolean;

};



export function WarehouseMovementsModal({

  open,

  onClose,

  token,

  warehouseId,

  showWarehouseColumn,

}: Props) {

  const { t } = useTranslation();

  const [movements, setMovements] = useState<Awaited<ReturnType<typeof warehouseApi.movements>>>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [pdfOpen, setPdfOpen] = useState(false);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);

  const [pdfError, setPdfError] = useState<string | null>(null);

  const pdfParamsRef = useRef<WarehouseReportPdfParams | undefined>(undefined);



  useEffect(() => {

    if (!open || !token) return;

    setLoading(true);

    setError('');

    warehouseApi

      .movements(token, 100, warehouseId)

      .then(setMovements)

      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))

      .finally(() => setLoading(false));

  }, [open, token, warehouseId]);



  const buildPdfParams = useCallback((): WarehouseReportPdfParams => ({

    warehouseId,

    limit: 500,

  }), [warehouseId]);



  const revokePdfUrl = () => {

    setPdfUrl((prev) => {

      if (prev) URL.revokeObjectURL(prev);

      return null;

    });

  };



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

      const blob = await warehouseApi.fetchMovementsReportPdfBlob(token, params);

      setPdfUrl(URL.createObjectURL(blob));

    } catch (err) {

      setPdfError(err instanceof Error ? err.message : 'Error');

    } finally {

      setPdfLoading(false);

    }

  };



  const onDownloadPdf = async () => {

    if (!token) return;

    try {

      await warehouseApi.downloadMovementsReportPdf(token, pdfParamsRef.current ?? buildPdfParams());

    } catch (err) {

      setPdfError(err instanceof Error ? err.message : 'Error');

    }

  };



  return (

    <>

      <AppModal

        open={open}

        onClose={onClose}

        ariaLabel={t('warehouse.movements')}

        className="app-modal-panel warehouse-movements-modal"

        overlayClassName="warehouse-movements-overlay"

        noCard

        closeOnBackdrop={false}

        resize={WAREHOUSE_MOVEMENTS_RESIZE}

      >

        <header className="app-modal-panel__header app-modal-panel__header--with-actions">

          <h2>{t('warehouse.movements')}</h2>

          <div className="app-modal-panel__header-actions">

            <button

              type="button"

              className="btn btn-secondary"

              onClick={openPdfPreview}

              disabled={loading}

            >

              {t('warehouse.viewReportPdf')}

            </button>

            <button

              type="button"

              className="app-modal-panel__close"

              onClick={onClose}

              aria-label={t('products.close')}

            >

              ×

            </button>

          </div>

        </header>

        <div className="app-modal-panel__body">

          {error && <div className="error-banner">{error}</div>}

          {loading ? (

            <p className="muted">{t('products.loading')}</p>

          ) : (

            <div className="table-wrap">

              <table className="data-table">

                <thead>

                  <tr>

                    {showWarehouseColumn && <th>{t('products.warehouseCol')}</th>}

                    <th>{t('products.article')}</th>

                    <th>{t('products.name')}</th>

                    <th>{t('warehouse.type')}</th>

                    <th>{t('warehouse.qty')}</th>

                    <th>{t('warehouse.after')}</th>

                    <th>{t('warehouse.date')}</th>

                  </tr>

                </thead>

                <tbody>

                  {movements.map((m) => (

                    <tr key={m.id}>

                      {showWarehouseColumn && <td>{m.warehouseName}</td>}

                      <td><code>{m.articleCode}</code></td>

                      <td>{m.productName}</td>

                      <td>{t(`warehouse.moveTypes.${m.movementType}`)}</td>

                      <td>{formatStockQuantity(m.quantity)}</td>

                      <td>{formatStockQuantity(m.balanceAfter)}</td>

                      <td>{new Date(m.createdAt).toLocaleString()}</td>

                    </tr>

                  ))}

                </tbody>

              </table>

              {movements.length === 0 && (

                <p className="muted empty-table">{t('products.noMovements')}</p>

              )}

            </div>

          )}

        </div>

      </AppModal>



      <DocumentPdfPreviewModal

        open={pdfOpen}

        title={t('reports.movementsPdfTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        onDownload={onDownloadPdf}

      />

    </>

  );

}

