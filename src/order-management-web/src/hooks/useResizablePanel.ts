import { useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import {
  applyModalSize,
  clearModalInlineSize,
  clampModalSize,
  loadModalSize,
  saveModalSize,
  type ModalSize,
  type ModalSizeLimits,
} from '../lib/modalSize';

export type ResizablePanelConfig = ModalSizeLimits & {
  storageKey: string;
  defaultSize: ModalSize;
  /** If false, only restore saved size; CSS defaults when nothing saved */
  applyDefaultWhenEmpty?: boolean;
};

export function useResizablePanel(open: boolean, config: ResizablePanelConfig | undefined) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const suppressOverlayCloseRef = useRef(false);

  const limits: ModalSizeLimits | undefined = config
    ? {
        minWidth: config.minWidth,
        minHeight: config.minHeight,
        maxWidthRatio: config.maxWidthRatio,
        maxHeightRatio: config.maxHeightRatio,
      }
    : undefined;

  const persistSize = useCallback(() => {
    if (!config || !limits) return;
    const el = panelRef.current;
    if (!el) return;
    saveModalSize(config.storageKey, el.offsetWidth, el.offsetHeight, limits);
  }, [config, limits]);

  useLayoutEffect(() => {
    if (!open || !config || !limits) return;
    const el = panelRef.current;
    if (!el) return;

    const saved = loadModalSize(config.storageKey, limits, config.defaultSize);
    const hasStored = (() => {
      try {
        return !!localStorage.getItem(config.storageKey);
      } catch {
        return false;
      }
    })();

    if (hasStored || config.applyDefaultWhenEmpty !== false) {
      applyModalSize(el, saved);
    } else {
      clearModalInlineSize(el);
    }
  }, [open, config, limits]);

  useEffect(() => {
    if (!open || !config || !limits) return;

    const onMove = (e: globalThis.MouseEvent) => {
      if (!isResizingRef.current || !resizeStartRef.current || !panelRef.current) return;
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      const next = clampModalSize(
        resizeStartRef.current.w + dx,
        resizeStartRef.current.h + dy,
        limits
      );
      panelRef.current.style.width = `${next.width}px`;
      panelRef.current.style.height = `${next.height}px`;
    };

    const onUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      resizeStartRef.current = null;
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
      persistSize();
      suppressOverlayCloseRef.current = true;
      window.setTimeout(() => {
        suppressOverlayCloseRef.current = false;
      }, 200);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
  }, [open, config, limits, persistSize]);

  const onResizeHandleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!config) return;
    e.preventDefault();
    e.stopPropagation();
    const el = panelRef.current;
    if (!el) return;
    isResizingRef.current = true;
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: el.offsetWidth,
      h: el.offsetHeight,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
  };

  const shouldSuppressBackdropClose = () =>
    isResizingRef.current || suppressOverlayCloseRef.current;

  return {
    panelRef,
    resizable: !!config,
    persistSize,
    onResizeHandleMouseDown,
    shouldSuppressBackdropClose,
  };
}
