import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import {
  DEFAULT_PRODUCT_PHOTO_VIEW,
  productPhotoDisplayLayout,
  type ProductPhotoViewState,
} from '../../lib/productPhotoView';
import { PRODUCT_PHOTO_PREVIEW_RESIZE } from '../../lib/resizablePanelKeys';
import { ModalResizeHandles } from '../ui/ModalResizeHandles';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

type Props = {
  open: boolean;
  src: string;
  alt: string;
  initialView?: ProductPhotoViewState;
  onClose: () => void;
  onCloseWithView?: (view: ProductPhotoViewState) => void;
};

export function ProductPhotoLightbox({
  open,
  src,
  alt,
  initialView = DEFAULT_PRODUCT_PHOTO_VIEW,
  onClose,
  onCloseWithView,
}: Props) {
  const { t } = useTranslation();
  const [fitToWindow, setFitToWindow] = useState(initialView.fitToWindow);
  const [zoom, setZoom] = useState(initialView.zoom);
  const [pan, setPan] = useState({ x: initialView.panX, y: initialView.panY });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [bodySize, setBodySize] = useState({ w: 1, h: 1 });

  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);

  const { panelRef, resizable, persistSize, onResizeHandleMouseDown, shouldSuppressBackdropClose } =
    useResizablePanel(open, PRODUCT_PHOTO_PREVIEW_RESIZE);

  useEffect(() => {
    if (!open) return;
    setFitToWindow(initialView.fitToWindow);
    setZoom(initialView.zoom);
    setPan({ x: initialView.panX, y: initialView.panY });
    setNatural(null);
    setDragging(false);
    dragRef.current = null;
  }, [open, src, initialView.fitToWindow, initialView.zoom, initialView.panX, initialView.panY]);

  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const node = bodyRef.current;
    const update = () => {
      setBodySize({ w: node.clientWidth || 1, h: node.clientHeight || 1 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [open]);

  const currentView = useCallback(
    (): ProductPhotoViewState => ({
      fitToWindow,
      zoom,
      panX: pan.x,
      panY: pan.y,
    }),
    [fitToWindow, zoom, pan.x, pan.y]
  );

  const emitClose = useCallback(() => {
    persistSize();
    onCloseWithView?.(currentView());
    window.setTimeout(() => onClose(), 0);
  }, [persistSize, onClose, onCloseWithView, currentView]);

  const handleClose = useCallback(() => {
    emitClose();
  }, [emitClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, handleClose]);

  const applyPanDelta = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bw = bodySize.w || 1;
    const bh = bodySize.h || 1;
    setPan({
      x: drag.originPanX + (clientX - drag.startX) / bw,
      y: drag.originPanY + (clientY - drag.startY) / bh,
    });
  }, [bodySize.h, bodySize.w]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      applyPanDelta(e.clientX, e.clientY);
    };

    const onMouseUp = () => endDrag();

    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      applyPanDelta(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onTouchEnd = () => endDrag();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, applyPanDelta, endDrag]);

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      originPanX: pan.x,
      originPanY: pan.y,
    };
    setDragging(true);
  };

  const onBodyMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const onBodyTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const zoomOut = () => {
    setFitToWindow(false);
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  };

  const zoomIn = () => {
    setFitToWindow(false);
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  };

  const fitWindow = () => {
    setFitToWindow(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (!open) return null;

  const zoomLabel = fitToWindow ? t('products.photoFitWindow') : `${Math.round(zoom * 100)}%`;

  const displayLayout = natural
    ? productPhotoDisplayLayout(
        { fitToWindow, zoom, panX: pan.x, panY: pan.y },
        natural,
        bodySize.w,
        bodySize.h
      )
    : null;

  const panTransform = displayLayout
    ? `translate(${displayLayout.panX}px, ${displayLayout.panY}px)`
    : undefined;

  const imgStyle = displayLayout
    ? { width: displayLayout.imgW, height: displayLayout.imgH }
    : undefined;

  return createPortal(
    <div
      className="product-photo-lightbox"
      role="presentation"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (shouldSuppressBackdropClose()) return;
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }}
    >
      <div
        ref={panelRef}
        className="product-photo-lightbox-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('products.photoPreview', { name: alt })}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="product-photo-lightbox-toolbar">
          <span className="product-photo-lightbox-title">{alt}</span>
          <div className="product-photo-lightbox-controls">
            <button
              type="button"
              className={`product-photo-lightbox-btn${fitToWindow ? ' is-active' : ''}`}
              onClick={fitWindow}
              title={t('products.photoFitWindow')}
            >
              {t('products.photoFitWindow')}
            </button>
            <button
              type="button"
              className="product-photo-lightbox-btn"
              onClick={zoomOut}
              title={t('products.photoZoomOut')}
              aria-label={t('products.photoZoomOut')}
            >
              −
            </button>
            <span className="product-photo-lightbox-zoom">{zoomLabel}</span>
            <button
              type="button"
              className="product-photo-lightbox-btn"
              onClick={zoomIn}
              title={t('products.photoZoomIn')}
              aria-label={t('products.photoZoomIn')}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="product-photo-lightbox-close"
            onClick={handleClose}
            aria-label={t('products.closePhoto')}
          >
            ×
          </button>
        </header>
        <div
          ref={bodyRef}
          className={`product-photo-lightbox-body${dragging ? ' is-dragging' : ''}`}
          onMouseDown={onBodyMouseDown}
          onTouchStart={onBodyTouchStart}
          title={t('products.photoDragHint')}
        >
          <div className="product-photo-lightbox-pan-layer" style={{ transform: panTransform }}>
            <img
              src={src}
              alt={alt}
              className="product-photo-lightbox-img"
              style={imgStyle}
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              draggable={false}
            />
          </div>
        </div>
        {resizable && <ModalResizeHandles onMouseDown={onResizeHandleMouseDown} />}
      </div>
    </div>,
    document.body
  );
}
