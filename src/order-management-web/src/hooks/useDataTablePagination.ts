import { useEffect, useMemo, useState } from 'react';

export const DATA_TABLE_PAGE_SIZES = [25, 50, 100, 200] as const;

export function useDataTablePagination<T>(items: T[], resetDeps: unknown[] = []) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page, pageSize]
  );

  useEffect(() => {
    setPage(0);
  }, [pageSize, ...resetDeps]);

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    pageItems,
    total: items.length,
  };
}
