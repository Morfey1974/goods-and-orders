import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { catalogApi } from '../../api/catalog';

type Props = {
  productId: string;
  token: string;
  hasImage: boolean;
  alt: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Click thumbnail to open full-size preview (catalog table). */
  previewable?: boolean;
};

export function ProductPhoto({
  productId,
  token,
  hasImage,
  alt,
  className = '',
  size = 'md',
  previewable = false,
}: Props) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!hasImage || !token) {
      setSrc(null);
      setFailed(false);
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

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewOpen]);

  const sizeClass =
    size === 'sm' ? 'product-photo-sm' : size === 'lg' ? 'product-photo-lg' : 'product-photo-md';

  const canPreview = previewable && hasImage && src && !failed;

  const lightbox =
    previewOpen && src
      ? createPortal(
          <div
            className="product-photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={t('products.photoPreview', { name: alt })}
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="product-photo-lightbox-frame"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="product-photo-lightbox-close"
                onClick={() => setPreviewOpen(false)}
                aria-label={t('products.closePhoto')}
              >
                ×
              </button>
              <img src={src} alt={alt} className="product-photo-lightbox-img" />
            </div>
          </div>,
          document.body
        )
      : null;

  if (hasImage && src && !failed) {
    return (
      <>
        <img
          src={src}
          alt={alt}
          className={`product-photo-img ${sizeClass} ${className}${canPreview ? ' product-photo-clickable' : ''}`}
          onClick={canPreview ? () => setPreviewOpen(true) : undefined}
          onKeyDown={
            canPreview
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPreviewOpen(true);
                  }
                }
              : undefined
          }
          tabIndex={canPreview ? 0 : undefined}
          role={canPreview ? 'button' : undefined}
          aria-label={canPreview ? t('products.viewPhoto', { name: alt }) : undefined}
        />
        {lightbox}
      </>
    );
  }

  return (
    <div className={`product-photo-placeholder ${sizeClass} ${className}`} aria-hidden>
      <span>📦</span>
    </div>
  );
}
