import type { MouseEvent, ReactNode } from 'react';

type HeaderVariant = 'dt' | 'inv';

export function renderDataTableHeaderCell(
  colKey: string,
  label: ReactNode,
  columnClass: string,
  onResizeHandleMouseDown: (key: string, e: MouseEvent) => void,
  resizeLabel: string,
  startAlign = false,
  variant: HeaderVariant = 'dt'
) {
  const thClass = variant === 'inv' ? 'inv-th-resizable' : 'dt-th-resizable';
  const labelClass = variant === 'inv' ? 'inv-th-label' : 'dt-th-label';
  const handleClass = variant === 'inv' ? 'inv-col-resize-handle' : 'dt-col-resize-handle';

  return (
    <th
      key={colKey}
      className={`${thClass} ${columnClass}${startAlign ? ' dt-col-text-start' : ''}`}
    >
      <span className={labelClass}>{label}</span>
      <span
        className={handleClass}
        onMouseDown={(e) => onResizeHandleMouseDown(colKey, e)}
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
        tabIndex={-1}
      />
    </th>
  );
}
