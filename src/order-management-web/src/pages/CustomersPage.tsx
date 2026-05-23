import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi, type Customer } from '../api/catalog';
import { useAuth } from '../context/AuthContext';

const emptyForm = () => ({
  name: '',
  email: '',
  phone: '',
  address: '',
  defaultDiscountPercent: 0,
});

export function CustomersPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [list, setList] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    if (!token) return;
    catalogApi.customers.list(token, true).then(setList).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      address: c.address ?? '',
      defaultDiscountPercent: c.defaultDiscountPercent,
    });
    setError('');
    setModalOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    try {
      if (editing) {
        await catalogApi.customers.update(token, editing.id, {
          ...form,
          isActive: editing.isActive,
          version: editing.version,
        });
        setMessage(t('customers.updated'));
      } else {
        await catalogApi.customers.create(token, form);
        setMessage(t('customers.created'));
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('nav.customers')}</h1>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          {t('customers.add')}
        </button>
      </div>
      {message && <div className="success-banner">{message}</div>}
      {error && !modalOpen && <div className="error-banner">{error}</div>}

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('customers.name')}</th>
              <th>{t('customers.phone')}</th>
              <th>{t('customers.discount')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className={!c.isActive ? 'row-inactive' : ''}>
                <td>{c.name}</td>
                <td>{c.phone ?? '—'}</td>
                <td>{c.defaultDiscountPercent > 0 ? `${c.defaultDiscountPercent}%` : '—'}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => openEdit(c)}>
                    {t('customers.edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="muted empty-table">{t('customers.empty')}</p>}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? t('customers.edit') : t('customers.add')}</h2>
            <form className="form-grid" onSubmit={onSubmit}>
              {error && <div className="error-banner">{error}</div>}
              <label>
                {t('customers.name')} *
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                {t('email')}
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                {t('customers.phone')}
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label>
                {t('customers.address')}
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
              </label>
              <label>
                {t('customers.discount')}
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.defaultDiscountPercent}
                  onChange={(e) => setForm({ ...form, defaultDiscountPercent: Number(e.target.value) })}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost-inline" onClick={() => setModalOpen(false)}>
                  {t('settings.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">{t('submit')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
