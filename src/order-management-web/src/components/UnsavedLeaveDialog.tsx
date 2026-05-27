import { AppModal } from './ui/AppModal';

type Props = {
  open: boolean;
  title: string;
  message: string;
  saveLabel: string;
  discardLabel: string;
  cancelLabel: string;
  busy?: boolean;
  saveDisabled?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export function UnsavedLeaveDialog({
  open,
  title,
  message,
  saveLabel,
  discardLabel,
  cancelLabel,
  busy = false,
  saveDisabled = false,
  onSave,
  onDiscard,
  onCancel,
}: Props) {
  return (
    <AppModal
      open={open}
      onClose={onCancel}
      preventClose={busy}
      size="sm"
      zIndex={2600}
      overlayClassName="confirm-dialog-overlay"
      className="confirm-dialog unsaved-leave-dialog"
      labelledBy="unsaved-leave-title"
    >
      <h2 id="unsaved-leave-title">{title}</h2>
      <p className="confirm-dialog-message">{message}</p>
      <div className="modal-actions unsaved-leave-actions">
        <button type="button" className="btn btn-ghost-inline unsaved-leave-btn" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn-secondary unsaved-leave-btn" onClick={onDiscard} disabled={busy}>
          {discardLabel}
        </button>
        <button
          type="button"
          className="btn btn-primary unsaved-leave-btn"
          onClick={onSave}
          disabled={busy || saveDisabled}
        >
          {saveLabel}
        </button>
      </div>
    </AppModal>
  );
}
