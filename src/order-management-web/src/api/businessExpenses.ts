import { request } from './http';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type BusinessExpenseDocument = {
  id: string;
  fileName: string;
  contentType: string;
  sortOrder: number;
  createdAt: string;
};

export type BusinessExpense = {
  id: string;
  expenseDate: string;
  isHomeMixed: boolean;
  homeExpenseType?: string | null;
  operatingExpenseType?: string | null;
  amountIls: number;
  recognizedPercent: number;
  recognizedAmountIls: number;
  vendorName?: string | null;
  invoiceReference?: string | null;
  notes?: string | null;
  documentCount: number;
  createdAt: string;
  documents?: BusinessExpenseDocument[];
};

export type BusinessExpenseInput = {
  expenseDate: string;
  isHomeMixed: boolean;
  homeExpenseType?: string | null;
  operatingExpenseType?: string | null;
  amountIls: number;
  vendorName?: string | null;
  invoiceReference?: string | null;
  notes?: string | null;
};

function mapDocument(raw: Record<string, unknown>): BusinessExpenseDocument {
  const createdAt = raw.createdAt ?? raw.CreatedAt;
  return {
    id: String(raw.id ?? raw.Id),
    fileName: String(raw.fileName ?? raw.FileName ?? ''),
    contentType: String(raw.contentType ?? raw.ContentType ?? ''),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
    createdAt: createdAt ? String(createdAt) : '',
  };
}

function mapExpense(raw: Record<string, unknown>): BusinessExpense {
  const expenseDate = raw.expenseDate ?? raw.ExpenseDate;
  const createdAt = raw.createdAt ?? raw.CreatedAt;
  const documentsRaw = raw.documents ?? raw.Documents;
  const documents = Array.isArray(documentsRaw)
    ? documentsRaw.map((d) => mapDocument(d as Record<string, unknown>))
    : undefined;
  const documentCount = Number(raw.documentCount ?? raw.DocumentCount ?? documents?.length ?? 0);
  return {
    id: String(raw.id ?? raw.Id),
    expenseDate: expenseDate ? String(expenseDate).slice(0, 10) : '',
    isHomeMixed: Boolean(raw.isHomeMixed ?? raw.IsHomeMixed),
    homeExpenseType: (raw.homeExpenseType ?? raw.HomeExpenseType) as string | null | undefined,
    operatingExpenseType: (raw.operatingExpenseType ?? raw.OperatingExpenseType) as string | null | undefined,
    amountIls: Number(raw.amountIls ?? raw.AmountIls ?? 0),
    recognizedPercent: Number(raw.recognizedPercent ?? raw.RecognizedPercent ?? 0),
    recognizedAmountIls: Number(raw.recognizedAmountIls ?? raw.RecognizedAmountIls ?? 0),
    vendorName: (raw.vendorName ?? raw.VendorName) as string | null | undefined,
    invoiceReference: (raw.invoiceReference ?? raw.InvoiceReference) as string | null | undefined,
    notes: (raw.notes ?? raw.Notes) as string | null | undefined,
    documentCount,
    createdAt: createdAt ? String(createdAt) : '',
    documents,
  };
}

function buildQuery(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const businessExpensesApi = {
  list(token: string, from?: string, to?: string): Promise<BusinessExpense[]> {
    return request<Record<string, unknown>[]>(`/api/business-expenses${buildQuery(from, to)}`, {}, token).then(
      (rows) => rows.map((r) => mapExpense(r))
    );
  },

  get(token: string, id: string): Promise<BusinessExpense> {
    return request<Record<string, unknown>>(`/api/business-expenses/${id}`, {}, token).then(mapExpense);
  },

  create(token: string, body: BusinessExpenseInput): Promise<BusinessExpense> {
    return request<Record<string, unknown>>(
      '/api/business-expenses',
      { method: 'POST', body: JSON.stringify(body) },
      token
    ).then(mapExpense);
  },

  update(token: string, id: string, body: BusinessExpenseInput): Promise<BusinessExpense> {
    return request<Record<string, unknown>>(
      `/api/business-expenses/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    ).then(mapExpense);
  },

  delete(token: string, id: string): Promise<void> {
    return request<void>(`/api/business-expenses/${id}`, { method: 'DELETE' }, token);
  },

  uploadDocument: async (token: string, expenseId: string, file: File): Promise<BusinessExpense> => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch(`${API_BASE}/api/business-expenses/${expenseId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { message?: string };
    if (!res.ok) {
      throw new Error(data.message ?? res.statusText);
    }
    return mapExpense(data);
  },

  deleteDocument: async (token: string, expenseId: string, documentId: string): Promise<BusinessExpense> => {
    const raw = await request<Record<string, unknown>>(
      `/api/business-expenses/${expenseId}/documents/${documentId}`,
      { method: 'DELETE' },
      token
    );
    return mapExpense(raw);
  },

  fetchDocumentBlob: async (token: string, expenseId: string, documentId: string, fileName?: string) => {
    const res = await fetch(`${API_BASE}/api/business-expenses/${expenseId}/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? res.statusText);
    }
    const blob = await res.blob();
    let contentType = res.headers.get('Content-Type') ?? blob.type ?? 'application/octet-stream';
    if (contentType.includes('pdf') || fileName?.toLowerCase().endsWith('.pdf') || blob.type.includes('pdf')) {
      contentType = 'application/pdf';
    }
    return new Blob([blob], { type: contentType });
  },

  fetchJournalPdfBlob(token: string, from?: string, to?: string): Promise<Blob> {
    return fetch(`${API_BASE}/api/business-expenses/pdf${buildQuery(from, to)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? res.statusText);
      }
      return res.blob();
    });
  },

  downloadJournalPdf(token: string, from?: string, to?: string): Promise<void> {
    return businessExpensesApi.fetchJournalPdfBlob(token, from, to).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `business-expenses-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
};
