import { request } from './http';

export type OrderLine = {
  id: string;
  productId: string;
  articleCode: string;
  productName: string;
  productType: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  notes?: string;
  chargeInvoiceNumber?: string;
  chargeInvoiceIssuedAt?: string;
  stockDeducted: boolean;
  totalAmount: number;
  lines: OrderLine[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

function mapOrderLine(raw: Record<string, unknown>): OrderLine {
  return {
    id: String(raw.id ?? raw.Id),
    productId: String(raw.productId ?? raw.ProductId),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    productType: String(raw.productType ?? raw.ProductType ?? ''),
    quantity: Number(raw.quantity ?? raw.Quantity ?? 0),
    unitPrice: Number(raw.unitPrice ?? raw.UnitPrice ?? 0),
    lineTotal: Number(raw.lineTotal ?? raw.LineTotal ?? 0),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

function mapOrder(raw: Record<string, unknown>): Order {
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    id: String(raw.id ?? raw.Id),
    orderNumber: String(raw.orderNumber ?? raw.OrderNumber ?? ''),
    customerId: String(raw.customerId ?? raw.CustomerId),
    customerName: String(raw.customerName ?? raw.CustomerName ?? ''),
    status: String(raw.status ?? raw.Status ?? 'Draft'),
    notes: (raw.notes ?? raw.Notes) as string | undefined,
    chargeInvoiceNumber: (raw.chargeInvoiceNumber ?? raw.ChargeInvoiceNumber) as string | undefined,
    chargeInvoiceIssuedAt: (raw.chargeInvoiceIssuedAt ?? raw.ChargeInvoiceIssuedAt) as string | undefined,
    stockDeducted: Boolean(raw.stockDeducted ?? raw.StockDeducted),
    totalAmount: Number(raw.totalAmount ?? raw.TotalAmount ?? 0),
    lines: Array.isArray(linesRaw) ? linesRaw.map(mapOrderLine) : [],
    version: Number(raw.version ?? raw.Version ?? 1),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.UpdatedAt ?? ''),
  };
}

export const ordersApi = {
  list: async (token: string) => {
    const data = await request<Record<string, unknown>[]>('/api/orders', {}, token);
    return data.map(mapOrder);
  },
  get: async (token: string, id: string) => {
    const data = await request<Record<string, unknown>>(`/api/orders/${id}`, {}, token);
    return mapOrder(data);
  },
  create: async (
    token: string,
    body: { customerId: string; notes?: string; lines: { productId: string; quantity: number; unitPrice?: number }[] }
  ) => {
    const data = await request<Record<string, unknown>>(
      '/api/orders',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return mapOrder(data);
  },
  startWork: async (token: string, id: string) => {
    const data = await request<Record<string, unknown>>(
      `/api/orders/${id}/start-work`,
      { method: 'POST' },
      token
    );
    return mapOrder(data);
  },
  issueChargeInvoice: async (token: string, id: string) => {
    const data = await request<Record<string, unknown>>(
      `/api/orders/${id}/issue-charge-invoice`,
      { method: 'POST' },
      token
    );
    return mapOrder(data);
  },
};
