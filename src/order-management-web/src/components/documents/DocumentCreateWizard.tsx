import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { catalogApi, type Product } from '../../api/catalog';
import { documentsApi, type Document } from '../../api/documents';
import { documentSequencesApi } from '../../api/documentSequences';
import { productGroupsApi, type ProductGroup } from '../../api/productGroups';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { DOCUMENT_PRODUCT_PICKER_RESIZE, DOCUMENT_WIZARD_RESIZE } from '../../lib/resizablePanelKeys';
import { mergeRefs } from '../../lib/mergeRefs';
import { bidiAutoInput } from '../BidiText';
import {
  finalizePriceDraft,
  normalizeStockQuantity,
  sanitizePriceDraft,
  sanitizeQuantityDraft,
} from '../../lib/stockQuantity';
import {
  PurchaseReceiptProductPickerModal,
  type PickedReceiptProduct,
} from '../purchaseReceipts/PurchaseReceiptProductPickerModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { DateInput } from '../DateInput';
import { isoToDateInput, todayDateInput } from '../../lib/dateInput';

export type WizardDocumentType = 'Quote' | 'ChargeInvoice';

type CustomerOption = { id: string; name: string };

type DraftLine = {
  key: string;
  productId: string;
  description: string;
  quantity: number;
  /** Editable price text — empty while the user clears the field. */
  unitPrice: string;
};

type Props = {
  open: boolean;
  documentType: WizardDocumentType;
  token: string;
  customers: CustomerOption[];
  products: Product[];
  /** When set, wizard opens in edit mode for an existing document. */
  editDocumentId?: string | null;
  /** When set, prefill form from this document and create on save (duplicate draft). */
  duplicateFromDocumentId?: string | null;
  /** When set, prefill form from this quote and link parent on first save (no server draft until save). */
  chargeFromQuoteId?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onDraftSaved?: () => void;
  onCustomersUpdated: () => void;
  onSendEmail?: (doc: Document) => void;
  onPreviewPdf?: (doc: Document) => void;
};

type DiscountKind = 'percent' | 'amount';

function sequenceKindForDocumentType(documentType: WizardDocumentType): string {
  return documentType === 'Quote' ? 'Quote' : 'ChargeInvoice';
}

function stripDocumentNumberPrefix(documentNumber: string): string {
  return documentNumber.replace(/^[A-Z]+-/, '');
}

function loadDocumentIntoForm(doc: Document, options?: { forDuplicate?: boolean }) {
  const forDuplicate = options?.forDuplicate ?? false;
  const parts = (doc.description ?? '').split('\n\n');
  const mainDesc = parts[0] ?? '';
  const extraNotes = parts.slice(1).join('\n\n');
  const loadedLines: DraftLine[] = doc.lines.map((l) => ({
    key: forDuplicate ? crypto.randomUUID() : l.id,
    productId: l.productId ?? '',
    description: l.description,
    quantity: l.quantity,
    unitPrice: String(l.unitPrice),
  }));
  let showDiscount = false;
  let discountKind: DiscountKind = 'percent';
  let discountValue = 0;
  if (doc.discountPercent && doc.discountPercent > 0) {
    showDiscount = true;
    discountKind = 'percent';
    discountValue = doc.discountPercent;
  } else if (doc.discountAmount && doc.discountAmount > 0) {
    showDiscount = true;
    discountKind = 'amount';
    discountValue = doc.discountAmount;
  }
  return {
    customer: { id: doc.customerId, name: doc.customerName },
    issueDate: isoToDateInput(doc.issueDate),
    dueDate: doc.dueDate ? isoToDateInput(doc.dueDate) : '',
    description: mainDesc,
    notes: extraNotes,
    lines: loadedLines,
    showDiscount,
    discountKind,
    discountValue,
    version: doc.version,
    title: forDuplicate ? '' : doc.documentNumber,
  };
}

const todayIso = todayDateInput;

type FormSnapshot = {
  customerId: string;
  issueDate: string;
  dueDate: string;
  description: string;
  notes: string;
  lines: { productId: string; description: string; quantity: number; unitPrice: number }[];
  showDiscount: boolean;
  discountKind: DiscountKind;
  discountValue: number;
  clientOrderReceivedAt: string;
  clientOrderReference: string;
  clientOrderFileName: string;
  pendingClientOrderFileName: string;
};

function lineToSnapshot(
  line: { productId?: string; description: string; quantity: number; unitPrice: number | string },
  products?: { id: string; name: string }[]
): FormSnapshot['lines'][number] {
  const productId = line.productId ?? '';
  const quantity = normalizeStockQuantity(line.quantity);
  const unitPrice = finalizePriceDraft(
    typeof line.unitPrice === 'number' ? String(line.unitPrice) : line.unitPrice
  );
  const trimmed = line.description.trim();
  const description =
    trimmed ||
    (productId && products ? products.find((p) => p.id === productId)?.name ?? '' : '');
  return { productId, description, quantity, unitPrice };
}

