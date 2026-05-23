import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { catalogApi, type Customer } from '../api/catalog';
import {
  bankDisplayName,
  findIsraeliBank,
  ISRAELI_BANKS,
  normalizeBankCode,
  resolveBankNameForCode,
} from '../data/israeliBanks';
import { useAuth } from '../context/AuthContext';
import '../styles/settings.css';
import '../styles/customers.css';

type CustomerForm = Omit<Customer, 'id' | 'hasLogo' | 'createdAt' | 'version'> & { version?: number };

function emptyForm(): CustomerForm {
  return {
    name: '',
    documentName: '',
    nickname: '',
    contactPerson: '',
    osekNumber: '',
    teudatZehut: '',
    businessCategory: '',
    paymentTerms: '',
    email: '',
    phone: '',
    mobilePhone: '',
    fax: '',
    address: '',
    city: '',
    zipCode: '',
    website: '',
    bankBeneficiary: '',
    bankCode: '',
    bankName: '',
    bankBranch: '',
    bankAccountNumber: '',
    bankSwift: '',
    bankAba: '',
    bankIban: '',
    defaultDiscountPercent: 0,
    isActive: true,
  };
}

function customerToForm(c: Customer): CustomerForm {
  const code = normalizeBankCode(c.bankCode ?? '') || (c.bankCode ?? '');
  return {
    name: c.name,
    documentName: c.documentName ?? '',
    nickname: c.nickname ?? '',
    contactPerson: c.contactPerson ?? '',
    osekNumber: c.osekNumber ?? '',
    teudatZehut: c.teudatZehut ?? '',
    businessCategory: c.businessCategory ?? '',
    paymentTerms: c.paymentTerms ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    mobilePhone: c.mobilePhone ?? '',
    fax: c.fax ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    zipCode: c.zipCode ?? '',
    website: c.website ?? '',
    bankBeneficiary: c.bankBeneficiary ?? '',
    bankCode: code,
    bankName: c.bankName ?? '',
    bankBranch: c.bankBranch ?? '',
    bankAccountNumber: c.bankAccountNumber ?? '',
    bankSwift: c.bankSwift ?? '',
    bankAba: c.bankAba ?? '',
    bankIban: c.bankIban ?? '',
    defaultDiscountPercent: c.defaultDiscountPercent,
    isActive: c.isActive,
    version: c.version,
  };
}

function formToPayload(form: CustomerForm, lang: string, version?: number) {
  const bankCode = normalizeBankCode(form.bankCode ?? '') || (form.bankCode ?? '').trim() || null;
  return {
    name: form.name.trim(),
    documentName: form.documentName?.trim() || null,
    nickname: form.nickname?.trim() || null,
    contactPerson: form.contactPerson?.trim() || null,
    osekNumber: form.osekNumber?.trim() || null,
    teudatZehut: form.teudatZehut?.trim() || null,
    businessCategory: form.businessCategory?.trim() || null,
    paymentTerms: form.paymentTerms?.trim() || null,
    email: form.email?.trim() || null,
    phone: form.phone?.trim() || null,
    mobilePhone: form.mobilePhone?.trim() || null,
    fax: form.fax?.trim() || null,
    address: form.address?.trim() || null,
    city: form.city?.trim() || null,
    zipCode: form.zipCode?.trim() || null,
    website: form.website?.trim() || null,
    bankBeneficiary: form.bankBeneficiary?.trim() || null,
    bankCode,
    bankName: (bankCode ? resolveBankNameForCode(bankCode, lang) : form.bankName?.trim()) || null,
    bankBranch: form.bankBranch?.trim() || null,
    bankAccountNumber: form.bankAccountNumber?.trim() || null,
    bankSwift: form.bankSwift?.trim() || null,
    bankAba: form.bankAba?.trim() || null,
    bankIban: form.bankIban?.trim() || null,
    defaultDiscountPercent: form.defaultDiscountPercent,
    isActive: form.isActive,
    version: version ?? form.version ?? 1,
  };
}

