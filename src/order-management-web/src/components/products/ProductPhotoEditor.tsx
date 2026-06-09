import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi, type Product } from '../../api/catalog';
import { optimizeProductImage } from '../../utils/optimizeProductImage';
import { ProductPhoto, type ProductPhotoHandle } from './ProductPhoto';

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

type Props = {
  product: Product | null;
  token: string;
  canEdit: boolean;
  onUpdated: (product: Product) => void;
  onError: (message: string) => void;
  onPreviewOpenChange?: (open: boolean) => void;
  lightboxZIndex?: number;
};

export function ProductPhotoEditor({
  product,
  token,
  canEdit,
  onUpdated,
  onError,
  onPreviewOpenChange: onPreviewOpenChangeProp,
  lightboxZIndex,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<ProductPhotoHandle>(null);
  const [uploading, setUploading] = useState(false);
  const blockReplaceUntilRef = useRef(0);

  const hasImage = product?.hasImage ?? false;

  const openFilePicker = () => {
    if (!canEdit || !product || uploading) return;
    if (Date.now() < blockReplaceUntilRef.current) return;
    inputRef.current?.click();
  };

  const blockReplaceBriefly = () => {
    blockReplaceUntilRef.current = Date.now() + 400;
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw || !product || !token) return;

    setUploading(true);
    try {
      const optimized = await optimizeProductImage(raw);
      const updated = await catalogApi.products.uploadImage(token, product.id, optimized);
      onUpdated(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product || !token || !hasImage || uploading) return;
    setUploading(true);
    try {
      const updated = await catalogApi.products.deleteImage(token, product.id);
      onUpdated(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setUploading(false);
    }
  };

  const onExpandPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    blockReplaceBriefly();
    photoRef.current?.openPreview();
  };

  const onPreviewOpenChange = (open: boolean) => {
    if (!open) blockReplaceBriefly();
    onPreviewOpenChangeProp?.(open);
  };

  const onSlotClick = () => {
    if (hasImage) return;
    openFilePicker();
  };

  const onSlotDoubleClick = () => {
    if (!hasImage) return;
    openFilePicker();
  };

  return (
    <div className="product-photo-editor">
      {canEdit && hasImage && (
        <button
          type="button"
          className="product-photo-delete"
          onClick={onDelete}
          disabled={uploading}
          aria-label={t('products.photoDelete')}
        >
          ×
        </button>
      )}

      {canEdit && hasImage && (
        <button
          type="button"
          className="product-photo-expand-btn product-photo-expand-btn--editor"
          onClick={onExpandPreview}
          aria-label={t('products.viewPhoto', { name: product?.name ?? '' })}
          title={t('products.viewPhoto', { name: product?.name ?? '' })}
        >
          ⤢
        </button>
      )}

      <div
        className={`product-photo-slot ${canEdit ? 'clickable' : 'disabled'}${hasImage ? ' has-image' : ''}`}
        onClick={onSlotClick}
        onDoubleClick={onSlotDoubleClick}
        onKeyDown={(e) => {
          if (!canEdit) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (hasImage) return;
            openFilePicker();
          }
        }}
        role={canEdit && !hasImage ? 'button' : undefined}
        tabIndex={canEdit && !hasImage ? 0 : undefined}
        aria-label={
          canEdit
            ? hasImage
              ? t('products.photoReplaceHint')
              : t('products.photoPick')
            : t('products.photoSaveFirst')
        }
        title={canEdit && hasImage ? t('products.photoReplaceHint') : undefined}
      >
        <div className="product-photo-slot-inner">
          {product && hasImage ? (
            <ProductPhoto
              ref={photoRef}
              key={`${product.id}-${product.hasImage}-${product.version}`}
              productId={product.id}
              token={token}
              hasImage
              alt={product.name}
              size="lg"
              showPreviewButton
              externalExpandButton
              lightboxZIndex={lightboxZIndex}
              onPreviewOpenChange={onPreviewOpenChange}
            />
          ) : (
            <span className="product-photo-empty" aria-hidden>
              <span className="product-photo-empty-icon">📦</span>
              <span className="product-photo-empty-camera">📷</span>
            </span>
          )}
        </div>
        {uploading && <span className="product-photo-loading" aria-live="polite">…</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={onFileChange}
      />
    </div>
  );
}
