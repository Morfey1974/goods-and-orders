import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

const MIN_WIDTH = 40;

function loadWidths(storageKey: string, defaults: Record<string, number>): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = parsed[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= MIN_WIDTH) {
        result[key] = Math.round(value);
      }
    }
    return result;
  } catch {
    return { ...defaults };
  }
}

export function useResizableTableColumns(
  storageKey: string,
  defaultWidths: Record<string, number>,
  minWidth = MIN_WIDTH
) {
  const [widths, setWidths] = useState(() => loadWidths(storageKey, defaultWidths));
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  const onResizeHandleMouseDown = useCallback(
    (key: string, e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startW = widths[key] ?? defaultWidths[key] ?? minWidth;
      resizeRef.current = { key, startX: e.clientX, startW };

      const rtl = document.documentElement.dir === 'rtl';

      const onMove = (ev: globalThis.MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = ev.clientX - resizeRef.current.startX;
        const signed = rtl ? -delta : delta;
        const next = Math.max(minWidth, Math.round(resizeRef.current.startW + signed));
        setWidths((prev) => ({ ...prev, [key]: next }));
      };

      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [widths, defaultWidths, minWidth]
  );

  const tableMinWidth = useMemo(
    () => Object.values(widths).reduce((sum, w) => sum + w, 0),
    [widths]
  );

  return { widths, onResizeHandleMouseDown, tableMinWidth };
}
