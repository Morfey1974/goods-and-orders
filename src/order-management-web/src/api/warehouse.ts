import { normalizeStockQuantity } from '../lib/stockQuantity';
import { request } from './http';

export type Warehouse = {
  id: string;
  kind: string;
  name: string;
  description?: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
};

export type StockBalance = {
  productId: string;
  articleCode: string;
  productName: string;
  productType: string;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
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

function mapWarehouse(raw: Record<string, unknown>): Warehouse {
  return {
    id: String(raw.id ?? raw.Id),
    kind: String(raw.kind ?? raw.Kind ?? ''),
    name: String(raw.name ?? raw.Name ?? ''),
    description: (raw.description ?? raw.Description) as string | undefined,
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    isSystem: Boolean(raw.isSystem ?? raw.IsSystem),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
  };
}

function mapBalance(raw: Record<string, unknown>): StockBalance {
  return {
    productId: String(raw.productId ?? raw.ProductId),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    productType: String(raw.productType ?? raw.ProductType ?? ''),
    quantity: normalizeStockQuantity(Number(raw.quantity ?? raw.Quantity ?? 0)),
    warehouseId: String(raw.warehouseId ?? raw.WarehouseId ?? ''),
    warehouseName: String(raw.warehouseName ?? raw.WarehouseName ?? ''),
  };
}

export const warehouseApi = {
  list: async (token: string) => {
    const data = await request<Record<string, unknown>[]>('/api/warehouse', {}, token);
    return data.map(mapWarehouse);
  },
  create: async (token: string, body: { name: string; description?: string; isActive?: boolean }) => {
    const data = await request<Record<string, unknown>>(
      '/api/warehouse',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return mapWarehouse(data);
  },
  update: async (token: string, id: string, body: { name: string; description?: string; isActive: boolean }) => {
    const data = await request<Record<string, unknown>>(
      `/api/warehouse/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    );
    return mapWarehouse(data);
  },
  delete: (token: string, id: string) =>
    request<void>(`/api/warehouse/${id}`, { method: 'DELETE' }, token),
  balances: async (token: string, warehouseId?: string) => {
    const q = warehouseId ? `?warehouseId=${warehouseId}` : '';
    const data = await request<Record<string, unknown>[]>(`/api/warehouse/balances${q}`, {}, token);
    return data.map(mapBalance);
  },
  movements: async (token: string, limit = 50, warehouseId?: string, productId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (warehouseId) params.set('warehouseId', warehouseId);
    if (productId) params.set('productId', productId);
    const data = await request<Record<string, unknown>[]>(
      `/api/warehouse/movements?${params}`,
      {},
      token
    );
    return data.map((m) => ({
      id: String(m.id ?? m.Id),
      articleCode: String(m.articleCode ?? m.ArticleCode ?? ''),
      productName: String(m.productName ?? m.ProductName ?? ''),
      movementType: String(m.movementType ?? m.MovementType ?? ''),
      quantity: Number(m.quantity ?? m.Quantity ?? 0),
      balanceAfter: Number(m.balanceAfter ?? m.BalanceAfter ?? 0),
      notes: (m.notes ?? m.Notes) as string | undefined,
      createdAt: String(m.createdAt ?? m.CreatedAt ?? ''),
    })) as StockMovement[];
  },
  stockProducts: async (token: string, warehouseId?: string) => {
    const q = warehouseId ? `?warehouseId=${warehouseId}` : '';
    const data = await request<Record<string, unknown>[]>(
      `/api/warehouse/stock-products${q}`,
      {},
      token
    );
    return data.map((p) => ({
      id: String(p.id ?? p.Id),
      articleCode: String(p.articleCode ?? p.ArticleCode ?? ''),
      name: String(p.name ?? p.Name ?? ''),
    }));
  },
  receipt: (
    token: string,
    body: { productId: string; quantity: number; notes?: string; warehouseId?: string }
  ) =>
    request<StockMovement>('/api/warehouse/receipt', { method: 'POST', body: JSON.stringify(body) }, token),
};
