export type ReceiptPaymentTypeKey =
  | 'WithholdingTax'
  | 'BankTransfer'
  | 'Check'
  | 'CreditCard'
  | 'PaymentApp'
  | 'PayPal'
  | 'Cash'
  | 'Other';

export const RECEIPT_PAYMENT_TABS: ReceiptPaymentTypeKey[] = [
  'WithholdingTax',
  'BankTransfer',
  'Check',
  'CreditCard',
  'PaymentApp',
  'PayPal',
  'Cash',
  'Other',
];

export type SavedPaymentLine = {
  id: string;
  paymentType: ReceiptPaymentTypeKey;
  amount: number;
  currency: string;
  lineDate: string;
  generalDetail: string;
  details: Record<string, string | number>;
};

export type PaymentDraftFields = {
  lineDate: string;
  amount: string;
  currency: string;
  generalDetail: string;
  percent: string;
  bankNumber: string;
  branchNumber: string;
  accountNumber: string;
  reference: string;
  depositDate: string;
  checkNumber: string;
  dueDate: string;
  duplicateChecks: string;
  lastFour: string;
  cardType: string;
  transactionType: string;
  installments: string;
  appType: string;
  transactionNo: string;
  payerAccount: string;
  otherType: string;
};

export function emptyPaymentDraft(today: string): PaymentDraftFields {
  return {
    lineDate: today,
    amount: '',
    currency: 'ILS',
    generalDetail: '',
    percent: '',
    bankNumber: '',
    branchNumber: '',
    accountNumber: '',
    reference: '',
    depositDate: today,
    checkNumber: '',
    dueDate: today,
    duplicateChecks: '1',
    lastFour: '',
    cardType: 'Unknown',
    transactionType: 'Regular',
    installments: '1',
    appType: 'BIT',
    transactionNo: '',
    payerAccount: '',
    otherType: 'BIT',
  };
}

export function buildDetailsJson(
  type: ReceiptPaymentTypeKey,
  d: PaymentDraftFields
): Record<string, string | number> {
  switch (type) {
    case 'WithholdingTax':
      return { percent: d.percent };
    case 'BankTransfer':
      return {
        depositDate: d.depositDate,
        bankNumber: d.bankNumber,
        branchNumber: d.branchNumber,
        accountNumber: d.accountNumber,
        reference: d.reference,
      };
    case 'Check':
      return {
        dueDate: d.dueDate,
        bankNumber: d.bankNumber,
        branchNumber: d.branchNumber,
        accountNumber: d.accountNumber,
        checkNumber: d.checkNumber,
        duplicateCount: d.duplicateChecks,
      };
    case 'CreditCard':
      return {
        lastFour: d.lastFour,
        cardType: d.cardType,
        transactionType: d.transactionType,
        installments: d.installments,
      };
    case 'PaymentApp':
      return { appType: d.appType, transactionNo: d.transactionNo };
    case 'PayPal':
      return { payerAccount: d.payerAccount, transactionNo: d.transactionNo };
    case 'Other':
      return { typeName: d.otherType, transactionNo: d.transactionNo };
    default:
      return {};
  }
}

export function lineDateForType(type: ReceiptPaymentTypeKey, d: PaymentDraftFields): string {
  if (type === 'BankTransfer') return d.depositDate;
  if (type === 'Check') return d.dueDate;
  return d.lineDate;
}

