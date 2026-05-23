import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="page">
      <h1>{t('nav.dashboard')}</h1>
      <div className="card">
        <p>
          {t('dashboard.welcome')}, <strong>{user?.businessName}</strong>
        </p>
        <p className="muted">{t('dashboard.stage')}</p>
        {user?.trialEndsAt && (
          <p className="badge badge-open">
            {t('dashboard.trialUntil')}: {new Date(user.trialEndsAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
