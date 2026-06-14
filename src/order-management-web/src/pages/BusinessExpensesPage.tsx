import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import {
  businessExpensesApi,
  type BusinessExpense,
  type BusinessExpenseDocument,
  type BusinessExpenseInput,
} from '../api/businessExpenses';
import { fetchScanPdf, LocalScanAgentError } from '../api/localScan';
import { suppliersApi, type Supplier } from '../api/suppliers';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateInput } from '../components/DateInput';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { AppModal } from '../components/ui/AppModal';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { HOME_EXPENSE_TYPES, OPERATING_EXPENSE_TYPES } from '../lib/businessAccountingTypes';
import {
  BUSINESS_EXPENSES_COLUMN_CLASS,
  BUSINESS_EXPENSES_COLUMN_KEYS,
  BUSINESS_EXPENSES_COLUMN_WIDTHS_KEY,
  BUSINESS_EXPENSES_DEFAULT_WIDTHS,
  BUSINESS_EXPENSES_TEXT_START_COLUMNS,
  type BusinessExpensesColumnKey,
} from '../lib/listTableColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { isImageAttachment, isPreviewableAttachment } from '../lib/attachmentPreview';
import { BUSINESS_EXPENSE_MODAL_RESIZE, BUSINESS_EXPENSES_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import { buildReportPdfFileName } from '../lib/pdfDownload';

import '../styles/purchase-receipts.css';
import '../styles/settings.css';
import '../styles/business-expenses.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

function formatPanelDate(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

const LEGACY_SUPPLIER_ID = '__legacy__';
const ADD_SUPPLIER_ID = '__add_supplier__';

type ExpenseForm = BusinessExpenseInput & { id?: string; supplierId: string };

function resolveSupplierId(vendorName: string | null | undefined, suppliers: Supplier[]): string {
  if (!vendorName) return '';
  return suppliers.find((s) => s.name === vendorName)?.id ?? LEGACY_SUPPLIER_ID;
}

function emptyForm(homeOffice: boolean): ExpenseForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    expenseDate: today,
    isHomeMixed: homeOffice,
    homeExpenseType: homeOffice ? 'Electricity' : null,
    operatingExpenseType: homeOffice ? null : 'Rent',
    amountIls: 0,
    vendorName: '',
    supplierId: '',
    invoiceReference: '',
    notes: '',
  };
}

function formFromExpense(e: BusinessExpense, suppliers: Supplier[]): ExpenseForm {
  return {
    id: e.id,
    expenseDate: e.expenseDate,
    isHomeMixed: e.isHomeMixed,
    homeExpenseType: e.homeExpenseType ?? 'Other',
    operatingExpenseType: e.operatingExpenseType ?? 'Other',
    amountIls: e.amountIls,
    vendorName: e.vendorName ?? '',
    supplierId: resolveSupplierId(e.vendorName, suppliers),
    invoiceReference: e.invoiceReference ?? '',
    notes: e.notes ?? '',
  };
}

function buildBody(form: ExpenseForm, homeOffice: boolean, suppliers: Supplier[]): BusinessExpenseInput {
  const isHomeMixed = homeOffice && form.isHomeMixed;
  let vendorName: string | null = null;
  if (form.supplierId === LEGACY_SUPPLIER_ID) {
    vendorName = form.vendorName?.trim() || null;
  } else if (form.supplierId) {
    vendorName = suppliers.find((s) => s.id === form.supplierId)?.name ?? null;
  }
  return {
    expenseDate: form.expenseDate,
    isHomeMixed,
    homeExpenseType: isHomeMixed ? form.homeExpenseType : null,
    operatingExpenseType: isHomeMixed ? null : form.operatingExpenseType,
    amountIls: form.amountIls,
    vendorName,
    invoiceReference: form.invoiceReference?.trim() || null,
    notes: form.notes?.trim() || null,
  };
}

