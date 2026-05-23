import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import i18n from '../i18n';

export function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
    businessName: '',
    ownerFullName: '',
  });
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register({ ...form, defaultLanguage: i18n.language });
      navigate('/settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t('register')}</h1>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t('email')}
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label>
          {t('password')}
          <input
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        <label>
          {t('businessName')}
          <input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            required
          />
        </label>
        <label>
          {t('ownerName')}
          <input
            value={form.ownerFullName}
            onChange={(e) => setForm({ ...form, ownerFullName: e.target.value })}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary">
          {t('register')}
        </button>
        <p className="auth-footer">
          {t('auth.hasAccount')} <Link to="/login">{t('login')}</Link>
        </p>
      </form>
    </div>
  );
}
