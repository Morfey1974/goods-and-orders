import {
  useCallback,
  useEffect,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { mergeRefs } from '../../lib/mergeRefs';
import { buildModalResizeConfig, type ModalSizePreset, type ResizablePanelConfig } from '../../lib/modalSize';
import { ModalResizeHandles } from './ModalResizeHandles';

/** sm=440, md=480, lg=720, xl=960 */
export type AppModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fit';

export type AppModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width preset (ignored when `resize` is set) */
  size?: AppModalSize;
  /** Persisted resize; omit for default (all modals are resizable). Pass `false` to disable. */
  resize?: ResizablePanelConfig | false;
  /** localStorage key suffix when using default resize (defaults to labelledBy / className) */
  resizeKey?: string;
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
  resizeKey,
  className = '',
  overlayClassName = '',
  shellClassName = '',
  zIndex,
  closeOnBackdrop = false,
  closeOnEscape = true,
  preventClose = false,
  labelledBy,
  ariaLabel,
  panelRef: externalPanelRef,
  noCard = false,
  role = 'dialog',
}: AppModalProps) {
  const resizeStorageKey =
    resizeKey ??
    labelledBy ??
    ariaLabel ??
    className.split(/\s+/).find((part) => part && part !== 'card') ??
    'modal';
  const resizeConfig =
    resize === false ? undefined : (resize ?? buildModalResizeConfig(size as ModalSizePreset, resizeStorageKey));

  const {
    panelRef: resizePanelRef,
    resizable,
    persistSize,
    onResizeHandleMouseDown,
    shouldSuppressBackdropClose,
  } = useResizablePanel(open, resizeConfig);

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
          {resizable && <ModalResizeHandles onMouseDown={onResizeHandleMouseDown} />}
        </div>
      </div>
    </div>,
    document.body
  );
}
