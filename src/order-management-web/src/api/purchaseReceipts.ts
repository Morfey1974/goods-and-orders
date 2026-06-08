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

export type PurchaseReceiptDocument = {
  id: string;
  fileName: string;
  contentType: string;
  sortOrder: number;
  createdAt: string;
};

export type PurchaseReceiptLandedCostLine = {
  id: string;
  supplierId: string;
  supplierName: string;
  category: string;
  currency: string;
  amount: number;
  amountIls?: number;
  notes?: string;
  sortOrder: number;
};

export type PurchaseReceiptLandedCostLineInput = {
  supplierId: string;
  category: string;
  currency: string;
  amount: number;
  notes?: string;
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
  documentCount: number;
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
  usdIlsRate?: number;
  notes?: string;
  status: string;
  postedAt?: string;
  documentCount: number;
  version: number;
  createdAt: string;
  lines: PurchaseReceiptLine[];
  applyLandedCosts: boolean;
  landedCostLines: PurchaseReceiptLandedCostLine[];
  documents: PurchaseReceiptDocument[];
};

function mapDocument(raw: Record<string, unknown>): PurchaseReceiptDocument {
  return {
    id: String(raw.id ?? raw.Id),
    fileName: String(raw.fileName ?? raw.FileName ?? ''),
    contentType: String(raw.contentType ?? raw.ContentType ?? ''),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
  };
}

function mapLandedCostLine(raw: Record<string, unknown>): PurchaseReceiptLandedCostLine {
  return {
    id: String(raw.id ?? raw.Id),
    supplierId: String(raw.supplierId ?? raw.SupplierId),
    supplierName: String(raw.supplierName ?? raw.SupplierName ?? ''),
    category: String(raw.category ?? raw.Category ?? 'Other'),
    currency: String(raw.currency ?? raw.Currency ?? 'ILS'),
    amount: Number(raw.amount ?? raw.Amount ?? 0),
    amountIls: raw.amountIls != null || raw.AmountIls != null
      ? Number(raw.amountIls ?? raw.AmountIls)
      : undefined,
    notes: (raw.notes ?? raw.Notes) as string | undefined,
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

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
  const landedRaw = raw.landedCostLines ?? raw.LandedCostLines;
  const landedCostLines = Array.isArray(landedRaw)
    ? landedRaw.map((l) => mapLandedCostLine(l as Record<string, unknown>))
    : [];
  const documentsRaw = raw.documents ?? raw.Documents;
  const documents = Array.isArray(documentsRaw)
    ? documentsRaw.map((d) => mapDocument(d as Record<string, unknown>))
    : [];
  const documentCount = Number(raw.documentCount ?? raw.DocumentCount ?? documents.length);
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
    usdIlsRate: raw.usdIlsRate != null || raw.UsdIlsRate != null
      ? Number(raw.usdIlsRate ?? raw.UsdIlsRate)
      : undefined,
    notes: (raw.notes ?? raw.Notes) as string | undefined,
    status: String(raw.status ?? raw.Status ?? 'Draft'),
    postedAt: (raw.postedAt ?? raw.PostedAt) as string | undefined,
    documentCount,
    version: Number(raw.version ?? raw.Version ?? 1),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    lines,
    applyLandedCosts: Boolean(raw.applyLandedCosts ?? raw.ApplyLandedCosts),
    landedCostLines,
    documents,
  };
}

function mapListItem(raw: Record<string, unknown>): PurchaseReceiptListItem {
  const documentsRaw = raw.documents ?? raw.Documents;
  const documentsCount = Array.isArray(documentsRaw) ? documentsRaw.length : 0;
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
    documentCount: Number(raw.documentCount ?? raw.DocumentCount ?? documentsCount),
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
  usdIlsRate?: number | null;
  notes?: string | null;
  version?: number;
  applyLandedCosts?: boolean;
  lines: PurchaseReceiptLineInput[];
  landedCostLines?: PurchaseReceiptLandedCostLineInput[];
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

  uploadDocument: async (token: string, receiptId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/purchase-receipts/${receiptId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        throw new Error(
          'Не удалось связаться с сервером. Проверьте, что API запущен (docker compose up) и страница открыта через http://localhost:5173'
        );
      }
      throw err;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      message?: string;
      code?: string;
    };
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Сессия истекла — войдите снова.');
      }
      if (res.status === 402 || data.code === 'SUBSCRIPTION_EXPIRED') {
        throw new Error(data.message ?? 'Пробный период закончился.');
      }
      throw new Error(data.message ?? res.statusText);
    }
    const mapped = mapReceipt(data);
    if (!mapped.id) {
      throw new Error(data.message ?? 'Upload failed: empty server response.');
    }
    return mapped;
  },

  deleteDocument: async (token: string, receiptId: string, documentId: string) => {
    const raw = await request<Record<string, unknown>>(
      `/api/purchase-receipts/${receiptId}/documents/${documentId}`,
      { method: 'DELETE' },
      token
    );
    return mapReceipt(raw);
  },

  clearLegacyDocument: async (token: string, receiptId: string) => {
    const raw = await request<Record<string, unknown>>(
      `/api/purchase-receipts/${receiptId}/document`,
      { method: 'DELETE' },
      token
    );
    return mapReceipt(raw);
  },

  fetchDocumentBlob: async (
    token: string,
    receiptId: string,
    documentId: string,
    fileName?: string
  ) => {
    const res = await fetch(
      `${API_BASE}/api/purchase-receipts/${receiptId}/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? res.statusText);
    }
    const blob = await res.blob();
    let contentType = res.headers.get('Content-Type') ?? blob.type ?? 'application/octet-stream';
    const looksPdf =
      contentType.includes('pdf') ||
      fileName?.toLowerCase().endsWith('.pdf') ||
      blob.type.includes('pdf');
    if (looksPdf) contentType = 'application/pdf';
    const typed =
      blob.type === contentType
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: contentType });
    return typed;
  },

  documentBlobUrl: async (
    token: string,
    receiptId: string,
    documentId: string,
    fileName?: string
  ) => {
    const typed = await purchaseReceiptsApi.fetchDocumentBlob(
      token,
      receiptId,
      documentId,
      fileName
    );
    return URL.createObjectURL(typed);
  },

  downloadDocument: async (
    token: string,
    receiptId: string,
    documentId: string,
    fileName: string
  ) => {
    const blob = await purchaseReceiptsApi.fetchDocumentBlob(
      token,
      receiptId,
      documentId,
      fileName
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
};
