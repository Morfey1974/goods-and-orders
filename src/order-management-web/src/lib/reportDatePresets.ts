export type ReportDatePresetId =
  | 'today'
  | 'week'
  | 'month'
  | 'twoMonths'
  | 'thisYear'
  | 'lastYear';

export type ReportDateRange = {
  from: string;
  to: string;
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

export function getReportDatePresetRange(id: ReportDatePresetId): ReportDateRange {
  const today = startOfToday();
  const to = toIsoDate(today);

  switch (id) {
    case 'today':
      return { from: to, to };
    case 'week': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: toIsoDate(from), to };
    }
    case 'month': {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 1);
      return { from: toIsoDate(from), to };
    }
    case 'twoMonths': {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 2);
      return { from: toIsoDate(from), to };
    }
    case 'thisYear': {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: toIsoDate(from), to };
    }
    case 'lastYear': {
      const year = today.getFullYear() - 1;
      const from = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return { from: toIsoDate(from), to: toIsoDate(end) };
    }
  }
}

export const REPORT_DATE_PRESETS: ReportDatePresetId[] = [
  'today',
  'week',
  'month',
  'twoMonths',
  'thisYear',
  'lastYear',
];
