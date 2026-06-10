import { request } from './http';

export type IncomeReportLine = {
  receiptId: string;
  documentNumber: string;
  receiptDate: string;
  customerName: string;
  paymentDate: string;
  paymentType: string;
  currency: string;
  amount: number;
  amountIls: number;
  detail?: string | null;
};

export type IncomeReport = {
  from?: string | null;
  to?: string | null;
  lines: IncomeReportLine[];
  grandTotalIls: number;
  receiptCount: number;
};

export type ExpenseReportLine = {
  purchaseReceiptId: string;
  receiptNumber: string;
  documentDate: string;
  supplierName: string;
  supplierInvoiceNumber?: string | null;
  currency: string;
  amountOriginal?: number | null;
  amountIls: number;
  lineCount: number;
};

export type ExpenseReport = {
  from?: string | null;
  to?: string | null;
  lines: ExpenseReportLine[];
  grandTotalIls: number;
  receiptCount: number;
};

function mapIncomeLine(raw: Record<string, unknown>): IncomeReportLine {
  const receiptDate = raw.receiptDate ?? raw.ReceiptDate;
  const paymentDate = raw.paymentDate ?? raw.PaymentDate;
  return {
    receiptId: String(raw.receiptId ?? raw.ReceiptId),
    documentNumber: String(raw.documentNumber ?? raw.DocumentNumber ?? ''),
    receiptDate: receiptDate ? String(receiptDate).slice(0, 10) : '',
    customerName: String(raw.customerName ?? raw.CustomerName ?? ''),
    paymentDate: paymentDate ? String(paymentDate).slice(0, 10) : '',
    paymentType: String(raw.paymentType ?? raw.PaymentType ?? ''),
    currency: String(raw.currency ?? raw.Currency ?? 'ILS'),
    amount: Number(raw.amount ?? raw.Amount ?? 0),
    amountIls: Number(raw.amountIls ?? raw.AmountIls ?? 0),
    detail: (raw.detail ?? raw.Detail) as string | null | undefined,
  };
}

function mapExpenseLine(raw: Record<string, unknown>): ExpenseReportLine {
  const documentDate = raw.documentDate ?? raw.DocumentDate;
  const amountOriginal = raw.amountOriginal ?? raw.AmountOriginal;
  return {
    purchaseReceiptId: String(raw.purchaseReceiptId ?? raw.PurchaseReceiptId),
    receiptNumber: String(raw.receiptNumber ?? raw.ReceiptNumber ?? ''),
    documentDate: documentDate ? String(documentDate).slice(0, 10) : '',
    supplierName: String(raw.supplierName ?? raw.SupplierName ?? ''),
    supplierInvoiceNumber: (raw.supplierInvoiceNumber ?? raw.SupplierInvoiceNumber) as string | null | undefined,
    currency: String(raw.currency ?? raw.Currency ?? 'ILS'),
    amountOriginal: amountOriginal != null ? Number(amountOriginal) : null,
    amountIls: Number(raw.amountIls ?? raw.AmountIls ?? 0),
    lineCount: Number(raw.lineCount ?? raw.LineCount ?? 0),
  };
}

function mapIncomeReport(raw: Record<string, unknown>): IncomeReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    lines: linesRaw.map(mapIncomeLine),
    grandTotalIls: Number(raw.grandTotalIls ?? raw.GrandTotalIls ?? 0),
    receiptCount: Number(raw.receiptCount ?? raw.ReceiptCount ?? 0),
  };
}

function mapExpenseReport(raw: Record<string, unknown>): ExpenseReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    lines: linesRaw.map(mapExpenseLine),
    grandTotalIls: Number(raw.grandTotalIls ?? raw.GrandTotalIls ?? 0),
    receiptCount: Number(raw.receiptCount ?? raw.ReceiptCount ?? 0),
  };
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function buildQuery(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function fetchPdfBlob(token: string, path: string, from?: string, to?: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}${buildQuery(from, to)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const body = data as { message?: string };
    throw new Error(body.message ?? res.statusText);
  }
  return res.blob();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export const financialReportsApi = {
  income(token: string, from?: string, to?: string): Promise<IncomeReport> {
    return request<Record<string, unknown>>(`/api/reports/income${buildQuery(from, to)}`, {}, token).then(
      mapIncomeReport
    );
  },
  expenses(token: string, from?: string, to?: string): Promise<ExpenseReport> {
    return request<Record<string, unknown>>(`/api/reports/expenses${buildQuery(from, to)}`, {}, token).then(
      mapExpenseReport
    );
  },
  fetchIncomePdfBlob(token: string, from?: string, to?: string) {
    return fetchPdfBlob(token, '/api/reports/income/pdf', from, to);
  },
  downloadIncomePdf(token: string, from?: string, to?: string) {
    return fetchPdfBlob(token, '/api/reports/income/pdf', from, to).then((blob) =>
      downloadBlob(blob, `income-report${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.pdf`)
    );
  },
  fetchExpensesPdfBlob(token: string, from?: string, to?: string) {
    return fetchPdfBlob(token, '/api/reports/expenses/pdf', from, to);
  },
  downloadExpensesPdf(token: string, from?: string, to?: string) {
    return fetchPdfBlob(token, '/api/reports/expenses/pdf', from, to).then((blob) =>
      downloadBlob(blob, `expense-report${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.pdf`)
    );
  },
};
