import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { catalogApi, type Product } from '../api/catalog';
import {
  DocumentCreateWizard,
  type WizardDocumentType,
} from '../components/documents/DocumentCreateWizard';
import { ReceiptEditWizard } from '../components/documents/ReceiptEditWizard';
import { CatalogRowMenu } from '../components/products/CatalogRowMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { DocumentEmailModal } from '../components/documents/DocumentEmailModal';
import {
  buildIssueContextMap,
  DocumentIssueMenu,
} from '../components/documents/DocumentIssueMenu';
import { documentsApi, type Document, type DocumentListResponse } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import {
  DOCUMENTS_COLUMN_CLASS,
  DOCUMENTS_COLUMN_KEYS,
  DOCUMENTS_COLUMN_WIDTHS_KEY,
  DOCUMENTS_DEFAULT_WIDTHS,
  DOCUMENTS_TEXT_START_COLUMNS,
  type DocumentsColumnKey,
} from '../lib/listTableColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { DOCUMENTS_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import '../styles/products-catalog.css';
import '../styles/documents.css';

const STATUS_CLASS: Record<string, string> = {
  Draft: 'draft',
  Sent: 'sent',
  Open: 'open',
  Paid: 'paid',
  Closed: 'closed',
  Cancelled: 'cancelled',
};

const TYPE_CLASS: Record<string, string> = {
  Quote: 'quote',
  ChargeInvoice: 'charge',
  Receipt: 'receipt',
  Order: 'order',
};