function emptyFormSnapshot(issueDate: string): FormSnapshot {
  return {
    customerId: '',
    issueDate,
    dueDate: '',
    description: '',
    notes: '',
    lines: [],
    showDiscount: false,
    discountKind: 'percent',
    discountValue: 0,
    clientOrderReceivedAt: '',
    clientOrderReference: '',
    clientOrderFileName: '',
    pendingClientOrderFileName: '',
  };
}

function snapshotFromLoaded(
  loaded: ReturnType<typeof loadDocumentIntoForm>,
  clientOrder?: Pick<Document, 'clientOrderReceivedAt' | 'clientOrderReference' | 'clientOrderFileName'>,
  products?: { id: string; name: string }[]
): FormSnapshot {
  return {
    customerId: loaded.customer.id,
    issueDate: loaded.issueDate,
    dueDate: loaded.dueDate,
    description: loaded.description,
    notes: loaded.notes,
    lines: loaded.lines.map((l) => lineToSnapshot(l, products)),
    showDiscount: loaded.showDiscount,
    discountKind: loaded.discountKind,
    discountValue: loaded.discountValue,
    clientOrderReceivedAt: clientOrder?.clientOrderReceivedAt
      ? isoToDateInput(clientOrder.clientOrderReceivedAt)
      : '',
    clientOrderReference: clientOrder?.clientOrderReference ?? '',
    clientOrderFileName: clientOrder?.clientOrderFileName ?? '',
    pendingClientOrderFileName: '',
  };
}

function isEmptyFormSnapshot(snapshot: FormSnapshot): boolean {
  return (
    !snapshot.customerId &&
    !snapshot.description.trim() &&
    !snapshot.notes.trim() &&
    snapshot.lines.length === 0 &&
    !snapshot.showDiscount &&
    snapshot.discountValue <= 0 &&
    !snapshot.clientOrderReceivedAt &&
    !snapshot.clientOrderReference.trim() &&
    !snapshot.clientOrderFileName &&
    !snapshot.pendingClientOrderFileName
  );
}

function serializeSnapshot(snapshot: FormSnapshot): string {
  return JSON.stringify(snapshot);
}

function parseSnapshot(json: string): FormSnapshot {
  return JSON.parse(json) as FormSnapshot;
}

function draftFromPicked(p: PickedReceiptProduct): DraftLine {
  return {
    key: crypto.randomUUID(),
    productId: p.product.id,
    description: p.product.name,
    quantity: p.quantity,
    unitPrice: String(p.unitPrice ?? p.product.unitPrice),
  };
}

function draftEmptyTextLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    productId: '',
    description: '',
    quantity: 1,
    unitPrice: '',
  };
}

function isPersistableLine(line: DraftLine): boolean {
  const qty = normalizeStockQuantity(line.quantity);
  if (qty <= 0) return false;
  if (line.productId) return true;
  const price = finalizePriceDraft(line.unitPrice);
  return line.description.trim().length > 0 && price > 0;
}

function toLinePayload(
  line: DraftLine,
  products: { id: string; name: string }[]
): {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
} {
  const productId = line.productId || undefined;
  const quantity = normalizeStockQuantity(line.quantity);
  const unitPrice = finalizePriceDraft(line.unitPrice);
  const description =
    line.description.trim() ||
    (productId ? products.find((p) => p.id === productId)?.name : '') ||
    '';
  return {
    ...(productId ? { productId } : {}),
    description,
    quantity,
    unitPrice,
  };
}

