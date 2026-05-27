import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { tenantAssetsApi } from '../../api/tenantAssets';
import type { TenantAssetsSummary } from '../../api/tenantAssets';

type Props = {
  token: string;
  summary: TenantAssetsSummary | null;
  onSummaryChange: (s: TenantAssetsSummary) => void;
  onError: (msg: string) => void;
};

export function TenantBrandingSection({ token, summary, onSummaryChange, onError }: Props) {
  const { t } = useTranslation();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [signatureVersion, setSignatureVersion] = useState(0);
  const [busy, setBusy] = useState<'logo' | 'signature' | null>(null);

  const replacePreviewUrl = useCallback((setter: Dispatch<SetStateAction<string | null>>, next: string | null) => {
    setter((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!summary?.hasLogo) {
      replacePreviewUrl(setLogoPreview, null);
      return;
    }
    let cancelled = false;
    tenantAssetsApi
      .fetchLogoBlob(token, logoVersion)
      .then((blob) => {
        if (cancelled) return;
        replacePreviewUrl(setLogoPreview, URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) replacePreviewUrl(setLogoPreview, null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, summary?.hasLogo, logoVersion, replacePreviewUrl]);

  useEffect(() => {
    if (!summary?.hasSignature) {
      replacePreviewUrl(setSignaturePreview, null);
      return;
    }
    let cancelled = false;
    tenantAssetsApi
      .fetchSignatureBlob(token, signatureVersion)
      .then((blob) => {
        if (cancelled) return;
        replacePreviewUrl(setSignaturePreview, URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) replacePreviewUrl(setSignaturePreview, null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, summary?.hasSignature, signatureVersion, replacePreviewUrl]);

  useEffect(
    () => () => {
      replacePreviewUrl(setLogoPreview, null);
      replacePreviewUrl(setSignaturePreview, null);
    },
    [replacePreviewUrl]
  );

  const upload = async (type: 'logo' | 'signature', file: File) => {
    setBusy(type);
    onError('');
    const localUrl = URL.createObjectURL(file);
    if (type === 'logo') replacePreviewUrl(setLogoPreview, localUrl);
    else replacePreviewUrl(setSignaturePreview, localUrl);

    try {
      const updated =
        type === 'logo'
          ? await tenantAssetsApi.uploadLogo(token, file)
          : await tenantAssetsApi.uploadSignature(token, file);
      onSummaryChange(updated);
      if (type === 'logo') setLogoVersion((v) => v + 1);
      else setSignatureVersion((v) => v + 1);
    } catch (e) {
      if (type === 'logo') setLogoVersion((v) => v + 1);
      else setSignatureVersion((v) => v + 1);
      onError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (type: 'logo' | 'signature') => {
    setBusy(type);
    onError('');
    if (type === 'logo') replacePreviewUrl(setLogoPreview, null);
    else replacePreviewUrl(setSignaturePreview, null);

    try {
      const updated =
        type === 'logo'
          ? await tenantAssetsApi.deleteLogo(token)
          : await tenantAssetsApi.deleteSignature(token);
      onSummaryChange(updated);
      if (type === 'logo') setLogoVersion((v) => v + 1);
      else setSignatureVersion((v) => v + 1);
    } catch (e) {
      if (type === 'logo') setLogoVersion((v) => v + 1);
      else setSignatureVersion((v) => v + 1);
      onError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="settings-branding-grid">
        <div className="settings-branding-slot">
          <p className="settings-branding-label">{t('settings.companyLogo')}</p>
          <p className="field-hint">{t('settings.companyLogoHint')}</p>
          <div className="settings-branding-preview">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="settings-branding-img" />
            ) : (
              <span className="muted">{t('settings.notUploaded')}</span>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload('logo', f);
              e.target.value = '';
            }}
          />
          <div className="settings-branding-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy === 'logo'}
              onClick={() => logoInputRef.current?.click()}
            >
              {summary?.hasLogo ? t('settings.replaceFile') : t('settings.uploadFile')}
            </button>
            {summary?.hasLogo && (
              <button
                type="button"
                className="btn btn-ghost-inline btn-sm"
                disabled={busy === 'logo'}
                onClick={() => void remove('logo')}
              >
                {t('settings.removeFile')}
              </button>
            )}
          </div>
        </div>

        <div className="settings-branding-slot">
          <p className="settings-branding-label">{t('settings.signature')}</p>
          <p className="field-hint">{t('settings.signatureHint')}</p>
          <div className="settings-branding-preview settings-branding-preview--signature">
            {signaturePreview ? (
              <img src={signaturePreview} alt="" className="settings-branding-img" />
            ) : (
              <span className="muted">{t('settings.notUploaded')}</span>
            )}
          </div>
          <input
            ref={signatureInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload('signature', f);
              e.target.value = '';
            }}
          />
          <div className="settings-branding-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy === 'signature'}
              onClick={() => signatureInputRef.current?.click()}
            >
              {summary?.hasSignature ? t('settings.replaceFile') : t('settings.uploadFile')}
            </button>
            {summary?.hasSignature && (
              <button
                type="button"
                className="btn btn-ghost-inline btn-sm"
                disabled={busy === 'signature'}
                onClick={() => void remove('signature')}
              >
                {t('settings.removeFile')}
              </button>
            )}
          </div>
        </div>
      </div>
  );
}
