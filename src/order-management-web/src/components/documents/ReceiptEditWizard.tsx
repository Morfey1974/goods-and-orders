import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api, type TenantProfile } from '../../api/client';
import { documentsApi, type Document, type ReceiptPaymentLine } from '../../api/documents';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { RECEIPT_WIZARD_RESIZE } from '../../lib/resizablePanelKeys';
import { ISRAELI_BANKS } from '../../data/israeliBanks';
import {
  RECEIPT_PAYMENT_TABS,
  buildDetailsJson,
  buildPaymentDraft,
  draftFromSavedLine,
  emptyPaymentDraft,
  hasUncommittedPaymentDraft,
  formatLineDateDisplay,
  formatPaymentLineDetail,
  lineDateForType,
  parseDetailsJson,
  reconcileBankTransferAmounts,
  roundMoney,
  withholdingAmountFromPercent,
  type PaymentDraftFields,
  type ReceiptPaymentTypeKey,
  type SavedPaymentLine,
} from './receiptPaymentTypes';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoToDateInput(iso: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function formatMoney(n: number) {
  return `₪${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mapApiLine(line: ReceiptPaymentLine): SavedPaymentLine {
  return {
    id: line.id,
    paymentType: line.paymentType as ReceiptPaymentTypeKey,
    amount: line.amount,
    currency: line.currency,
    lineDate: line.lineDate ? isoToDateInput(line.lineDate) : '',
    generalDetail: line.generalDetail ?? '',
    details: parseDetailsJson(line.detailsJson),
  };
}

type Props = {
  open: boolean;
  receiptId: string;
  token: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onPreviewPdf?: (doc: Document) => void;
  onSendEmail?: (doc: Document) => void;
};

export function ReceiptEditWizard({
  open,
  receiptId,
  token,
  onClose,
  onSuccess,
  onPreviewPdf,
  onSendEmail,
}: Props) {
  const { t } = useTranslation();
  const { panelRef, persistSize, onResizeHandleMouseDown } = useResizablePanel(open, RECEIPT_WIZARD_RESIZE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [doc, setDoc] = useState<Document | null>(null);
  const [issueDate, setIssueDate] = useState(todayIso);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<ReceiptPaymentTypeKey>('BankTransfer');
  const [draft, setDraft] = useState<PaymentDraftFields>(() =>
    buildPaymentDraft('BankTransfer', {
      today: todayIso(),
      chargeTotal: 0,
      openBalance: 0,
    })
  );
  const [savedLines, setSavedLines] = useState<SavedPaymentLine[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(null);
  const skipTabDraftResetRef = useRef(false);

  const isDraft = doc?.status === 'Draft';
  const chargeTotal = doc?.parentChargeAmount ?? 0;
  const chargeNumber = doc?.parentChargeNumber?.replace(/^[A-Z]+-/, '') ?? '';
  const totalPaid = useMemo(() => savedLines.reduce((s, l) => s + l.amount, 0), [savedLines]);
  const openBalance = Math.max(0, roundMoney(chargeTotal - totalPaid));
  const withholdingPercent = tenantProfile?.withholdingTaxPercent ?? null;

  const draftContext = useMemo(
    () => ({
      today: issueDate || todayIso(),
      chargeTotal,
      openBalance,
      bankCode: tenantProfile?.bankCode ?? '',
      bankBranch: tenantProfile?.bankBranch ?? '',
      bankAccount: tenantProfile?.bankAccountNumber ?? '',
      withholdingPercent,
    }),
    [issueDate, chargeTotal, openBalance, tenantProfile, withholdingPercent]
  );

  const detailLabels = useMemo(
    () => ({
      bank: t('documents.receiptDetailBank'),
      branch: t('documents.receiptDetailBranch'),
      account: t('documents.receiptDetailAccount'),
      reference: t('documents.receiptDetailRef'),
      check: t('documents.receiptCheckNumber'),
      percent: t('documents.receiptPercent'),
    }),
    [t]
  );

  const handleClose = () => {
    persistSize();
    onClose();
  };

  useEffect(() => {
    if (!open || !token) return;
    api.getProfile(token).then(setTenantProfile).catch(() => setTenantProfile(null));
  }, [open, token]);

  useEffect(() => {
    if (!open || !token || !receiptId) return;
    setLoading(true);
    setError('');
    documentsApi
      .get(token, receiptId)
      .then((loaded) => {
        if (loaded.documentType !== 'Receipt') {
          throw new Error(t('documents.receiptEditWrongType'));
        }
        const parts = (loaded.description ?? '').split('\n\n');
        const date = isoToDateInput(loaded.issueDate) || todayIso();
        setDoc(loaded);
        setIssueDate(date);
        setDescription(parts[0] ?? '');
        setNotes(parts.slice(1).join('\n\n'));
        const lines = reconcileBankTransferAmounts(
          (loaded.paymentLines ?? []).map(mapApiLine),
          loaded.parentChargeAmount ?? 0
        );
        setSavedLines(lines);
        setVersion(loaded.version);
        const paid = lines.reduce((s, l) => s + l.amount, 0);
        const balance = Math.max(0, roundMoney((loaded.parentChargeAmount ?? 0) - paid));
        setDraft(
          buildPaymentDraft('BankTransfer', {
            today: date,
            chargeTotal: loaded.parentChargeAmount ?? 0,
            openBalance: balance,
            bankCode: '',
            bankBranch: '',
            bankAccount: '',
            withholdingPercent: null,
          })
        );
        setActiveTab('BankTransfer');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setLoading(false));
  }, [open, token, receiptId, t]);

  useEffect(() => {
    if (!open || !isDraft || loading) return;
    if (skipTabDraftResetRef.current) {
      skipTabDraftResetRef.current = false;
      return;
    }
    setEditingLineId(null);
    setDraft(buildPaymentDraft(activeTab, draftContext));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when payment tab changes
  }, [activeTab]);

  useEffect(() => {
    if (!open || !isDraft || loading || !tenantProfile) return;
    setDraft(buildPaymentDraft(activeTab, draftContext));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply bank / withholding defaults once profile loads
  }, [tenantProfile?.id]);

  const setDraftField = <K extends keyof PaymentDraftFields>(key: K, value: PaymentDraftFields[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'percent' && activeTab === 'WithholdingTax') {
        const pct = Number(value);
        if (Number.isFinite(pct) && pct > 0 && chargeTotal > 0) {
          next.amount = String(withholdingAmountFromPercent(chargeTotal, pct));
        }
      }
      return next;
    });
  };

  const applySavedLines = (lines: SavedPaymentLine[]) => {
    const next = reconcileBankTransferAmounts(lines, chargeTotal);
    const paid = next.reduce((s, l) => s + l.amount, 0);
    const balance = Math.max(0, roundMoney(chargeTotal - paid));
    setSavedLines(next);
    setDraft(buildPaymentDraft(activeTab, { ...draftContext, openBalance: balance }));
    return next;
  };

  const validateDraft = (): string | null => {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return t('documents.receiptAmountRequired');

    if (activeTab === 'Check' && !draft.bankNumber.trim()) return t('documents.receiptBankRequired');
    if (activeTab === 'Check' && !draft.checkNumber.trim()) return t('documents.receiptCheckRequired');

    if (activeTab === 'WithholdingTax') {
      const pct = Number(draft.percent);
      if (!Number.isFinite(pct) || pct <= 0) return t('documents.receiptPercentRequired');
    }

    return null;
  };

  const onSaveLine = () => {
    const err = validateDraft();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    const amount = Math.round(Number(draft.amount) * 100) / 100;
    const details = buildDetailsJson(activeTab, draft);
    const line: SavedPaymentLine = {
      id: editingLineId ?? crypto.randomUUID(),
      paymentType: activeTab,
      amount,
      currency: draft.currency,
      lineDate: lineDateForType(activeTab, draft),
      generalDetail: draft.generalDetail.trim(),
      details,
    };
    const baseLines = editingLineId
      ? savedLines.filter((l) => l.id !== editingLineId)
      : savedLines;
    const merged = editingLineId ? baseLines.map((l) => (l.id === editingLineId ? line : l)) : [...baseLines, line];
    applySavedLines(merged);
    setEditingLineId(null);
    setDraft(emptyPaymentDraft(issueDate || todayIso()));
  };

  const onEditLine = (line: SavedPaymentLine) => {
    skipTabDraftResetRef.current = true;
    setEditingLineId(line.id);
    setActiveTab(line.paymentType);
    setDraft(draftFromSavedLine(line, issueDate || todayIso()));
    setError('');
  };

  const onRemoveLine = (id: string) => {
    if (editingLineId === id) setEditingLineId(null);
    applySavedLines(savedLines.filter((l) => l.id !== id));
  };

  const linesForPersist = (): SavedPaymentLine[] | null => {
    if (hasUncommittedPaymentDraft(activeTab, draft, savedLines, editingLineId)) {
      setError(t('documents.receiptUnsavedLine'));
      return null;
    }
    if (savedLines.length === 0) {
      setError(t('documents.receiptNoLines'));
      return null;
    }
    return reconcileBankTransferAmounts(savedLines, chargeTotal);
  };

  const persistReceipt = async (finalize: boolean): Promise<boolean> => {
    if (!doc || !isDraft) return false;
    const linesToSave = linesForPersist();
    if (!linesToSave) return false;

    setBusy(true);
    setError('');
    setInfoMessage('');
    try {
      const fullDescription = notes.trim()
        ? `${description.trim()}\n\n${notes.trim()}`.trim()
        : description.trim();
      const updated = await documentsApi.saveReceipt(token, doc.id, {
        description: fullDescription || undefined,
        issueDate: new Date(issueDate).toISOString(),
        version,
        paymentLines: linesToSave.map((l) => ({
          paymentType: l.paymentType,
          amount: l.amount,
          currency: l.currency,
          lineDate: l.lineDate ? new Date(l.lineDate).toISOString() : undefined,
          generalDetail: l.generalDetail || undefined,
          detailsJson: JSON.stringify(l.details),
        })),
        finalize,
      });
      const synced = reconcileBankTransferAmounts(
        (updated.paymentLines ?? []).map(mapApiLine),
        chargeTotal
      );
      setSavedLines(synced);
      setDoc(updated);
      setVersion(updated.version);
      if (!finalize) {
        setInfoMessage(t('documents.draftSaved'));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSaveDraft = () => void persistReceipt(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!doc || !isDraft) return;
    const ok = await persistReceipt(true);
    if (ok) onSuccess(t('documents.receiptSaved'));
  };

  const renderField = (
    label: string,
    node: ReactNode,
    required = false,
    sizeClass = 'receipt-pay-field--md'
  ) => (
    <label className={`receipt-pay-field ${sizeClass}`}>
      <span className="receipt-pay-label">
        {label}
        {required && <span className="receipt-required">*</span>}
      </span>
      {node}
    </label>
  );

  const renderTabFields = () => {
    switch (activeTab) {
      case 'WithholdingTax':
        return (
          <>
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--detail'
            )}
            {renderField(
              t('documents.receiptPercent'),
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={draft.percent}
                onChange={(e) => setDraftField('percent', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--pct'
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true,
              'receipt-pay-field--amount'
            )}
          </>
        );
      case 'BankTransfer':
        return (
          <>
            {renderField(
              t('documents.receiptDepositDate'),
              <input
                type="date"
                value={draft.depositDate}
                onChange={(e) => setDraftField('depositDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptBankNumber'),
              <select
                value={draft.bankNumber}
                onChange={(e) => setDraftField('bankNumber', e.target.value)}
                disabled={!isDraft}
              >
                <option value="">—</option>
                {ISRAELI_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code}
                  </option>
                ))}
              </select>,
              false,
              'receipt-pay-field--bank'
            )}
            {renderField(
              t('documents.receiptBranchNumber'),
              <input
                type="text"
                inputMode="numeric"
                value={draft.branchNumber}
                onChange={(e) => setDraftField('branchNumber', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--branch'
            )}
            {renderField(
              t('documents.receiptAccountNumber'),
              <input
                type="text"
                inputMode="numeric"
                value={draft.accountNumber}
                onChange={(e) => setDraftField('accountNumber', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--account'
            )}
            {renderField(
              t('documents.receiptReference'),
              <input
                type="text"
                value={draft.reference}
                onChange={(e) => setDraftField('reference', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--ref'
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--detail'
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true,
              'receipt-pay-field--amount'
            )}
          </>
        );
      case 'Check':
        return (
          <>
            {renderField(
              t('documents.receiptDueDate'),
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraftField('dueDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptAccountNumber'),
              <input
                type="text"
                value={draft.accountNumber}
                onChange={(e) => setDraftField('accountNumber', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--account'
            )}
            {renderField(
              t('documents.receiptBranchNumber'),
              <input
                type="text"
                value={draft.branchNumber}
                onChange={(e) => setDraftField('branchNumber', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--branch'
            )}
            {renderField(
              t('documents.receiptBankNumber'),
              <select
                value={draft.bankNumber}
                onChange={(e) => setDraftField('bankNumber', e.target.value)}
                disabled={!isDraft}
              >
                <option value="">—</option>
                {ISRAELI_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code}
                  </option>
                ))}
              </select>,
              true,
              'receipt-pay-field--bank'
            )}
            {renderField(
              t('documents.receiptCheckNumber'),
              <input
                type="text"
                value={draft.checkNumber}
                onChange={(e) => setDraftField('checkNumber', e.target.value)}
                disabled={!isDraft}
              />,
              true,
              'receipt-pay-field--ref'
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--detail'
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true,
              'receipt-pay-field--amount'
            )}
            {renderField(
              t('documents.receiptDuplicateChecks'),
              <input
                type="number"
                min={1}
                step={1}
                value={draft.duplicateChecks}
                onChange={(e) => setDraftField('duplicateChecks', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--pct'
            )}
          </>
        );
      case 'CreditCard':
        return (
          <>
            {renderField(
              t('documents.receiptLineDate'),
              <input
                type="date"
                value={draft.lineDate}
                onChange={(e) => setDraftField('lineDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptCardLastFour'),
              <input
                type="text"
                maxLength={4}
                placeholder={t('documents.receiptCardLastFourHint')}
                value={draft.lastFour}
                onChange={(e) => setDraftField('lastFour', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--digits'
            )}
            {renderField(
              t('documents.receiptCardType'),
              <select
                value={draft.cardType}
                onChange={(e) => setDraftField('cardType', e.target.value)}
                disabled={!isDraft}
              >
                <option value="Unknown">{t('documents.receiptCardUnknown')}</option>
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="Amex">Amex</option>
                <option value="Isracard">Isracard</option>
              </select>,
              false,
              'receipt-pay-field--md'
            )}
            {renderField(
              t('documents.receiptTransactionType'),
              <select
                value={draft.transactionType}
                onChange={(e) => setDraftField('transactionType', e.target.value)}
                disabled={!isDraft}
              >
                <option value="Regular">{t('documents.receiptTxnRegular')}</option>
                <option value="Installments">{t('documents.receiptTxnInstallments')}</option>
              </select>,
              false,
              'receipt-pay-field--md'
            )}
            {renderField(
              t('documents.receiptInstallments'),
              <input
                type="number"
                min={1}
                step={1}
                value={draft.installments}
                onChange={(e) => setDraftField('installments', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--pct'
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--detail'
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true,
              'receipt-pay-field--amount'
            )}
          </>
        );
      case 'PaymentApp':
        return (
          <>
            {renderField(
              t('documents.receiptLineDate'),
              <input
                type="date"
                value={draft.lineDate}
                onChange={(e) => setDraftField('lineDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptAppType'),
              <select
                value={draft.appType}
                onChange={(e) => setDraftField('appType', e.target.value)}
                disabled={!isDraft}
              >
                <option value="BIT">BIT</option>
                <option value="PayBox">PayBox</option>
                <option value="Pepper Pay">Pepper Pay</option>
              </select>
            )}
            {renderField(
              t('documents.receiptTransactionNo'),
              <input
                type="text"
                value={draft.transactionNo}
                onChange={(e) => setDraftField('transactionNo', e.target.value)}
                disabled={!isDraft}
              />
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--detail'
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true,
              'receipt-pay-field--amount'
            )}
          </>
        );
      case 'PayPal':
        return (
          <>
            {renderField(
              t('documents.receiptLineDate'),
              <input
                type="date"
                value={draft.lineDate}
                onChange={(e) => setDraftField('lineDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptPayerAccount'),
              <input
                type="text"
                value={draft.payerAccount}
                onChange={(e) => setDraftField('payerAccount', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--md'
            )}
            {renderField(
              t('documents.receiptTransactionNo'),
              <input
                type="text"
                value={draft.transactionNo}
                onChange={(e) => setDraftField('transactionNo', e.target.value)}
                disabled={!isDraft}
              />
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true
            )}
          </>
        );
      case 'Cash':
        return (
          <>
            {renderField(
              t('documents.receiptLineDate'),
              <input
                type="date"
                value={draft.lineDate}
                onChange={(e) => setDraftField('lineDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true
            )}
          </>
        );
      case 'Other':
        return (
          <>
            {renderField(
              t('documents.receiptLineDate'),
              <input
                type="date"
                value={draft.lineDate}
                onChange={(e) => setDraftField('lineDate', e.target.value)}
                disabled={!isDraft}
              />,
              false,
              'receipt-pay-field--date'
            )}
            {renderField(
              t('documents.receiptOtherType'),
              <select
                value={draft.otherType}
                onChange={(e) => setDraftField('otherType', e.target.value)}
                disabled={!isDraft}
              >
                <option value="BIT">BIT</option>
                <option value="PayBox">PayBox</option>
                <option value="Other">{t('documents.receiptPayOther')}</option>
              </select>
            )}
            {renderField(
              t('documents.receiptTransactionNo'),
              <input
                type="text"
                value={draft.transactionNo}
                onChange={(e) => setDraftField('transactionNo', e.target.value)}
                disabled={!isDraft}
              />
            )}
            {renderField(
              t('documents.receiptGeneralDetail'),
              <input
                type="text"
                value={draft.generalDetail}
                onChange={(e) => setDraftField('generalDetail', e.target.value)}
                disabled={!isDraft}
              />
            )}
            {renderField(
              t('documents.colAmount'),
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.amount}
                onChange={(e) => setDraftField('amount', e.target.value)}
                disabled={!isDraft}
              />,
              true
            )}
          </>
        );
      default:
        return null;
    }
  };

  if (!open) return null;

  const titleNum = doc?.documentNumber.replace(/^[A-Z]+-/, '') ?? '';

  return createPortal(
    <div className="doc-wizard-overlay doc-wizard-overlay--form" role="presentation">
      <div className="doc-wizard-form-shell">
      <div
        ref={panelRef}
        className="doc-wizard doc-wizard--form receipt-wizard-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-wizard-title"
      >
        <header className="doc-wizard-header receipt-wizard-header">
          <button type="button" className="doc-wizard-back" onClick={handleClose} aria-label={t('settings.cancel')}>
            ←
          </button>
          <div className="receipt-wizard-title-wrap">
            <h1 id="receipt-wizard-title">
              {t('documents.types.Receipt')} {titleNum}
            </h1>
            {doc && (
              <p className="muted receipt-wizard-sub">
                {doc.customerName}
                {chargeNumber ? ` · ${t('documents.receiptFromCharge', { number: chargeNumber })}` : ''}
              </p>
            )}
          </div>
        </header>

        {loading ? (
          <p className="doc-wizard-loading">{t('documents.loading')}</p>
        ) : (
          <div className="doc-wizard-body">
          <form
            id="receipt-wizard-form"
            className="doc-wizard-form receipt-wizard-form"
            onSubmit={onSubmit}
            noValidate
          >
            {error && <div className="error-banner doc-wizard-error">{error}</div>}
            {infoMessage && <div className="success-banner doc-wizard-error">{infoMessage}</div>}

            <section className="doc-panel">
              <div className="doc-panel-grid">
                <label>
                  <span className="doc-panel-label">{t('documents.colDate')}</span>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    disabled={!isDraft}
                  />
                </label>
                <label>
                  <span className="doc-panel-label">{t('documents.receiptCurrency')}</span>
                  <input type="text" value="₪ ILS" readOnly disabled />
                </label>
                <label className="doc-field-block" style={{ gridColumn: '1 / -1' }}>
                  <span className="doc-panel-label">{t('documents.contentDescriptionHint')}</span>
                  <textarea
                    className="doc-textarea"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isDraft}
                  />
                </label>
              </div>
            </section>

            <section className="doc-panel receipt-pay-panel">
              <h2 className="receipt-pay-title">{t('documents.receiptHowPaid')}</h2>
              <div className="receipt-pay-tabs" role="tablist">
                {RECEIPT_PAYMENT_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={`receipt-pay-tab${activeTab === tab ? ' is-active' : ''}`}
                    onClick={() => {
                      if (tab !== activeTab) setEditingLineId(null);
                      setActiveTab(tab);
                    }}
                  >
                    {t(`documents.receiptPay.${tab}`)}
                  </button>
                ))}
              </div>

              {isDraft && (
                <div className="receipt-pay-entry">
                  {activeTab === 'BankTransfer' && (
                    <p className="receipt-pay-hint">{t('documents.receiptBankTransferHint')}</p>
                  )}
                  <div className="receipt-pay-row">
                    {renderTabFields()}
                    <label className="receipt-pay-field receipt-pay-field--currency">
                      <span className="receipt-pay-label">{t('documents.receiptCurrency')}</span>
                      <select
                        value={draft.currency}
                        onChange={(e) => setDraftField('currency', e.target.value)}
                      >
                        <option value="ILS">₪ {t('documents.receiptShekel')}</option>
                      </select>
                    </label>
                    <div className="receipt-pay-field receipt-pay-field--save">
                      <span className="receipt-pay-label" aria-hidden>
                        &nbsp;
                      </span>
                      <button type="button" className="btn btn-primary receipt-save-line-btn" onClick={onSaveLine}>
                        {editingLineId ? t('documents.receiptUpdateLine') : t('documents.receiptSaveLine')}
                      </button>
                    </div>
                  </div>
                  <p className="receipt-save-line-hint">{t('documents.receiptSaveLineHint')}</p>
                </div>
              )}

              {savedLines.length === 0 ? (
                <p className="muted receipt-no-lines">{t('documents.receiptNoLinesYet')}</p>
              ) : (
                <div className="receipt-lines-table-wrap">
                  <table className="receipt-lines-table">
                    <thead>
                      <tr>
                        <th className="receipt-lines-col-num">#</th>
                        <th>{t('documents.receiptColLineDate')}</th>
                        <th>{t('documents.receiptColPayType')}</th>
                        <th className="receipt-lines-col-detail">{t('documents.receiptColDetail')}</th>
                        <th className="receipt-lines-col-amount">{t('documents.colAmount')}</th>
                        {isDraft && <th className="receipt-lines-col-actions" />}
                      </tr>
                    </thead>
                    <tbody>
                      {savedLines.map((line, index) => (
                        <tr key={line.id} className={editingLineId === line.id ? 'is-editing' : undefined}>
                          <td className="receipt-lines-col-num">{index + 1}</td>
                          <td>{formatLineDateDisplay(line.lineDate)}</td>
                          <td>{t(`documents.receiptPay.${line.paymentType}`)}</td>
                          <td className="receipt-lines-col-detail">
                            {formatPaymentLineDetail(line, detailLabels)}
                          </td>
                          <td className="receipt-lines-col-amount">{formatMoney(line.amount)}</td>
                          {isDraft && (
                            <td className="receipt-lines-col-actions">
                              <div className="receipt-lines-row-actions">
                                <button
                                  type="button"
                                  className="doc-line-edit"
                                  onClick={() => onEditLine(line)}
                                  aria-label={t('documents.editLine')}
                                  title={t('documents.editLine')}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className="doc-line-remove"
                                  onClick={() => onRemoveLine(line.id)}
                                  aria-label={t('documents.removeLine')}
                                  title={t('documents.removeLine')}
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="receipt-pay-footer">
                <aside className="receipt-summary-box">
                  <div className="receipt-summary-row">
                    <span>{t('documents.receiptTotalPaid')}</span>
                    <strong>{formatMoney(totalPaid)}</strong>
                  </div>
                  {chargeTotal > 0 && (
                    <div className="receipt-summary-row receipt-summary-open">
                      <span>
                        {t('documents.receiptOpenBalance', { number: chargeNumber })}
                      </span>
                      <strong>{formatMoney(openBalance)}</strong>
                    </div>
                  )}
                </aside>
                <label className="doc-field-block receipt-notes-block">
                  <span className="doc-panel-label">{t('documents.receiptNotes')}</span>
                  <textarea
                    className="doc-textarea"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!isDraft}
                    placeholder={t('documents.receiptNotesHint')}
                  />
                </label>
              </div>
            </section>
          </form>
          </div>
        )}

        {!loading && (
          <footer className="doc-wizard-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={handleClose} disabled={busy}>
              {t('settings.cancel')}
            </button>
            {doc && onSendEmail && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => onSendEmail(doc)}
              >
                {t('documents.sendByEmail')}
              </button>
            )}
            {doc && onPreviewPdf && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => onPreviewPdf(doc)}
              >
                {t('documents.previewPdf')}
              </button>
            )}
            {isDraft && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={onSaveDraft}
              >
                {busy ? t('documents.loading') : t('documents.saveDraft')}
              </button>
            )}
            {isDraft && (
              <button
                type="submit"
                className="btn btn-primary"
                form="receipt-wizard-form"
                disabled={busy}
              >
                {busy ? t('documents.loading') : t('documents.receiptFinalize')}
              </button>
            )}
          </footer>
        )}
        <div className="app-modal__resize-gutter" aria-hidden />
        <div
          className="app-modal__resize-handle"
          aria-hidden
          onMouseDown={onResizeHandleMouseDown}
          title={t('common.resizeModal')}
        />
      </div>
      </div>
    </div>,
    document.body
  );
}
