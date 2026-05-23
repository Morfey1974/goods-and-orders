import { normalizeStockQuantity } from '../lib/stockQuantity';
import { request } from './http';

export type Customer = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  defaultDiscountPercent: number;
  isActive: boolean;
  version: number;
};

export type BomLine = {
  componentProductId: string;
  componentArticleCode: string;
  componentName: string;
  quantity: number;
};

export type ProductImportResult = {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: { line: number; message: string }[];
};

export type Product = {
  id: string;
  articleCode: string;
  legacySku?: string | null;
  productType: string;
  name: string;
  description?: string;
  hasImage: boolean;
  unitPrice: number;
  showBomInQuote: boolean;
  showBomInInvoice: boolean;
  isActive: boolean;
  hasStockMovements: boolean;
  stockQuantity?: number | null;
  bomLines: BomLine[];
  version: number;
};

function mapBomLine(raw: Record<string, unknown>): BomLine {
  return {
    componentProductId: String(raw.componentProductId ?? raw.ComponentProductId ?? ''),
    componentArticleCode: String(raw.componentArticleCode ?? raw.ComponentArticleCode ?? ''),
    componentName: String(raw.componentName ?? raw.ComponentName ?? ''),
    quantity: Number(raw.quantity ?? raw.Quantity ?? 0),
  };
}

/** API may return camelCase or PascalCase depending on proxy/version */
function mapProduct(raw: Record<string, unknown>): Product {
  const bomRaw = (raw.bomLines ?? raw.BomLines ?? []) as Record<string, unknown>[];
  const bom = Array.isArray(bomRaw) ? bomRaw.map((b) => mapBomLine(b)) : [];
  return {
    id: String(raw.id ?? raw.Id),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    legacySku: (raw.legacySku ?? raw.LegacySku) as string | null | undefined,
    productType: String(raw.productType ?? raw.ProductType ?? ''),
    name: String(raw.name ?? raw.Name ?? ''),
    description: (raw.description ?? raw.Description) as string | undefined,
    hasImage: Boolean(raw.hasImage ?? raw.HasImage),
    unitPrice: Number(raw.unitPrice ?? raw.UnitPrice ?? 0),
    showBomInQuote: Boolean(raw.showBomInQuote ?? raw.ShowBomInQuote),
    showBomInInvoice: Boolean(raw.showBomInInvoice ?? raw.ShowBomInInvoice),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    hasStockMovements: Boolean(raw.hasStockMovements ?? raw.HasStockMovements),
    stockQuantity: (() => {
      const v = raw.stockQuantity ?? raw.StockQuantity;
      if (v == null) return null;
      return normalizeStockQuantity(Number(v));
    })(),
    bomLines: bom,
    version: Number(raw.version ?? raw.Version ?? 1),
  };
}

export type StockBalance = {
  productId: string;
  articleCode: string;
  productName: string;
  productType: string;
  quantity: number;
  warehouseId?: string;
  warehouseName?: string;
};

export type StockMovement = {
  id: string;
  articleCode: string;
  productName: string;
  movementType: string;
  quantity: number;
  balanceAfter: number;
  notes?: string;
  createdAt: string;
};

export const PRODUCT_TYPES = [
  'ComponentPart',
  'FinishedGood',
  'Service',
  'Charge',
  'Bundle',
  'Spare',
] as const;

export const catalogApi = {
  customers: {
    list: (token: string, includeInactive = false) =>
      request<Customer[]>(`/api/customers?includeInactive=${includeInactive}`, {}, token),
    create: (token: string, body: object) =>
      request<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(body) }, token),
    update: (token: string, id: string, body: object) =>
      request<Customer>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }, token),
  },
  products: {
    list: async (token: string, productType?: string, includeInactive = true) => {
      const params = new URLSearchParams({ includeInactive: String(includeInactive) });
      if (productType) params.set('productType', productType);
      const data = await request<Record<string, unknown>[]>(`/api/products?${params}`, {}, token);
      return data.map(mapProduct);
    },
    get: async (token: string, id: string) => {
      const data = await request<Record<string, unknown>>(`/api/products/${id}`, {}, token);
      return mapProduct(data);
    },
    reactivateImported: (token: string) =>
      request<{ reactivated: number }>('/api/products/reactivate-imported', { method: 'POST' }, token),
    peekArticle: (token: string, productType: string) =>
      request<{ articleCode: string }>(`/api/products/next-article?productType=${productType}`, {}, token),
    create: async (token: string, body: object) => {
      const data = await request<Record<string, unknown>>(
        '/api/products',
        { method: 'POST', body: JSON.stringify(body) },
        token
      );
      return mapProduct(data);
    },
    setActive: async (token: string, id: string, body: { isActive: boolean; version: number }) => {
      const data = await request<Record<string, unknown>>(
        `/api/products/${id}/active`,
        { method: 'PATCH', body: JSON.stringify(body) },
        token
      );
      return mapProduct(data);
    },
    update: async (token: string, id: string, body: object) => {
      const data = await request<Record<string, unknown>>(
        `/api/products/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token
      );
      return mapProduct(data);
    },
    quickUpdate: async (token: string, id: string, body: { unitPrice?: number; stockQuantity?: number; version: number }) => {
      const data = await request<Record<string, unknown>>(
        `/api/products/${id}/quick`,
        { method: 'PATCH', body: JSON.stringify(body) },
        token
      );
      return mapProduct(data);
    },
    fetchImageBlob: async (token: string, productId: string) => {
      const base = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${base}/api/products/${productId}/image`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(res.statusText);
      return res.blob();
    },
    uploadImage: async (token: string, id: string, file: File) => {
      const base = import.meta.env.VITE_API_URL ?? '';
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/api/products/${id}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? res.statusText);
      return mapProduct(data as Record<string, unknown>);
    },
    deleteImage: async (token: string, id: string) => {
      const data = await request<Record<string, unknown>>(
        `/api/products/${id}/image`,
        { method: 'DELETE' },
        token
      );
      return mapProduct(data);
    },
    duplicate: async (token: string, id: string) => {
      const data = await request<Record<string, unknown>>(
        `/api/products/${id}/duplicate`,
        { method: 'POST' },
        token
      );
      return mapProduct(data);
    },
    delete: (token: string, id: string) =>
      request<void>(`/api/products/${id}`, { method: 'DELETE' }, token),
    deactivateAll: (token: string) =>
      request<{ deactivated: number }>('/api/products/deactivate-all', { method: 'POST' }, token),
    exportCsv: async (token: string) => {
      const base = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${base}/api/products/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    },
    importCsv: async (
      token: string,
      file: File,
      defaultProductType = 'ComponentPart',
      importStock = true
    ) => {
      const base = import.meta.env.VITE_API_URL ?? '';
      const q = new URLSearchParams({
        defaultProductType,
        importStock: String(importStock),
      });
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/api/products/import?${q}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? res.statusText);
      return data as ProductImportResult;
    },
  },
  warehouse: {
    movements: (token: string, limit = 50, productId?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (productId) params.set('productId', productId);
      return request<StockMovement[]>(`/api/warehouse/movements?${params}`, {}, token);
    },
  },
};
