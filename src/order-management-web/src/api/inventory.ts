import { request } from './http';

export type InventoryOpeningBalanceLineInput = {
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCostIls: number;
};

export type InventoryValuationLine = {
  productId: string;
  articleCode: string;
  legacySku?: string | null;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  unitCostIls: number;
  totalValueIls: number;
  lotId?: string | null;
  receivedAt?: string | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
};

export type InventoryLot = {
  id: string;
  productId: string;
  articleCode: string;
  legacySku?: string | null;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCostIls: number;
  totalReceivedIls: number;
  totalValueIls: number;
  receivedAt: string;
  sourceType: string;
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceReceiptId?: string | null;
  sourceReceiptNumber?: string | null;
  sourceAssemblyId?: string | null;
  sourceAssemblyNumber?: string | null;
};

export type InventoryValuationReport = {
  asOfDate: string;
  costMethod: string;
  lines: InventoryValuationLine[];
  grandTotalIls: number;
  detailed: boolean;
};

function mapValuationLine(raw: Record<string, unknown>): InventoryValuationLine {
  const receivedAt = raw.receivedAt ?? raw.ReceivedAt;
  return {
    productId: String(raw.productId ?? raw.ProductId),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    legacySku: (raw.legacySku ?? raw.LegacySku) as string | null | undefined,
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    warehouseId: String(raw.warehouseId ?? raw.WarehouseId),
    warehouseName: String(raw.warehouseName ?? raw.WarehouseName ?? ''),
    quantity: Number(raw.quantity ?? raw.Quantity ?? 0),
    unitCostIls: Number(raw.unitCostIls ?? raw.UnitCostIls ?? 0),
    totalValueIls: Number(raw.totalValueIls ?? raw.TotalValueIls ?? 0),
    lotId: (raw.lotId ?? raw.LotId) as string | null | undefined,
    receivedAt: receivedAt ? String(receivedAt).slice(0, 10) : null,
    sourceType: (raw.sourceType ?? raw.SourceType) as string | null | undefined,
    sourceLabel: (raw.sourceLabel ?? raw.SourceLabel) as string | null | undefined,
  };
}

function mapLot(raw: Record<string, unknown>): InventoryLot {
  return {
    id: String(raw.id ?? raw.Id),
    productId: String(raw.productId ?? raw.ProductId),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    legacySku: (raw.legacySku ?? raw.LegacySku) as string | null | undefined,
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    warehouseId: String(raw.warehouseId ?? raw.WarehouseId),
    warehouseName: String(raw.warehouseName ?? raw.WarehouseName ?? ''),
    quantityReceived: Number(raw.quantityReceived ?? raw.QuantityReceived ?? raw.quantityRemaining ?? raw.QuantityRemaining ?? 0),
    quantityRemaining: Number(raw.quantityRemaining ?? raw.QuantityRemaining ?? 0),
    unitCostIls: Number(raw.unitCostIls ?? raw.UnitCostIls ?? 0),
    totalReceivedIls: Number(raw.totalReceivedIls ?? raw.TotalReceivedIls ?? 0),
    totalValueIls: Number(raw.totalValueIls ?? raw.TotalValueIls ?? 0),
    receivedAt: String(raw.receivedAt ?? raw.ReceivedAt ?? '').slice(0, 10),
    sourceType: String(raw.sourceType ?? raw.SourceType ?? ''),
    sourceId: (raw.sourceId ?? raw.SourceId) as string | null | undefined,
    sourceLabel: (raw.sourceLabel ?? raw.SourceLabel) as string | null | undefined,
    sourceReceiptId: (raw.sourceReceiptId ?? raw.SourceReceiptId) as string | null | undefined,
    sourceReceiptNumber: (raw.sourceReceiptNumber ?? raw.SourceReceiptNumber) as string | null | undefined,
    sourceAssemblyId: (raw.sourceAssemblyId ?? raw.SourceAssemblyId) as string | null | undefined,
    sourceAssemblyNumber: (raw.sourceAssemblyNumber ?? raw.SourceAssemblyNumber) as string | null | undefined,
  };
}

