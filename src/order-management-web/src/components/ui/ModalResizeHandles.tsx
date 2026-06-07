import type { MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
};

export function ModalResizeHandles({ onMouseDown }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="app-modal__resize-gutter" aria-hidden />
      <div
        className="app-modal__resize-handle"
        onMouseDown={onMouseDown}
        title={t('common.resizeModal')}
        aria-hidden
      />
    </>
  );
}