export function BusinessExpensesPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [list, setList] = useState<BusinessExpense[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessExpense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<BusinessExpenseDocument | null>(null);
  const [deleteDocBusy, setDeleteDocBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDownloadFileName, setPdfDownloadFileName] = useState('');
  const pdfParamsRef = useRef({ from, to });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(emptyForm(true));
  const [saving, setSaving] = useState(false);
  const [homeOffice, setHomeOffice] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [documents, setDocuments] = useState<BusinessExpenseDocument[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<'starting' | 'scanning'>('starting');
  const [docError, setDocError] = useState('');
  const [formError, setFormError] = useState('');
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addSupplierBusy, setAddSupplierBusy] = useState(false);
  const [addSupplierError, setAddSupplierError] = useState('');
  const attachmentUrlRef = useRef<string | null>(null);
  const expenseDocsCacheRef = useRef<Record<string, BusinessExpenseDocument[]>>({});
  const [attachmentPreview, setAttachmentPreview] = useState<{
    open: boolean;
    title: string;
    url: string | null;
    loading: boolean;
    error: string | null;
    isImage: boolean;
    downloadFileName?: string;
  }>({ open: false, title: '', url: null, loading: false, error: null, isImage: false });

  useEffect(() => {
    if (!token) return;
    api.getProfile(token).then((p) => {
      const isHome = (p.expenseLocationMode ?? 'HomeOffice') === 'HomeOffice';
      setHomeOffice(isHome);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    suppliersApi.list(token).then(setSuppliers).catch(() => setSuppliers([]));
  }, [token]);

  const getExpenseTypeLabel = useCallback(
    (row: BusinessExpense) => {
      if (row.isHomeMixed && row.homeExpenseType) {
        return t(`homeExpenseType.${row.homeExpenseType}`);
      }
      if (!row.isHomeMixed && row.operatingExpenseType) {
        return t(`operatingExpenseType.${row.operatingExpenseType}`);
      }
      return '—';
    },
    [t]
  );

  const typeFilterOptions = useMemo(() => {
    if (filterKind === 'home') return [...HOME_EXPENSE_TYPES];
    if (filterKind === 'operating') return [...OPERATING_EXPENSE_TYPES];
    return [...new Set([...HOME_EXPENSE_TYPES, ...OPERATING_EXPENSE_TYPES])];
  }, [filterKind]);

  const typeFilterLabel = useCallback(
    (typeKey: string) => {
      if (filterKind === 'home') return t(`homeExpenseType.${typeKey}`);
      if (filterKind === 'operating') return t(`operatingExpenseType.${typeKey}`);
      if (HOME_EXPENSE_TYPES.includes(typeKey as (typeof HOME_EXPENSE_TYPES)[number])) {
        return t(`homeExpenseType.${typeKey}`);
      }
      return t(`operatingExpenseType.${typeKey}`);
    },
    [filterKind, t]
  );

  const vendorFilterOptions = useMemo(() => {
    const supplierNames = suppliers
      .filter((s) => s.isActive)
      .map((s) => s.name.trim())
      .filter(Boolean);
    const names = new Set(supplierNames);
    for (const row of list) {
      const legacy = row.vendorName?.trim();
      if (legacy && !names.has(legacy)) names.add(legacy);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [list, suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((row) => {
      if (filterKind === 'home' && !row.isHomeMixed) return false;
      if (filterKind === 'operating' && row.isHomeMixed) return false;
      if (filterType) {
        const rowType = row.isHomeMixed ? row.homeExpenseType : row.operatingExpenseType;
        if (rowType !== filterType) return false;
      }
      if (filterVendor && (row.vendorName?.trim() ?? '') !== filterVendor) return false;
      if (!q) return true;
      const haystack = [row.notes, row.invoiceReference, getExpenseTypeLabel(row)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [list, search, filterKind, filterType, filterVendor, getExpenseTypeLabel]);

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(filtered, [
    from,
    to,
    search,
    filterKind,
    filterType,
    filterVendor,
  ]);
  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({
          amountIls: acc.amountIls + row.amountIls,
          recognizedIls: acc.recognizedIls + row.recognizedAmountIls,
        }),
        { amountIls: 0, recognizedIls: 0 }
      ),
    [filtered]
  );
  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    BUSINESS_EXPENSES_COLUMN_WIDTHS_KEY,
    BUSINESS_EXPENSES_DEFAULT_WIDTHS
  );

  const cellClass = (key: BusinessExpensesColumnKey) =>
    `${BUSINESS_EXPENSES_COLUMN_CLASS[key]}${BUSINESS_EXPENSES_TEXT_START_COLUMNS.has(key) ? ' dt-col-text-start' : ''}`;

  const columnLabel = (key: BusinessExpensesColumnKey) => {
    switch (key) {
      case 'date':
        return t('businessExpenses.colDate');
      case 'type':
        return t('businessExpenses.colType');
      case 'notes':
        return t('businessExpenses.notes');
      case 'vendor':
        return t('businessExpenses.colVendor');
      case 'invoice':
        return t('businessExpenses.colInvoice');
      case 'amount':
        return t('businessExpenses.colAmount');
      case 'recognized':
        return t('businessExpenses.colRecognized');
      case 'docs':
        return t('businessExpenses.colDocs');
      case 'actions':
        return '';
      default:
        return key;
    }
  };

  const load = useCallback(async () => {
    if (!token) return;
    if (from && to && from > to) {
      setError(t('reports.incomeDateError'));
      setList([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await businessExpensesApi.list(token, from || undefined, to || undefined);
      setList(rows);
      expenseDocsCacheRef.current = {};
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, t, setPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (form.id) {
      expenseDocsCacheRef.current[form.id] = documents;
    }
  }, [form.id, documents]);

  useEffect(
    () => () => {
      if (attachmentUrlRef.current) URL.revokeObjectURL(attachmentUrlRef.current);
    },
    []
  );

  useEffect(() => {
    if (!token || !modalOpen) return;
    suppliersApi
      .list(token)
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [token, modalOpen]);

  const resetModalDocs = () => {
    setDocuments([]);
    setPendingFiles([]);
    setDocError('');
    setDocUploading(false);
    setScanning(false);
  };

  const resetAddSupplier = () => {
    setAddSupplierOpen(false);
    setNewSupplierName('');
    setAddSupplierBusy(false);
    setAddSupplierError('');
  };

  const onSupplierSelectChange = (value: string) => {
    if (value === ADD_SUPPLIER_ID) {
      setAddSupplierOpen(true);
      setNewSupplierName('');
      setAddSupplierError('');
      return;
    }
    resetAddSupplier();
    setForm((current) => ({ ...current, supplierId: value }));
  };

  const onCreateSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !newSupplierName.trim()) return;
    setAddSupplierBusy(true);
    setAddSupplierError('');
    try {
      const created = await suppliersApi.create(token, {
        name: newSupplierName.trim(),
        defaultCurrency: 'ILS',
      });
      setSuppliers((prev) =>
        [...prev.filter((s) => s.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setForm((current) => ({ ...current, supplierId: created.id }));
      resetAddSupplier();
    } catch (err) {
      setAddSupplierError(err instanceof Error ? err.message : 'Error');
    } finally {
      setAddSupplierBusy(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm(homeOffice));
    resetModalDocs();
    resetAddSupplier();
    setFormError('');
    setModalOpen(true);
    setMessage('');
  };

  const openEdit = async (row: BusinessExpense) => {
    if (!token) return;
    setError('');
    try {
      const full = await businessExpensesApi.get(token, row.id);
      setForm(formFromExpense(full, suppliers));
      setDocuments(full.documents ?? []);
      setPendingFiles([]);
      setDocError('');
      setFormError('');
      resetAddSupplier();
      setModalOpen(true);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const openDuplicate = (row: BusinessExpense) => {
    const base = formFromExpense(row, suppliers);
    setForm({
      ...base,
      id: undefined,
      expenseDate: new Date().toISOString().slice(0, 10),
    });
    resetModalDocs();
    resetAddSupplier();
    setFormError('');
    setModalOpen(true);
    setMessage('');
  };

  const closeModal = () => {
    resetAddSupplier();
    setModalOpen(false);
  };

  useEffect(() => {
    if (!modalOpen || suppliers.length === 0) return;
    setForm((current) => {
      if (current.supplierId || !current.vendorName) return current;
      const match = suppliers.find((s) => s.name === current.vendorName);
      return { ...current, supplierId: match?.id ?? LEGACY_SUPPLIER_ID };
    });
  }, [modalOpen, suppliers]);

  const uploadPendingFiles = async (expenseId: string, files: File[]) => {
    if (!token || files.length === 0) return;
    let latest = await businessExpensesApi.get(token, expenseId);
    for (const file of files) {
      latest = await businessExpensesApi.uploadDocument(token, expenseId, file);
    }
    setDocuments(latest.documents ?? []);
    setPendingFiles([]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!Number.isFinite(form.amountIls) || form.amountIls <= 0) {
      setFormError(t('businessExpenses.amountRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setFormError('');
    setDocError('');
    try {
      const body = buildBody(form, homeOffice, suppliers);
      let expenseId = form.id;
      if (form.id) {
        await businessExpensesApi.update(token, form.id, body);
        setMessage(t('businessExpenses.updated'));
      } else {
        const created = await businessExpensesApi.create(token, body);
        expenseId = created.id;
        setMessage(t('businessExpenses.created'));
      }
      if (expenseId && pendingFiles.length > 0) {
        await uploadPendingFiles(expenseId, pendingFiles);
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row: BusinessExpense) => {
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await businessExpensesApi.delete(token, deleteTarget.id);
      setMessage(t('businessExpenses.deleted'));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const revokePdfUrl = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  }, [pdfUrl]);

  const buildPdfParams = useCallback(() => ({ from, to }), [from, to]);

  const closePdf = () => {
    setPdfOpen(false);
    revokePdfUrl();
    setPdfError(null);
    setPdfLoading(false);
  };

  const openPdfPreview = async () => {
    if (!token) return;
    const params = buildPdfParams();
    pdfParamsRef.current = params;
    setPdfDownloadFileName(
      buildReportPdfFileName('reports.pdfFileName_businessExpenses', { from: params.from, to: params.to })
    );
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    try {
      const blob = await businessExpensesApi.fetchJournalPdfBlob(
        token,
        params.from || undefined,
        params.to || undefined
      );
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPdfLoading(false);
    }
  };

  const revokeAttachmentUrl = useCallback(() => {
    if (attachmentUrlRef.current) {
      URL.revokeObjectURL(attachmentUrlRef.current);
      attachmentUrlRef.current = null;
    }
  }, []);

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreview((prev) => ({ ...prev, open: false }));
    revokeAttachmentUrl();
  }, [revokeAttachmentUrl]);

  const openSavedDocumentPreview = useCallback(
    async (expenseId: string, doc: BusinessExpenseDocument) => {
      if (!token) return;
      revokeAttachmentUrl();
      setAttachmentPreview({
        open: true,
        title: doc.fileName,
        url: null,
        loading: true,
        error: null,
        isImage: isImageAttachment(doc.fileName, doc.contentType),
        downloadFileName: doc.fileName,
      });
      try {
        const blob = await businessExpensesApi.fetchDocumentBlob(token, expenseId, doc.id, doc.fileName);
        if (!isPreviewableAttachment(doc.fileName, blob.type || doc.contentType)) {
          const url = URL.createObjectURL(blob);
          attachmentUrlRef.current = url;
          const a = document.createElement('a');
          a.href = url;
          a.download = doc.fileName;
          a.click();
          setAttachmentPreview((prev) => ({
            ...prev,
            open: false,
            loading: false,
            url: null,
          }));
          revokeAttachmentUrl();
          return;
        }
        const url = URL.createObjectURL(blob);
        attachmentUrlRef.current = url;
        setAttachmentPreview({
          open: true,
          title: doc.fileName,
          url,
          loading: false,
          error: null,
          isImage: blob.type.startsWith('image/') || isImageAttachment(doc.fileName, doc.contentType),
          downloadFileName: doc.fileName,
        });
      } catch (err) {
        setAttachmentPreview((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Error',
        }));
      }
    },
    [token, revokeAttachmentUrl]
  );

  const openPendingFilePreview = useCallback(
    (file: File) => {
      revokeAttachmentUrl();
      if (!isPreviewableAttachment(file.name, file.type)) {
        const url = URL.createObjectURL(file);
        attachmentUrlRef.current = url;
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        revokeAttachmentUrl();
        return;
      }
      const url = URL.createObjectURL(file);
      attachmentUrlRef.current = url;
      setAttachmentPreview({
        open: true,
        title: file.name,
        url,
        loading: false,
        error: null,
        isImage: file.type.startsWith('image/') || isImageAttachment(file.name, file.type),
        downloadFileName: file.name,
      });
    },
    [revokeAttachmentUrl]
  );

  const loadExpenseDocuments = useCallback(
    async (expenseId: string): Promise<BusinessExpenseDocument[]> => {
      const cached = expenseDocsCacheRef.current[expenseId];
      if (cached) return cached;
      if (!token) return [];
      const expense = await businessExpensesApi.get(token, expenseId);
      const docs = [...(expense.documents ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
      );
      expenseDocsCacheRef.current[expenseId] = docs;
      return docs;
    },
    [token]
  );

  const onTableDocumentClick = async (expenseId: string, docIndex: number) => {
    try {
      const docs = await loadExpenseDocuments(expenseId);
      const doc = docs[docIndex];
      if (doc) await openSavedDocumentPreview(expenseId, doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onPickDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setDocError('');
    if (!form.id) {
      setPendingFiles((prev) => [...prev, ...files]);
      return;
    }
    if (!token) return;
    setDocUploading(true);
    try {
      let latest: BusinessExpense | null = null;
      for (const file of files) {
        latest = await businessExpensesApi.uploadDocument(token, form.id, file);
      }
      if (latest) setDocuments(latest.documents ?? []);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDocUploading(false);
    }
  };

  const onScanDocument = async () => {
    setDocError('');
    setScanning(true);
    setScanPhase('starting');
    try {
      const { blob, fileName } = await fetchScanPdf((phase) => setScanPhase(phase));
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (!form.id) {
        setPendingFiles((prev) => [...prev, file]);
        return;
      }
      if (!token) return;
      setDocUploading(true);
      const latest = await businessExpensesApi.uploadDocument(token, form.id, file);
      setDocuments(latest.documents ?? []);
    } catch (err) {
      if (err instanceof LocalScanAgentError) {
        setDocError(
          err.code === 'unavailable'
            ? t('purchaseReceipts.scanAgentUnavailable')
            : t('purchaseReceipts.scanFailed', { message: err.message })
        );
      } else {
        setDocError(err instanceof Error ? err.message : 'Error');
      }
    } finally {
      setScanning(false);
      setDocUploading(false);
    }
  };

  const onRemoveDocument = (documentId: string) => {
    if (!token || !form.id) return;
    const doc = documents.find((d) => d.id === documentId);
    if (doc) setDeleteDocTarget(doc);
  };

  const confirmRemoveDocument = async () => {
    if (!token || !form.id || !deleteDocTarget) return;
    setDeleteDocBusy(true);
    setDocError('');
    try {
      const latest = await businessExpensesApi.deleteDocument(token, form.id, deleteDocTarget.id);
      setDocuments(latest.documents ?? []);
      setDeleteDocTarget(null);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDeleteDocBusy(false);
    }
  };

  const onRemovePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const expenseTypeLabel = getExpenseTypeLabel;

  const onFilterKindChange = (value: string) => {
    setFilterKind(value);
    if (!filterType) return;
    const allowed = new Set<string>(
      value === 'home'
        ? HOME_EXPENSE_TYPES
        : value === 'operating'
          ? OPERATING_EXPENSE_TYPES
          : [...HOME_EXPENSE_TYPES, ...OPERATING_EXPENSE_TYPES]
    );
    if (!allowed.has(filterType)) setFilterType('');
  };

  const allDocs = documents;
  const pendingDocNames = pendingFiles.map((f) => f.name);
  const canManageDocs = !saving;

  return (
    <div className="page business-expenses-page">
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <DataTablePanel
        resize={BUSINESS_EXPENSES_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading title={t('businessExpenses.title')} count={t('products.results', { count: total })} />
            <div className="dt-panel__toolbar-actions">
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                {t('businessExpenses.add')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => void openPdfPreview()}
              >
                {t('reports.viewPdf')}
              </button>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('businessExpenses.refresh')}
              </button>
            </div>
          </div>
        }
        toolbarSecondary={
          <div className="be-list-toolbar">
            <div className="dt-panel-filters be-list-filters">
              <label className="be-list-filter be-list-filter--search">
                <span>{t('businessExpenses.search')}</span>
                <input
                  type="search"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('businessExpenses.searchPlaceholder')}
                />
              </label>
              {homeOffice && (
                <label className="be-list-filter be-list-filter--kind">
                  <span>{t('businessExpenses.filterKind')}</span>
                  <select value={filterKind} onChange={(e) => onFilterKindChange(e.target.value)}>
                    <option value="">{t('businessExpenses.allKinds')}</option>
                    <option value="home">{t('businessExpenses.kindHome')}</option>
                    <option value="operating">{t('businessExpenses.kindOperating')}</option>
                  </select>
                </label>
              )}
              <label className="be-list-filter be-list-filter--type">
                <span>{t('businessExpenses.filterType')}</span>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">{t('businessExpenses.allTypes')}</option>
                  {typeFilterOptions.map((typeKey) => (
                    <option key={typeKey} value={typeKey}>
                      {typeFilterLabel(typeKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="be-list-filter be-list-filter--vendor">
                <span>{t('businessExpenses.filterVendor')}</span>
                <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}>
                  <option value="">{t('businessExpenses.allVendors')}</option>
                  {vendorFilterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ReportDateRangePicker
              from={from}
              to={to}
              presetId={datePreset}
              onChange={(nextFrom, nextTo, preset) => {
                setFrom(nextFrom);
                setTo(nextTo);
                setDatePreset(preset);
              }}
            />
            <p className="muted be-list-hint">{homeOffice ? t('businessExpenses.hintHome') : t('businessExpenses.hintOffice')}</p>
          </div>
        }
        summary={
          total > 0 ? (
            <div className="inventory-valuation-summary business-expenses-panel-summary">
              <span>
                {t('businessExpenses.summaryPeriod', {
                  from: from ? formatPanelDate(from) : t('reports.datePresetAll'),
                  to: to ? formatPanelDate(to) : t('reports.datePresetAll'),
                })}
              </span>
              <span>{t('businessExpenses.summaryAmount', { value: formatIls(totals.amountIls) })}</span>
              <strong>{t('businessExpenses.summaryRecognized', { value: formatIls(totals.recognizedIls) })}</strong>
            </div>
          ) : undefined
        }
        pagination={{
          page,
          pageCount,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      >
        <table className="dt-panel-table" style={{ minWidth: tableMinWidth }}>
          <colgroup>
            {BUSINESS_EXPENSES_COLUMN_KEYS.map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {BUSINESS_EXPENSES_COLUMN_KEYS.map((key) =>
                renderDataTableHeaderCell(
                  key,
                  columnLabel(key),
                  BUSINESS_EXPENSES_COLUMN_CLASS[key],
                  onResizeHandleMouseDown,
                  t('products.resizeColumn'),
                  BUSINESS_EXPENSES_TEXT_START_COLUMNS.has(key)
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={BUSINESS_EXPENSES_COLUMN_KEYS.length} className="dt-panel-empty muted">
                  {t('businessExpenses.empty')}
                </td>
              </tr>
            ) : (
              pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={cellClass('date')}>{row.expenseDate}</td>
                  <td className={cellClass('type')}>{expenseTypeLabel(row)}</td>
                  <td className={cellClass('notes')}>{row.notes ?? '—'}</td>
                  <td className={`${cellClass('vendor')} bidi-auto`}>{row.vendorName ?? '—'}</td>
                  <td className={`${cellClass('invoice')} bidi-auto`}>{row.invoiceReference ?? '—'}</td>
                  <td className={cellClass('amount')}>{formatIls(row.amountIls)}</td>
                  <td className={cellClass('recognized')}>
                    {formatIls(row.recognizedAmountIls)}
                    {row.isHomeMixed && (
                      <span className="muted" style={{ marginInlineStart: '0.35rem', fontSize: '0.85em' }}>
                        ({row.recognizedPercent}%)
                      </span>
                    )}
                  </td>
                  <td className={cellClass('docs')}>
                    {row.documentCount > 0 ? (
                      <span className="business-expense-docs-cell">
                        {Array.from({ length: row.documentCount }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            className="pr-doc-clip-btn"
                            title={t('businessExpenses.viewDocument')}
                            onClick={() => void onTableDocumentClick(row.id, i)}
                          >
                            <span className="pr-doc-clip" aria-hidden="true">
                              📎
                            </span>
                          </button>
                        ))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`${cellClass('actions')} table-actions-cell`}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openEdit(row)}>
                      {t('products.edit')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDuplicate(row)}>
                      {t('businessExpenses.duplicate')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(row)}>
                      {t('products.actionDelete')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>

      <AppModal
        open={modalOpen}
        onClose={closeModal}
        ariaLabel={form.id ? t('businessExpenses.editTitle') : t('businessExpenses.addTitle')}
        className="app-modal-panel business-expense-modal settings-page"
        overlayClassName="business-expense-modal-overlay"
        noCard
        closeOnBackdrop={false}
        preventClose={saving || docUploading || scanning || addSupplierBusy}
        resize={BUSINESS_EXPENSE_MODAL_RESIZE}
      >
        <header className="app-modal-panel__header">
          <h2>{form.id ? t('businessExpenses.editTitle') : t('businessExpenses.addTitle')}</h2>
          <button
            type="button"
            className="app-modal-panel__close"
            onClick={closeModal}
            disabled={saving || docUploading || scanning || addSupplierBusy}
            aria-label={t('products.close')}
          >
            ×
          </button>
        </header>
        <div className="app-modal-panel__body app-modal-panel__body--form">
          <form className="business-expense-form" onSubmit={(e) => void onSubmit(e)}>
            {formError && <div className="error-banner">{formError}</div>}
            <div className="settings-fields">
              <div
                className={`settings-row settings-row--full settings-row--expense-header${
                  homeOffice ? '' : ' settings-row--expense-header--office'
                }`}
              >
                <label className="settings-field">
                  <span className="settings-field-label-row">{t('businessExpenses.colDate')}</span>
                  <DateInput
                    value={form.expenseDate}
                    onChange={(expenseDate) => setForm({ ...form, expenseDate })}
                    required
                  />
                </label>
                {homeOffice && (
                  <label className="settings-field">
                    <span className="settings-field-label-row">{t('businessExpenses.expenseKind')}</span>
                    <select
                      value={form.isHomeMixed ? 'home' : 'operating'}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          isHomeMixed: e.target.value === 'home',
                          homeExpenseType: e.target.value === 'home' ? 'Electricity' : null,
                          operatingExpenseType: e.target.value === 'home' ? null : 'Other',
                        })
                      }
                    >
                      <option value="home">{t('businessExpenses.kindHome')}</option>
                      <option value="operating">{t('businessExpenses.kindOperating')}</option>
                    </select>
                  </label>
                )}
                <label className="settings-field">
                  <span className="settings-field-label-row">
                    {form.isHomeMixed && homeOffice
                      ? t('businessExpenses.homeType')
                      : t('businessExpenses.operatingType')}
                  </span>
                  {form.isHomeMixed && homeOffice ? (
                    <select
                      value={form.homeExpenseType ?? 'Other'}
                      onChange={(e) => setForm({ ...form, homeExpenseType: e.target.value })}
                    >
                      {HOME_EXPENSE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`homeExpenseType.${type}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={form.operatingExpenseType ?? 'Other'}
                      onChange={(e) => setForm({ ...form, operatingExpenseType: e.target.value })}
                    >
                      {OPERATING_EXPENSE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`operatingExpenseType.${type}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              {!homeOffice && (
                <p className="business-expense-form__note">{t('businessExpenses.officeModeNote')}</p>
              )}

              <div className="business-expense-form__grow">
                <div className="business-expense-form__compact-rows">
                  <div className="settings-row settings-row--full settings-row--expense-amount">
                    <label className="settings-field field-flex-compact">
                      <span className="settings-field-label-row">{t('businessExpenses.colAmount')}</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={form.amountIls || ''}
                        onChange={(e) => setForm({ ...form, amountIls: Number(e.target.value) })}
                        required
                      />
                    </label>
                    <label className="settings-field field-flex-grow">
                      <span className="settings-field-label-row">{t('businessExpenses.invoiceRef')}</span>
                      <input
                        value={form.invoiceReference ?? ''}
                        onChange={(e) => setForm({ ...form, invoiceReference: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="settings-row settings-row--full">
                    <label className="settings-field field-w-full">
                      <span className="settings-field-label-row">{t('businessExpenses.colVendor')}</span>
                      <select
                        value={addSupplierOpen ? '' : form.supplierId}
                        onChange={(e) => onSupplierSelectChange(e.target.value)}
                      >
                        <option value="">{t('purchaseReceipts.selectSupplier')}</option>
                        {form.supplierId === LEGACY_SUPPLIER_ID && form.vendorName && (
                          <option value={LEGACY_SUPPLIER_ID}>{form.vendorName}</option>
                        )}
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value={ADD_SUPPLIER_ID}>{t('suppliers.add')}</option>
                      </select>
                    </label>
                    {addSupplierOpen && (
                      <form
                        className="business-expense-form__add-supplier"
                        onSubmit={(e) => void onCreateSupplier(e)}
                      >
                        <input
                          value={newSupplierName}
                          onChange={(e) => setNewSupplierName(e.target.value)}
                          placeholder={t('suppliers.name')}
                          required
                          autoFocus
                          disabled={addSupplierBusy}
                        />
                        <button type="submit" className="btn btn-primary" disabled={addSupplierBusy}>
                          {addSupplierBusy ? t('settings.saving') : t('suppliers.add')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost-inline"
                          disabled={addSupplierBusy}
                          onClick={resetAddSupplier}
                        >
                          {t('settings.cancel')}
                        </button>
                        {addSupplierError && <div className="error-banner">{addSupplierError}</div>}
                      </form>
                    )}
                  </div>
                </div>

                <label className="settings-field business-expense-form__stretch-field">
                  <span className="settings-field-label-row">{t('businessExpenses.notes')}</span>
                  <textarea
                    className="business-expense-form__stretch-input"
                    rows={5}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </label>
              </div>

              <section className="business-expense-form__docs">
                <div className="business-expense-form__docs-head">
                  <span className="settings-field-label-row">{t('businessExpenses.documents')}</span>
                  <div className="business-expense-form__docs-actions">
                    <label
                      className={`btn btn-secondary pr-doc-upload-label${
                        !canManageDocs || docUploading || scanning ? ' pr-doc-upload-label--disabled' : ''
                      }`}
                    >
                      {docUploading ? t('purchaseReceipts.uploading') : t('purchaseReceipts.addDocument')}
                      <input
                        ref={docFileInputRef}
                        type="file"
                        accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/*"
                        multiple
                        className="sr-only"
                        disabled={!canManageDocs || docUploading || scanning}
                        onChange={(e) => void onPickDocument(e)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!canManageDocs || docUploading || scanning}
                      onClick={() => void onScanDocument()}
                    >
                      {scanning
                        ? scanPhase === 'starting'
                          ? t('purchaseReceipts.scanAgentStarting')
                          : t('purchaseReceipts.scanningDocument')
                        : t('purchaseReceipts.scanDocument')}
                    </button>
                  </div>
                </div>
                {!form.id && pendingFiles.length === 0 && (
                  <p className="muted business-expense-form__docs-hint">{t('businessExpenses.documentsAfterSave')}</p>
                )}
                {docError && <div className="error-banner">{docError}</div>}
                {(allDocs.length > 0 || pendingDocNames.length > 0) && (
                  <ul className="business-expense-form__doc-list">
                    {allDocs.map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          className="business-expense-form__doc-link"
                          title={t('businessExpenses.viewDocument')}
                          onClick={() => form.id && void openSavedDocumentPreview(form.id, doc)}
                        >
                          <span className="pr-doc-clip" aria-hidden="true">
                            📎
                          </span>
                          <span className="business-expense-form__doc-name">{doc.fileName}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={docUploading || deleteDocBusy}
                          onClick={() => onRemoveDocument(doc.id)}
                        >
                          {t('products.actionDelete')}
                        </button>
                      </li>
                    ))}
                    {pendingDocNames.map((name, index) => (
                      <li key={`pending-${name}-${index}`}>
                        <button
                          type="button"
                          className="business-expense-form__doc-link"
                          title={t('businessExpenses.viewDocument')}
                          onClick={() => openPendingFilePreview(pendingFiles[index])}
                        >
                          <span className="pr-doc-clip" aria-hidden="true">
                            📎
                          </span>
                          <span className="business-expense-form__doc-name">{name}</span>
                        </button>
                        <span className="muted business-expense-form__doc-pending">{t('businessExpenses.pendingUpload')}</span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => onRemovePendingFile(index)}
                        >
                          {t('products.actionDelete')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="business-expense-form__actions">
              <button
                type="button"
                className="btn btn-ghost-inline"
                onClick={closeModal}
                disabled={saving || docUploading || scanning || addSupplierBusy}
              >
                {t('settings.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || docUploading || scanning || addSupplierBusy}>
                {saving ? t('settings.saving') : t('settings.saveToDb')}
              </button>
            </div>
          </form>
        </div>
      </AppModal>

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('businessExpenses.title')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        downloadFileName={pdfDownloadFileName}
      />

      <DocumentPdfPreviewModal
        open={attachmentPreview.open}
        title={attachmentPreview.title}
        pdfUrl={attachmentPreview.url}
        loading={attachmentPreview.loading}
        error={attachmentPreview.error}
        isImage={attachmentPreview.isImage}
        downloadLabel={t('settings.downloadFile')}
        downloadFileName={attachmentPreview.downloadFileName}
        onClose={closeAttachmentPreview}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('businessExpenses.deleteConfirmTitle')}
        message={t('businessExpenses.deleteConfirm', {
          name: deleteTarget?.notes?.trim() || deleteTarget?.expenseDate || '',
        })}
        confirmLabel={t('businessExpenses.deleteConfirmAction')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={deleteDocTarget !== null}
        title={t('businessExpenses.removeDocumentConfirmTitle')}
        message={t('businessExpenses.removeDocumentConfirm', {
          name: deleteDocTarget?.fileName ?? '',
        })}
        confirmLabel={t('businessExpenses.removeDocumentConfirmAction')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleteDocBusy}
        onConfirm={() => void confirmRemoveDocument()}
        onCancel={() => !deleteDocBusy && setDeleteDocTarget(null)}
      />
    </div>
  );
}
