export type ModalSize = { width: number; height: number };

export type ModalSizeLimits = {
  minWidth: number;
  minHeight: number;
  maxWidthRatio?: number;
  maxHeightRatio?: number;
};

export type ResizablePanelConfig = ModalSizeLimits & {
  storageKey: string;
  defaultSize: ModalSize;
  /** If false, only restore saved size; CSS defaults when nothing saved */
  applyDefaultWhenEmpty?: boolean;
};

const DEFAULT_MAX_W = 0.96;
const DEFAULT_MAX_H = 0.92;

export function clampModalSize(
  width: number,
  height: number,
  limits: ModalSizeLimits
): ModalSize {
  const maxW = window.innerWidth * (limits.maxWidthRatio ?? DEFAULT_MAX_W);
  const maxH = window.innerHeight * (limits.maxHeightRatio ?? DEFAULT_MAX_H);
  return {
    width: Math.round(Math.min(maxW, Math.max(limits.minWidth, width))),
    height: Math.round(Math.min(maxH, Math.max(limits.minHeight, height))),
  };
}

export function loadModalSize(
  storageKey: string,
  limits: ModalSizeLimits,
  defaultSize: ModalSize
): ModalSize {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return clampModalSize(defaultSize.width, defaultSize.height, limits);
    const parsed = JSON.parse(raw) as Partial<ModalSize>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return clampModalSize(defaultSize.width, defaultSize.height, limits);
    }
    return clampModalSize(parsed.width, parsed.height, limits);
  } catch {
    return clampModalSize(defaultSize.width, defaultSize.height, limits);
  }
}

export function saveModalSize(storageKey: string, width: number, height: number, limits: ModalSizeLimits) {
  const size = clampModalSize(width, height, limits);
  localStorage.setItem(storageKey, JSON.stringify(size));
}

export function applyModalSize(el: HTMLElement, size: ModalSize) {
  el.style.width = `${size.width}px`;
  el.style.height = `${size.height}px`;
}

export function clearModalInlineSize(el: HTMLElement) {
  el.style.removeProperty('width');
  el.style.removeProperty('height');
}
