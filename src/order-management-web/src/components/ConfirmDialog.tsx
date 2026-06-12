import { AppModal } from './ui/AppModal';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  zIndex?: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  zIndex = 2600,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AppModal
      open={open}
      onClose={onCancel}
      preventClose={busy}
      size="sm"
      zIndex={zIndex}
      overlayClassName="confirm-dialog-overlay"
      className="confirm-dialog"
      labelledBy="confirm-dialog-title"
    >
      <h2 id="confirm-dialog-title">{title}</h2>
      <p className="confirm-dialog-message">{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost-inline" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </AppModal>
  );
}
