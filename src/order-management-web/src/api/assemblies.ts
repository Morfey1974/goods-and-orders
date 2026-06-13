import { normalizeStockQuantity } from '../lib/stockQuantity';
import { request } from './http';

export type AssemblyLine = {
  id?: string;
  productId: string;
  articleCode: string;
  productName: string;
  quantity: number;
  sortOrder?: number;
};

export type AssemblyLineInput = {
  productId: string;
  quantity: number;
};

export type AssemblyListItem = {
  id: string;
  assemblyNumber: string;
  assemblyDate: string;
  status: string;
  outputArticleCode: string;
  outputProductName: string;
  outputQuantity: number;
  additionalCostIls: number;
  version: number;
  createdAt: string;
};

export type StockAssembly = {
  id: string;
  assemblyNumber: string;
  assemblyDate: string;
  status: string;
  outputProductId: string;
  outputArticleCode: string;
  outputProductName: string;
  outputWarehouseId: string;
  outputWarehouseName: string;
  outputQuantity: number;
  additionalCostIls: number;
  notes?: string | null;
  postedAt?: string | null;
  outputUnitCostIls?: number | null;
  lines: AssemblyLine[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AssemblyPayload = {
  assemblyDate: string;
  outputProductId: string;
  outputWarehouseId?: string | null;
  outputQuantity: number;
  additionalCostIls: number;
  notes?: string | null;
  lines: AssemblyLineInput[];
  version?: number;
};

function mapLine(raw: Record<string, unknown>): AssemblyLine {
  return {
    id: String(raw.id ?? raw.Id ?? ''),
    productId: String(raw.productId ?? raw.ProductId ?? ''),
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    quantity: normalizeStockQuantity(Number(raw.quantity ?? raw.Quantity ?? 0)),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

function mapAssembly(raw: Record<string, unknown>): StockAssembly {
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    id: String(raw.id ?? raw.Id),
    assemblyNumber: String(raw.assemblyNumber ?? raw.AssemblyNumber ?? ''),
    assemblyDate: String(raw.assemblyDate ?? raw.AssemblyDate ?? ''),
    status: String(raw.status ?? raw.Status ?? ''),
    outputProductId: String(raw.outputProductId ?? raw.OutputProductId ?? ''),
    outputArticleCode: String(raw.outputArticleCode ?? raw.OutputArticleCode ?? ''),
    outputProductName: String(raw.outputProductName ?? raw.OutputProductName ?? ''),
    outputWarehouseId: String(raw.outputWarehouseId ?? raw.OutputWarehouseId ?? ''),
    outputWarehouseName: String(raw.outputWarehouseName ?? raw.OutputWarehouseName ?? ''),
    outputQuantity: normalizeStockQuantity(Number(raw.outputQuantity ?? raw.OutputQuantity ?? 0)),
    additionalCostIls: Number(raw.additionalCostIls ?? raw.AdditionalCostIls ?? 0),
    notes: (raw.notes ?? raw.Notes) as string | null | undefined,
    postedAt: (raw.postedAt ?? raw.PostedAt) as string | null | undefined,
    outputUnitCostIls: (() => {
      const v = raw.outputUnitCostIls ?? raw.OutputUnitCostIls;
      return v == null ? null : Number(v);
    })(),
    lines: Array.isArray(linesRaw) ? linesRaw.map(mapLine) : [],
    version: Number(raw.version ?? raw.Version ?? 1),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.UpdatedAt ?? ''),
  };
}

function mapListItem(raw: Record<string, unknown>): AssemblyListItem {
  return {
    id: String(raw.id ?? raw.Id),
    assemblyNumber: String(raw.assemblyNumber ?? raw.AssemblyNumber ?? ''),
    assemblyDate: String(raw.assemblyDate ?? raw.AssemblyDate ?? ''),
    status: String(raw.status ?? raw.Status ?? ''),
    outputArticleCode: String(raw.outputArticleCode ?? raw.OutputArticleCode ?? ''),
    outputProductName: String(raw.outputProductName ?? raw.OutputProductName ?? ''),
    outputQuantity: normalizeStockQuantity(Number(raw.outputQuantity ?? raw.OutputQuantity ?? 0)),
    additionalCostIls: Number(raw.additionalCostIls ?? raw.AdditionalCostIls ?? 0),
    version: Number(raw.version ?? raw.Version ?? 1),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
  };
}

export const assembliesApi = {
  list: async (
    token: string,
    params?: { status?: string; from?: string; to?: string; outputProductId?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.outputProductId) qs.set('outputProductId', params.outputProductId);
    const data = await request<Record<string, unknown>[]>(
      `/api/assemblies${qs.toString() ? `?${qs}` : ''}`,
      {},
      token
    );
    return data.map(mapListItem);
  },

  get: async (token: string, id: string) => {
    const raw = await request<Record<string, unknown>>(`/api/assemblies/${id}`, {}, token);
    return mapAssembly(raw);
  },

  recipeLines: async (token: string, outputProductId: string) => {
    const qs = new URLSearchParams({ outputProductId });
    const data = await request<{ productId: string; quantity: number }[]>(
      `/api/assemblies/recipe-lines?${qs}`,
      {},
      token
    );
    return data.map((l) => ({
      productId: String(l.productId),
      quantity: normalizeStockQuantity(Number(l.quantity)),
    }));
  },

  create: async (token: string, body: AssemblyPayload) => {
    const raw = await request<Record<string, unknown>>(
      '/api/assemblies',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return mapAssembly(raw);
  },

  update: async (token: string, id: string, body: AssemblyPayload & { version: number }) => {
    const raw = await request<Record<string, unknown>>(
      `/api/assemblies/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    );
    return mapAssembly(raw);
  },

  post: async (token: string, id: string, version: number) => {
    const raw = await request<Record<string, unknown>>(
      `/api/assemblies/${id}/post?version=${version}`,
      { method: 'POST' },
      token
    );
    return mapAssembly(raw);
  },

  delete: async (token: string, id: string) => {
    await request<void>(`/api/assemblies/${id}`, { method: 'DELETE' }, token);
  },
};
