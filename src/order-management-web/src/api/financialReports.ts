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

function mapLine(raw: Record<string, unknown>): IncomeReportLine {
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

function mapReport(raw: Record<string, unknown>): IncomeReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    lines: linesRaw.map(mapLine),
    grandTotalIls: Number(raw.grandTotalIls ?? raw.GrandTotalIls ?? 0),
    receiptCount: Number(raw.receiptCount ?? raw.ReceiptCount ?? 0),
  };
}

export const financialReportsApi = {
  income(token: string, from?: string, to?: string): Promise<IncomeReport> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<Record<string, unknown>>(`/api/reports/income${qs ? `?${qs}` : ''}`, {}, token).then(mapReport);
  },
};
