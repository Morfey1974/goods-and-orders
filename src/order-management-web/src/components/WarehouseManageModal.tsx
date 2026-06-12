import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { WAREHOUSE_MANAGE_RESIZE } from '../lib/resizablePanelKeys';
import { AppModal } from './ui/AppModal';
import { ConfirmDialog } from './ConfirmDialog';
import { bidiAutoInputProps } from './BidiText';
import { warehouseApi, type Warehouse } from '../api/warehouse';

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  onChanged: () => void;
};

export function WarehouseManageModal({ open, onClose, token, onChanged }: Props) {
  const { t } = useTranslation();
  const [list, setList] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', isActive: true });
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    warehouseApi.list(token).then(setList).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (open) {
      load();
      setEditing(null);
      setFormOpen(false);
      setForm({ name: '', description: '', isActive: true });
      setError('');
    }
  }, [open, load]);

  const openEdit = (wh: Warehouse | null) => {
    setEditing(wh);
    setFormOpen(true);
    setForm({
      name: wh?.name ?? '',
      description: wh?.description ?? '',
      isActive: wh?.isActive ?? true,
    });
    setError('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    try {
      if (editing) {
        await warehouseApi.update(token, editing.id, {
          name: form.name,
          description: form.description || undefined,
          isActive: form.isActive,
        });
      } else {
        await warehouseApi.create(token, {
          name: form.name,
          description: form.description || undefined,
          isActive: form.isActive,
        });
      }
      setEditing(null);
      setFormOpen(false);
      setForm({ name: '', description: '', isActive: true });
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onDelete = (wh: Warehouse) => {
    if (!token || wh.isSystem) return;
    setDeleteTarget(wh);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleteBusy(true);
    try {
      await warehouseApi.delete(token, deleteTarget.id);
      setDeleteTarget(null);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
    <AppModal
      open={open}
      onClose={onClose}
      ariaLabel={t('warehouse.manageTitle')}
      className="app-modal-panel warehouse-manage-modal"
      overlayClassName="warehouse-manage-overlay"
      noCard
      closeOnBackdrop={false}
      resize={WAREHOUSE_MANAGE_RESIZE}
    >
      <header className="app-modal-panel__header">
        <div>
          <h2>{t('warehouse.manageTitle')}</h2>
          <p className="app-modal-panel__header-sub">
            {t('warehouse.manageSubtitle', { count: list.length })}
          </p>
        </div>
        <button
          type="button"
          className="app-modal-panel__close"
          onClick={onClose}
          aria-label={t('products.close')}
        >
          ×
        </button>
      </header>

      <div className="app-modal-panel__body">
        {error && <div className="error-banner">{error}</div>}

        <div className="warehouse-manage-toolbar">
          <button type="button" className="btn btn-primary" onClick={() => openEdit(null)}>
            + {t('warehouse.addWarehouse')}
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table warehouse-manage-table">
            <thead>
              <tr>
                <th>{t('warehouse.colName')}</th>
                <th>{t('warehouse.colDescription')}</th>
                <th>{t('warehouse.colStatus')}</th>
                <th>{t('warehouse.colCreated')}</th>
                <th>{t('products.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((wh) => (
                <tr key={wh.id}>
                  <td className="bidi-auto">
                    <strong>{wh.name}</strong>
                    {wh.isSystem && <span className="warehouse-system-tag">{t('warehouse.system')}</span>}
                  </td>
                  <td className="bidi-auto">{wh.description ?? '—'}</td>
                  <td>
                    <span className={wh.isActive ? 'warehouse-status-active' : 'warehouse-status-inactive'}>
                      {wh.isActive ? t('products.statusActive') : t('products.statusInactive')}
                    </span>
                  </td>
                  <td>{new Date(wh.createdAt).toLocaleDateString()}</td>
                  <td className="doc-actions">
                    <button type="button" className="btn btn-ghost-inline" onClick={() => openEdit(wh)}>
                      {t('customers.edit')}
                    </button>
                    {!wh.isSystem && (
                      <button type="button" className="btn btn-ghost-inline" onClick={() => onDelete(wh)}>
                        {t('products.actionDelete')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {formOpen && (
          <form className="form-grid warehouse-edit-form" onSubmit={onSubmit}>
            <h3>{editing ? t('warehouse.editWarehouse') : t('warehouse.newWarehouse')}</h3>
            <label>
              {t('warehouse.colName')} *
              <input
                {...bidiAutoInputProps}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              {t('warehouse.colDescription')}
              <input
                {...bidiAutoInputProps}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={editing?.isSystem}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              {t('warehouse.activeWarehouse')}
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost-inline"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(false);
                  setForm({ name: '', description: '', isActive: true });
                }}
              >
                {t('settings.cancel')}
              </button>
              <button type="submit" className="btn btn-primary">{t('submit')}</button>
            </div>
          </form>
        )}
      </div>
    </AppModal>

    <ConfirmDialog
      open={deleteTarget !== null}
      title={t('warehouse.deleteConfirmTitle')}
      message={t('warehouse.deleteConfirm', { name: deleteTarget?.name ?? '' })}
      confirmLabel={t('products.actionDelete')}
      cancelLabel={t('settings.cancel')}
      danger
      busy={deleteBusy}
      onConfirm={() => void confirmDelete()}
      onCancel={() => !deleteBusy && setDeleteTarget(null)}
    />
    </>
  );
}
