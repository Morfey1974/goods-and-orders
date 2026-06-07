export type ProductPhotoViewState = {
  fitToWindow: boolean;
  zoom: number;
  /** Pan offset normalized to preview viewport width (0 = centered). */
  panX: number;
  /** Pan offset normalized to preview viewport height (0 = centered). */
  panY: number;
};

export const DEFAULT_PRODUCT_PHOTO_VIEW: ProductPhotoViewState = {
  fitToWindow: true,
  zoom: 1,
  panX: 0,
  panY: 0,
};

/** Visible circle diameter per thumbnail size (px). */
export const PRODUCT_PHOTO_CIRCLE_PX = {
  sm: 48,
  md: 64,
  lg: 80,
} as const;

export type ProductPhotoDisplayLayout = {
  imgW: number;
  imgH: number;
  panX: number;
  panY: number;
};

const VIEW_STORAGE_PREFIX = 'productPhotoView:';

export function loadProductPhotoView(productId: string): ProductPhotoViewState {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_PREFIX + productId);
    if (!raw) return DEFAULT_PRODUCT_PHOTO_VIEW;
    const parsed = JSON.parse(raw) as Partial<ProductPhotoViewState>;
    return {
      fitToWindow: parsed.fitToWindow ?? DEFAULT_PRODUCT_PHOTO_VIEW.fitToWindow,
      zoom: typeof parsed.zoom === 'number' ? parsed.zoom : DEFAULT_PRODUCT_PHOTO_VIEW.zoom,
      panX: typeof parsed.panX === 'number' ? parsed.panX : DEFAULT_PRODUCT_PHOTO_VIEW.panX,
      panY: typeof parsed.panY === 'number' ? parsed.panY : DEFAULT_PRODUCT_PHOTO_VIEW.panY,
    };
  } catch {
    return DEFAULT_PRODUCT_PHOTO_VIEW;
  }
}

export function saveProductPhotoView(productId: string, view: ProductPhotoViewState): void {
  try {
    localStorage.setItem(VIEW_STORAGE_PREFIX + productId, JSON.stringify(view));
    window.dispatchEvent(
      new CustomEvent('productPhotoViewChanged', { detail: { productId, view } })
    );
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Fit image into a viewport, then apply zoom (100% = fitted size).
 * Same logic for lightbox and circular thumbnail — scales, does not crop via object-fit: cover.
 */
export function productPhotoDisplayLayout(
  view: ProductPhotoViewState,
  natural: { w: number; h: number },
  containerW: number,
  containerH: number = containerW
): ProductPhotoDisplayLayout {
  const fitScale = Math.min(containerW / natural.w, containerH / natural.h);
  const zoom = view.fitToWindow ? 1 : view.zoom;
  return {
    imgW: natural.w * fitScale * zoom,
    imgH: natural.h * fitScale * zoom,
    panX: view.panX * containerW,
    panY: view.panY * containerH,
  };
}

export function productPhotoThumbLayout(
  view: ProductPhotoViewState,
  natural: { w: number; h: number },
  containerSize: number
): ProductPhotoDisplayLayout {
  return productPhotoDisplayLayout(view, natural, containerSize, containerSize);
}

/** @deprecated use PRODUCT_PHOTO_CIRCLE_PX.lg */
export const PRODUCT_PHOTO_THUMB_SIZE = PRODUCT_PHOTO_CIRCLE_PX.lg;
