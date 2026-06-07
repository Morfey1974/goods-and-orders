import { useTranslation } from 'react-i18next';
import { DATA_TABLE_PAGE_SIZES } from '../../hooks/useDataTablePagination';

type Props = {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  total: number;
  inline?: boolean;
};

export function DataTablePageSizeSelect({
  pageSize,
  onPageSizeChange,
  className,
}: {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`page-size-select${className ? ` ${className}` : ''}`}>
      <label className="dt-panel-page-size-label">
        <span className="muted">{t('products.pageSize')}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label={t('products.pageSize')}
        >
          {DATA_TABLE_PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function DataTablePagination({
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  total,
  inline,
}: Props) {
  if (total === 0) return null;

  return (
    <div className={`dt-panel-pagination${inline ? ' dt-panel-pagination--inline' : ''}`}>
      {total > pageSize && (
        <button
          type="button"
          className="btn btn-ghost-inline"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          ←
        </button>
      )}
      <span className="muted">
        {page + 1} / {pageCount}
      </span>
      {total > pageSize && (
        <button
          type="button"
          className="btn btn-ghost-inline"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          →
        </button>
      )}
      <DataTablePageSizeSelect
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        className="dt-panel-page-size--inline"
      />
    </div>
  );
}
