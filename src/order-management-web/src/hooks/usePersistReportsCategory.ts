import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { categoryForReportPath, writeReportsCategory } from '../lib/reportsCategory';

/** Remember reports hub tab (warehouse / financial) while viewing a report page. */
export function usePersistReportsCategory() {
  const { pathname } = useLocation();

  useEffect(() => {
    const category = categoryForReportPath(pathname);
    if (category) writeReportsCategory(category);
  }, [pathname]);
}
