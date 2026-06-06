import { normalizeStockQuantity } from '../lib/stockQuantity';
import { request } from './http';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type PurchaseReceiptLine = {
  id: string;
  productId: string;
  productArticleCode: string;
  productName: string;
  warehouseId?: string;
  warehouseName?: string;
  quantity: number;
  unitPrice?: number;
  unitCostIls?: number;
  supplierSku?: string;
  notes?: string;
  sortOrder: number;
};

export type PurchaseReceiptLineInput = {
  productId: string;
  warehouseId?: string;
  quantity: number;
  unitPrice?: number;
  unitCostIls?: number;
  supplierSku?: string;
  notes?: string;
};

export type PurchaseReceiptListItem = {
  id: string;
  receiptNumber: string;
  supplierName: string;
  documentDate: string;
  currency: string;
  totalAmount?: number;
  status: string;
  hasDocument: boolean;
  createdAt: string;
  postedAt?: string;
};

export type PurchaseReceipt = {
  id: string;
  receiptNumber: string;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNumber?: string;
  documentDate: string;
  currency: string;
  totalAmount?: number;
  notes?: string;
  status: string;
  postedAt?: string;
  hasDocument: boolean;
  documentFileName?: string;
  version: number;
  createdAt: string;
  lines: PurchaseReceiptLine[];
};

function mapLine(raw: Record<string, unknown>): PurchaseReceiptLine {
  return {
    id: String(raw.id ?? raw.Id),
    productId: String(raw.productId ?? raw.ProductId),
    productArticleCode: String(raw.productArticleCode ?? raw.ProductArticleCode ?? ''),
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    warehouseId: (raw.warehouseId ?? raw.WarehouseId) as string | undefined,
    warehouseName: (raw.warehouseName ?? raw.WarehouseName) as string | undefined,
    quantity: normalizeStockQuantity(Number(raw.quantity ?? raw.Quantity ?? 0)),
    unitPrice: raw.unitPrice != null || raw.UnitPrice != null
      ? Number(raw.unitPrice ?? raw.UnitPrice)
      : undefined,
    unitCostIls: raw.unitCostIls != null || raw.UnitCostIls != null
      ? Number(raw.unitCostIls ?? raw.UnitCostIls)
      : undefined,
    supplierSku: (raw.supplierSku ?? raw.SupplierSku) as string | undefined,
    notes: (raw.notes ?? raw.Notes) as string | undefined,
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

function mapReceipt(raw: Record<string, unknown>): PurchaseReceipt {
  const linesRaw = raw.lines ?? raw.Lines;
  const lines = Array.isArray(linesRaw)
    ? linesRaw.map((l) => mapLine(l as Record<string, unknown>))
    : [];
  return {
    id: String(raw.id ?? raw.Id),
    receiptNumber: String(raw.receiptNumber ?? raw.ReceiptNumber ?? ''),
    supplierId: String(raw.supplierId ?? raw.SupplierId),
    supplierName: String(raw.supplierName ?? raw.SupplierName ?? ''),
    supplierInvoiceNumber: (raw.supplierInvoiceNumber ?? raw.SupplierInvoiceNumber) as string | undefined,
    documentDate: String(raw.documentDate ?? raw.DocumentDate ?? '').slice(0, 10),
    currency: String(raw.currency ?? raw.Currency ?? 'ILS'),
    totalAmount: raw.totalAmount != null || raw.TotalAmount != null
      ? Number(raw.totalAmount ?? raw.TotalAmount)
      : undefined,
    notes: (raw.notes ?? raw.Notes) as string | undefined,
    status: String(raw.status ?? raw.Status ?? 'Draft'),
    postedAt: (raw.postedAt ?? raw.PostedAt) as string | undefined,
    hasDocument: Boolean(raw.hasDocument ?? raw.HasDocument),
    documentFileName: (raw.documentFileName ?? raw.DocumentFileName) as string | undefined,
    version: Number(raw.version ?? raw.Version ?? 1),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    lines,
  };
}

function mapListItem(raw: Record<string, unknown>): PurchaseReceiptListItem {
  return {
    id: String(raw.id ?? raw.Id),
    receiptNumber: String(raw.receiptNumber ?? raw.ReceiptNumber ?? ''),
    supplierName: String(raw.supplierName ?? raw.SupplierName ?? ''),
    documentDate: String(raw.documentDate ?? raw.DocumentDate ?? '').slice(0, 10),
    currency: String(raw.currency ?? raw.Currency ?? 'ILS'),
    totalAmount: raw.totalAmount != null || raw.TotalAmount != null
      ? Number(raw.totalAmount ?? raw.TotalAmount)
      : undefined,
    status: String(raw.status ?? raw.Status ?? 'Draft'),
    hasDocument: Boolean(raw.hasDocument ?? raw.HasDocument),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    postedAt: (raw.postedAt ?? raw.PostedAt) as string | undefined,
  };
}

export type PurchaseReceiptPayload = {
  supplierId: string;
  supplierInvoiceNumber?: string | null;
  documentDate: string;
  currency?: string | null;
  totalAmount?: number | null;
  notes?: string | null;
  version?: number;
  lines: PurchaseReceiptLineInput[];
};

export const purchaseReceiptsApi = {
  list: async (
    token: string,
    opts?: { supplierId?: string; status?: string; from?: string; to?: string }
  ) => {
    const q = new URLSearchParams();
    if (opts?.supplierId) q.set('supplierId', opts.supplierId);
    if (opts?.status) q.set('status', opts.status);
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    const raw = await request<Record<string, unknown>[]>(
      `/api/purchase-receipts${qs ? `?${qs}` : ''}`,
      {},
      token
    );
    return raw.map(mapListItem);
  },

  get: async (token: string, id: string) => {
    const raw = await request<Record<string, unknown>>(`/api/purchase-receipts/${id}`, {}, token);
    return mapReceipt(raw);
  },

  create: async (token: string, body: PurchaseReceiptPayload) => {
    const raw = await request<Record<string, unknown>>(
      '/api/purchase-receipts',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return mapReceipt(raw);
  },

  update: async (token: string, id: string, body: PurchaseReceiptPayload) => {
    const raw = await request<Record<string, unknown>>(
      `/api/purchase-receipts/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    );
    return mapReceipt(raw);
  },

  post: async (token: string, id: string, version: number) => {
    const raw = await request<Record<string, unknown>>(
      `/api/purchase-receipts/${id}/post?version=${version}`,
      { method: 'POST' },
      token
    );
    return mapReceipt(raw);
  },

  delete: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE}/api/purchase-receipts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? res.statusText);
    }
  },

  uploadDocument: async (token: string, id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/purchase-receipts/${id}/document`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { message?: string }).message ?? res.statusText);
    return mapReceipt(data as Record<string, unknown>);
  },

  deleteDocument: async (token: string, id: string) => {
    const raw = await request<Record<string, unknown>>(
      `/api/purchase-receipts/${id}/document`,
      { method: 'DELETE' },
      token
    );
    return mapReceipt(raw);
  },

  documentBlobUrl: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE}/api/purchase-receipts/${id}/document`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? res.statusText);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
