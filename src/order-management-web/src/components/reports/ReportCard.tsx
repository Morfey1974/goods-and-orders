import { useTranslation } from 'react-i18next';

type Props = {
  title: string;
  description: string;
  onOpen: () => void;
};

export function ReportCard({ title, description, onOpen }: Props) {
  const { t } = useTranslation();

  return (
    <article className="report-card">
      <div className="report-card__icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
      </div>
      <h3 className="report-card__title">{title}</h3>
      <p className="report-card__desc">{description}</p>
      <button type="button" className="btn btn-primary report-card__btn" onClick={onOpen}>
        {t('reports.openReport')}
      </button>
    </article>
  );
}
