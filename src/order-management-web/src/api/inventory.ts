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
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  unitCostIls: number;
  totalValueIls: number;
};

export type InventoryValuationReport = {
  asOfDate: string;
  costMethod: string;
  lines: InventoryValuationLine[];
  grandTotalIls: number;
};

function mapValuationLine(raw: Record<string, unknown>): InventoryValuationLine {
  return {
    productId: String(raw.productId ?? raw.ProductId),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    warehouseId: String(raw.warehouseId ?? raw.WarehouseId),
    warehouseName: String(raw.warehouseName ?? raw.WarehouseName ?? ''),
    quantity: Number(raw.quantity ?? raw.Quantity ?? 0),
    unitCostIls: Number(raw.unitCostIls ?? raw.UnitCostIls ?? 0),
    totalValueIls: Number(raw.totalValueIls ?? raw.TotalValueIls ?? 0),
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

  valuation: (token: string, asOf?: string) => {
    const q = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
    return request<InventoryValuationReport>(`/api/inventory/valuation${q}`, {}, token).then((r) => ({
      asOfDate: String((r as unknown as Record<string, unknown>).asOfDate ?? '').slice(0, 10),
      costMethod: String((r as unknown as Record<string, unknown>).costMethod ?? 'FIFO'),
      lines: (
        ((r as unknown as Record<string, unknown>).lines as Record<string, unknown>[]) ?? []
      ).map(mapValuationLine),
      grandTotalIls: Number((r as unknown as Record<string, unknown>).grandTotalIls ?? 0),
    }));
  },
};
