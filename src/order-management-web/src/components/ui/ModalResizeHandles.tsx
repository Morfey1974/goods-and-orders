import type { MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
  /** Handle only — no bottom gutter (for in-page table body corner) */
  corner?: boolean;
};

export function ModalResizeHandles({ onMouseDown, corner }: Props) {
  const { t } = useTranslation();
  if (corner) {
    return (
      <div
        className="app-modal__resize-handle dt-panel__resize-handle"
        onMouseDown={onMouseDown}
        title={t('common.resizeModal')}
        aria-hidden
      />
    );
  }
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
