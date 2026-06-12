import { request } from './http';
import { type BusinessExpense } from './businessExpenses';

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

export type CogsIssueLine = {
  movementId: string;
  movementDate: string;
  articleCode: string;
  productName: string;
  quantity: number;
  totalCostIls: number;
  notes?: string | null;
};

export type CogsReport = {
  from?: string | null;
  to?: string | null;
  openingInventoryIls: number;
  purchasesToInventoryIls: number;
  closingInventoryIls: number;
  cogsByFormulaIls: number;
  cogsFromIssuesIls: number;
  issueLines: CogsIssueLine[];
};

export type GrossProfitReport = {
  from?: string | null;
  to?: string | null;
  revenueIls: number;
  cogsIls: number;
  grossProfitIls: number;
  receiptCount: number;
};

export type OperatingExpenseCategoryLine = {
  category: string;
  amountIls: number;
};

export type ProfitAndLossReport = {
  from?: string | null;
  to?: string | null;
  revenueIls: number;
  cogsIls: number;
  grossProfitIls: number;
  homeMixedRecognizedIls: number;
  operatingDirectRecognizedIls: number;
  depreciationIls: number;
  totalRecognizedExpensesIls: number;
  netProfitIls: number;
  operatingByCategory: OperatingExpenseCategoryLine[];
};

export type VendorServiceLine = {
  serviceDate: string;
  sourceKind: string;
  receiptNumber?: string | null;
  vendorName: string;
  category: string;
  description?: string | null;
  amountIls: number;
};

export type VendorServicesReport = {
  from?: string | null;
  to?: string | null;
  lines: VendorServiceLine[];
  grandTotalIls: number;
};

export type FixedAssetDepreciationLine = {
  assetId: string;
  name: string;
  category: string;
  annualDepreciationIls: number;
  periodDepreciationIls: number;
};

export type OperatingExpensesReport = {
  from?: string | null;
  to?: string | null;
  homeMixedTotalIls: number;
  homeMixedRecognizedIls: number;
  operatingDirectTotalIls: number;
  depreciationIls: number;
  grandTotalRecognizedIls: number;
  expenseLines: BusinessExpense[];
  depreciationLines: FixedAssetDepreciationLine[];
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

function mapCogsIssueLine(raw: Record<string, unknown>): CogsIssueLine {
  const movementDate = raw.movementDate ?? raw.MovementDate;
  return {
    movementId: String(raw.movementId ?? raw.MovementId),
    movementDate: movementDate ? String(movementDate).slice(0, 10) : '',
    articleCode: String(raw.articleCode ?? raw.ArticleCode ?? ''),
    productName: String(raw.productName ?? raw.ProductName ?? ''),
    quantity: Number(raw.quantity ?? raw.Quantity ?? 0),
    totalCostIls: Number(raw.totalCostIls ?? raw.TotalCostIls ?? 0),
    notes: (raw.notes ?? raw.Notes) as string | null | undefined,
  };
}

function mapBusinessExpenseLine(raw: Record<string, unknown>): BusinessExpense {
  const expenseDate = raw.expenseDate ?? raw.ExpenseDate;
  const createdAt = raw.createdAt ?? raw.CreatedAt;
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
    notes: (raw.notes ?? raw.Notes ?? raw.description ?? raw.Description) as string | null | undefined,
    documentCount: Number(raw.documentCount ?? raw.DocumentCount ?? 0),
    createdAt: createdAt ? String(createdAt) : '',
  };
}

function mapCogsReport(raw: Record<string, unknown>): CogsReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const linesRaw = (raw.issueLines ?? raw.IssueLines ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    openingInventoryIls: Number(raw.openingInventoryIls ?? raw.OpeningInventoryIls ?? 0),
    purchasesToInventoryIls: Number(raw.purchasesToInventoryIls ?? raw.PurchasesToInventoryIls ?? 0),
    closingInventoryIls: Number(raw.closingInventoryIls ?? raw.ClosingInventoryIls ?? 0),
    cogsByFormulaIls: Number(raw.cogsByFormulaIls ?? raw.CogsByFormulaIls ?? 0),
    cogsFromIssuesIls: Number(raw.cogsFromIssuesIls ?? raw.CogsFromIssuesIls ?? 0),
    issueLines: linesRaw.map(mapCogsIssueLine),
  };
}

function mapGrossProfitReport(raw: Record<string, unknown>): GrossProfitReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    revenueIls: Number(raw.revenueIls ?? raw.RevenueIls ?? 0),
    cogsIls: Number(raw.cogsIls ?? raw.CogsIls ?? 0),
    grossProfitIls: Number(raw.grossProfitIls ?? raw.GrossProfitIls ?? 0),
    receiptCount: Number(raw.receiptCount ?? raw.ReceiptCount ?? raw.chargeInvoiceCount ?? raw.ChargeInvoiceCount ?? 0),
  };
}

