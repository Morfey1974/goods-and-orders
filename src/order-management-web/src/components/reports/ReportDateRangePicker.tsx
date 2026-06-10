import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatReportRangeLabel,
  getReportDatePresetRange,
  REPORT_DATE_DROPDOWN_PRESETS,
  REPORT_DATE_QUICK_PRESETS,
  type ReportDatePresetId,
} from '../../lib/reportDatePresets';

import '../../styles/report-date-range.css';

type Props = {
  from: string;
  to: string;
  presetId: ReportDatePresetId | '';
  onChange: (from: string, to: string, presetId: ReportDatePresetId | '') => void;
};

export function ReportDateRangePicker({ from, to, presetId, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [draftPreset, setDraftPreset] = useState<ReportDatePresetId | ''>(presetId);

  useEffect(() => {
    if (!open) {
      setDraftFrom(from);
      setDraftTo(to);
      setDraftPreset(presetId);
    }
  }, [from, to, presetId, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const presetLabel = (labelKey: string, yearOffset?: number) => {
    if (labelKey === 'datePresetThisYearDynamic') {
      const y = new Date().getFullYear() - (yearOffset ?? 0);
      return t('reports.datePresetThisYearNamed', { year: y });
    }
    if (labelKey === 'datePresetYearDynamic') {
      const y = new Date().getFullYear() - (yearOffset ?? 1);
      return t('reports.datePresetPrevYearNamed', { year: y });
    }
    return t(`reports.${labelKey}` as 'reports.datePresetToday');
  };

  const applyRange = (range: { from: string; to: string }, id: ReportDatePresetId | '') => {
    onChange(range.from, range.to, id);
    setOpen(false);
  };

  const applyQuick = (id: ReportDatePresetId) => {
    applyRange(getReportDatePresetRange(id), id);
  };

  const applyDropdownPreset = (id: ReportDatePresetId) => {
    const range = getReportDatePresetRange(id);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setDraftPreset(id);
  };

  const confirmDraft = () => {
    if (draftFrom && draftTo && draftFrom > draftTo) return;
    onChange(draftFrom, draftTo, draftPreset);
    setOpen(false);
  };

  const rangeLabel =
    from || to
      ? formatReportRangeLabel(from, to, i18n.language)
      : t('reports.datePresetAll');

  const draftInvalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);

  return (
    <div className="report-date-range" ref={rootRef}>
      <div className="report-date-range__quick">
        {REPORT_DATE_QUICK_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`report-date-range__chip${presetId === p.id ? ' report-date-range__chip--active' : ''}`}
            onClick={() => applyQuick(p.id)}
          >
            {presetLabel(p.labelKey)}
          </button>
        ))}
      </div>

      <div className="report-date-range__trigger-wrap">
        <button
          type="button"
          className={`report-date-range__trigger${open ? ' report-date-range__trigger--open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
        >
          <span className="report-date-range__trigger-icon" aria-hidden>
            📅
          </span>
          <span className="report-date-range__trigger-label">{rangeLabel}</span>
          <span className="report-date-range__trigger-caret" aria-hidden>
            ▾
          </span>
        </button>

        {open && (
          <div className="report-date-range__panel" id={listId} role="dialog" aria-label={t('reports.dateRangeTitle')}>
            <div className="report-date-range__panel-body">
              <ul className="report-date-range__presets">
                {REPORT_DATE_DROPDOWN_PRESETS.map((p) => (
                  <li key={`${p.id}-${p.yearOffset ?? 0}`}>
                    <button
                      type="button"
                      className={`report-date-range__preset${draftPreset === p.id ? ' report-date-range__preset--active' : ''}`}
                      onClick={() => applyDropdownPreset(p.id)}
                    >
                      {presetLabel(p.labelKey, p.yearOffset)}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="report-date-range__manual">
                <p className="report-date-range__manual-title">{t('reports.dateRangeManualTitle')}</p>
                <label className="report-date-range__field">
                  <span>{t('reports.dateFrom')}</span>
                  <input
                    type="date"
                    value={draftFrom}
                    onChange={(e) => {
                      setDraftFrom(e.target.value);
                      setDraftPreset('');
                    }}
                  />
                </label>
                <label className="report-date-range__field">
                  <span>{t('reports.dateTo')}</span>
                  <input
                    type="date"
                    value={draftTo}
                    onChange={(e) => {
                      setDraftTo(e.target.value);
                      setDraftPreset('');
                    }}
                  />
                </label>
                {draftInvalid && (
                  <p className="report-date-range__error">{t('reports.incomeDateError')}</p>
                )}
                <button
                  type="button"
                  className="btn btn-primary report-date-range__confirm"
                  disabled={draftInvalid}
                  onClick={confirmDraft}
                >
                  {t('reports.dateRangeConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
