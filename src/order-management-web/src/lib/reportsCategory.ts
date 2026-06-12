export type ReportCategoryId = 'warehouse' | 'financial';

const STORAGE_KEY = 'ordermgmt.reports-active-category';

const FINANCIAL_REPORT_PATHS = new Set([
  '/reports/income',
  '/reports/expenses',
  '/reports/cogs',
  '/reports/gross-profit',
  '/reports/operating-expenses',
  '/reports/form-1342',
  '/reports/profit-and-loss',
  '/reports/vendor-services',
]);

const WAREHOUSE_REPORT_PATHS = new Set(['/reports/inventory-valuation']);

export function categoryForReportPath(pathname: string): ReportCategoryId | null {
  if (FINANCIAL_REPORT_PATHS.has(pathname)) return 'financial';
  if (WAREHOUSE_REPORT_PATHS.has(pathname)) return 'warehouse';
  return null;
}

export function readReportsCategory(): ReportCategoryId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'financial' || raw === 'warehouse') return raw;
  } catch {
    /* ignore */
  }
  return 'warehouse';
}

export function writeReportsCategory(category: ReportCategoryId) {
  try {
    localStorage.setItem(STORAGE_KEY, category);
  } catch {
    /* ignore */
  }
}
