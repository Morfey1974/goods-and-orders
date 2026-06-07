import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi } from '../../api/catalog';
import {
  DEFAULT_PRODUCT_PHOTO_VIEW,
  loadProductPhotoView,
  PRODUCT_PHOTO_CIRCLE_PX,
  productPhotoThumbLayout,
  saveProductPhotoView,
  type ProductPhotoViewState,
} from '../../lib/productPhotoView';
import { ProductPhotoLightbox } from './ProductPhotoLightbox';

export type ProductPhotoHandle = {
  openPreview: () => void;
  canPreview: boolean;
};

type Props = {
  productId: string;
  token: string;
  hasImage: boolean;
  alt: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Click thumbnail to open full-size preview (catalog table). */
  previewable?: boolean;
  /** Expand button in product card (does not steal click from parent upload slot). */
  showPreviewButton?: boolean;
  /** Render expand control in parent (ProductPhotoEditor) — avoids clipping inside circle. */
  externalExpandButton?: boolean;
  onPreviewOpenChange?: (open: boolean) => void;
};

export const ProductPhoto = forwardRef<ProductPhotoHandle, Props>(function ProductPhoto(
  {
    productId,
    token,
    hasImage,
    alt,
    className = '',
    size = 'md',
    previewable = false,
    showPreviewButton = false,
    externalExpandButton = false,
    onPreviewOpenChange,
  },
  ref
) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [thumbView, setThumbView] = useState<ProductPhotoViewState>(DEFAULT_PRODUCT_PHOTO_VIEW);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const containerPx = PRODUCT_PHOTO_CIRCLE_PX[size];
  const persistView = previewable || showPreviewButton;

  const setPreview = (open: boolean) => {
    setPreviewOpen(open);
    onPreviewOpenChange?.(open);
  };

  useEffect(() => {
    setThumbView(loadProductPhotoView(productId));
    setNatural(null);
  }, [productId, hasImage]);

  useEffect(() => {
    const onViewChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ productId: string; view: ProductPhotoViewState }>).detail;
      if (detail?.productId === productId) setThumbView(detail.view);
    };
    window.addEventListener('productPhotoViewChanged', onViewChanged);
    return () => window.removeEventListener('productPhotoViewChanged', onViewChanged);
  }, [productId]);

  useEffect(() => {
    if (!hasImage || !token) {
      setSrc(null);
      setFailed(false);
      setNatural(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    catalogApi.products
      .fetchImageBlob(token, productId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productId, token, hasImage]);

  const sizeClass =
    size === 'sm' ? 'product-photo-sm' : size === 'lg' ? 'product-photo-lg' : 'product-photo-md';

  const canPreview = previewable && hasImage && src && !failed;
  const canExpand = showPreviewButton && hasImage && src && !failed;
  const thumbLayout = natural ? productPhotoThumbLayout(thumbView, natural, containerPx) : null;

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setNatural({
      w: e.currentTarget.naturalWidth,
      h: e.currentTarget.naturalHeight,
    });
  };

  const onCloseWithView = (view: ProductPhotoViewState) => {
    setThumbView(view);
    if (persistView) saveProductPhotoView(productId, view);
  };

  useImperativeHandle(
    ref,
    () => ({
      openPreview: () => {
        if (canExpand || canPreview) setPreview(true);
      },
      canPreview: Boolean(canExpand || canPreview),
    }),
    [canExpand, canPreview]
  );

  if (hasImage && src && !failed) {
    return (
      <>
        <span
          className={`product-photo-wrap product-photo-wrap--circle-thumb ${sizeClass} ${className}`.trim()}
        >
          <div
            className="product-photo-thumb-pan"
            style={
              thumbLayout
                ? { transform: `translate(${thumbLayout.panX}px, ${thumbLayout.panY}px)` }
                : undefined
            }
          >
            <img
              src={src}
              alt={alt}
              className={`product-photo-img product-photo-img--circle-thumb${canPreview ? ' product-photo-clickable' : ''}`}
              style={
                thumbLayout
                  ? { width: thumbLayout.imgW, height: thumbLayout.imgH }
                  : { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }
              }
              onLoad={onImageLoad}
              draggable={false}
              onClick={
                canPreview
                  ? (e) => {
                      e.stopPropagation();
                      setPreview(true);
                    }
                  : undefined
              }
              onKeyDown={
                canPreview
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreview(true);
                      }
                    }
                  : undefined
              }
              tabIndex={canPreview ? 0 : undefined}
              role={canPreview ? 'button' : undefined}
              aria-label={canPreview ? t('products.viewPhoto', { name: alt }) : undefined}
            />
          </div>
          {canExpand && !externalExpandButton && (
            <button
              type="button"
              className="product-photo-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setPreview(true);
              }}
              aria-label={t('products.viewPhoto', { name: alt })}
              title={t('products.viewPhoto', { name: alt })}
            >
              ⤢
            </button>
          )}
        </span>
        <ProductPhotoLightbox
          open={previewOpen}
          src={src}
          alt={alt}
          initialView={thumbView}
          onClose={() => setPreview(false)}
          onCloseWithView={persistView ? onCloseWithView : undefined}
        />
      </>
    );
  }

  return (
    <div className={`product-photo-placeholder ${sizeClass} ${className}`} aria-hidden>
      <span>📦</span>
    </div>
  );
});
