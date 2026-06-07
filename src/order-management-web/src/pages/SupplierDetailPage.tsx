import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { suppliersApi, type Supplier, type SupplierContactInput } from '../api/suppliers';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SuppressBrowserAutofill } from '../components/form/SuppressBrowserAutofill';
import { useAuth } from '../context/AuthContext';
import { FORM_AUTOCOMPLETE_OFF } from '../lib/browserAutofill';
import '../styles/settings.css';
import '../styles/customers.css';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'CNY'];

type FormState = {
  name: string;
  legalName: string;
  countryCode: string;
  taxId: string;
  contactPerson: string;
  email: string;
  phone: string;
  mobilePhone: string;
  website: string;
  address: string;
  city: string;
  stateRegion: string;
  zipCode: string;
  bankBeneficiary: string;
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
  bankSwift: string;
  bankIban: string;
  defaultCurrency: string;
  notes: string;
  isActive: boolean;
  version?: number;
};

type ContactRow = {
  key: string;
  fullName: string;
  phone: string;
  email: string;
};

function emptyContactRow(): ContactRow {
  return { key: crypto.randomUUID(), fullName: '', phone: '', email: '' };
}

function contactsFromSupplier(s: Supplier): ContactRow[] {
  const rows = (s.contacts ?? []).map((x) => ({
    key: x.id,
    fullName: x.fullName,
    phone: x.phone ?? '',
    email: x.email ?? '',
  }));
  return rows.length > 0 ? rows : [emptyContactRow()];
}

function contactsToPayload(rows: ContactRow[]): SupplierContactInput[] {
  return rows.map((r) => ({
    fullName: r.fullName.trim() || null,
    phone: r.phone.trim() || null,
    email: r.email.trim() || null,
  }));
}

function emptyForm(): FormState {
  return {
    name: '',
    legalName: '',
    countryCode: '',
    taxId: '',
    contactPerson: '',
    email: '',
    phone: '',
    mobilePhone: '',
    website: '',
    address: '',
    city: '',
    stateRegion: '',
    zipCode: '',
    bankBeneficiary: '',
    bankName: '',
    bankBranch: '',
    bankAccountNumber: '',
    bankSwift: '',
    bankIban: '',
    defaultCurrency: 'ILS',
    notes: '',
    isActive: true,
  };
}

function toForm(s: Supplier): FormState {
  return {
    name: s.name,
    legalName: s.legalName ?? '',
    countryCode: s.countryCode ?? '',
    taxId: s.taxId ?? '',
    contactPerson: s.contactPerson ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    mobilePhone: s.mobilePhone ?? '',
    website: s.website ?? '',
    address: s.address ?? '',
    city: s.city ?? '',
    stateRegion: s.stateRegion ?? '',
    zipCode: s.zipCode ?? '',
    bankBeneficiary: s.bankBeneficiary ?? '',
    bankName: s.bankName ?? '',
    bankBranch: s.bankBranch ?? '',
    bankAccountNumber: s.bankAccountNumber ?? '',
    bankSwift: s.bankSwift ?? '',
    bankIban: s.bankIban ?? '',
    defaultCurrency: s.defaultCurrency || 'ILS',
    notes: s.notes ?? '',
    isActive: s.isActive,
    version: s.version,
  };
}

function toPayload(form: FormState, contacts: SupplierContactInput[]) {
  const trim = (v: string) => v.trim() || null;
  return {
    name: form.name.trim(),
    legalName: trim(form.legalName),
    countryCode: trim(form.countryCode),
    taxId: trim(form.taxId),
    contactPerson: trim(form.contactPerson),
    email: trim(form.email),
    phone: trim(form.phone),
    mobilePhone: trim(form.mobilePhone),
    website: trim(form.website),
    address: trim(form.address),
    city: trim(form.city),
    stateRegion: trim(form.stateRegion),
    zipCode: trim(form.zipCode),
    bankBeneficiary: trim(form.bankBeneficiary),
    bankName: trim(form.bankName),
    bankBranch: trim(form.bankBranch),
    bankAccountNumber: trim(form.bankAccountNumber),
    bankSwift: trim(form.bankSwift),
    bankIban: trim(form.bankIban),
    defaultCurrency: form.defaultCurrency,
    notes: trim(form.notes),
    isActive: form.isActive,
    version: form.version,
    contacts,
  };
}

function supplierInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function SupplierDetailPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !routeId || routeId === 'new';

  const [form, setForm] = useState<FormState>(emptyForm);
  const [contactRows, setContactRows] = useState<ContactRow[]>([emptyContactRow()]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!token || isNew || !routeId) return;
    suppliersApi
      .get(token, routeId)
      .then((s) => {
        setForm(toForm(s));
        setContactRows(contactsFromSupplier(s));
      })
      .catch((e) => setError(e.message));
  }, [token, routeId, isNew]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !form.name.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body = toPayload(form, contactsToPayload(contactRows));
      if (isNew) {
        const created = await suppliersApi.create(token, body);
        setMessage(t('suppliers.created'));
        navigate(`/suppliers/${created.id}`, { replace: true });
      } else if (routeId) {
        const updated = await suppliersApi.update(token, routeId, body);
        setForm(toForm(updated));
        setContactRows(contactsFromSupplier(updated));
        setMessage(t('suppliers.updated'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = () => {
    if (form.isActive) {
      setError(t('suppliers.deleteMustDeactivate'));
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!token || isNew || !routeId) return;
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await suppliersApi.delete(token, routeId);
      navigate('/suppliers');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const initials = supplierInitials(form.name || form.legalName);

  return (
    <div className="page settings-page customer-detail-page supplier-detail-page">
      <div className="customer-detail-head">
        <Link to="/suppliers" className="btn btn-ghost-inline customer-back-link">
          ← {t('suppliers.back')}
        </Link>
        <h1>{isNew ? t('suppliers.newTitle') : t('suppliers.editTitle')}</h1>
      </div>

      <form
        className="settings-form"
        onSubmit={onSubmit}
        autoComplete="off"
        data-lpignore="true"
        data-form-type="other"
      >
        <SuppressBrowserAutofill />
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        <section className="card settings-section supplier-identity-section">
          <div className="settings-section-body customer-logo-section-body supplier-identity-body">
            <div className="customer-logo-status">
              <span className="customer-logo-status-label">{t('customers.status')}</span>
              <label className="settings-bank-toggle customer-status-toggle">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span>{form.isActive ? t('suppliers.active') : t('suppliers.inactive')}</span>
              </label>
            </div>
            <div className="customer-logo-row supplier-identity-row">
              <div className="supplier-avatar" aria-hidden>
                <span>{initials}</span>
                {form.countryCode && (
                  <span className="supplier-avatar-country">{form.countryCode}</span>
                )}
              </div>
              <div className="supplier-identity-summary">
                <p className="settings-branding-label">{t('suppliers.sectionGeneral')}</p>
                <p className="supplier-identity-name">{form.name.trim() || t('suppliers.newTitle')}</p>
                {form.legalName.trim() && (
                  <p className="muted supplier-identity-legal">{form.legalName}</p>
                )}
                <p className="muted supplier-identity-meta">
                  {[form.taxId && `VAT: ${form.taxId}`, form.defaultCurrency]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('suppliers.sectionGeneral')}</h2>
          </div>
          <div className="settings-section-body">
            <div className="settings-fields">
              <div className="settings-row settings-row--full">
                <label className="settings-field field-flex-2">
                  <span className="settings-field-label-row">
                    {t('suppliers.name')}
                    <span className="field-required">*</span>
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>
                <label className="settings-field field-flex-1">
                  <span className="settings-field-label-row">{t('suppliers.legalName')}</span>
                  <input
                    value={form.legalName}
                    onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--ids">
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('suppliers.countryCode')}</span>
                  <input
                    value={form.countryCode}
                    maxLength={2}
                    placeholder="CN"
                    onChange={(e) =>
                      setForm({ ...form, countryCode: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('suppliers.taxId')}</span>
                  <input
                    value={form.taxId}
                    onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('suppliers.defaultCurrency')}</span>
                  <select
                    value={form.defaultCurrency}
                    onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-field field-flex-owner">
                  <span className="settings-field-label-row">{t('suppliers.contactPerson')}</span>
                  <input
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-section customer-contacts-section">
          <div className="settings-section-head customer-contacts-head">
            <h2 className="settings-section-title">{t('customers.contactPeople')}</h2>
            <button
              type="button"
              className="btn btn-primary btn-sm customer-contact-add"
              onClick={() => setContactRows((prev) => [...prev, emptyContactRow()])}
              aria-label={t('customers.addContact')}
            >
              +
            </button>
          </div>
          <div className="settings-section-body">
            <p className="muted customer-contacts-hint">{t('suppliers.contactPeopleHint')}</p>
            <div className="customer-contacts-list">
              {contactRows.map((row, index) => (
                <div key={row.key} className="customer-contact-row">
                  <label className="customer-contact-field customer-contact-field--name">
                    <span>{t('customers.contactFullName')}</span>
                    <input
                      value={row.fullName}
                      onChange={(e) =>
                        setContactRows((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, fullName: e.target.value } : r
                          )
                        )
                      }
                    />
                  </label>
                  <label className="customer-contact-field customer-contact-field--phone">
                    <span>{t('settings.phoneMobile')}</span>
                    <input
                      type="tel"
                      value={row.phone}
                      onChange={(e) =>
                        setContactRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, phone: e.target.value } : r))
                        )
                      }
                    />
                  </label>
                  <label className="customer-contact-field customer-contact-field--email">
                    <span>{t('settings.email')}</span>
                    <input
                      type="text"
                      inputMode="email"
                      autoComplete={FORM_AUTOCOMPLETE_OFF}
                      value={row.email}
                      onChange={(e) =>
                        setContactRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, email: e.target.value } : r))
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="customer-contact-remove"
                    onClick={() =>
                      setContactRows((prev) =>
                        prev.length <= 1 ? [emptyContactRow()] : prev.filter((_, i) => i !== index)
                      )
                    }
                    aria-label={t('customers.removeContact')}
                  >
                    ×
                  </button>
                </div>
              ))}
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
                    autoComplete="off"
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.city')}</span>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('suppliers.stateRegion')}</span>
                  <input
                    value={form.stateRegion}
                    onChange={(e) => setForm({ ...form, stateRegion: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-compact">
                  <span className="settings-field-label-row">{t('settings.zipCode')}</span>
                  <input
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--contact-phones">
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.phoneOffice')}</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.phoneMobile')}</span>
                  <input
                    value={form.mobilePhone}
                    onChange={(e) => setForm({ ...form, mobilePhone: e.target.value })}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="settings-row settings-row--full settings-row--contact-email">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.email')}</span>
                  <input
                    type="text"
                    inputMode="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoComplete={FORM_AUTOCOMPLETE_OFF}
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
              <div className="settings-row settings-row--full settings-row--bank-codes settings-row--bank-codes--beneficiary-first">
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('settings.bankBeneficiary')}</span>
                  <input
                    value={form.bankBeneficiary}
                    onChange={(e) => setForm({ ...form, bankBeneficiary: e.target.value })}
                  />
                </label>
                <label className="settings-field field-flex-grow">
                  <span className="settings-field-label-row">{t('suppliers.bankName')}</span>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  />
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
              </div>
              <div className="settings-row settings-row--full settings-row--bank-swift">
                <label className="settings-field field-flex-rest">
                  <span className="settings-field-label-row">{t('settings.bankSwift')}</span>
                  <input
                    value={form.bankSwift}
                    onChange={(e) => setForm({ ...form, bankSwift: e.target.value })}
                  />
                </label>
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

        <section className="card settings-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">{t('suppliers.notes')}</h2>
          </div>
          <div className="settings-section-body">
            <label className="settings-field field-flex-grow">
              <textarea
                className="field-rows-2"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('suppliers.notesPlaceholder')}
                autoComplete="off"
              />
            </label>
          </div>
        </section>

        <div className="settings-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('settings.saving') : t('settings.saveToDb')}
          </button>
          <Link to="/suppliers" className="btn btn-ghost-inline">
            {t('settings.cancel')}
          </Link>
        </div>

        {!isNew && (
          <section className="card settings-section supplier-danger-section">
            <div className="settings-section-head">
              <h2 className="settings-section-title">{t('suppliers.dangerZone')}</h2>
            </div>
            <div className="settings-section-body">
              <p className="muted">{t('suppliers.deleteHint')}</p>
              {form.isActive ? (
                <p className="muted">{t('suppliers.deleteMustDeactivate')}</p>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={deleting || saving}
                  onClick={requestDelete}
                >
                  {t('suppliers.delete')}
                </button>
              )}
            </div>
          </section>
        )}
      </form>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('suppliers.deleteConfirmTitle')}
        message={t('suppliers.deleteConfirm', { name: form.name.trim() || routeId || '' })}
        confirmLabel={t('suppliers.deleteConfirmAction')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleting && setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
