export type ReportDatePresetId =
  | 'today'
  | 'week'
  | 'month'
  | 'twoMonths'
  | 'prevMonth'
  | 'prev2Months'
  | 'prev3Months'
  | 'prev6Months'
  | 'last12Months'
  | 'thisMonth'
  | 'last2Months'
  | 'last6Months'
  | 'last2Years'
  | 'thisYear'
  | 'lastYear'
  | 'yearMinus2'
  | 'yearMinus3'
  | 'yearMinus4'
  | 'all';

export type ReportDateRange = {
  from: string;
  to: string;
};

export type ReportDatePresetGroup = 'quick' | 'dropdown';

export type ReportDatePresetDef = {
  id: ReportDatePresetId;
  group: ReportDatePresetGroup;
  /** i18n key under reports.datePreset* */
  labelKey: string;
  /** For dynamic year labels (e.g. current year). */
  yearOffset?: number;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

function addMonths(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

export function getReportDatePresetRange(id: ReportDatePresetId, today = startOfToday()): ReportDateRange {
  const toToday = toIsoDate(today);
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (id) {
    case 'today':
      return { from: toToday, to: toToday };
    case 'week': {
      const from = addMonths(today, 0);
      from.setDate(from.getDate() - 6);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'month': {
      const from = addMonths(today, -1);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'twoMonths': {
      const from = addMonths(today, -2);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'prevMonth': {
      const m = addMonths(today, -1);
      const y = m.getFullYear();
      const mo = m.getMonth();
      return { from: toIsoDate(monthStart(y, mo)), to: toIsoDate(monthEnd(y, mo)) };
    }
    case 'prev2Months': {
      const end = addMonths(today, -1);
      const start = addMonths(today, -2);
      return {
        from: toIsoDate(monthStart(start.getFullYear(), start.getMonth())),
        to: toIsoDate(monthEnd(end.getFullYear(), end.getMonth())),
      };
    }
    case 'prev3Months': {
      const end = addMonths(today, -1);
      const start = addMonths(today, -3);
      return {
        from: toIsoDate(monthStart(start.getFullYear(), start.getMonth())),
        to: toIsoDate(monthEnd(end.getFullYear(), end.getMonth())),
      };
    }
    case 'prev6Months': {
      const end = addMonths(today, -1);
      const start = addMonths(today, -6);
      return {
        from: toIsoDate(monthStart(start.getFullYear(), start.getMonth())),
        to: toIsoDate(monthEnd(end.getFullYear(), end.getMonth())),
      };
    }
    case 'last12Months': {
      const from = addMonths(today, -12);
      from.setDate(from.getDate() + 1);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'thisMonth':
      return {
        from: toIsoDate(monthStart(year, month)),
        to: toIsoDate(monthEnd(year, month)),
      };
    case 'last2Months': {
      const from = addMonths(today, -2);
      from.setDate(from.getDate() + 1);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'last6Months': {
      const from = addMonths(today, -6);
      from.setDate(from.getDate() + 1);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'last2Years': {
      const from = addMonths(today, -24);
      from.setDate(from.getDate() + 1);
      return { from: toIsoDate(from), to: toToday };
    }
    case 'thisYear':
      return { from: toIsoDate(new Date(year, 0, 1)), to: toToday };
    case 'lastYear':
      return {
        from: toIsoDate(new Date(year - 1, 0, 1)),
        to: toIsoDate(new Date(year - 1, 11, 31)),
      };
    case 'yearMinus2':
      return {
        from: toIsoDate(new Date(year - 2, 0, 1)),
        to: toIsoDate(new Date(year - 2, 11, 31)),
      };
    case 'yearMinus3':
      return {
        from: toIsoDate(new Date(year - 3, 0, 1)),
        to: toIsoDate(new Date(year - 3, 11, 31)),
      };
    case 'yearMinus4':
      return {
        from: toIsoDate(new Date(year - 4, 0, 1)),
        to: toIsoDate(new Date(year - 4, 11, 31)),
      };
    case 'all':
      return { from: '', to: '' };
  }
}

export const REPORT_DATE_QUICK_PRESETS: ReportDatePresetDef[] = [
  { id: 'today', group: 'quick', labelKey: 'datePresetToday' },
  { id: 'prevMonth', group: 'quick', labelKey: 'datePresetPrevMonth' },
  { id: 'prev2Months', group: 'quick', labelKey: 'datePresetPrev2Months' },
  { id: 'prev3Months', group: 'quick', labelKey: 'datePresetPrev3Months' },
  { id: 'prev6Months', group: 'quick', labelKey: 'datePresetPrev6Months' },
];

export const REPORT_DATE_DROPDOWN_PRESETS: ReportDatePresetDef[] = [
  { id: 'last12Months', group: 'dropdown', labelKey: 'datePresetLast12Months' },
  { id: 'thisMonth', group: 'dropdown', labelKey: 'datePresetThisMonth' },
  { id: 'last2Months', group: 'dropdown', labelKey: 'datePresetLast2Months' },
  { id: 'last6Months', group: 'dropdown', labelKey: 'datePresetLast6Months' },
  { id: 'last2Years', group: 'dropdown', labelKey: 'datePresetLast2Years' },
  { id: 'prevMonth', group: 'dropdown', labelKey: 'datePresetPrevMonth' },
  { id: 'thisYear', group: 'dropdown', labelKey: 'datePresetThisYearDynamic', yearOffset: 0 },
  { id: 'lastYear', group: 'dropdown', labelKey: 'datePresetYearDynamic', yearOffset: 1 },
  { id: 'yearMinus2', group: 'dropdown', labelKey: 'datePresetYearDynamic', yearOffset: 2 },
  { id: 'yearMinus3', group: 'dropdown', labelKey: 'datePresetYearDynamic', yearOffset: 3 },
  { id: 'yearMinus4', group: 'dropdown', labelKey: 'datePresetYearDynamic', yearOffset: 4 },
  { id: 'all', group: 'dropdown', labelKey: 'datePresetAll' },
];

/** Warehouse PDF modal — simple preset list */
export const REPORT_DATE_PRESETS: ReportDatePresetId[] = [
  'today',
  'week',
  'month',
  'twoMonths',
  'thisYear',
  'lastYear',
];

export function formatReportDisplayDate(iso: string, locale?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  if (locale === 'he') return `${d}/${m}/${y}`;
  if (locale === 'en') return `${m}/${d}/${y}`;
  return `${d}.${m}.${y}`;
}

export function formatReportRangeLabel(from: string, to: string, locale?: string): string {
  if (!from && !to) return '';
  if (!from) return `— ${formatReportDisplayDate(to, locale)}`;
  if (!to) return `${formatReportDisplayDate(from, locale)} —`;
  return `${formatReportDisplayDate(from, locale)} — ${formatReportDisplayDate(to, locale)}`;
}
