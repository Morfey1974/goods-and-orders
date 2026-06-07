import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi } from '../api/catalog';
import { ordersApi, type Order } from '../api/orders';
import { AppModal } from '../components/ui/AppModal';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { bidiAutoInputProps } from '../components/BidiText';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import {
  ORDERS_COLUMN_CLASS,
  ORDERS_COLUMN_KEYS,
  ORDERS_COLUMN_WIDTHS_KEY,
  ORDERS_DEFAULT_WIDTHS,
  ORDERS_TEXT_START_COLUMNS,
  type OrdersColumnKey,
} from '../lib/listTableColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { ORDERS_PANEL_RESIZE } from '../lib/resizablePanelKeys';

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

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    ORDERS_COLUMN_WIDTHS_KEY,
    ORDERS_DEFAULT_WIDTHS
  );

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(orders);

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

  const canIssueInvoice = (o: Order) => !o.stockDeducted && o.status !== 'Cancelled';

  const columnLabel = (key: OrdersColumnKey): string => {
    switch (key) {
      case 'number':
        return t('orders.number');
      case 'customer':
        return t('orders.customer');
      case 'status':
        return t('orders.status');
      case 'chargeInvoice':
        return t('orders.chargeInvoice');
      case 'total':
        return t('orders.total');
      case 'stock':
        return t('orders.stock');
      case 'actions':
        return t('products.actions');
      default:
        return key;
    }
  };

  const cellClass = (key: OrdersColumnKey) =>
    `${ORDERS_COLUMN_CLASS[key]}${ORDERS_TEXT_START_COLUMNS.has(key) ? ' dt-col-text-start' : ''}`;

  return (
    <div className="page orders-page">
      {message && <div className="success-banner">{message}</div>}
      {error && !createOpen && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={ORDERS_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <div>
              <DataTablePanelHeading
                title={t('nav.orders')}
                count={t('products.results', { count: total })}
              />
              <p className="muted dt-panel__hint">{t('orders.stockHint')}</p>
            </div>
            <div className="dt-panel__toolbar-actions">
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                {t('orders.add')}
              </button>
            </div>
          </div>
        }
        pagination={{
          page,
          pageCount,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      >
        <table className="dt-panel-table" style={{ minWidth: tableMinWidth }}>
          <colgroup>
            {ORDERS_COLUMN_KEYS.map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {ORDERS_COLUMN_KEYS.map((key) =>
                renderDataTableHeaderCell(
                  key,
                  columnLabel(key),
                  ORDERS_COLUMN_CLASS[key],
                  onResizeHandleMouseDown,
                  t('products.resizeColumn'),
                  ORDERS_TEXT_START_COLUMNS.has(key)
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={ORDERS_COLUMN_KEYS.length} className="dt-panel-empty muted">
                  {t('orders.empty')}
                </td>
              </tr>
            ) : (
              pageItems.map((o) => (
                <tr key={o.id}>
                  <td className={cellClass('number')}>
                    <code>{o.orderNumber}</code>
                  </td>
                  <td className={`${cellClass('customer')} bidi-auto`}>{o.customerName}</td>
                  <td className={cellClass('status')}>
                    <span className={`status-badge status-${STATUS_KEYS[o.status] ?? 'draft'}`}>
                      {t(`orders.statuses.${STATUS_KEYS[o.status] ?? 'draft'}`)}
                    </span>
                  </td>
                  <td className={cellClass('chargeInvoice')}>
                    {o.chargeInvoiceNumber ? (
                      <code>{o.chargeInvoiceNumber}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className={cellClass('total')}>{o.totalAmount.toFixed(2)} ₪</td>
                  <td className={cellClass('stock')}>
                    {o.stockDeducted ? t('orders.stockDone') : t('orders.stockPending')}
                  </td>
                  <td className={`${cellClass('actions')} order-actions-cell`}>
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
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>

      <AppModal open={createOpen} onClose={() => setCreateOpen(false)} size="md">
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
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
                <option key={p.id} value={p.id}>
                  {p.articleCode} — {p.name}
                </option>
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
            <input {...bidiAutoInputProps} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost-inline" onClick={() => setCreateOpen(false)}>
              {t('settings.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('submit')}
            </button>
          </div>
        </form>
      </AppModal>
    </div>
  );
}
