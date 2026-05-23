import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppModal } from '../components/ui/AppModal';
import { useTranslation } from 'react-i18next';
import { api, type TenantProfile } from '../api/client';
import {
  bankDisplayName,
  findIsraeliBank,
  ISRAELI_BANKS,
  normalizeBankCode,
  resolveBankNameForCode,
} from '../data/israeliBanks';
import { tenantAssetsApi, type TenantAssetsSummary } from '../api/tenantAssets';
import { TenantBrandingSection } from '../components/settings/TenantBrandingSection';
import { TenantComplianceSection } from '../components/settings/TenantComplianceSection';
import { useAuth } from '../context/AuthContext';
import '../styles/settings.css';

type BankForm = {
  bankBeneficiary: string;
  bankCode: string;
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
  bankSwift: string;
  bankAba: string;
  bankIban: string;
  showBankOnDocuments: boolean;
};

function bankFromProfile(p: TenantProfile, lang: string): BankForm {
  const rawCode = (p.bankCode ?? '').trim();
  const code = normalizeBankCode(rawCode) || rawCode;
  const catalogName = resolveBankNameForCode(code, lang);
  return {
    bankBeneficiary: p.bankBeneficiary ?? p.ownerFullName ?? p.businessName ?? '',
    bankCode: code,
    bankName: catalogName || p.bankName || '',
    bankBranch: p.bankBranch ?? '',
    bankAccountNumber: p.bankAccountNumber ?? '',
    bankSwift: p.bankSwift ?? '',
    bankAba: p.bankAba ?? '',
    bankIban: p.bankIban ?? '',
    showBankOnDocuments: p.showBankOnDocuments ?? true,
  };
}

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function websiteLinkLabel(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return href;
  }
}

function formatBankPreview(p: TenantProfile) {
  const parts: string[] = [];
  if (p.bankCode) parts.push(p.bankCode);
  if (p.bankName) parts.push(p.bankName);
  const bank = parts.join(' · ');
  const account = p.bankAccountNumber ?? '';
  const iban = p.bankIban ? `IBAN ${p.bankIban}` : '';
  return [bank, account, iban].filter(Boolean).join(' · ');
}

