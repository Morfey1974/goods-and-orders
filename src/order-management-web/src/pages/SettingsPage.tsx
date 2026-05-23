import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type TenantProfile } from '../api/client';
import { useAuth } from '../context/AuthContext';

type BankForm = {
  bankBeneficiary: string;
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
};

function bankFromProfile(p: TenantProfile): BankForm {
  return {
    bankBeneficiary: p.bankBeneficiary ?? p.businessName ?? '',
    bankName: p.bankName ?? '',
    bankBranch: p.bankBranch ?? '',
    bankAccountNumber: p.bankAccountNumber ?? '',
  };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [bankForm, setBankForm] = useState<BankForm | null>(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [bankMessage, setBankMessage] = useState('');
  const [error, setError] = useState('');
  const [bankError, setBankError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getProfile(token).then((p) => {
      setProfile(p);
      setBankForm(bankFromProfile(p));
    }).catch((e) => setError(e.message));
  }, [token]);

  const onSubmitProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !profile) return;
    if (!profile.teudatZehut?.trim()) {
      setError(t('settings.teudatRequired'));
      return;
    }
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const updated = await api.updateProfile(token, {
        businessName: profile.businessName,
        ownerFullName: profile.ownerFullName,
        osekNumber: profile.osekNumber,
        teudatZehut: profile.teudatZehut.trim(),
        phone: profile.phone,
        address: profile.address,
        defaultLanguage: profile.defaultLanguage,
        version: profile.version,
      });
      setProfile(updated);
      setBankForm(bankFromProfile(updated));
      setMessage(t('settings.savedToDb'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
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
      const updated = await api.updateBankDetails(token, {
        bankBeneficiary: bankForm.bankBeneficiary.trim(),
        bankName: bankForm.bankName.trim(),
        bankBranch: bankForm.bankBranch.trim() || null,
        bankAccountNumber: bankForm.bankAccountNumber.trim(),
        version: profile.version,
      });
      setProfile(updated);
      setBankForm(bankFromProfile(updated));
      setBankMessage(t('settings.bankSaved'));
      setTimeout(() => {
        setBankModalOpen(false);
        setBankMessage('');
      }, 1200);
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingBank(false);
    }
  };

  const openBankModal = () => {
    if (profile) setBankForm(bankFromProfile(profile));
    setBankError('');
    setBankMessage('');
    setBankModalOpen(true);
  };

  if (!profile) return <div className="page">{error || '...'}</div>;

  const hasBank = !!(profile.bankName && profile.bankAccountNumber);

  return (
    <div className="page">
      <h1>{t('settings.title')}</h1>
      <p className="muted">{t('settings.taxRegime')}</p>

      <form className="card form-grid" onSubmit={onSubmitProfile}>
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        <label>
          {t('businessName')}
          <input
            value={profile.businessName}
            onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
            required
          />
        </label>
        <label>
          {t('ownerName')}
          <input
            value={profile.ownerFullName}
            onChange={(e) => setProfile({ ...profile, ownerFullName: e.target.value })}
            required
          />
        </label>
        <label>
          {t('settings.osekNumber')}
          <span className="field-hint">{t('settings.forInvoices')}</span>
          <input
            value={profile.osekNumber ?? ''}
            onChange={(e) => setProfile({ ...profile, osekNumber: e.target.value })}
          />
        </label>
        <label>
          {t('settings.teudatZehut')} *
          <span className="field-hint">{t('settings.teudatHint')}</span>
          <input
            value={profile.teudatZehut ?? ''}
            onChange={(e) => setProfile({ ...profile, teudatZehut: e.target.value })}
            required
            inputMode="numeric"
          />
        </label>
        <label>
          {t('settings.phone')}
          <span className="field-hint">{t('settings.forInvoices')}</span>
          <input
            type="tel"
            value={profile.phone ?? ''}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
        </label>
        <label>
          {t('settings.address')}
          <span className="field-hint">{t('settings.forInvoices')}</span>
          <textarea
            value={profile.address ?? ''}
            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            rows={2}
          />
        </label>

        <div className="bank-section">
          <div>
            <strong>{t('settings.bankDetails')}</strong>
            <p className="field-hint">{t('settings.bankHint')}</p>
            {hasBank && (
              <p className="bank-preview muted">
                {profile.bankName} · {profile.bankAccountNumber}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={openBankModal}>
            {t('settings.configureBank')}
          </button>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('settings.saving') : t('settings.saveToDb')}
        </button>
      </form>

      {bankModalOpen && bankForm && (
        <div className="modal-overlay" onClick={() => setBankModalOpen(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>{t('settings.bankModalTitle')}</h2>
            <p className="muted">{t('settings.bankModalHint')}</p>
            <form className="form-grid" onSubmit={onSubmitBank}>
              {bankError && <div className="error-banner">{bankError}</div>}
              {bankMessage && <div className="success-banner">{bankMessage}</div>}
              <label>
                {t('settings.bankBeneficiary')}
                <input
                  value={bankForm.bankBeneficiary}
                  onChange={(e) => setBankForm({ ...bankForm, bankBeneficiary: e.target.value })}
                  required
                />
              </label>
              <label>
                {t('settings.bankName')}
                <input
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  required
                />
              </label>
              <label>
                {t('settings.bankBranch')}
                <input
                  value={bankForm.bankBranch}
                  onChange={(e) => setBankForm({ ...bankForm, bankBranch: e.target.value })}
                />
              </label>
              <label>
                {t('settings.bankAccount')}
                <input
                  value={bankForm.bankAccountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, bankAccountNumber: e.target.value })}
                  required
                  inputMode="numeric"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost-inline" onClick={() => setBankModalOpen(false)}>
                  {t('settings.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingBank}>
                  {savingBank ? t('settings.saving') : t('settings.saveBank')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