export function parseDetailsJson(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

export type DraftDefaultsContext = {
  today: string;
  chargeTotal: number;
  openBalance: number;
  bankCode?: string;
  bankBranch?: string;
  bankAccount?: string;
  withholdingPercent?: number | null;
};

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function withholdingAmountFromPercent(chargeTotal: number, percent: number) {
  if (!Number.isFinite(chargeTotal) || chargeTotal <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return roundMoney((chargeTotal * percent) / 100);
}

export function totalWithholdingAmount(lines: SavedPaymentLine[]): number {
  return roundMoney(
    lines
      .filter((l) => l.paymentType === 'WithholdingTax')
      .reduce((sum, l) => sum + l.amount, 0)
  );
}

/** When ניכוי במקור exists, bank transfer = charge − withholding − other payments. */
export function reconcileBankTransferAmounts(
  lines: SavedPaymentLine[],
  chargeTotal: number
): SavedPaymentLine[] {
  if (chargeTotal <= 0 || lines.length === 0) return lines;

  const withholding = totalWithholdingAmount(lines);
  const bankLines = lines.filter((l) => l.paymentType === 'BankTransfer');
  if (bankLines.length === 0) return lines;

  const otherTotal = roundMoney(
    lines
      .filter((l) => l.paymentType !== 'BankTransfer' && l.paymentType !== 'WithholdingTax')
      .reduce((sum, l) => sum + l.amount, 0)
  );

  const bankTarget = roundMoney(Math.max(0, chargeTotal - withholding - otherTotal));

  if (withholding <= 0 && otherTotal === 0 && bankLines.length === 1) {
    return lines.map((l) =>
      l.paymentType === 'BankTransfer' ? { ...l, amount: chargeTotal } : l
    );
  }

  if (withholding <= 0) return lines;

  const primaryBankId = bankLines[0].id;
  return lines.map((l) => {
    if (l.paymentType !== 'BankTransfer') return l;
    if (l.id === primaryBankId) return { ...l, amount: bankTarget };
    return l;
  });
}

export function defaultAmountForTab(tab: ReceiptPaymentTypeKey, ctx: DraftDefaultsContext): string {
  if (tab === 'WithholdingTax') {
    const pct = ctx.withholdingPercent ?? 0;
    if (pct > 0 && ctx.chargeTotal > 0) {
      return String(withholdingAmountFromPercent(ctx.chargeTotal, pct));
    }
    return '';
  }
  const n = ctx.openBalance > 0 ? ctx.openBalance : ctx.chargeTotal;
  return n > 0 ? String(roundMoney(n)) : '';
}

export function buildPaymentDraft(
  tab: ReceiptPaymentTypeKey,
  ctx: DraftDefaultsContext
): PaymentDraftFields {
  const base = emptyPaymentDraft(ctx.today);
  const amount = defaultAmountForTab(tab, ctx);

  if (tab === 'BankTransfer') {
    return {
      ...base,
      amount,
      bankNumber: ctx.bankCode ?? '',
      branchNumber: ctx.bankBranch ?? '',
      accountNumber: ctx.bankAccount ?? '',
      depositDate: ctx.today,
    };
  }

  if (tab === 'WithholdingTax') {
    const pct = ctx.withholdingPercent ?? 0;
    return {
      ...base,
      amount,
      percent: pct > 0 ? String(pct) : '',
    };
  }

  return { ...base, amount };
}

export function formatLineDateDisplay(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

type DetailLabels = {
  bank: string;
  branch: string;
  account: string;
  reference: string;
  check: string;
  percent: string;
};

export function formatPaymentLineDetail(
  line: SavedPaymentLine,
  labels: DetailLabels
): string {
  const d = line.details;
  switch (line.paymentType) {
    case 'BankTransfer': {
      const parts: string[] = [];
      if (d.bankNumber) parts.push(`${labels.bank} ${d.bankNumber}`);
      if (d.branchNumber) parts.push(`${labels.branch} ${d.branchNumber}`);
      if (d.accountNumber) parts.push(`${labels.account} ${d.accountNumber}`);
      if (d.reference) parts.push(`${labels.reference} ${d.reference}`);
      if (line.generalDetail) parts.push(line.generalDetail);
      return parts.join(' / ') || '—';
    }
    case 'WithholdingTax': {
      const parts: string[] = [];
      if (line.generalDetail) parts.push(line.generalDetail);
      if (d.reference) parts.push(String(d.reference));
      if (d.percent) parts.push(`${d.percent}%`);
      return parts.join(' / ') || '—';
    }
    case 'Check': {
      const parts: string[] = [];
      if (d.bankNumber) parts.push(`${labels.bank} ${d.bankNumber}`);
      if (d.branchNumber) parts.push(`${labels.branch} ${d.branchNumber}`);
      if (d.accountNumber) parts.push(`${labels.account} ${d.accountNumber}`);
      if (d.checkNumber) parts.push(`${labels.check} ${d.checkNumber}`);
      if (line.generalDetail) parts.push(line.generalDetail);
      return parts.join(' / ') || '—';
    }
    case 'CreditCard': {
      const parts: string[] = [];
      if (d.cardType) parts.push(String(d.cardType));
      if (d.lastFour) parts.push(`**** ${d.lastFour}`);
      if (line.generalDetail) parts.push(line.generalDetail);
      return parts.join(' · ') || '—';
    }
    case 'PaymentApp':
    case 'PayPal':
    case 'Other': {
      const parts: string[] = [];
      if (d.appType) parts.push(String(d.appType));
      if (d.typeName) parts.push(String(d.typeName));
      if (d.transactionNo) parts.push(String(d.transactionNo));
      if (d.payerAccount) parts.push(String(d.payerAccount));
      if (line.generalDetail) parts.push(line.generalDetail);
      return parts.join(' / ') || '—';
    }
    default:
      return line.generalDetail || '—';
  }
}

/** Load saved line back into the payment entry form for editing. */
export function draftFromSavedLine(line: SavedPaymentLine, today: string): PaymentDraftFields {
  const base = emptyPaymentDraft(today);
  const d = line.details;
  const draft: PaymentDraftFields = {
    ...base,
    amount: String(line.amount),
    currency: line.currency || 'ILS',
    generalDetail: line.generalDetail,
    lineDate: line.lineDate || today,
  };

  switch (line.paymentType) {
    case 'WithholdingTax':
      draft.percent = d.percent != null ? String(d.percent) : '';
      break;
    case 'BankTransfer':
      draft.depositDate = String(d.depositDate ?? line.lineDate ?? today);
      draft.bankNumber = String(d.bankNumber ?? '');
      draft.branchNumber = String(d.branchNumber ?? '');
      draft.accountNumber = String(d.accountNumber ?? '');
      draft.reference = String(d.reference ?? '');
      break;
    case 'Check':
      draft.dueDate = String(d.dueDate ?? line.lineDate ?? today);
      draft.bankNumber = String(d.bankNumber ?? '');
      draft.branchNumber = String(d.branchNumber ?? '');
      draft.accountNumber = String(d.accountNumber ?? '');
      draft.checkNumber = String(d.checkNumber ?? '');
      draft.duplicateChecks = d.duplicateCount != null ? String(d.duplicateCount) : '1';
      break;
    case 'CreditCard':
      draft.lastFour = String(d.lastFour ?? '');
      draft.cardType = String(d.cardType ?? 'Unknown');
      draft.transactionType = String(d.transactionType ?? 'Regular');
      draft.installments = d.installments != null ? String(d.installments) : '1';
      break;
    case 'PaymentApp':
      draft.appType = String(d.appType ?? 'BIT');
      draft.transactionNo = String(d.transactionNo ?? '');
      break;
    case 'PayPal':
      draft.payerAccount = String(d.payerAccount ?? '');
      draft.transactionNo = String(d.transactionNo ?? '');
      break;
    case 'Other':
      draft.otherType = String(d.typeName ?? 'BIT');
      draft.transactionNo = String(d.transactionNo ?? '');
      break;
    default:
      break;
  }

  return draft;
}

export function draftHasContent(d: PaymentDraftFields): boolean {
  if (d.amount.trim()) return true;
  if (d.generalDetail.trim()) return true;
  if (d.percent.trim()) return true;
  if (d.bankNumber.trim() || d.branchNumber.trim() || d.accountNumber.trim()) return true;
  if (d.reference.trim() || d.checkNumber.trim() || d.transactionNo.trim()) return true;
  return false;
}

function draftAmount(d: PaymentDraftFields): number | null {
  const n = Number(d.amount);
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : null;
}

function strEq(a: string | undefined | null, b: string | undefined | null) {
  return (a ?? '').trim() === (b ?? '').trim();
}

/** True when the draft row matches an already saved payment line (incl. tab defaults). */
export function draftMatchesSavedLine(
  tab: ReceiptPaymentTypeKey,
  draft: PaymentDraftFields,
  line: SavedPaymentLine
): boolean {
  if (line.paymentType !== tab) return false;
  const amt = draftAmount(draft);
  if (amt === null || amt !== line.amount) return false;
  if (!strEq(draft.generalDetail, line.generalDetail)) return false;

  const d = line.details;
  switch (tab) {
    case 'WithholdingTax':
      return strEq(draft.percent, d.percent != null ? String(d.percent) : '');
    case 'BankTransfer':
      return (
        strEq(draft.bankNumber, String(d.bankNumber ?? '')) &&
        strEq(draft.branchNumber, String(d.branchNumber ?? '')) &&
        strEq(draft.accountNumber, String(d.accountNumber ?? '')) &&
        strEq(draft.reference, String(d.reference ?? ''))
      );
    case 'Check':
      return (
        strEq(draft.bankNumber, String(d.bankNumber ?? '')) &&
        strEq(draft.branchNumber, String(d.branchNumber ?? '')) &&
        strEq(draft.accountNumber, String(d.accountNumber ?? '')) &&
        strEq(draft.checkNumber, String(d.checkNumber ?? ''))
      );
    case 'CreditCard':
      return (
        strEq(draft.lastFour, String(d.lastFour ?? '')) &&
        strEq(draft.cardType, String(d.cardType ?? ''))
      );
    case 'PaymentApp':
      return strEq(draft.appType, String(d.appType ?? '')) && strEq(draft.transactionNo, String(d.transactionNo ?? ''));
    case 'PayPal':
      return (
        strEq(draft.payerAccount, String(d.payerAccount ?? '')) &&
        strEq(draft.transactionNo, String(d.transactionNo ?? ''))
      );
    case 'Other':
      return strEq(draft.otherType, String(d.typeName ?? '')) && strEq(draft.transactionNo, String(d.transactionNo ?? ''));
    default:
      return true;
  }
}

/** Blocks persist when the form holds a new or changed line not yet in the table. */
export function hasUncommittedPaymentDraft(
  tab: ReceiptPaymentTypeKey,
  draft: PaymentDraftFields,
  savedLines: SavedPaymentLine[],
  editingLineId: string | null
): boolean {
  if (!draftHasContent(draft)) return false;

  if (editingLineId) {
    const line = savedLines.find((l) => l.id === editingLineId);
    if (!line) return true;
    return !draftMatchesSavedLine(tab, draft, line);
  }

  const sameType = savedLines.filter((l) => l.paymentType === tab);
  if (sameType.some((l) => draftMatchesSavedLine(tab, draft, l))) return false;

  return true;
}
