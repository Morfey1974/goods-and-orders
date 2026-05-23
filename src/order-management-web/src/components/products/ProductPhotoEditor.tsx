import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi, type Product } from '../../api/catalog';
import { optimizeProductImage } from '../../utils/optimizeProductImage';
import { ProductPhoto } from './ProductPhoto';

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

type Props = {
  product: Product | null;
  token: string;
  canEdit: boolean;
  onUpdated: (product: Product) => void;
  onError: (message: string) => void;
};

export function ProductPhotoEditor({ product, token, canEdit, onUpdated, onError }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const hasImage = product?.hasImage ?? false;

  const openFilePicker = () => {
    if (!canEdit || !product || uploading) return;
    inputRef.current?.click();
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

      <div
        className={`product-photo-slot ${canEdit ? 'clickable' : 'disabled'}`}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openFilePicker();
          }
        }}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        aria-label={canEdit ? t('products.photoPick') : t('products.photoSaveFirst')}
      >
        {product && hasImage ? (
          <ProductPhoto
            key={`${product.id}-${product.hasImage}-${product.version}`}
            productId={product.id}
            token={token}
            hasImage
            alt={product.name}
            size="lg"
          />
        ) : (
          <span className="product-photo-empty" aria-hidden>
            <span className="product-photo-empty-icon">📦</span>
            <span className="product-photo-empty-camera">📷</span>
          </span>
        )}
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
