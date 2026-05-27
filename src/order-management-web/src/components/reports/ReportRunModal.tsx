import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WarehouseReportPdfParams } from '../../api/warehouse';
import {
  getReportDatePresetRange,
  REPORT_DATE_PRESETS,
  type ReportDatePresetId,
} from '../../lib/reportDatePresets';
import { AppModal } from '../ui/AppModal';

const ALL_WAREHOUSES = '';

export type ReportRunKind = 'balances' | 'movements';

type Props = {
  open: boolean;
  kind: ReportRunKind;
  warehouses: { id: string; name: string }[];
  onClose: () => void;
  onPreview: (params: WarehouseReportPdfParams) => void;
  onDownload: (params: WarehouseReportPdfParams) => void;
};

export function ReportRunModal({
  open,
  kind,
  warehouses,
  onClose,
  onPreview,
  onDownload,
}: Props) {
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSES);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [includeZero, setIncludeZero] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWarehouseId(ALL_WAREHOUSES);
    setFrom('');
    setTo('');
    setDatePreset('');
    setIncludeZero(false);
  }, [open, kind]);

  const buildParams = (): WarehouseReportPdfParams => ({
    warehouseId: warehouseId || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: 500,
    includeZero: kind === 'balances' ? includeZero : undefined,
  });

  const applyPreset = (preset: ReportDatePresetId) => {
    const range = getReportDatePresetRange(preset);
    setFrom(range.from);
    setTo(range.to);
    setDatePreset(preset);
  };

  const presetLabelKey: Record<ReportDatePresetId, string> = {
    today: 'reports.datePresetToday',
    week: 'reports.datePresetWeek',
    month: 'reports.datePresetMonth',
    twoMonths: 'reports.datePresetTwoMonths',
    thisYear: 'reports.datePresetThisYear',
    lastYear: 'reports.datePresetLastYear',
  };

  const title = kind === 'balances' ? t('reports.balancesTitle') : t('reports.movementsTitle');

  return (
    <AppModal open={open} onClose={onClose} size="md" labelledBy="report-run-title">
      <h2 id="report-run-title">{title}</h2>
      <div className="report-run-form">
        <label className="reports-field">
          <span>{t('reports.warehouseFilter')}</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value={ALL_WAREHOUSES}>{t('warehouse.allWarehouses')}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>

        {kind === 'movements' && (
          <>
            <label className="reports-field">
              <span>{t('reports.datePresets')}</span>
              <select
                value={datePreset}
                onChange={(e) => {
                  const value = e.target.value as ReportDatePresetId | '';
                  if (!value) {
                    setDatePreset('');
                    return;
                  }
                  applyPreset(value);
                }}
              >
                <option value="">{t('reports.datePresetSelect')}</option>
                {REPORT_DATE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {t(presetLabelKey[preset])}
                  </option>
                ))}
              </select>
            </label>
            <div className="reports-date-row">
              <label className="reports-field">
                <span>{t('reports.dateFrom')}</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setDatePreset('');
                  }}
                />
              </label>
              <label className="reports-field">
                <span>{t('reports.dateTo')}</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setDatePreset('');
                  }}
                />
              </label>
            </div>
          </>
        )}

        {kind === 'balances' && (
          <label className="reports-checkbox">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
            />
            <span>{t('reports.includeZero')}</span>
          </label>
        )}

        <div className="report-run-actions">
          <button type="button" className="btn btn-primary" onClick={() => onPreview(buildParams())}>
            {t('reports.preview')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onDownload(buildParams())}>
            {t('reports.download')}
          </button>
          <button type="button" className="btn btn-ghost-inline" onClick={onClose}>
            {t('settings.cancel')}
          </button>
        </div>
      </div>
    </AppModal>
  );
}