function formatMoney(n: number) {
  return `₪${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function isWizardDocument(doc: Document) {
  return doc.documentType === 'Quote' || doc.documentType === 'ChargeInvoice';
}

function canEditReceipt(doc: Document) {
  return doc.documentType === 'Receipt';
}

function canManageDocument(doc: Document) {
  return isWizardDocument(doc) || canEditReceipt(doc);
}

function hasClientOrder(doc: Document) {
  return Boolean(doc.clientOrderReceivedAt || doc.clientOrderFileName);
}

function supportsDocumentPdf(doc: Document) {
  return (
    doc.documentType === 'Quote' ||
    doc.documentType === 'ChargeInvoice' ||
    doc.documentType === 'Receipt'
  );
}

function documentPdfFileName(doc: Document) {
  const num = doc.documentNumber.replace(/^[A-Z]+-/, '');
  switch (doc.documentType) {
    case 'ChargeInvoice':
      return `invoice-${num}.pdf`;
    case 'Receipt':
      return `receipt-${num}.pdf`;
    default:
      return `quote-${num}.pdf`;
  }
}

function documentHasActions(doc: Document) {
  return (
    canManageDocument(doc) ||
    supportsDocumentPdf(doc) ||
    (doc.documentType === 'ChargeInvoice' && doc.status === 'Open')
  );
}

function formatDocNumber(num: string) {
  return num.replace(/^[A-Z]+-/, '');
}

function relatedDocNumbersForDelete(
  doc: Document,
  issueContextMap: Map<string, { chargeForQuote?: Document; receiptForCharge?: Document }>
): string[] {
  const ctx = issueContextMap.get(doc.id);
  const numbers: string[] = [];
  if (ctx?.receiptForCharge)
    numbers.push(formatDocNumber(ctx.receiptForCharge.documentNumber));
  if (ctx?.chargeForQuote) {
    numbers.push(formatDocNumber(ctx.chargeForQuote.documentNumber));
    const chargeCtx = issueContextMap.get(ctx.chargeForQuote.id);
    if (chargeCtx?.receiptForCharge) {
      const receiptNum = formatDocNumber(chargeCtx.receiptForCharge.documentNumber);
      if (!numbers.includes(receiptNum)) numbers.push(receiptNum);
    }
  }
  return numbers;
}

function mapDeleteError(message: string, t: (key: string) => string): string {
  if (message.includes('linked to an order'))
    return t('documents.deleteErrorOrderLinked');
  if (message.includes('Document not found'))
    return t('documents.deleteErrorNotFound');
  return message;
}

function monthLabel(year: number, month: number) {
  const lang = i18n.language;
  const locale = lang === 'he' ? 'he-IL' : lang === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  );
}

export function DocumentsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [wizardType, setWizardType] = useState<WizardDocumentType | null>(null);
  const [editDocumentId, setEditDocumentId] = useState<string | null>(null);
  const [duplicateFromDocumentId, setDuplicateFromDocumentId] = useState<string | null>(null);
  const [chargeFromQuoteId, setChargeFromQuoteId] = useState<string | null>(null);
  const [receiptEditId, setReceiptEditId] = useState<string | null>(null);
  const [receiptComposeOpen, setReceiptComposeOpen] = useState(false);
  const [preselectedChargeIds, setPreselectedChargeIds] = useState<string[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [rowMenuDoc, setRowMenuDoc] = useState<Document | null>(null);
  const [issueMenuDocId, setIssueMenuDocId] = useState<string | null>(null);
  const rowMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [customerFilterOptions, setCustomerFilterOptions] = useState<{ id: string; name: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pdfPreviewDoc, setPdfPreviewDoc] = useState<Document | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [emailDoc, setEmailDoc] = useState<Document | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!token) return;
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (filterType) params.documentType = filterType;
    if (filterStatus) params.status = filterStatus;
    if (filterCustomerId) params.customerId = filterCustomerId;
    documentsApi
      .list(token, params)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token, search, filterType, filterStatus, filterCustomerId]);

  useEffect(() => {
    if (!token) return;
    catalogApi.customers.list(token, true).then((c) => {
      const sorted = [...c].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
      setCustomerFilterOptions(sorted.map((x) => ({ id: x.id, name: x.name })));
      setCustomers(sorted.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name })));
    });
    catalogApi.products.list(token, undefined, true).then((p) =>
      setProducts(p.filter((x) => x.isActive))
    );
  }, [token]);

  const reloadCustomers = useCallback(() => {
    if (!token) return;
    catalogApi.customers.list(token, true).then((c) => {
      const sorted = [...c].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
      setCustomerFilterOptions(sorted.map((x) => ({ id: x.id, name: x.name })));
      setCustomers(sorted.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name })));
    });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.documents-create-wrap')) {
        setMenuOpen(false);
      }
      if (
        !el.closest('.row-menu-wrap') &&
        !el.closest('.row-menu--portal') &&
        !el.closest('.action-plus-wrap') &&
        !el.closest('.action-dropdown')
      ) {
        setRowMenuDoc(null);
        setIssueMenuDocId(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const openCharges = useMemo(() => {
    if (!data) return [];
    return data.groups.flatMap((g) =>
      g.documents.filter((d) => d.documentType === 'ChargeInvoice' && d.status === 'Open')
    );
  }, [data]);

  const allDocuments = useMemo(
    () => data?.groups.flatMap((g) => g.documents) ?? [],
    [data]
  );

  const chargeIdsInDraftReceipts = useMemo(() => {
    const ids = new Set<string>();
    for (const doc of allDocuments) {
      if (doc.documentType !== 'Receipt' || doc.status !== 'Draft') continue;
      for (const allocation of doc.chargeAllocations ?? []) {
        ids.add(allocation.chargeInvoiceId);
      }
      if (doc.parentDocumentId) ids.add(doc.parentDocumentId);
    }
    return ids;
  }, [allDocuments]);

  const selectableOpenCharges = useMemo(
    () => openCharges.filter((c) => !chargeIdsInDraftReceipts.has(c.id)),
    [openCharges, chargeIdsInDraftReceipts]
  );

  const selectedChargeDocs = useMemo(
    () => selectableOpenCharges.filter((c) => selectedChargeIds.includes(c.id)),
    [selectableOpenCharges, selectedChargeIds]
  );

  const selectedChargeCustomerIds = useMemo(
    () => new Set(selectedChargeDocs.map((c) => c.customerId)),
    [selectedChargeDocs]
  );

  const canSelectChargeRow = (doc: Document) =>
    doc.documentType === 'ChargeInvoice' &&
    doc.status === 'Open' &&
    !chargeIdsInDraftReceipts.has(doc.id);

  const toggleChargeSelection = (doc: Document) => {
    if (!canSelectChargeRow(doc)) return;
    setSelectedChargeIds((prev) =>
      prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
    );
  };

  const clearChargeSelection = () => setSelectedChargeIds([]);

  const openReceiptFromSelection = () => {
    if (selectedChargeDocs.length === 0) return;
    if (selectedChargeCustomerIds.size !== 1) {
      setError(t('documents.receiptMultiSameCustomer'));
      return;
    }
    setError('');
    setPreselectedChargeIds(selectedChargeDocs.map((c) => c.id));
    setReceiptComposeOpen(true);
    setReceiptEditId(null);
  };

  type DocumentWithMonth = Document & { monthKey: string; year: number; month: number };

  const documentsWithMonth = useMemo<DocumentWithMonth[]>(
    () =>
      data?.groups.flatMap((g) =>
        g.documents.map((d) => ({
          ...d,
          monthKey: g.monthKey,
          year: g.year,
          month: g.month,
        }))
      ) ?? [],
    [data]
  );

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    DOCUMENTS_COLUMN_WIDTHS_KEY,
    DOCUMENTS_DEFAULT_WIDTHS
  );

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(
    documentsWithMonth,
    [search, filterType, filterStatus, filterCustomerId]
  );

  const pageGroups = useMemo(() => {
    const groups: { monthKey: string; year: number; month: number; documents: DocumentWithMonth[] }[] = [];
    const indexByKey = new Map<string, number>();
    for (const doc of pageItems) {
      const idx = indexByKey.get(doc.monthKey);
      if (idx === undefined) {
        indexByKey.set(doc.monthKey, groups.length);
        groups.push({ monthKey: doc.monthKey, year: doc.year, month: doc.month, documents: [doc] });
      } else {
        groups[idx].documents.push(doc);
      }
    }
    return groups;
  }, [pageItems]);

  const issueContextMap = useMemo(
    () => buildIssueContextMap(allDocuments),
    [allDocuments]
  );

  const openCreate = (type: 'Quote' | 'ChargeInvoice' | 'Receipt') => {
    setMenuOpen(false);
    setError('');
    if (type === 'Quote' || type === 'ChargeInvoice') {
      setEditDocumentId(null);
      setDuplicateFromDocumentId(null);
      setChargeFromQuoteId(null);
      setWizardType(type);
      return;
    }
    setReceiptComposeOpen(true);
    setReceiptEditId(null);
    setPreselectedChargeIds([]);
    setError('');
  };

  const toggleRowMenu = (doc: Document, btn: HTMLButtonElement) => {
    setIssueMenuDocId(null);
    if (rowMenuDoc?.id === doc.id) {
      setRowMenuDoc(null);
      return;
    }
    rowMenuAnchorRef.current = btn;
    setRowMenuDoc(doc);
  };

  const closeWizard = () => {
    setWizardType(null);
    setEditDocumentId(null);
    setDuplicateFromDocumentId(null);
    setChargeFromQuoteId(null);
  };

  const openReceiptEditor = (receiptId: string) => {
    setRowMenuDoc(null);
    setReceiptEditId(receiptId);
    setError('');
  };

  const closeReceiptEditor = () => {
    setReceiptEditId(null);
    setReceiptComposeOpen(false);
    setPreselectedChargeIds([]);
    setSelectedChargeIds([]);
  };

  const onEditDocument = (doc: Document) => {
    if (!canManageDocument(doc)) return;
    setRowMenuDoc(null);
    setDuplicateFromDocumentId(null);
    setChargeFromQuoteId(null);
    if (doc.documentType === 'Receipt') {
      openReceiptEditor(doc.id);
      return;
    }
    setEditDocumentId(doc.id);
    setWizardType(doc.documentType as WizardDocumentType);
    setError('');
  };

  const onDuplicateDocument = async (doc: Document) => {
    if (!token || !canManageDocument(doc)) return;
    setRowMenuDoc(null);
    setEditDocumentId(null);
    setChargeFromQuoteId(null);
    setError('');
    setWizardType(doc.documentType as WizardDocumentType);
    setDuplicateFromDocumentId(doc.id);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await documentsApi.delete(token, deleteTarget.id);
      setMessage(t('documents.deleted'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Error';
      setError(mapDeleteError(raw, t));
    } finally {
      setDeleteBusy(false);
    }
  };

  const closePdfPreview = useCallback(() => {
    setPdfPreviewDoc(null);
    setPdfPreviewError(null);
    setPdfPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  useEffect(() => () => {
    setPdfPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  const openPdfPreview = async (doc: Document) => {
    if (!token || !supportsDocumentPdf(doc)) return;
    setRowMenuDoc(null);
    setError('');
    setPdfPreviewDoc(doc);
    setPdfPreviewLoading(true);
    setPdfPreviewError(null);
    setPdfPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    try {
      const blob = await documentsApi.fetchPdfBlob(token, doc.id);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
    } catch (err) {
      setPdfPreviewError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  const onDownloadPdf = async (doc: Document) => {
    if (!token || !supportsDocumentPdf(doc)) return;
    setRowMenuDoc(null);
    setError('');
    try {
      await documentsApi.downloadPdf(token, doc.id, documentPdfFileName(doc));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onIssueCharge = (quote: Document) => {
    setRowMenuDoc(null);
    setError('');
    setEditDocumentId(null);
    setDuplicateFromDocumentId(null);
    setChargeFromQuoteId(quote.id);
    setWizardType('ChargeInvoice');
    setMessage('');
  };

  const resolveReceiptForDoc = (doc: Document) => {
    const ctx = issueContextMap.get(doc.id);
    return ctx?.receiptForCharge;
  };

  const onImportCsv = async (file: File) => {
    if (!token) return;
    setImportBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await documentsApi.importCsv(token, file);
      setMessage(
        t('documents.importResult', {
          imported: result.imported,
          skipped: result.skipped,
          linked: result.linked,
        })
      );
      if (result.errors.length > 0) {
        const preview = result.errors
          .slice(0, 5)
          .map((e) => `${e.line}: ${e.message}`)
          .join('; ');
        setError(t('documents.importErrors', { count: result.errors.length, preview }));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setImportBusy(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const onIssueReceipt = async (doc: Document) => {
    if (!token) return;
    setIssueBusy(true);
    setError('');
    setRowMenuDoc(null);
    try {
      const existing = resolveReceiptForDoc(doc);
      if (existing) {
        openReceiptEditor(existing.id);
        return;
      }
      const receipt = await documentsApi.issueReceipt(token, doc.id, {
        paymentMethod: doc.paymentMethod || undefined,
      });
      openReceiptEditor(receipt.id);
      setMessage('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setIssueBusy(false);
    }
  };

  const summary = data?.summary;

  const columnLabel = (key: DocumentsColumnKey): string => {
    switch (key) {
      case 'select':
        return '';
      case 'number':
        return t('documents.colNumber');
      case 'status':
        return t('documents.colStatus');
      case 'type':
        return t('documents.colType');
      case 'customer':
        return t('documents.colCustomer');
      case 'clientOrder':
        return t('documents.colClientOrder');
      case 'description':
        return t('documents.colDescription');
      case 'payment':
        return t('documents.colPayment');
      case 'date':
        return t('documents.colDate');
      case 'due':
        return t('documents.colDue');
      case 'amount':
        return t('documents.colAmount');
      case 'actions':
        return t('products.actions');
      default:
        return key;
    }
  };

  const cellClass = (key: DocumentsColumnKey) =>
    `${DOCUMENTS_COLUMN_CLASS[key]}${DOCUMENTS_TEXT_START_COLUMNS.has(key) ? ' dt-col-text-start' : ''}`;

  const renderDocumentRow = (doc: Document) => (
    <tr
      key={doc.id}
      className={`dt-panel-doc-row${selectedChargeIds.includes(doc.id) ? ' is-charge-selected' : ''}`}
    >
      <td className={cellClass('select')}>
        {canSelectChargeRow(doc) ? (
          <input
            type="checkbox"
            checked={selectedChargeIds.includes(doc.id)}
            onChange={() => toggleChargeSelection(doc)}
            aria-label={t('documents.colNumber')}
          />
        ) : null}
      </td>
      <td className={cellClass('number')}>
        {supportsDocumentPdf(doc) ? (
          <button
            type="button"
            className="doc-number-link"
            onClick={() => void openPdfPreview(doc)}
            title={t('documents.previewPdf')}
          >
            <code>{doc.documentNumber.replace(/^[A-Z]+-/, '')}</code>
          </button>
        ) : (
          <code>{doc.documentNumber.replace(/^[A-Z]+-/, '')}</code>
        )}
      </td>
      <td className={cellClass('status')}>
        <span className={`doc-badge doc-badge-${STATUS_CLASS[doc.status] ?? 'draft'}`}>
          {t(`documents.statuses.${STATUS_CLASS[doc.status] ?? 'draft'}`)}
        </span>
      </td>
      <td className={cellClass('type')}>
        <span className={`doc-type-${TYPE_CLASS[doc.documentType] ?? 'quote'}`}>
          {t(`documents.types.${doc.documentType}`)}
        </span>
      </td>
      <td className={`${cellClass('customer')} bidi-auto`}>{doc.customerName}</td>
      <td className={cellClass('clientOrder')}>
        {doc.documentType === 'Quote' ? (
          hasClientOrder(doc) ? (
            <span className="doc-client-order-flag" title={doc.clientOrderReference ?? undefined}>
              {t('documents.colClientOrder')}
            </span>
          ) : (
            '—'
          )
        ) : (
          '—'
        )}
      </td>
      <td className={cellClass('description')}>{doc.description ?? '—'}</td>
      <td className={cellClass('payment')}>{doc.paymentMethod ?? '—'}</td>
      <td className={cellClass('date')}>{formatDate(doc.issueDate)}</td>
      <td className={cellClass('due')}>{doc.dueDate ? formatDate(doc.dueDate) : '—'}</td>
      <td className={cellClass('amount')}>{formatMoney(doc.totalAmount)}</td>
      <td className={cellClass('actions')}>
        <div className="doc-actions table-actions-cell">
          <DocumentIssueMenu
            doc={doc}
            context={issueContextMap.get(doc.id) ?? {}}
            busy={issueBusy}
            menuOpen={issueMenuDocId === doc.id}
            onMenuOpenChange={(open) => {
              if (open) {
                setRowMenuDoc(null);
                setIssueMenuDocId(doc.id);
              } else if (issueMenuDocId === doc.id) {
                setIssueMenuDocId(null);
              }
            }}
            onIssueCharge={(q) => void onIssueCharge(q)}
            onIssueReceipt={(d) => void onIssueReceipt(d)}
          />
          {documentHasActions(doc) && (
            <div className={`row-menu-wrap${rowMenuDoc?.id === doc.id ? ' is-open' : ''}`}>
              <button
                type="button"
                className="row-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRowMenu(doc, e.currentTarget);
                }}
                aria-label={t('products.actions')}
                aria-expanded={rowMenuDoc?.id === doc.id}
              >
                ⋮
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="page documents-page">
      {message && <div className="success-banner">{message}</div>}
      {error && !wizardType && !receiptEditId && !receiptComposeOpen && (
        <div className="error-banner">{error}</div>
      )}

      <DataTablePanel
        resize={DOCUMENTS_PANEL_RESIZE}
        toolbar={
          <>
            <div className="dt-panel__toolbar-row">
              <DataTablePanelHeading
                title={t('nav.documents')}
                count={t('products.results', { count: total })}
              />
              <div className="documents-create-wrap dt-panel__toolbar-actions">
                <button type="button" className="btn btn-primary" onClick={() => setMenuOpen((v) => !v)}>
                  + {t('documents.create')}
                </button>
                {menuOpen && (
                  <div className="documents-create-menu">
                    <h3>{t('documents.createNew')}</h3>
                    <button type="button" onClick={() => openCreate('Quote')}>
                      {t('documents.types.Quote')}
                    </button>
                    <button type="button" onClick={() => openCreate('ChargeInvoice')}>
                      {t('documents.types.ChargeInvoice')}
                    </button>
                    <button type="button" onClick={() => openCreate('Receipt')}>
                      {t('documents.types.Receipt')}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {summary && (
              <div className="documents-summary">
                <div className="documents-summary-item">
                  <span className="label">{t('documents.totalReceipts')}</span>
                  <span className="value">{formatMoney(summary.totalReceipts)}</span>
                </div>
                <div className="documents-summary-item">
                  <span className="label">{t('documents.totalChargeInvoices')}</span>
                  <span className="value">{formatMoney(summary.totalChargeInvoices)}</span>
                </div>
                <div className="documents-summary-item">
                  <span className="label">{t('documents.totalQuotes')}</span>
                  <span className="value">{formatMoney(summary.totalQuotes)}</span>
                </div>
                <div className="documents-summary-item receivable">
                  <span className="label">{t('documents.totalReceivable')}</span>
                  <span className="value">{formatMoney(summary.totalReceivable)}</span>
                </div>
              </div>
            )}
          </>
        }
        toolbarSecondary={
          <div className="dt-panel-filters documents-toolbar" style={{ padding: 0, border: 'none' }}>
            <input
              type="search"
              className="dt-panel-search"
              placeholder={t('documents.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">{t('documents.allTypes')}</option>
              <option value="Quote">{t('documents.types.Quote')}</option>
              <option value="ChargeInvoice">{t('documents.types.ChargeInvoice')}</option>
              <option value="Receipt">{t('documents.types.Receipt')}</option>
            </select>
            <select
              className="documents-filter-customer"
              value={filterCustomerId}
              onChange={(e) => setFilterCustomerId(e.target.value)}
            >
              <option value="">{t('documents.allCustomers')}</option>
              {customerFilterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">{t('documents.allStatuses')}</option>
              <option value="Open">{t('documents.statuses.open')}</option>
              <option value="Sent">{t('documents.statuses.sent')}</option>
              <option value="Paid">{t('documents.statuses.paid')}</option>
              <option value="Closed">{t('documents.statuses.closed')}</option>
              <option value="Draft">{t('documents.statuses.draft')}</option>
            </select>
            <button type="button" className="btn btn-ghost-inline" onClick={load}>
              {t('documents.refresh')}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="documents-import-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportCsv(file);
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={importBusy}
              onClick={() => importInputRef.current?.click()}
            >
              {importBusy ? t('documents.importing') : t('documents.importCsv')}
            </button>
          </div>
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
        {total === 0 ? (
          <p className="muted dt-panel-empty">{t('documents.empty')}</p>
        ) : (
          <div className="dt-panel-doc-groups">
            <table className="dt-panel-table documents-table" style={{ minWidth: tableMinWidth }}>
              <colgroup>
                {DOCUMENTS_COLUMN_KEYS.map((key) => (
                  <col key={key} style={{ width: widths[key] }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {DOCUMENTS_COLUMN_KEYS.map((key) =>
                    key === 'select' ? (
                      <th key={key} className={cellClass('select')} aria-hidden />
                    ) : (
                      renderDataTableHeaderCell(
                        key,
                        columnLabel(key),
                        DOCUMENTS_COLUMN_CLASS[key],
                        onResizeHandleMouseDown,
                        t('products.resizeColumn'),
                        DOCUMENTS_TEXT_START_COLUMNS.has(key)
                      )
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {pageGroups.map((group) => (
                  <Fragment key={group.monthKey}>
                    <tr>
                      <td colSpan={DOCUMENTS_COLUMN_KEYS.length} className="dt-panel-doc-month">
                        {monthLabel(group.year, group.month)}
                      </td>
                    </tr>
                    {group.documents.map((doc) => renderDocumentRow(doc))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataTablePanel>

      {selectedChargeIds.length > 0 && (
        <div className="documents-charge-selection-bar" role="status">
          <span>{t('documents.receiptSelectionCount', { count: selectedChargeIds.length })}</span>
          <div className="documents-charge-selection-actions">
            <button type="button" className="btn btn-ghost-inline" onClick={clearChargeSelection}>
              {t('documents.receiptSelectionClear')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selectedChargeCustomerIds.size !== 1}
              title={
                selectedChargeCustomerIds.size !== 1
                  ? t('documents.receiptMultiSameCustomer')
                  : undefined
              }
              onClick={openReceiptFromSelection}
            >
              {t('documents.receiptCreateFromSelection')}
            </button>
          </div>
        </div>
      )}

      <CatalogRowMenu open={rowMenuDoc !== null} anchorRef={rowMenuAnchorRef}>
        {rowMenuDoc && (
          <>
            {supportsDocumentPdf(rowMenuDoc) && (
              <>
                <button type="button" onClick={() => void openPdfPreview(rowMenuDoc)}>
                  {t('documents.previewPdf')}
                </button>
                <button type="button" onClick={() => void onDownloadPdf(rowMenuDoc)}>
                  {t('documents.downloadPdf')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRowMenuDoc(null);
                    setEmailDoc(rowMenuDoc);
                  }}
                >
                  {t('documents.sendByEmail')}
                </button>
              </>
            )}
            {canManageDocument(rowMenuDoc) && (
              <button
                type="button"
                onClick={() => onEditDocument(rowMenuDoc)}
              >
                {t('documents.actionEdit')}
              </button>
            )}
            {canManageDocument(rowMenuDoc) && (
              <button type="button" onClick={() => void onDuplicateDocument(rowMenuDoc)}>
                {t('documents.actionDuplicate')}
              </button>
            )}
            {rowMenuDoc.documentType === 'ChargeInvoice' &&
              rowMenuDoc.status === 'Open' &&
              (() => {
                const r = issueContextMap.get(rowMenuDoc.id)?.receiptForCharge;
                return !r || r.status === 'Draft';
              })() && (
              <button
                type="button"
                onClick={() => {
                  setRowMenuDoc(null);
                  void onIssueReceipt(rowMenuDoc);
                }}
              >
                {issueContextMap.get(rowMenuDoc.id)?.receiptForCharge?.status === 'Draft'
                  ? t('documents.issueMenuReceiptDraft')
                  : t('documents.recordPayment')}
              </button>
            )}
            {canManageDocument(rowMenuDoc) && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setRowMenuDoc(null);
                  setDeleteTarget(rowMenuDoc);
                }}
              >
                {t('documents.actionDelete')}
              </button>
            )}
          </>
        )}
      </CatalogRowMenu>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('documents.deleteConfirmTitle')}
        message={
          deleteTarget
            ? (() => {
                const related = relatedDocNumbersForDelete(deleteTarget, issueContextMap);
                return related.length > 0
                  ? t('documents.deleteConfirmCascade', {
                      number: formatDocNumber(deleteTarget.documentNumber),
                      related: related.join(', '),
                    })
                  : t('documents.deleteConfirm', {
                      number: formatDocNumber(deleteTarget.documentNumber),
                    });
              })()
            : ''
        }
        confirmLabel={t('documents.actionDelete')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
      />

      {(receiptEditId || receiptComposeOpen) && token && (
        <ReceiptEditWizard
          open
          receiptId={receiptEditId}
          composeMode={receiptComposeOpen && !receiptEditId}
          preselectedChargeIds={preselectedChargeIds}
          openCharges={selectableOpenCharges.map((c) => ({
            id: c.id,
            documentNumber: c.documentNumber,
            customerId: c.customerId,
            customerName: c.customerName,
            totalAmount: c.totalAmount,
            description: c.description,
          }))}
          token={token}
          onClose={closeReceiptEditor}
          onDraftSaved={(saved) => {
            setReceiptEditId((id) => id ?? saved.id);
            load();
          }}
          onSuccess={(msg) => {
            setMessage(msg);
            closeReceiptEditor();
            load();
          }}
          onPreviewPdf={(doc) => void openPdfPreview(doc)}
          onSendEmail={(d) => setEmailDoc(d)}
        />
      )}

      {token && (
        <DocumentEmailModal
          open={emailDoc !== null}
          document={emailDoc}
          token={token}
          onClose={() => setEmailDoc(null)}
          onMessage={(msg, isError) => {
            if (isError) setError(msg);
            else setMessage(msg);
          }}
        />
      )}

      <DocumentPdfPreviewModal
        open={pdfPreviewDoc !== null}
        title={
          pdfPreviewDoc
            ? `${t(`documents.types.${pdfPreviewDoc.documentType}`)} ${pdfPreviewDoc.documentNumber.replace(/^[A-Z]+-/, '')}`
            : ''
        }
        pdfUrl={pdfPreviewUrl}
        loading={pdfPreviewLoading}
        error={pdfPreviewError}
        onClose={closePdfPreview}
        downloadFileName={pdfPreviewDoc ? documentPdfFileName(pdfPreviewDoc) : undefined}
      />

      {wizardType && token && (
        <DocumentCreateWizard
          open
          documentType={wizardType}
          token={token}
          customers={customers}
          products={products}
          editDocumentId={editDocumentId}
          duplicateFromDocumentId={duplicateFromDocumentId}
          chargeFromQuoteId={chargeFromQuoteId}
          onClose={closeWizard}
          onSuccess={(msg) => {
            setMessage(msg);
            closeWizard();
            load();
          }}
          onDraftSaved={load}
          onCustomersUpdated={reloadCustomers}
          onSendEmail={(doc) => setEmailDoc(doc)}
          onPreviewPdf={(doc) => void openPdfPreview(doc)}
        />
      )}

    </div>
  );
}
