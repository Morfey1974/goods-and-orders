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

export type ReceiptPaymentLine = {
  id: string;
  paymentType: string;
  amount: number;
  currency: string;
  lineDate?: string;
  generalDetail?: string;
  detailsJson?: string;
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
  discountPercent?: number | null;
  discountAmount?: number | null;
  paymentMethod?: string;
  lines: DocumentLine[];
  paymentLines?: ReceiptPaymentLine[];
  parentChargeAmount?: number;
  parentChargeNumber?: string;
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

function mapPaymentLine(raw: Record<string, unknown>): ReceiptPaymentLine {
  return {
    id: String(raw.id ?? raw.Id),
    paymentType: String(raw.paymentType ?? raw.PaymentType ?? ''),
    amount: Number(raw.amount ?? raw.Amount ?? 0),
    currency: String(raw.currency ?? raw.Currency ?? 'ILS'),
    lineDate: (raw.lineDate ?? raw.LineDate) as string | undefined,
    generalDetail: (raw.generalDetail ?? raw.GeneralDetail) as string | undefined,
    detailsJson: (raw.detailsJson ?? raw.DetailsJson) as string | undefined,
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

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
  const paymentLinesRaw = (raw.paymentLines ?? raw.PaymentLines ?? []) as Record<string, unknown>[];
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
    discountPercent: (raw.discountPercent ?? raw.DiscountPercent) as number | null | undefined,
    discountAmount: (raw.discountAmount ?? raw.DiscountAmount) as number | null | undefined,
    paymentMethod: (raw.paymentMethod ?? raw.PaymentMethod) as string | undefined,
    lines: Array.isArray(linesRaw) ? linesRaw.map(mapLine) : [],
    paymentLines: Array.isArray(paymentLinesRaw) ? paymentLinesRaw.map(mapPaymentLine) : undefined,
    parentChargeAmount: (raw.parentChargeAmount ?? raw.ParentChargeAmount) as number | undefined,
    parentChargeNumber: (raw.parentChargeNumber ?? raw.ParentChargeNumber) as string | undefined,
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
  get: async (token: string, id: string) => {
    const data = await request<Record<string, unknown>>(`/api/documents/${id}`, {}, token);
    return mapDocument(data);
  },
  update: async (token: string, id: string, body: object) => {
    const data = await request<Record<string, unknown>>(
      `/api/documents/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    );
    return mapDocument(data);
  },
  delete: async (token: string, id: string) => {
    await request(`/api/documents/${id}`, { method: 'DELETE' }, token);
  },
  duplicate: async (token: string, id: string) => {
    const data = await request<Record<string, unknown>>(
      `/api/documents/${id}/duplicate`,
      { method: 'POST' },
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
  issueChargeInvoice: async (token: string, quoteId: string) => {
    const quote = await documentsApi.get(token, quoteId);
    if (quote.documentType !== 'Quote') {
      throw new Error('Charge invoice can only be issued from a price quote.');
    }
    return documentsApi.create(token, {
      documentType: 'ChargeInvoice',
      customerId: quote.customerId,
      parentDocumentId: quote.id,
      description: quote.description,
      issueDate: new Date().toISOString(),
      dueDate: quote.dueDate,
      paymentMethod: quote.paymentMethod,
      discountPercent: quote.discountPercent ?? undefined,
      discountAmount: quote.discountAmount ?? undefined,
      lines: quote.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    });
  },
  issueReceipt: async (token: string, documentId: string, body?: object) => {
    const source = await documentsApi.get(token, documentId);
    if (source.documentType === 'ChargeInvoice') {
      return documentsApi.createReceiptDraft(token, documentId, body);
    }
    if (source.documentType === 'Quote') {
      let chargeId: string | undefined;
      try {
        const charge = await documentsApi.issueChargeInvoice(token, documentId);
        chargeId = charge.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('already exists')) throw err;
        const list = await documentsApi.list(token);
        const existing = list.groups
          .flatMap((g) => g.documents)
          .find(
            (d) =>
              d.documentType === 'ChargeInvoice' &&
              d.parentDocumentId === documentId
          );
        if (!existing) throw err;
        chargeId = existing.id;
      }
      return documentsApi.createReceiptDraft(token, chargeId!, body);
    }
    throw new Error('Receipt can only be issued from a quote or charge invoice.');
  },
  createReceiptDraft: async (token: string, chargeOrQuoteId: string, body?: object) => {
    const data = await request<Record<string, unknown>>(
      `/api/documents/${chargeOrQuoteId}/payment`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
      token
    );
    return mapDocument(data);
  },
  saveReceipt: async (token: string, receiptId: string, body: object) => {
    const data = await request<Record<string, unknown>>(
      `/api/documents/${receiptId}/receipt`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    );
    return mapDocument(data);
  },
  fetchPdfBlob: async (token: string, id: string) => {
    const API_BASE = import.meta.env.VITE_API_URL ?? '';
    const res = await fetch(`${API_BASE}/api/documents/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const body = data as { message?: string };
      throw new Error(body.message ?? res.statusText);
    }
    return res.blob();
  },

  downloadPdf: async (token: string, id: string, fileName: string) => {
    const blob = await documentsApi.fetchPdfBlob(token, id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },

  sendEmail: async (
    token: string,
    id: string,
    body: { contactId: string; recipientEmail: string; subject?: string; bodyHtml?: string }
  ) => {
    const data = await request<Record<string, unknown>>(
      `/api/documents/${id}/send-email`,
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return {
      sent: Boolean(data.sent ?? data.Sent),
      stub: Boolean(data.stub ?? data.Stub),
      message: String(data.message ?? data.Message ?? ''),
    };
  },
};
