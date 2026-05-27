import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { PasswordInput } from '../components/PasswordInput';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState<string>('');

  useEffect(() => {
    const state = location.state as { resetDone?: boolean } | null;
    if (state?.resetDone) {
      setInfo(t('auth.resetDone'));
      window.history.replaceState({}, '');
    }
  }, [location.state, t]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('login')}</h1>
        {error && <div className="error-banner">{error}</div>}
        {info && <div className="success-banner">{info}</div>}
        <label>
          {t('email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t('password')}
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn btn-primary">
          {t('login')}
        </button>
        <p className="auth-link">
          <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
        </p>
        <p className="auth-footer">
          {t('auth.noAccount')} <Link to="/register">{t('register')}</Link>
        </p>
      </form>
    </div>
  );
}