export function CustomerDetailPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const isNew = routeId === 'new';

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const customerId = isNew ? null : routeId ?? null;

  const bankCodeNorm = normalizeBankCode(form.bankCode ?? '');
  const bankCodeKnown = bankCodeNorm ? findIsraeliBank(bankCodeNorm) : undefined;
  const bankSelectOptions = useMemo(
    () =>
      ISRAELI_BANKS.map((bank) => ({
        code: bank.code,
        label: `${bank.code} — ${bankDisplayName(bank, i18n.language)}`,
      })),
    [i18n.language]
  );

  useEffect(() => {
    if (!token || isNew || !customerId) return;
    catalogApi.customers
      .get(token, customerId)
      .then((c) => {
        setForm(customerToForm(c));
        setHasLogo(c.hasLogo);
      })
      .catch((e) => setError(e.message));
  }, [token, customerId, isNew]);

  useEffect(() => {
    if (!token || !customerId || !hasLogo) {
      setLogoPreview(null);
      return;
    }
    let revoked: string | null = null;
    catalogApi.customers
      .fetchLogoBlob(token, customerId)
      .then((blob) => {
        revoked = URL.createObjectURL(blob);
        setLogoPreview(revoked);
      })
      .catch(() => setLogoPreview(null));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [token, customerId, hasLogo]);

  useEffect(() => {
    if (!form.bankCode) return;
    const name = resolveBankNameForCode(form.bankCode, i18n.language);
    if (name && name !== form.bankName) {
      setForm((prev) => ({ ...prev, bankName: name }));
    }
  }, [i18n.language, form.bankCode]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const created = await catalogApi.customers.create(token, formToPayload(form, i18n.language));
        setMessage(t('customers.created'));
        navigate(`/customers/${created.id}`, { replace: true });
      } else if (customerId) {
        const updated = await catalogApi.customers.update(
          token,
          customerId,
          formToPayload(form, i18n.language, form.version)
        );
        setForm(customerToForm(updated));
        setMessage(t('customers.updated'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const onLogoUpload = async (file: File) => {
    if (!token || !customerId) return;
    setLogoBusy(true);
    setError('');
    try {
      const updated = await catalogApi.customers.uploadLogo(token, customerId, file);
      setHasLogo(updated.hasLogo);
      setForm((f) => ({ ...f, version: updated.version }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLogoBusy(false);
    }
  };

  const onLogoDelete = async () => {
    if (!token || !customerId) return;
    setLogoBusy(true);
    try {
      const updated = await catalogApi.customers.deleteLogo(token, customerId);
      setHasLogo(false);
      setForm((f) => ({ ...f, version: updated.version }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="page settings-page customer-detail-page">
      <div className="customer-detail-head">
        <Link to="/customers" className="btn btn-ghost-inline customer-back-link">
          ← {t('customers.backToList')}
        </Link>
        <h1>{isNew ? t('customers.add') : t('customers.cardTitle')}</h1>
      </div>

      <form className="settings-form" onSubmit={onSubmit}>
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        <section className="card settings-section customer-logo-section">
          <div className="settings-section-body customer-logo-section-body">
            <div className="customer-logo-status">
              <span className="customer-logo-status-label">{t('customers.status')}</span>
              <label className="settings-bank-toggle customer-status-toggle">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span>{form.isActive ? t('customers.active') : t('customers.inactive')}</span>
              </label>
            </div>
            <div className="customer-logo-row">
              <div className="customer-logo-preview">
                {logoPreview ? (
                  <img src={logoPreview} alt="" />
                ) : (
                  <span className="customer-logo-placeholder">{t('customers.logoEmpty')}</span>
                )}
              </div>
              <div className="customer-logo-actions">
                <p className="settings-branding-label">{t('customers.logo')}</p>
                {isNew ? (
                  <p className="field-hint">{t('customers.logoAfterSave')}</p>
                ) : (
                  <>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onLogoUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={logoBusy}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {hasLogo ? t('settings.replaceFile') : t('settings.uploadFile')}
                    </button>
                    {hasLogo && (
                      <button
                        type="button"
                        className="btn btn-ghost-inline btn-sm"
                        disabled={logoBusy}
                        onClick={() => void onLogoDelete()}
                      >
                        {t('settings.removeFile')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('customers.sectionGeneral')}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-fields">
              <div className="settings-row settings-row--full">
                <label className="settings-field field-flex-2">
                  <span className="settings-field-label-row">
                    {t('customers.name')}
                    <span className="field-required">*</span>
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>
                <label className="settings-field field-flex-1">
                  <span className="settings-field-label-row">{t('customers.documentName')}</span>
                  <input
                    value={form.documentName}
                    onChange={(e) => setForm({ ...form, documentName: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full">
                <label className="settings-field field-flex-1">
                  <span className="settings-field-label-row">{t('settings.businessNickname')}</span>
                  <input
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-1">
                  <span className="settings-field-label-row">{t('customers.paymentTerms')}</span>
                  <input
                    value={form.paymentTerms}
                    onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--ids">
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.teudatZehut')}</span>
                  <input
                    value={form.teudatZehut}
                    onChange={(e) => setForm({ ...form, teudatZehut: e.target.value })}
                    inputMode="numeric"
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.osekNumber')}</span>
                  <input
                    value={form.osekNumber}
                    onChange={(e) => setForm({ ...form, osekNumber: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-owner">
                  <span className="settings-field-label-row">{t('customers.contactPerson')}</span>
                  <input
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--category customer-category-row">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.businessCategory')}</span>
                  <textarea
                    className="field-rows-2"
                    rows={2}
                    value={form.businessCategory}
                    onChange={(e) => setForm({ ...form, businessCategory: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('customers.discount')}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.defaultDiscountPercent}
                    onChange={(e) =>
                      setForm({ ...form, defaultDiscountPercent: Number(e.target.value) })
                    }
                  />
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
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.streetAddress')}</span>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.city')}</span>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.zipCode')}</span>
                  <input
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--contact-phones">
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.phoneOffice')}</span>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.phoneMobile')}</span>
                  <input
                    value={form.mobilePhone}
                    onChange={(e) => setForm({ ...form, mobilePhone: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.fax')}</span>
                  <input value={form.fax} onChange={(e) => setForm({ ...form, fax: e.target.value })} />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--contact-email">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.email')}</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.website')}</span>
                  <input
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('settings.sectionBank')}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-fields">
              <div className="settings-row settings-row--full settings-row--bank-codes">
                <label className="settings-field field-flex-compact field-bank-code">
                  <span className="settings-field-label-row">{t('settings.bankCode')}</span>
                  <select
                    value={bankCodeNorm}
                    onChange={(e) => {
                      const norm = normalizeBankCode(e.target.value);
                      const name = norm ? resolveBankNameForCode(norm, i18n.language) : '';
                      setForm({ ...form, bankCode: norm || e.target.value, bankName: name });
                    }}
                  >
                    <option value="">{t('settings.bankCodeSelect')}</option>
                    {bankCodeNorm && !bankCodeKnown && (
                      <option value={bankCodeNorm}>
                        {bankCodeNorm} — {form.bankName || t('settings.bankCodeUnknown')}
                      </option>
                    )}
                    {bankSelectOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.bankBranch')}</span>
                  <input
                    value={form.bankBranch}
                    onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.bankAccount')}</span>
                  <input
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.bankBeneficiary')}</span>
                  <input
                    value={form.bankBeneficiary}
                    onChange={(e) => setForm({ ...form, bankBeneficiary: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">
                    {t('settings.bankName')}
                    <span className="field-hint">{t('settings.bankNameAutoHint')}</span>
                  </span>
                  <input value={form.bankName} readOnly className="input-readonly" tabIndex={-1} />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--bank-swift">
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.bankSwift')}</span>
                  <input
                    value={form.bankSwift}
                    onChange={(e) => setForm({ ...form, bankSwift: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.bankAba')}</span>
                  <input value={form.bankAba} onChange={(e) => setForm({ ...form, bankAba: e.target.value })} />
                </label>
              </div>
              <div className="settings-row settings-row--full">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.bankIban')}</span>
                  <input
                    value={form.bankIban}
                    onChange={(e) => setForm({ ...form, bankIban: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <div className="settings-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('settings.saving') : t('settings.saveToDb')}
          </button>
        </div>
      </form>
    </div>
  );
}
