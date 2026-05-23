import { request } from './http';

export type DocumentLine = {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
};

export type Document = {
  id: string;
  documentType: string;
  documentNumber: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  parentDocumentId?: string;
  status: string;
  description?: string;
  issueDate: string;
  dueDate?: string;
  totalAmount: number;
  paymentMethod?: string;
  lines: DocumentLine[];
  version: number;
  createdAt: string;
};

export type DocumentSummary = {
  totalReceipts: number;
  totalChargeInvoices: number;
  totalQuotes: number;
  totalReceivable: number;
};

export type DocumentMonthGroup = {
  monthKey: string;
  year: number;
  month: number;
  documents: Document[];
};

export type DocumentListResponse = {
  summary: DocumentSummary;
  groups: DocumentMonthGroup[];
};

function mapLine(raw: Record<string, unknown>): DocumentLine {
  return {
    id: String(raw.id ?? raw.Id),
    productId: (raw.productId ?? raw.ProductId) as string | undefined,
    description: String(raw.description ?? raw.Description ?? ''),
    quantity: Number(raw.quantity ?? raw.Quantity ?? 0),
    unitPrice: Number(raw.unitPrice ?? raw.UnitPrice ?? 0),
    lineTotal: Number(raw.lineTotal ?? raw.LineTotal ?? 0),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

function mapDocument(raw: Record<string, unknown>): Document {
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    id: String(raw.id ?? raw.Id),
    documentType: String(raw.documentType ?? raw.DocumentType ?? ''),
    documentNumber: String(raw.documentNumber ?? raw.DocumentNumber ?? ''),
    customerId: String(raw.customerId ?? raw.CustomerId),
    customerName: String(raw.customerName ?? raw.CustomerName ?? ''),
    orderId: (raw.orderId ?? raw.OrderId) as string | undefined,
    parentDocumentId: (raw.parentDocumentId ?? raw.ParentDocumentId) as string | undefined,
    status: String(raw.status ?? raw.Status ?? 'Draft'),
    description: (raw.description ?? raw.Description) as string | undefined,
    issueDate: String(raw.issueDate ?? raw.IssueDate ?? ''),
    dueDate: (raw.dueDate ?? raw.DueDate) as string | undefined,
    totalAmount: Number(raw.totalAmount ?? raw.TotalAmount ?? 0),
    paymentMethod: (raw.paymentMethod ?? raw.PaymentMethod) as string | undefined,
    lines: Array.isArray(linesRaw) ? linesRaw.map(mapLine) : [],
    version: Number(raw.version ?? raw.Version ?? 1),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
  };
}

function mapSummary(raw: Record<string, unknown>): DocumentSummary {
  return {
    totalReceipts: Number(raw.totalReceipts ?? raw.TotalReceipts ?? 0),
    totalChargeInvoices: Number(raw.totalChargeInvoices ?? raw.TotalChargeInvoices ?? 0),
    totalQuotes: Number(raw.totalQuotes ?? raw.TotalQuotes ?? 0),
    totalReceivable: Number(raw.totalReceivable ?? raw.TotalReceivable ?? 0),
  };
}

export const documentsApi = {
  list: async (token: string, params?: Record<string, string>) => {
    const q = new URLSearchParams(params);
    const data = await request<Record<string, unknown>>(
      `/api/documents?${q}`,
      {},
      token
    );
    const summary = mapSummary((data.summary ?? data.Summary ?? {}) as Record<string, unknown>);
    const groupsRaw = (data.groups ?? data.Groups ?? []) as Record<string, unknown>[];
    const groups: DocumentMonthGroup[] = groupsRaw.map((g) => ({
      monthKey: String(g.monthKey ?? g.MonthKey ?? ''),
      year: Number(g.year ?? g.Year ?? 0),
      month: Number(g.month ?? g.Month ?? 0),
      documents: ((g.documents ?? g.Documents ?? []) as Record<string, unknown>[]).map(mapDocument),
    }));
    return { summary, groups } as DocumentListResponse;
  },
  create: async (token: string, body: object) => {
    const data = await request<Record<string, unknown>>(
      '/api/documents',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return mapDocument(data);
  },
  recordPayment: async (token: string, chargeInvoiceId: string, body?: object) => {
    const data = await request<Record<string, unknown>>(
      `/api/documents/${chargeInvoiceId}/payment`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
      token
    );
    return mapDocument(data);
  },
};
