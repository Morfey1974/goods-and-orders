import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="page">
      <h1>{t(titleKey)}</h1>
      <div className="card muted">{t('placeholder')}</div>
    </div>
  );
}
