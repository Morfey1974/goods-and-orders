import type { ReactNode } from 'react';
import { ModalResizeHandles } from './ModalResizeHandles';
import { DataTablePageSizeSelect, DataTablePagination } from './DataTablePagination';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import type { ResizablePanelConfig } from '../../lib/modalSize';

type PaginationProps = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

type Props = {
  resize: ResizablePanelConfig;
  summary?: ReactNode;
  toolbar?: ReactNode;
  toolbarSecondary?: ReactNode;
  pagination?: PaginationProps;
  children: ReactNode;
  className?: string;
};

export function DataTablePanel({
  resize,
  summary,
  toolbar,
  toolbarSecondary,
  pagination,
  children,
  className,
}: Props) {
  const { panelRef, onResizeHandleMouseDown } = useResizablePanel(true, resize);

  return (
    <div
      ref={panelRef}
      className={[
        'card',
        'dt-panel',
        'app-modal__panel--resizable',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {toolbar && <div className="dt-panel__toolbar">{toolbar}</div>}
      {toolbarSecondary && <div className="dt-panel__toolbar-secondary">{toolbarSecondary}</div>}

      {(summary || pagination) && (
        <div className="dt-panel__summary">
          {summary && <span className="dt-panel__summary-text">{summary}</span>}
          {pagination && pagination.total > 0 && (
            <DataTablePageSizeSelect
              pageSize={pagination.pageSize}
              onPageSizeChange={pagination.onPageSizeChange}
              className="dt-panel-page-size--top"
            />
          )}
        </div>
      )}

      <div className="dt-panel__table-zone">
        <div className="dt-panel__table-scroll">{children}</div>
      </div>

      {pagination && (
        <DataTablePagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}

      <ModalResizeHandles corner onMouseDown={onResizeHandleMouseDown} />
    </div>
  );
}
