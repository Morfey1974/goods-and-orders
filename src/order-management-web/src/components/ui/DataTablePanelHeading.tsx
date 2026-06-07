import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  count?: ReactNode;
};

export function DataTablePanelHeading({ title, count }: Props) {
  return (
    <div className="dt-panel__heading">
      <h1 className="dt-panel__title">{title}</h1>
      {count != null && count !== '' && <span className="dt-panel__count">{count}</span>}
    </div>
  );
}
