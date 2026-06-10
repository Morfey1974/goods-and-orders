import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

type HeaderVariant = 'dt' | 'inv';

export type DataTableHeaderSort = {
  active: boolean;
  direction: 'asc' | 'desc';
  onToggle: () => void;
};

export function renderDataTableHeaderCell(
  colKey: string,
  label: ReactNode,
  columnClass: string,
  onResizeHandleMouseDown: (key: string, e: MouseEvent) => void,
  resizeLabel: string,
  startAlign = false,
  variant: HeaderVariant = 'dt',
  sort?: DataTableHeaderSort
) {
  const thClass = variant === 'inv' ? 'inv-th-resizable' : 'dt-th-resizable';
  const labelClass = variant === 'inv' ? 'inv-th-label' : 'dt-th-label';
  const handleClass = variant === 'inv' ? 'inv-col-resize-handle' : 'dt-col-resize-handle';
  const sortIndicator = sort
    ? sort.active
      ? sort.direction === 'asc'
        ? '▲'
        : '▼'
      : '⇅'
    : null;

  const onSortKeyDown = sort
    ? (e: KeyboardEvent<HTMLTableCellElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sort.onToggle();
        }
      }
    : undefined;

  return (
    <th
      key={colKey}
      className={`${thClass} ${columnClass}${startAlign ? ' dt-col-text-start' : ''}${sort ? ' dt-th-sortable' : ''}${sort?.active ? ' sorted' : ''}`}
      onClick={sort ? sort.onToggle : undefined}
      onKeyDown={onSortKeyDown}
      aria-sort={
        sort
          ? sort.active
            ? sort.direction === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'
          : undefined
      }
      tabIndex={sort ? 0 : undefined}
    >
      <span className={`${labelClass}${sort ? ' dt-th-sort-label' : ''}`}>
        {label}
        {sortIndicator != null && (
          <span className="dt-sort-indicator" aria-hidden>
            {sortIndicator}
          </span>
        )}
      </span>
      <span
        className={handleClass}
        onMouseDown={(e) => onResizeHandleMouseDown(colKey, e)}
        onClick={(e) => e.stopPropagation()}
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
        tabIndex={-1}
      />
    </th>
  );
}