export const inventoryApi = {
  postOpeningBalance: (
    token: string,
    body: { asOfDate: string; lines: InventoryOpeningBalanceLineInput[]; notes?: string }
  ) =>
    request<{ linesPosted: number; totalValueIls: number }>(
      '/api/inventory/opening-balance',
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  resetStock: (token: string) =>
    request<{
      lotAllocationsDeleted: number;
      lotsDeleted: number;
      averageCostsDeleted: number;
      movementsDeleted: number;
      balancesDeleted: number;
      ordersStockFlagReset: number;
      productsTrackInventoryReset: number;
    }>('/api/inventory/reset-stock', { method: 'POST' }, token).then((r) => ({
      lotAllocationsDeleted: Number(
        (r as Record<string, unknown>).lotAllocationsDeleted ??
          (r as Record<string, unknown>).LotAllocationsDeleted ??
          0
      ),
      lotsDeleted: Number(
        (r as Record<string, unknown>).lotsDeleted ?? (r as Record<string, unknown>).LotsDeleted ?? 0
      ),
      averageCostsDeleted: Number(
        (r as Record<string, unknown>).averageCostsDeleted ??
          (r as Record<string, unknown>).AverageCostsDeleted ??
          0
      ),
      movementsDeleted: Number(
        (r as Record<string, unknown>).movementsDeleted ??
          (r as Record<string, unknown>).MovementsDeleted ??
          0
      ),
      balancesDeleted: Number(
        (r as Record<string, unknown>).balancesDeleted ??
          (r as Record<string, unknown>).BalancesDeleted ??
          0
      ),
      ordersStockFlagReset: Number(
        (r as Record<string, unknown>).ordersStockFlagReset ??
          (r as Record<string, unknown>).OrdersStockFlagReset ??
          0
      ),
      productsTrackInventoryReset: Number(
        (r as Record<string, unknown>).productsTrackInventoryReset ??
          (r as Record<string, unknown>).ProductsTrackInventoryReset ??
          0
      ),
    })),

  valuation: (token: string, asOf?: string, detailed = false) => {
    const q = new URLSearchParams();
    if (asOf) q.set('asOf', asOf);
    if (detailed) q.set('detailed', 'true');
    const qs = q.toString();
    return request<InventoryValuationReport>(`/api/inventory/valuation${qs ? `?${qs}` : ''}`, {}, token).then(
      (r) => {
        const raw = r as unknown as Record<string, unknown>;
        return {
          asOfDate: String(raw.asOfDate ?? '').slice(0, 10),
          costMethod: String(raw.costMethod ?? 'FIFO'),
          lines: ((raw.lines as Record<string, unknown>[]) ?? []).map(mapValuationLine),
          grandTotalIls: Number(raw.grandTotalIls ?? 0),
          detailed: Boolean(raw.detailed ?? raw.Detailed ?? detailed),
        };
      }
    );
  },

  lots: (token: string, opts?: { asOf?: string; productId?: string; warehouseId?: string; includeDepleted?: boolean }) => {
    const q = new URLSearchParams();
    if (opts?.asOf) q.set('asOf', opts.asOf);
    if (opts?.productId) q.set('productId', opts.productId);
    if (opts?.warehouseId) q.set('warehouseId', opts.warehouseId);
    if (opts?.includeDepleted) q.set('includeDepleted', 'true');
    const qs = q.toString();
    return request<Record<string, unknown>[]>(`/api/inventory/lots${qs ? `?${qs}` : ''}`, {}, token).then(
      (rows) => rows.map(mapLot)
    );
  },

  fetchValuationPdfBlob: async (token: string, asOf?: string, detailed = false) => {
    const q = new URLSearchParams();
    if (asOf) q.set('asOf', asOf);
    if (detailed) q.set('detailed', 'true');
    const qs = q.toString();
    const API_BASE = import.meta.env.VITE_API_URL ?? '';
    const res = await fetch(`${API_BASE}/api/inventory/valuation/pdf${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const body = data as { message?: string };
      throw new Error(body.message ?? res.statusText);
    }
    return res.blob();
  },

  downloadValuationPdf: async (token: string, asOf?: string, detailed = false) => {
    const blob = await inventoryApi.fetchValuationPdfBlob(token, asOf, detailed);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-valuation${asOf ? `-${asOf}` : ''}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