function applyBankCodeToForm(form: BankForm, code: string, lang: string): BankForm {
  const norm = normalizeBankCode(code);
  if (!norm) {
    return { ...form, bankCode: '', bankName: '' };
  }
  const name = resolveBankNameForCode(norm, lang);
  return { ...form, bankCode: norm, bankName: name || form.bankName };
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { token, patchSession } = useAuth();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [bankForm, setBankForm] = useState<BankForm | null>(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [bankMessage, setBankMessage] = useState('');
  const [error, setError] = useState('');
  const [bankError, setBankError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [assetsSummary, setAssetsSummary] = useState<TenantAssetsSummary | null>(null);
  const [assetsError, setAssetsError] = useState('');
  const [assetsMessage, setAssetsMessage] = useState('');
  const closeBankModal = () => setBankModalOpen(false);

  useEffect(() => {
    if (!token) return;
    api
      .getProfile(token)
      .then((p) => {
        setProfile(p);
        setBankForm(bankFromProfile(p, i18n.language));
      })
      .catch((e) => setError(e.message));
    tenantAssetsApi
      .getSummary(token)
      .then(setAssetsSummary)
      .catch((e) => setAssetsError(e.message));
  }, [token]);

  const onSubmitProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !profile) return;
    if (!profile.teudatZehut?.trim()) {
      setError(t('settings.teudatRequired'));
      return;
    }
    if (!profile.email?.trim()) {
      setError(t('settings.emailRequired'));
      return;
    }
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const updated = await api.updateProfile(token, {
        businessName: profile.businessName,
        businessNickname: profile.businessNickname?.trim() || null,
        businessCategory: profile.businessCategory?.trim() || null,
        ownerFullName: profile.ownerFullName,
        osekNumber: profile.osekNumber,
        teudatZehut: profile.teudatZehut.trim(),
        email: profile.email.trim(),
        phone: profile.phone,
        mobilePhone: profile.mobilePhone,
        fax: profile.fax,
        address: profile.address,
        city: profile.city,
        zipCode: profile.zipCode,
        website: profile.website,
        businessField: profile.businessField,
        defaultLanguage: profile.defaultLanguage,
        version: profile.version,
      });
      setProfile(updated);
      setBankForm(bankFromProfile(updated, i18n.language));
      patchSession({ email: updated.email, businessName: updated.businessName });
      setMessage(t('settings.savedToDb'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      setError(msg.includes('EMAIL_TAKEN') || msg.includes('already registered')
        ? t('settings.emailTaken')
        : msg);
    } finally {
      setSaving(false);
    }
  };

  const onSubmitBank = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !profile || !bankForm) return;
    setBankError('');
    setBankMessage('');
    setSavingBank(true);
    try {
      const bankCode = normalizeBankCode(bankForm.bankCode) || bankForm.bankCode.trim();
      const bankName =
        resolveBankNameForCode(bankCode, i18n.language) || bankForm.bankName.trim() || null;
      const updated = await api.updateBankDetails(token, {
        bankBeneficiary: bankForm.bankBeneficiary.trim(),
        bankCode,
        bankName,
        bankBranch: bankForm.bankBranch.trim() || null,
        bankAccountNumber: bankForm.bankAccountNumber.trim(),
        bankSwift: bankForm.bankSwift.trim() || null,
        bankAba: bankForm.bankAba.trim() || null,
        bankIban: bankForm.bankIban.trim() || null,
        showBankOnDocuments: bankForm.showBankOnDocuments,
        version: profile.version,
      });
      setProfile(updated);
      setBankForm(bankFromProfile(updated, i18n.language));
      setBankMessage(t('settings.bankSaved'));
      setTimeout(() => {
        closeBankModal();
        setBankMessage('');
      }, 1200);
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingBank(false);
    }
  };

  const openBankModal = () => {
    if (profile) setBankForm(bankFromProfile(profile, i18n.language));
    setBankError('');
    setBankMessage('');
    setBankModalOpen(true);
  };

  const bankSelectOptions = useMemo(
    () =>
      ISRAELI_BANKS.map((bank) => ({
        code: bank.code,
        label: `${bank.code} — ${bankDisplayName(bank, i18n.language)}`,
      })),
    [i18n.language]
  );

  useEffect(() => {
    if (!bankForm?.bankCode) return;
    const name = resolveBankNameForCode(bankForm.bankCode, i18n.language);
    if (name && name !== bankForm.bankName) {
      setBankForm((prev) => (prev ? { ...prev, bankName: name } : prev));
    }
  }, [i18n.language, bankForm?.bankCode]);

  if (!profile) return <div className="page">{error || '...'}</div>;

  const hasBank = !!(profile.bankAccountNumber && profile.bankBeneficiary && (profile.bankCode || profile.bankName));
  const websiteHref = normalizeWebsiteUrl(profile.website ?? '');
  const bankCodeNorm = bankForm ? normalizeBankCode(bankForm.bankCode) : '';
  const bankCodeKnown = bankCodeNorm ? findIsraeliBank(bankCodeNorm) : undefined;

  return (
    <div className="page settings-page">
      <h1>{t('settings.title')}</h1>

      <form className="settings-form" onSubmit={onSubmitProfile} autoComplete="on">
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('settings.sectionGeneral')}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-fields">
              <div className="settings-row settings-row--full">
                <label className="settings-field field-flex-2">
                  <span className="settings-field-label-row">
                    {t('businessName')}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    value={profile.businessName}
                    onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                    required
                  />
                </label>
                <label className="settings-field settings-field--label-inline field-flex-1">
                  <span className="settings-field-label-row">
                    {t('settings.businessNickname')}
                    <span className="field-hint">{t('settings.businessNicknameHint')}</span>
                  </span>
                  <input
                    value={profile.businessNickname ?? ''}
                    onChange={(e) => setProfile({ ...profile, businessNickname: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--ids">
                <label className="settings-field settings-field--label-inline field-flex-rest">
                  <span className="settings-field-label-row">
                    {t('settings.teudatZehut')}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                    <span className="field-hint">{t('settings.teudatHint')}</span>
                  </span>
                  <input
                    value={profile.teudatZehut ?? ''}
                    onChange={(e) => setProfile({ ...profile, teudatZehut: e.target.value })}
                    required
                    inputMode="numeric"
                    maxLength={9}
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.osekNumber')}</span>
                  <input
                    value={profile.osekNumber ?? ''}
                    onChange={(e) => setProfile({ ...profile, osekNumber: e.target.value })}
                    inputMode="numeric"
                  />
                </label>
                <label className="settings-field field-flex-owner">
                  <span className="settings-field-label-row">{t('ownerName')}</span>
                  <input
                    value={profile.ownerFullName}
                    onChange={(e) => setProfile({ ...profile, ownerFullName: e.target.value })}
                    required
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--category">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.businessCategory')}</span>
                  <textarea
                    className="field-rows-2"
                    rows={2}
                    value={profile.businessCategory ?? ''}
                    onChange={(e) => setProfile({ ...profile, businessCategory: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.taxRegimeLabel')}</span>
                  <select value={profile.taxRegime} disabled title={t('settings.taxRegimeLocked')}>
                    <option value="Patur">{t('settings.taxRegimePatur')}</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('settings.sectionContact')}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-fields">
              <div className="settings-row settings-row--full settings-row--contact-address">
                <label className="settings-field settings-field--label-inline field-flex-grow">
                  <span className="settings-field-label-row">
                    {t('settings.streetAddress')}
                    <span className="field-hint">{t('settings.forInvoices')}</span>
                  </span>
                  <input
                    name="street-address"
                    autoComplete="street-address"
                    value={profile.address ?? ''}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    onInput={(e) => setProfile({ ...profile, address: e.currentTarget.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.city')}</span>
                  <input
                    name="address-level2"
                    autoComplete="address-level2"
                    value={profile.city ?? ''}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    onInput={(e) => setProfile({ ...profile, city: e.currentTarget.value })}
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.zipCode')}</span>
                  <input
                    name="postal-code"
                    autoComplete="postal-code"
                    value={profile.zipCode ?? ''}
                    onChange={(e) => setProfile({ ...profile, zipCode: e.target.value })}
                    onInput={(e) => setProfile({ ...profile, zipCode: e.currentTarget.value })}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--contact-phones">
                <label className="settings-field field-flex-rest field-phone-mobile">
                  <span className="settings-field-label-row">{t('settings.phoneMobile')}</span>
                  <input
                    type="tel"
                    name="mobile-phone"
                    autoComplete="mobile tel"
                    value={profile.mobilePhone ?? ''}
                    onChange={(e) => setProfile({ ...profile, mobilePhone: e.target.value })}
                    onInput={(e) => setProfile({ ...profile, mobilePhone: e.currentTarget.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest field-phone-office">
                  <span className="settings-field-label-row">{t('settings.phoneOffice')}</span>
                  <input
                    type="tel"
                    name="home-phone"
                    autoComplete="home tel"
                    value={profile.phone ?? ''}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    onInput={(e) => setProfile({ ...profile, phone: e.currentTarget.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest field-phone-fax">
                  <span className="settings-field-label-row">{t('settings.fax')}</span>
                  <input
                    type="tel"
                    name="fax"
                    autoComplete="fax"
                    value={profile.fax ?? ''}
                    onChange={(e) => setProfile({ ...profile, fax: e.target.value })}
                    onInput={(e) => setProfile({ ...profile, fax: e.currentTarget.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--contact-online">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.email')}</span>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    required
                    autoComplete="email"
                  />
                </label>
                <label className="settings-field settings-field--website field-flex-rest">
                  <span className="settings-field-label-row">
                    <span>{t('settings.website')}</span>
                    {websiteHref && (
                      <>
                        <span className="settings-field-label-sep" aria-hidden="true">
                          ·
                        </span>
                        <a
                          href={websiteHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="settings-field-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {websiteLinkLabel(websiteHref)}
                        </a>
                      </>
                    )}
                  </span>
                  <input
                    type="text"
                    name="website"
                    autoComplete="url"
                    value={profile.website ?? ''}
                    onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                    placeholder="https://"
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.defaultLanguage')}</span>
                  <select
                    value={profile.defaultLanguage}
                    onChange={(e) => setProfile({ ...profile, defaultLanguage: e.target.value })}
                  >
                    <option value="he">עברית</option>
                    <option value="ru">Русский</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('settings.sectionBranding')}</h2>
          </div>
          <div className="settings-section-body">
            {assetsError && <div className="error-banner">{assetsError}</div>}
            {assetsMessage && <div className="success-banner">{assetsMessage}</div>}
            {token && (
              <TenantBrandingSection
                token={token}
                summary={assetsSummary}
                onSummaryChange={(s) => {
                  setAssetsSummary(s);
                  setAssetsMessage('');
                  setAssetsError('');
                }}
                onError={setAssetsError}
              />
            )}
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('settings.sectionCompliance')}</h2>
          </div>
          <div className="settings-section-body">
            {token && (
              <TenantComplianceSection
                token={token}
                summary={assetsSummary}
                onSummaryChange={(s) => {
                  setAssetsSummary(s);
                  setAssetsMessage('');
                  setAssetsError('');
                }}
                onError={setAssetsError}
                onMessage={(msg) => {
                  setAssetsMessage(msg);
                  setAssetsError('');
                }}
              />
            )}
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('settings.sectionBank')}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-bank-panel">
              <div>
                <p className="field-hint">{t('settings.bankHint')}</p>
                {hasBank ? (
                  <p className="settings-bank-preview">{formatBankPreview(profile)}</p>
                ) : (
                  <p className="muted">{t('settings.bankNotConfigured')}</p>
                )}
              </div>
              <button type="button" className="btn btn-secondary" onClick={openBankModal}>
                {t('settings.configureBank')}
              </button>
            </div>
          </div>
        </section>

        <div className="settings-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('settings.saving') : t('settings.saveToDb')}
          </button>
        </div>
      </form>

      {bankModalOpen && bankForm && (
        <AppModal
          open={bankModalOpen}
          onClose={closeBankModal}
          className="settings-bank-modal settings-page"
          overlayClassName="settings-bank-overlay"
          closeOnBackdrop={false}
          labelledBy="settings-bank-modal-title"
          resize={{
            storageKey: 'ordermgmt.bank-modal-size',
            defaultSize: { width: 860, height: 680 },
            minWidth: 640,
            minHeight: 420,
            applyDefaultWhenEmpty: false,
          }}
        >
            <div className="settings-bank-modal-head">
              <h2 id="settings-bank-modal-title" className="settings-section-title">
                {t('settings.bankModalTitle')}
              </h2>
              <p className="settings-bank-modal-hint">{t('settings.bankModalHint')}</p>
            </div>
            <form className="settings-bank-modal-form" onSubmit={onSubmitBank}>
              {bankError && <div className="error-banner">{bankError}</div>}
              {bankMessage && <div className="success-banner">{bankMessage}</div>}

              <div className="settings-fields">
                <div className="settings-row settings-row--full settings-row--bank-codes">
                  <label className="settings-field field-flex-compact field-bank-code">
                    <span className="settings-field-label-row">
                      {t('settings.bankCode')}
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <select
                      value={bankCodeNorm}
                      onChange={(e) =>
                        setBankForm(applyBankCodeToForm(bankForm, e.target.value, i18n.language))
                      }
                      required
                    >
                      <option value="">{t('settings.bankCodeSelect')}</option>
                      {bankCodeNorm && !bankCodeKnown && (
                        <option value={bankCodeNorm}>
                          {bankCodeNorm} — {bankForm.bankName || t('settings.bankCodeUnknown')}
                        </option>
                      )}
                      {bankSelectOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field field-flex-compact field-bank-branch">
                    <span className="settings-field-label-row">{t('settings.bankBranch')}</span>
                    <input
                      value={bankForm.bankBranch}
                      onChange={(e) => setBankForm({ ...bankForm, bankBranch: e.target.value })}
                      inputMode="numeric"
                      maxLength={5}
                    />
                  </label>
                  <label className="settings-field field-flex-rest">
                    <span className="settings-field-label-row">
                      {t('settings.bankAccount')}
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      value={bankForm.bankAccountNumber}
                      onChange={(e) =>
                        setBankForm({ ...bankForm, bankAccountNumber: e.target.value })
                      }
                      required
                      inputMode="numeric"
                    />
                  </label>
                  <label className="settings-field field-flex-grow">
                    <span className="settings-field-label-row">
                      {t('settings.bankBeneficiary')}
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      value={bankForm.bankBeneficiary}
                      onChange={(e) => setBankForm({ ...bankForm, bankBeneficiary: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <div className="settings-row settings-row--full settings-row--bank-name">
                  <label className="settings-field settings-field--label-inline settings-field--bank-name field-flex-grow">
                    <span className="settings-field-label-row">
                      {t('settings.bankName')}
                      <span className="field-hint">{t('settings.bankNameAutoHint')}</span>
                    </span>
                    <input
                      value={bankForm.bankName}
                      readOnly
                      className="input-readonly"
                      tabIndex={-1}
                      aria-readonly="true"
                    />
                  </label>
                </div>
                <div className="settings-row settings-row--full settings-row--bank-swift">
                  <label className="settings-field field-flex-rest">
                    <span className="settings-field-label-row">{t('settings.bankSwift')}</span>
                    <input
                      value={bankForm.bankSwift}
                      onChange={(e) => setBankForm({ ...bankForm, bankSwift: e.target.value })}
                    />
                  </label>
                  <label className="settings-field field-flex-rest">
                    <span className="settings-field-label-row">{t('settings.bankAba')}</span>
                    <input
                      value={bankForm.bankAba}
                      onChange={(e) => setBankForm({ ...bankForm, bankAba: e.target.value })}
                    />
                  </label>
                </div>
                <div className="settings-row settings-row--full settings-row--bank-iban">
                  <label className="settings-field field-flex-grow">
                    <span className="settings-field-label-row">{t('settings.bankIban')}</span>
                    <input
                      value={bankForm.bankIban}
                      onChange={(e) => setBankForm({ ...bankForm, bankIban: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <label className="settings-bank-toggle">
                <input
                  type="checkbox"
                  checked={bankForm.showBankOnDocuments}
                  onChange={(e) =>
                    setBankForm({ ...bankForm, showBankOnDocuments: e.target.checked })
                  }
                />
                {t('settings.showBankOnDocuments')}
              </label>

              <div className="settings-bank-modal-actions">
                <button type="button" className="btn btn-ghost-inline" onClick={closeBankModal}>
                  {t('settings.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingBank}>
                  {savingBank ? t('settings.saving') : t('settings.saveBank')}
                </button>
              </div>
            </form>
        </AppModal>
      )}
    </div>
  );
}