function mapDepreciationLine(raw: Record<string, unknown>): FixedAssetDepreciationLine {
  return {
    assetId: String(raw.assetId ?? raw.AssetId),
    name: String(raw.name ?? raw.Name ?? ''),
    category: String(raw.category ?? raw.Category ?? ''),
    annualDepreciationIls: Number(raw.annualDepreciationIls ?? raw.AnnualDepreciationIls ?? 0),
    periodDepreciationIls: Number(raw.periodDepreciationIls ?? raw.PeriodDepreciationIls ?? 0),
  };
}

function mapOperatingExpensesReport(raw: Record<string, unknown>): OperatingExpensesReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const expenseLinesRaw = (raw.expenseLines ?? raw.ExpenseLines ?? []) as Record<string, unknown>[];
  const depreciationLinesRaw = (raw.depreciationLines ?? raw.DepreciationLines ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    homeMixedTotalIls: Number(raw.homeMixedTotalIls ?? raw.HomeMixedTotalIls ?? 0),
    homeMixedRecognizedIls: Number(raw.homeMixedRecognizedIls ?? raw.HomeMixedRecognizedIls ?? 0),
    operatingDirectTotalIls: Number(raw.operatingDirectTotalIls ?? raw.OperatingDirectTotalIls ?? 0),
    depreciationIls: Number(raw.depreciationIls ?? raw.DepreciationIls ?? 0),
    grandTotalRecognizedIls: Number(raw.grandTotalRecognizedIls ?? raw.GrandTotalRecognizedIls ?? 0),
    expenseLines: expenseLinesRaw.map(mapBusinessExpenseLine),
    depreciationLines: depreciationLinesRaw.map(mapDepreciationLine),
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
  cogs(token: string, from?: string, to?: string): Promise<CogsReport> {
    return request<Record<string, unknown>>(`/api/reports/cogs${buildQuery(from, to)}`, {}, token).then(
      mapCogsReport
    );
  },
  grossProfit(token: string, from?: string, to?: string): Promise<GrossProfitReport> {
    return request<Record<string, unknown>>(`/api/reports/gross-profit${buildQuery(from, to)}`, {}, token).then(
      mapGrossProfitReport
    );
  },
  operatingExpenses(token: string, from?: string, to?: string): Promise<OperatingExpensesReport> {
    return request<Record<string, unknown>>(
      `/api/reports/operating-expenses${buildQuery(from, to)}`,
      {},
      token
    ).then(mapOperatingExpensesReport);
  },
  fetchOperatingExpensesPdfBlob(token: string, from?: string, to?: string) {
    return fetchPdfBlob(token, '/api/reports/operating-expenses/pdf', from, to);
  },
  downloadOperatingExpensesPdf(token: string, from?: string, to?: string) {
    return fetchPdfBlob(token, '/api/reports/operating-expenses/pdf', from, to).then((blob) =>
      downloadBlob(
        blob,
        `operating-expenses-report${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.pdf`
      )
    );
  },

  profitAndLoss(token: string, from?: string, to?: string): Promise<ProfitAndLossReport> {
    return request<Record<string, unknown>>(
      `/api/reports/profit-and-loss${buildQuery(from, to)}`,
      {},
      token
    ).then(mapProfitAndLossReport);
  },

  vendorServices(token: string, from?: string, to?: string): Promise<VendorServicesReport> {
    return request<Record<string, unknown>>(
      `/api/reports/vendor-services${buildQuery(from, to)}`,
      {},
      token
    ).then(mapVendorServicesReport);
  },

  form1342(token: string, taxYear: number): Promise<Form1342Report> {
    return request<Record<string, unknown>>(`/api/reports/form-1342?taxYear=${taxYear}`, {}, token).then(
      mapForm1342Report
    );
  },

  fetchForm1342PdfBlob(token: string, taxYear: number): Promise<Blob> {
    return fetch(`${API_BASE}/api/reports/form-1342/pdf?taxYear=${taxYear}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? res.statusText);
      }
      return res.blob();
    });
  },

  downloadForm1342Pdf(token: string, taxYear: number): Promise<void> {
    return financialReportsApi.fetchForm1342PdfBlob(token, taxYear).then((blob) => {
      downloadBlob(blob, `form-1342-${taxYear}.pdf`);
    });
  },
};

export type Form1342Line = {
  rowNumber: number;
  instanceId: string;
  assetDescription: string;
  acquisitionDate: string;
  inServiceDate: string;
  originalCostIls: number;
  changesCostIls: number;
  totalDepreciableIls: number;
  legalDepreciationRatePercent: number;
  claimedDepreciationRatePercent: number;
  currentYearDepreciationIls: number;
  previousAccumulatedDepreciationIls: number;
  totalAccumulatedDepreciationIls: number;
  remainingBalanceIls: number;
  businessUsePercent: number;
  notes?: string | null;
};

export type Form1342Report = {
  taxYear: number;
  tenantName?: string | null;
  osekNumber?: string | null;
  lines: Form1342Line[];
  totalCurrentYearDepreciationIls: number;
};

function mapForm1342Line(raw: Record<string, unknown>): Form1342Line {
  const acq = raw.acquisitionDate ?? raw.AcquisitionDate;
  const ins = raw.inServiceDate ?? raw.InServiceDate;
  return {
    rowNumber: Number(raw.rowNumber ?? raw.RowNumber ?? 0),
    instanceId: String(raw.instanceId ?? raw.InstanceId ?? ''),
    assetDescription: String(raw.assetDescription ?? raw.AssetDescription ?? ''),
    acquisitionDate: acq ? String(acq).slice(0, 10) : '',
    inServiceDate: ins ? String(ins).slice(0, 10) : '',
    originalCostIls: Number(raw.originalCostIls ?? raw.OriginalCostIls ?? 0),
    changesCostIls: Number(raw.changesCostIls ?? raw.ChangesCostIls ?? 0),
    totalDepreciableIls: Number(raw.totalDepreciableIls ?? raw.TotalDepreciableIls ?? 0),
    legalDepreciationRatePercent: Number(raw.legalDepreciationRatePercent ?? raw.LegalDepreciationRatePercent ?? 0),
    claimedDepreciationRatePercent: Number(
      raw.claimedDepreciationRatePercent ?? raw.ClaimedDepreciationRatePercent ?? 0
    ),
    currentYearDepreciationIls: Number(raw.currentYearDepreciationIls ?? raw.CurrentYearDepreciationIls ?? 0),
    previousAccumulatedDepreciationIls: Number(
      raw.previousAccumulatedDepreciationIls ?? raw.PreviousAccumulatedDepreciationIls ?? 0
    ),
    totalAccumulatedDepreciationIls: Number(
      raw.totalAccumulatedDepreciationIls ?? raw.TotalAccumulatedDepreciationIls ?? 0
    ),
    remainingBalanceIls: Number(raw.remainingBalanceIls ?? raw.RemainingBalanceIls ?? 0),
    businessUsePercent: Number(raw.businessUsePercent ?? raw.BusinessUsePercent ?? 100),
    notes: (raw.notes ?? raw.Notes) as string | null | undefined,
  };
}

function mapForm1342Report(raw: Record<string, unknown>): Form1342Report {
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    taxYear: Number(raw.taxYear ?? raw.TaxYear ?? new Date().getFullYear()),
    tenantName: (raw.tenantName ?? raw.TenantName) as string | null | undefined,
    osekNumber: (raw.osekNumber ?? raw.OsekNumber) as string | null | undefined,
    lines: linesRaw.map(mapForm1342Line),
    totalCurrentYearDepreciationIls: Number(
      raw.totalCurrentYearDepreciationIls ?? raw.TotalCurrentYearDepreciationIls ?? 0
    ),
  };
}

function mapProfitAndLossReport(raw: Record<string, unknown>): ProfitAndLossReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const catRaw = (raw.operatingByCategory ?? raw.OperatingByCategory ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    revenueIls: Number(raw.revenueIls ?? raw.RevenueIls ?? 0),
    cogsIls: Number(raw.cogsIls ?? raw.CogsIls ?? 0),
    grossProfitIls: Number(raw.grossProfitIls ?? raw.GrossProfitIls ?? 0),
    homeMixedRecognizedIls: Number(raw.homeMixedRecognizedIls ?? raw.HomeMixedRecognizedIls ?? 0),
    operatingDirectRecognizedIls: Number(raw.operatingDirectRecognizedIls ?? raw.OperatingDirectRecognizedIls ?? 0),
    depreciationIls: Number(raw.depreciationIls ?? raw.DepreciationIls ?? 0),
    totalRecognizedExpensesIls: Number(raw.totalRecognizedExpensesIls ?? raw.TotalRecognizedExpensesIls ?? 0),
    netProfitIls: Number(raw.netProfitIls ?? raw.NetProfitIls ?? 0),
    operatingByCategory: catRaw.map((c) => ({
      category: String(c.category ?? c.Category ?? ''),
      amountIls: Number(c.amountIls ?? c.AmountIls ?? 0),
    })),
  };
}

function mapVendorServicesReport(raw: Record<string, unknown>): VendorServicesReport {
  const from = raw.from ?? raw.From;
  const to = raw.to ?? raw.To;
  const linesRaw = (raw.lines ?? raw.Lines ?? []) as Record<string, unknown>[];
  return {
    from: from ? String(from).slice(0, 10) : null,
    to: to ? String(to).slice(0, 10) : null,
    lines: linesRaw.map((l) => {
      const serviceDate = l.serviceDate ?? l.ServiceDate;
      return {
        serviceDate: serviceDate ? String(serviceDate).slice(0, 10) : '',
        sourceKind: String(l.sourceKind ?? l.SourceKind ?? ''),
        receiptNumber: (l.receiptNumber ?? l.ReceiptNumber) as string | null | undefined,
        vendorName: String(l.vendorName ?? l.VendorName ?? ''),
        category: String(l.category ?? l.Category ?? ''),
        description: (l.description ?? l.Description) as string | null | undefined,
        amountIls: Number(l.amountIls ?? l.AmountIls ?? 0),
      };
    }),
    grandTotalIls: Number(raw.grandTotalIls ?? raw.GrandTotalIls ?? 0),
  };
}