function formatMoney(n: number) {
  return `₪${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DocumentCreateWizard({
  open,
  documentType,
  token,
  customers,
  products,
  editDocumentId = null,
  duplicateFromDocumentId = null,
  chargeFromQuoteId = null,
  onClose,
  onSuccess,
  onDraftSaved,
  onCustomersUpdated,
  onSendEmail,
  onPreviewPdf,
}: Props) {
  const { t } = useTranslation();
  const formWizardRef = useRef<HTMLDivElement>(null);
  const clientOrderFileInputRef = useRef<HTMLInputElement>(null);
  const savedSnapshotRef = useRef<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(products);
  const [customerId, setCustomerId] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerBusy, setNewCustomerBusy] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [persistedDocId, setPersistedDocId] = useState<string | null>(null);
  const [parentQuoteId, setParentQuoteId] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountKind, setDiscountKind] = useState<DiscountKind>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [editVersion, setEditVersion] = useState(1);
  const [editTitle, setEditTitle] = useState('');
  /** Next free number from counter — preview only until first save allocates it. */
  const [previewNumber, setPreviewNumber] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [clientOrderReceivedAt, setClientOrderReceivedAt] = useState('');
  const [clientOrderReference, setClientOrderReference] = useState('');
  const [clientOrderFileName, setClientOrderFileName] = useState('');
  const [pendingClientOrderFile, setPendingClientOrderFile] = useState<File | null>(null);
  const [clientOrderBusy, setClientOrderBusy] = useState(false);

  useEffect(() => {
    setCatalogProducts(products);
  }, [products]);

  useEffect(() => {
    if (!open || !token) return;
    productGroupsApi
      .list(token)
      .then(setProductGroups)
      .catch(() => setProductGroups([]));
  }, [open, token]);

  useEffect(() => {
    if (!open || !token || editDocumentId) return;
    const kind = sequenceKindForDocumentType(documentType);
    documentSequencesApi
      .list(token)
      .then((seqs) => {
        const seq = seqs.find((s) => s.kind === kind);
        setPreviewNumber(seq?.preview ?? '');
      })
      .catch(() => setPreviewNumber(''));
  }, [open, token, documentType, editDocumentId]);

  const isEdit = Boolean(editDocumentId);
  const isDuplicateDraft = Boolean(duplicateFromDocumentId && !persistedDocId);
  const effectiveDocId = editDocumentId ?? persistedDocId;
  const canPreviewPdf = Boolean(effectiveDocId && editDoc);

  const captureSnapshot = useCallback((): string => {
    const validLines = lines.filter(isPersistableLine);
    return serializeSnapshot({
      customerId,
      issueDate,
      dueDate,
      description,
      notes,
      lines: validLines.map((l) => lineToSnapshot(l, products)),
      showDiscount,
      discountKind,
      discountValue,
      clientOrderReceivedAt,
      clientOrderReference,
      clientOrderFileName,
      pendingClientOrderFileName: pendingClientOrderFile?.name ?? '',
    });
  }, [
    customerId,
    issueDate,
    dueDate,
    description,
    notes,
    lines,
    products,
    showDiscount,
    discountKind,
    discountValue,
    clientOrderReceivedAt,
    clientOrderReference,
    clientOrderFileName,
    pendingClientOrderFile,
  ]);

  const isFormDirty = useCallback(() => {
    const saved = savedSnapshotRef.current;
    if (saved === null) return false;
    return captureSnapshot() !== saved;
  }, [captureSnapshot]);

  const applyLoadedDocument = (
    loaded: ReturnType<typeof loadDocumentIntoForm>,
    options?: { issueDateToday?: boolean }
  ) => {
    setCustomerId(loaded.customer.id);
    setIssueDate(options?.issueDateToday ? todayIso() : loaded.issueDate || todayIso());
    setDueDate(loaded.dueDate);
    setDescription(loaded.description);
    setNotes(loaded.notes);
    setLines(loaded.lines);
    setShowDiscount(loaded.showDiscount);
    setDiscountKind(loaded.discountKind);
    setDiscountValue(loaded.discountValue);
    setEditVersion(loaded.version);
    setEditTitle(loaded.title);
  };

  const applyClientOrderFromDoc = (doc: Document) => {
    setClientOrderReceivedAt(doc.clientOrderReceivedAt ? isoToDateInput(doc.clientOrderReceivedAt) : '');
    setClientOrderReference(doc.clientOrderReference ?? '');
    setClientOrderFileName(doc.clientOrderFileName ?? '');
    setPendingClientOrderFile(null);
  };

  useEffect(() => {
    if (!open) {
      savedSnapshotRef.current = null;
      return;
    }
    setError('');
    if (editDocumentId && token) {
      setLoadingEdit(true);
      setParentQuoteId(null);
      documentsApi
        .get(token, editDocumentId)
        .then((doc) => {
          const loaded = loadDocumentIntoForm(doc);
          setEditDoc(doc);
          applyLoadedDocument(loaded);
          applyClientOrderFromDoc(doc);
          savedSnapshotRef.current = serializeSnapshot(snapshotFromLoaded(loaded, doc, products));
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
        .finally(() => setLoadingEdit(false));
      return;
    }
    if (duplicateFromDocumentId && token) {
      setLoadingEdit(true);
      setParentQuoteId(null);
      documentsApi
        .get(token, duplicateFromDocumentId)
        .then((doc) => {
          const loaded = loadDocumentIntoForm(doc, { forDuplicate: true });
          applyLoadedDocument(loaded, { issueDateToday: true });
          setEditTitle('');
          setEditDoc(null);
          setPersistedDocId(null);
          savedSnapshotRef.current = serializeSnapshot(
            snapshotFromLoaded({ ...loaded, issueDate: todayIso() }, undefined, products)
          );
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
        .finally(() => setLoadingEdit(false));
      return;
    }
    if (chargeFromQuoteId && token) {
      setLoadingEdit(true);
      setParentQuoteId(chargeFromQuoteId);
      documentsApi
        .get(token, chargeFromQuoteId)
        .then((quote) => {
          if (quote.documentType !== 'Quote') {
            throw new Error(t('documents.issueChargeWrongSource'));
          }
          const loaded = loadDocumentIntoForm(quote, { forDuplicate: true });
          applyLoadedDocument(loaded);
          applyClientOrderFromDoc(quote);
          setEditTitle('');
          setEditDoc(null);
          setPersistedDocId(null);
          savedSnapshotRef.current = serializeSnapshot(snapshotFromLoaded(loaded, quote, products));
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
        .finally(() => setLoadingEdit(false));
      return;
    }
    const freshIssueDate = todayIso();
    setParentQuoteId(null);
    setCustomerId('');
    setNewCustomerOpen(false);
    setNewCustomerName('');
    setIssueDate(freshIssueDate);
    setDueDate('');
    setDescription('');
    setNotes('');
    setLines([]);
    setShowDiscount(false);
    setDiscountKind('percent');
    setDiscountValue(0);
    setEditVersion(1);
    setEditTitle('');
    setPreviewNumber('');
    setEditDoc(null);
    setPersistedDocId(null);
    setInfoMessage('');
    setClientOrderReceivedAt('');
    setClientOrderReference('');
    setClientOrderFileName('');
    setPendingClientOrderFile(null);
    savedSnapshotRef.current = serializeSnapshot(emptyFormSnapshot(freshIssueDate));
  }, [open, documentType, editDocumentId, duplicateFromDocumentId, chargeFromQuoteId, token, products, t]);

  const formVisible = open;
  const { panelRef, persistSize, onResizeHandleMouseDown } = useResizablePanel(
    formVisible,
    DOCUMENT_WIZARD_RESIZE
  );

  const abandonBlankDraftIfNeeded = useCallback(async () => {
    if (!token) return;
    const docId = persistedDocId;
    if (!docId || editDocumentId) return;
    const snapshot = parseSnapshot(captureSnapshot());
    if (!isEmptyFormSnapshot(snapshot)) return;
    try {
      await documentsApi.delete(token, docId);
      onDraftSaved?.();
    } catch {
      /* list refresh is best-effort */
    }
  }, [token, persistedDocId, editDocumentId, captureSnapshot, onDraftSaved]);

  const handleClose = () => {
    persistSize();
    void abandonBlankDraftIfNeeded();
    onClose();
  };

  const requestClose = () => {
    if (!isFormDirty()) {
      handleClose();
      return;
    }
    setCloseConfirmOpen(true);
  };

  const lineTotals = useMemo(
    () => lines.map((l) => l.quantity * finalizePriceDraft(l.unitPrice)),
    [lines]
  );
  const subtotal = useMemo(() => lineTotals.reduce((a, b) => a + b, 0), [lineTotals]);

  const discountTotal = useMemo(() => {
    if (!showDiscount || discountValue <= 0) return 0;
    if (discountKind === 'percent') {
      return Math.min(subtotal, Math.round(subtotal * (discountValue / 100) * 100) / 100);
    }
    return Math.min(subtotal, discountValue);
  }, [showDiscount, discountKind, discountValue, subtotal]);

  const totalDue = useMemo(() => Math.max(0, subtotal - discountTotal), [subtotal, discountTotal]);

  const onCreateCustomer = async () => {
    if (!token || !newCustomerName.trim()) return;
    setNewCustomerBusy(true);
    setError('');
    try {
      const created = await catalogApi.customers.create(token, {
        name: newCustomerName.trim(),
        defaultDiscountPercent: 0,
      });
      onCustomersUpdated();
      setCustomerId(created.id);
      setNewCustomerOpen(false);
      setError('');
      setNewCustomerName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setNewCustomerBusy(false);
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addPickedLines = (picked: PickedReceiptProduct[]) => {
    setLines((prev) => [...prev, ...picked.map(draftFromPicked)]);
    setError('');
  };

  const pickerExistingLines = useMemo(
    () =>
      lines
        .filter((l) => l.productId && l.quantity > 0)
        .map((l) => ({ productId: l.productId, quantity: l.quantity })),
    [lines]
  );

  const addTextLine = () => {
    setLines((prev) => [...prev, draftEmptyTextLine()]);
    setError('');
  };

  const persistDocument = async (closeOnSuccess: boolean): Promise<boolean> => {
    if (!token) return false;
    if (!customerId) {
      setError(t('documents.customerRequired'));
      return false;
    }
    const validLines = lines.filter(isPersistableLine);
    if (!validLines.length) {
      setError(t('documents.needLines'));
      return false;
    }
    setBusy(true);
    setError('');
    setInfoMessage('');
    try {
      const bodyDescription = [description.trim(), notes.trim()].filter(Boolean).join('\n\n') || undefined;
      const linePayload = validLines.map((l) => toLinePayload(l, products));
      const discountPayload = {
        discountPercent:
          showDiscount && discountKind === 'percent' && discountValue > 0 ? discountValue : undefined,
        discountAmount:
          showDiscount && discountKind === 'amount' && discountValue > 0 ? discountValue : undefined,
      };
      const payload = {
        description: bodyDescription,
        issueDate: issueDate ? `${issueDate}T12:00:00Z` : undefined,
        dueDate: dueDate ? `${dueDate}T12:00:00Z` : undefined,
        ...discountPayload,
        lines: linePayload,
        finalize: closeOnSuccess,
      };

      const wasUpdate = Boolean(effectiveDocId);
      let saved: Document;
      if (wasUpdate && effectiveDocId) {
        saved = await documentsApi.update(token, effectiveDocId, {
          ...payload,
          version: editVersion,
        });
      } else {
        saved = await documentsApi.create(token, {
          documentType,
          customerId,
          ...(parentQuoteId ? { parentDocumentId: parentQuoteId } : {}),
          ...payload,
        });
        setPersistedDocId(saved.id);
        if (parentQuoteId) setParentQuoteId(null);
      }

      setEditDoc(saved);
      setEditVersion(saved.version);
      setEditTitle(saved.documentNumber);

      // Match the live form (what the user saved), not server-normalized fields — avoids false "unsaved changes".
      savedSnapshotRef.current = captureSnapshot();

      if (closeOnSuccess) {
        onSuccess(wasUpdate ? t('documents.updated') : t('documents.created'));
        handleClose();
      } else {
        setInfoMessage(t('documents.draftSaved'));
        onDraftSaved?.();
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      if (msg.includes('finalized receipt') || msg.includes('receipt already exists')) {
        setError(t('documents.cannotEditFinalizedReceipt'));
      } else {
        setError(msg);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSaveDraft = () => void persistDocument(false);

  const onSaveAndExit = () => void persistDocument(true);

  const saveClientOrder = async () => {
    if (!token || !effectiveDocId) {
      setError(t('documents.clientOrderNeedSave'));
      return;
    }
    if (!pendingClientOrderFile && !clientOrderReceivedAt && !clientOrderReference.trim()) {
      setError(t('documents.clientOrderEmpty'));
      return;
    }
    setClientOrderBusy(true);
    setError('');
    try {
      const saved = await documentsApi.uploadClientOrder(token, effectiveDocId, {
        file: pendingClientOrderFile ?? undefined,
        receivedAt: clientOrderReceivedAt ? `${clientOrderReceivedAt}T12:00:00Z` : undefined,
        clientReference: clientOrderReference,
      });
      setEditDoc(saved);
      applyClientOrderFromDoc(saved);
      const snapshot = JSON.parse(captureSnapshot()) as FormSnapshot;
      snapshot.clientOrderReceivedAt = saved.clientOrderReceivedAt
        ? isoToDateInput(saved.clientOrderReceivedAt)
        : '';
      snapshot.clientOrderReference = saved.clientOrderReference ?? '';
      snapshot.clientOrderFileName = saved.clientOrderFileName ?? '';
      snapshot.pendingClientOrderFileName = '';
      savedSnapshotRef.current = serializeSnapshot(snapshot);
      setInfoMessage(t('documents.clientOrderSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setClientOrderBusy(false);
    }
  };

  const removeClientOrder = async () => {
    if (!token || !effectiveDocId) return;
    if (!window.confirm(t('documents.clientOrderRemoveConfirm'))) return;
    setClientOrderBusy(true);
    setError('');
    try {
      const saved = await documentsApi.deleteClientOrder(token, effectiveDocId);
      setEditDoc(saved);
      applyClientOrderFromDoc(saved);
      const snapshot = JSON.parse(captureSnapshot()) as FormSnapshot;
      snapshot.clientOrderReceivedAt = '';
      snapshot.clientOrderReference = '';
      snapshot.clientOrderFileName = '';
      snapshot.pendingClientOrderFileName = '';
      savedSnapshotRef.current = serializeSnapshot(snapshot);
      setInfoMessage(t('documents.clientOrderRemoved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setClientOrderBusy(false);
    }
  };

  const viewClientOrderFile = async () => {
    if (!token || !effectiveDocId) return;
    setClientOrderBusy(true);
    try {
      const blob = await documentsApi.fetchClientOrderBlob(token, effectiveDocId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setClientOrderBusy(false);
    }
  };

  const displayClientOrderFileName =
    pendingClientOrderFile?.name ?? clientOrderFileName ?? '';

  const clearPendingClientOrderFile = () => {
    setPendingClientOrderFile(null);
    setClientOrderFileName(editDoc?.clientOrderFileName ?? '');
    if (clientOrderFileInputRef.current) clientOrderFileInputRef.current.value = '';
  };

  const onViewClientOrderFile = () => {
    if (pendingClientOrderFile) {
      const url = URL.createObjectURL(pendingClientOrderFile);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    void viewClientOrderFile();
  };

  const onDeleteClientOrderFile = () => {
    if (pendingClientOrderFile) {
      clearPendingClientOrderFile();
      const snapshot = JSON.parse(captureSnapshot()) as FormSnapshot;
      snapshot.pendingClientOrderFileName = '';
      snapshot.clientOrderFileName = editDoc?.clientOrderFileName ?? '';
      savedSnapshotRef.current = serializeSnapshot(snapshot);
      return;
    }
    void removeClientOrder();
  };

  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  };

  if (!open) return null;

  const headerNumber = editTitle
    ? stripDocumentNumberPrefix(editTitle)
    : previewNumber;

  const header = (
    <header className="doc-wizard-header">
      <button
        type="button"
        className="doc-wizard-back"
        onClick={requestClose}
        aria-label={t('documents.back')}
      >
        ‹
      </button>
      <h1 className="doc-wizard-title">
        {headerNumber
          ? `${t(`documents.types.${documentType}`)} ${headerNumber}`
          : t(`documents.types.${documentType}`)}
      </h1>
      <button type="button" className="doc-wizard-close" onClick={requestClose} aria-label={t('products.close')}>
        ×
      </button>
    </header>
  );

  return createPortal(
    <div className="doc-wizard-overlay doc-wizard-overlay--form">
        <div className="doc-wizard-form-shell">
          <div
            ref={mergeRefs(panelRef, formWizardRef)}
            className="doc-wizard doc-wizard--form"
          >
            {header}
            <div className="doc-wizard-body">
              <form
                id="doc-create-form"
                className="doc-wizard-form"
                onSubmit={(e) => e.preventDefault()}
                onKeyDown={onFormKeyDown}
              >
                {loadingEdit && <p className="muted">{t('documents.loading')}</p>}
                {isDuplicateDraft && !loadingEdit && (
                  <p className="type-change-note type-change-note-info">{t('documents.duplicateDraftHint')}</p>
                )}
                {error && <div className="error-banner doc-wizard-error">{error}</div>}
                {infoMessage && <div className="success-banner doc-wizard-error">{infoMessage}</div>}

            <section className="doc-panel doc-panel-customer">
              <div className="doc-panel-grid">
                <label>
                  <span className="doc-panel-label">{t('documents.customerDetails')} *</span>
                  <select
                    value={customerId}
                    disabled={isEdit}
                    required
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      setError('');
                    }}
                  >
                    <option value="">{t('documents.selectCustomer')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!isEdit && (
                  <div className="doc-customer-create-wrap">
                    <button
                      type="button"
                      className="doc-link-btn"
                      onClick={() => setNewCustomerOpen((v) => !v)}
                    >
                      + {t('documents.createCustomer')}
                    </button>
                    {newCustomerOpen && (
                      <div className="doc-new-customer-form">
                        <input
                          type="text"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          placeholder={t('customers.name')}
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={newCustomerBusy}
                          onClick={() => void onCreateCustomer()}
                        >
                          {newCustomerBusy ? '…' : t('customers.add')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <label>
                  <span className="doc-panel-label">{t('documents.issueDate')}</span>
                  <DateInput value={issueDate} onChange={setIssueDate} required />
                </label>
                <label>
                  <span className="doc-panel-label">{t('documents.colDue')}</span>
                  <DateInput value={dueDate} onChange={setDueDate} />
                </label>
                <label>
                  <span className="doc-panel-label">{t('documents.currency')}</span>
                  <select disabled>
                    <option>₪ ILS</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="doc-panel">
              <label className="doc-field-block">
                <span className="doc-panel-label">{t('documents.contentDescription')}</span>
                <textarea
                  rows={2}
                  className="doc-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('documents.contentDescriptionHint')}
                />
              </label>
            </section>

            <section className="doc-panel doc-lines-panel">
              <div className="doc-lines-head">
                <h2>{t('documents.lineItems')}</h2>
                <div className="doc-lines-head-actions">
                  <button
                    type="button"
                    className="btn btn-secondary doc-btn-sm"
                    onClick={addTextLine}
                  >
                    + {t('documents.addLine')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary doc-btn-sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={!products.length}
                  >
                    + {t('documents.addProduct')}
                  </button>
                </div>
              </div>
              {documentType === 'ChargeInvoice' && (
                <p className="muted doc-lines-hint">{t('documents.textLineNoStockHint')}</p>
              )}

              <div className="doc-lines-layout">
                <div className="doc-lines-table-wrap">
                  {lines.length === 0 && (
                    <p className="muted doc-lines-empty">{t('documents.emptyLines')}</p>
                  )}
                  {lines.length > 0 && (
                  <table className="doc-lines-table">
                    <thead>
                      <tr>
                        <th className="col-article">{t('products.article')}</th>
                        <th className="col-name">{t('products.name')}</th>
                        <th className="col-qty">{t('warehouse.qty')}</th>
                        <th className="col-price">{t('documents.colUnitPrice')}</th>
                        <th className="col-total">{t('documents.colLineTotal')}</th>
                        <th className="col-remove" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => {
                        const articleCode =
                          products.find((p) => p.id === line.productId)?.articleCode ?? '';
                        const qtyDisplay = line.quantity <= 0 ? '' : String(line.quantity);
                        return (
                        <tr key={line.key}>
                          <td className="col-article">
                            <input
                              type="text"
                              className="doc-line-article"
                              value={articleCode}
                              readOnly
                              tabIndex={-1}
                              aria-label={t('products.article')}
                            />
                          </td>
                          <td className="col-name">
                            <input
                              type="text"
                              {...bidiAutoInput('doc-line-desc')}
                              value={line.description}
                              onChange={(e) => updateLine(line.key, { description: e.target.value })}
                              placeholder={t('products.name')}
                            />
                          </td>
                          <td className="col-qty">
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              value={qtyDisplay}
                              onChange={(e) => {
                                const raw = sanitizeQuantityDraft(e.target.value);
                                updateLine(line.key, {
                                  quantity:
                                    raw === '' ? 0 : normalizeStockQuantity(Number(raw)),
                                });
                              }}
                              onBlur={() => {
                                if (normalizeStockQuantity(line.quantity) < 1) {
                                  updateLine(line.key, { quantity: 1 });
                                }
                              }}
                              required
                            />
                          </td>
                          <td className="col-price">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="doc-line-price"
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  unitPrice: sanitizePriceDraft(e.target.value),
                                })
                              }
                              onBlur={() =>
                                updateLine(line.key, {
                                  unitPrice: String(finalizePriceDraft(line.unitPrice)),
                                })
                              }
                              required
                            />
                          </td>
                          <td className="col-total doc-line-total">{formatMoney(lineTotals[idx] ?? 0)}</td>
                          <td className="col-remove">
                            <button
                              type="button"
                              className="doc-line-remove"
                              onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                              aria-label={t('documents.removeLine')}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
                <aside className="doc-summary-box">
                  <span className="doc-summary-label">{t('documents.summary')}</span>
                  {subtotal > 0 && subtotal !== totalDue && (
                    <span className="doc-summary-sub muted">{formatMoney(subtotal)}</span>
                  )}
                  <span className="doc-summary-total">{formatMoney(totalDue)}</span>
                  <span className="muted doc-summary-hint">{t('documents.totalDue')}</span>
                  {!showDiscount ? (
                    <button
                      type="button"
                      className="btn btn-secondary doc-btn-sm doc-add-discount"
                      onClick={() => setShowDiscount(true)}
                    >
                      + {t('documents.addDiscount')}
                    </button>
                  ) : (
                    <div className="doc-discount-block">
                      <span className="doc-panel-label">{t('documents.discount')}</span>
                      <div className="doc-discount-row">
                        <input
                          type="number"
                          min={0}
                          step={discountKind === 'percent' ? 0.01 : 0.01}
                          max={discountKind === 'percent' ? 100 : undefined}
                          value={discountValue || ''}
                          onChange={(e) => setDiscountValue(Number(e.target.value))}
                        />
                        <select
                          value={discountKind}
                          onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}
                        >
                          <option value="percent">{t('documents.discountPercent')}</option>
                          <option value="amount">{t('documents.discountFixed')}</option>
                        </select>
                        <button
                          type="button"
                          className="doc-line-remove"
                          onClick={() => {
                            setShowDiscount(false);
                            setDiscountValue(0);
                          }}
                          aria-label={t('documents.removeDiscount')}
                        >
                          ×
                        </button>
                      </div>
                      {discountTotal > 0 && (
                        <span className="doc-discount-applied muted">
                          −{formatMoney(discountTotal)}
                        </span>
                      )}
                    </div>
                  )}
                </aside>
              </div>
            </section>

            {documentType === 'Quote' && (
              <section className="doc-panel doc-panel-client-order">
                <h2 className="doc-panel-heading">{t('documents.clientOrderTitle')}</h2>
                <p className="muted field-hint">{t('documents.clientOrderHint')}</p>
                {!effectiveDocId && (
                  <p className="muted field-hint">{t('documents.clientOrderNeedSave')}</p>
                )}
                <div className="doc-client-order-toolbar">
                  <label className="doc-client-order-field doc-client-order-field--date">
                    <span className="doc-panel-label">{t('documents.clientOrderReceivedAt')}</span>
                    <DateInput
                      value={clientOrderReceivedAt}
                      disabled={!effectiveDocId || clientOrderBusy}
                      onChange={setClientOrderReceivedAt}
                    />
                  </label>
                  <label className="doc-client-order-field doc-client-order-field--ref">
                    <span className="doc-panel-label">{t('documents.clientOrderReference')}</span>
                    <input
                      type="text"
                      value={clientOrderReference}
                      disabled={!effectiveDocId || clientOrderBusy}
                      onChange={(e) => setClientOrderReference(e.target.value)}
                      {...bidiAutoInput()}
                    />
                  </label>
                  <div className="doc-client-order-btn-group">
                    <span className="doc-panel-label doc-client-order-label-spacer" aria-hidden="true">
                      &nbsp;
                    </span>
                    <div className="doc-client-order-btn-row">
                      <label
                        className={`btn btn-secondary doc-client-order-file-btn${
                          !effectiveDocId || clientOrderBusy ? ' doc-client-order-file-btn--disabled' : ''
                        }`}
                      >
                        {t('documents.clientOrderChooseFile')}
                        <input
                          ref={clientOrderFileInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                          className="sr-only"
                          disabled={!effectiveDocId || clientOrderBusy}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setPendingClientOrderFile(file);
                            if (file) setClientOrderFileName(file.name);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary doc-client-order-save-btn"
                        disabled={!effectiveDocId || clientOrderBusy}
                        onClick={() => void saveClientOrder()}
                      >
                        {clientOrderBusy ? '…' : t('documents.clientOrderSave')}
                      </button>
                    </div>
                  </div>
                </div>
                {displayClientOrderFileName && (
                  <div className="doc-client-order-file-row">
                    <button
                      type="button"
                      className="doc-client-order-file-link"
                      disabled={clientOrderBusy}
                      onClick={() => onViewClientOrderFile()}
                      title={displayClientOrderFileName}
                    >
                      {displayClientOrderFileName}
                    </button>
                    {pendingClientOrderFile && (
                      <span className="muted doc-client-order-pending-tag">
                        {t('documents.clientOrderPendingSave')}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost-inline doc-client-order-delete-btn"
                      disabled={!effectiveDocId || clientOrderBusy}
                      onClick={() => onDeleteClientOrderFile()}
                    >
                      {t('documents.clientOrderRemove')}
                    </button>
                  </div>
                )}
              </section>
            )}

            <section className="doc-panel doc-panel-notes">
              <label className="doc-field-block">
                <span className="doc-panel-label">{t('documents.notes')}</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="doc-textarea doc-textarea--resizable"
                />
              </label>
            </section>
              </form>
            </div>
            <footer className="doc-wizard-footer">
              <button type="button" className="btn btn-ghost-inline" onClick={requestClose} disabled={busy}>
                {t('settings.cancel')}
              </button>
              {canPreviewPdf && editDoc && onSendEmail && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => onSendEmail(editDoc)}
                >
                  {t('documents.sendByEmail')}
                </button>
              )}
              {canPreviewPdf && editDoc && onPreviewPdf && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => onPreviewPdf(editDoc)}
                >
                  {t('documents.previewPdf')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || loadingEdit}
                onClick={onSaveDraft}
              >
                {busy ? '…' : t('documents.saveDraft')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || loadingEdit}
                onClick={onSaveAndExit}
              >
                {busy ? '…' : t('documents.saveAndExit')}
              </button>
            </footer>
            <div className="app-modal__resize-gutter" aria-hidden />
            <div
              className="app-modal__resize-handle"
              onMouseDown={onResizeHandleMouseDown}
              title={t('common.resizeModal')}
              aria-hidden
            />
          </div>
        </div>

      <PurchaseReceiptProductPickerModal
        open={pickerOpen}
        token={token}
        products={catalogProducts}
        groups={productGroups}
        titleKey="documents.pickerTitle"
        showUnitPrice
        newProductType="FinishedGood"
        resizeConfig={DOCUMENT_PRODUCT_PICKER_RESIZE}
        overlayZIndex={2800}
        nestedProductModalZIndex={2900}
        existingPicks={pickerExistingLines}
        onClose={() => setPickerOpen(false)}
        onSave={addPickedLines}
        onProductCreated={(p) => {
          setCatalogProducts((prev) => {
            const next = prev.some((x) => x.id === p.id)
              ? prev.map((x) => (x.id === p.id ? p : x))
              : [...prev, p];
            return [...next].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            );
          });
        }}
      />

      <ConfirmDialog
        open={closeConfirmOpen}
        title={t('documents.closeConfirmTitle')}
        message={t('documents.closeConfirmMessage')}
        confirmLabel={t('documents.closeConfirmDiscard')}
        cancelLabel={t('settings.cancel')}
        danger
        zIndex={2900}
        onConfirm={() => {
          setCloseConfirmOpen(false);
          handleClose();
        }}
        onCancel={() => setCloseConfirmOpen(false)}
      />
    </div>,
    document.body
  );
}
