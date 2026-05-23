import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi } from '../api/catalog';
import { ordersApi, type Order } from '../api/orders';
import { useAuth } from '../context/AuthContext';

const STATUS_KEYS: Record<string, string> = {
  Draft: 'draft',
  QuoteSent: 'quoteSent',
  Accepted: 'accepted',
  InProgress: 'inProgress',
  Invoiced: 'invoiced',
  AwaitingPayment: 'awaitingPayment',
  Paid: 'paid',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

export function OrdersPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; articleCode: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    productId: '',
    quantity: 1,
    notes: '',
  });

  const load = useCallback(() => {
    if (!token) return;
    ordersApi.list(token).then(setOrders).catch((e) => setError(e.message));
    catalogApi.customers.list(token, true).then((c) =>
      setCustomers(c.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name })))
    ).catch(() => {});
    catalogApi.products.list(token, undefined, true).then((p) =>
      setProducts(
        p.filter((x) => x.isActive).map((x) => ({ id: x.id, articleCode: x.articleCode, name: x.name }))
      )
    ).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !form.customerId || !form.productId) return;
    setError('');
    try {
      await ordersApi.create(token, {
        customerId: form.customerId,
        notes: form.notes || undefined,
        lines: [{ productId: form.productId, quantity: form.quantity }],
      });
      setMessage(t('orders.created'));
      setCreateOpen(false);
      setForm({ customerId: '', productId: '', quantity: 1, notes: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onStartWork = async (order: Order) => {
    if (!token) return;
    setError('');
    try {
      await ordersApi.startWork(token, order.id);
      setMessage(t('orders.workStarted'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onIssueChargeInvoice = async (order: Order) => {
    if (!token) return;
    if (!window.confirm(t('orders.chargeInvoiceConfirm', { number: order.orderNumber }))) return;
    setError('');
    try {
      const updated = await ordersApi.issueChargeInvoice(token, order.id);
      setMessage(t('orders.chargeInvoiceIssued', { h: updated.chargeInvoiceNumber ?? '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const canStartWork = (o: Order) =>
    !o.stockDeducted && o.status !== 'Cancelled' && o.status !== 'InProgress' && o.status !== 'Invoiced';

  const canIssueInvoice = (o: Order) =>
    !o.stockDeducted && o.status !== 'Cancelled';

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('nav.orders')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          {t('orders.add')}
        </button>
      </div>
      <p className="muted">{t('orders.stockHint')}</p>
      {message && <div className="success-banner">{message}</div>}
      {error && !createOpen && <div className="error-banner">{error}</div>}

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('orders.number')}</th>
              <th>{t('orders.customer')}</th>
              <th>{t('orders.status')}</th>
              <th>{t('orders.chargeInvoice')}</th>
              <th>{t('orders.total')}</th>
              <th>{t('orders.stock')}</th>
              <th>{t('products.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><code>{o.orderNumber}</code></td>
                <td>{o.customerName}</td>
                <td>
                  <span className={`status-badge status-${STATUS_KEYS[o.status] ?? 'draft'}`}>
                    {t(`orders.statuses.${STATUS_KEYS[o.status] ?? 'draft'}`)}
                  </span>
                </td>
                <td>
                  {o.chargeInvoiceNumber ? (
                    <code>{o.chargeInvoiceNumber}</code>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{o.totalAmount.toFixed(2)} ₪</td>
                <td>{o.stockDeducted ? t('orders.stockDone') : t('orders.stockPending')}</td>
                <td className="order-actions-cell">
                  {canStartWork(o) && (
                    <button type="button" className="btn btn-ghost-inline" onClick={() => onStartWork(o)}>
                      {t('orders.startWork')}
                    </button>
                  )}
                  {canIssueInvoice(o) && (
                    <button type="button" className="btn btn-ghost-inline" onClick={() => onIssueChargeInvoice(o)}>
                      {t('orders.issueChargeInvoice')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <p className="muted empty-table">{t('orders.empty')}</p>}
      </div>

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>{t('orders.add')}</h2>
            <form className="form-grid" onSubmit={onCreate}>
              {error && <div className="error-banner">{error}</div>}
              <label>
                {t('orders.customer')}
                <select
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  required
                >
                  <option value="">—</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('products.name')}
                <select
                  value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  required
                >
                  <option value="">—</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.articleCode} — {p.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('warehouse.qty')}
                <input
                  type="number"
                  min={0.0001}
                  step={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  required
                />
              </label>
              <label>
                {t('warehouse.notes')}
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost-inline" onClick={() => setCreateOpen(false)}>
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
