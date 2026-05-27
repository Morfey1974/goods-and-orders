import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('auth.recoverTitle')}</h1>
        {sent ? (
          <div className="success-banner">{t('auth.recoverSent')}</div>
        ) : (
          <>
            <p className="auth-footer" style={{ textAlign: 'start' }}>
              {t('auth.recoverHint')}
            </p>
            {error && <div className="error-banner">{error}</div>}
            <label>
              {t('email')}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {t('auth.recoverSubmit')}
            </button>
          </>
        )}
        <p className="auth-footer">
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </p>
      </form>
    </div>
  );
}
