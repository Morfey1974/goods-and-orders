import {
  useCallback,
  useEffect,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { mergeRefs } from '../../lib/mergeRefs';
import type { ResizablePanelConfig } from '../../lib/modalSize';

/** sm=440, md=480, lg=720, xl=960 */
export type AppModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fit';

export type AppModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width preset (ignored when `resize` is set) */
  size?: AppModalSize;
  /** Persisted draggable resize — use RESIZABLE_PANEL_KEYS + defaults from resizablePanelKeys.ts */
  resize?: ResizablePanelConfig;
  className?: string;
  overlayClassName?: string;
  shellClassName?: string;
  zIndex?: number;
  /** Click on dimmed backdrop closes modal (mousedown, resize-safe) */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Blocks backdrop + Escape close (e.g. while saving) */
  preventClose?: boolean;
  labelledBy?: string;
  ariaLabel?: string;
  panelRef?: Ref<HTMLDivElement>;
  /** Skip default `card` class on panel */
  noCard?: boolean;
  role?: 'dialog' | 'alertdialog';
};

const SIZE_CLASS: Record<AppModalSize, string> = {
  sm: 'app-modal__panel--sm',
  md: 'app-modal__panel--md',
  lg: 'app-modal__panel--lg',
  xl: 'app-modal__panel--xl',
  fit: 'app-modal__panel--fit',
};

export function AppModal({
  open,
  onClose,
  children,
  size = 'md',
  resize,
  className = '',
  overlayClassName = '',
  shellClassName = '',
  zIndex,
  closeOnBackdrop = true,
  closeOnEscape = true,
  preventClose = false,
  labelledBy,
  ariaLabel,
  panelRef: externalPanelRef,
  noCard = false,
  role = 'dialog',
}: AppModalProps) {
  const { t } = useTranslation();
  const {
    panelRef: resizePanelRef,
    resizable,
    persistSize,
    onResizeHandleMouseDown,
    shouldSuppressBackdropClose,
  } = useResizablePanel(open, resize);

  const handleClose = useCallback(() => {
    if (preventClose) return;
    if (resizable) persistSize();
    onClose();
  }, [preventClose, resizable, persistSize, onClose]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEscape, handleClose]);

  const onOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop || preventClose) return;
    if (e.target !== e.currentTarget) return;
    if (shouldSuppressBackdropClose()) return;
    handleClose();
  };

  const overlayStyle: CSSProperties | undefined = zIndex !== undefined ? { zIndex } : undefined;

  if (!open) return null;

  const panelClasses = [
    'app-modal__panel',
    !noCard && 'card',
    resizable ? 'app-modal__panel--resizable' : SIZE_CLASS[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className={`app-modal-overlay ${overlayClassName}`.trim()}
      style={overlayStyle}
      onMouseDown={onOverlayMouseDown}
      role="presentation"
    >
      <div className={`app-modal-shell ${shellClassName}`.trim()}>
        <div
          ref={mergeRefs(resizePanelRef, externalPanelRef)}
          className={panelClasses}
          onMouseDown={(e) => e.stopPropagation()}
          role={role}
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={ariaLabel}
        >
          {children}
          {resizable && <div className="app-modal__resize-gutter" aria-hidden />}
          {resizable && (
            <div
              className="app-modal__resize-handle"
              onMouseDown={onResizeHandleMouseDown}
              title={t('common.resizeModal')}
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
