import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { PasswordInput } from '../components/PasswordInput';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword({ token, newPassword: password });
      navigate('/login', { state: { resetDone: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={(e) => e.preventDefault()}>
          <h1>{t('auth.resetTitle')}</h1>
          <div className="error-banner">{t('auth.tokenMissing')}</div>
          <p className="auth-footer">
            <Link to="/forgot-password">{t('auth.recoverTitle')}</Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('auth.resetTitle')}</h1>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t('auth.newPassword')}
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            autoFocus
          />
        </label>
        <label>
          {t('auth.repeatPassword')}
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {t('auth.resetSubmit')}
        </button>
        <p className="auth-footer">
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </p>
      </form>
    </div>
  );
}
