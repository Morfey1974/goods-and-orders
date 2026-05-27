import type { ResizablePanelConfig } from './modalSize';

/** localStorage keys for persisted modal / wizard panel sizes (see useResizablePanel). */
export const RESIZABLE_PANEL_KEYS = {
  documentWizard: 'ordermgmt.document-wizard-form-size',
  receiptWizard: 'ordermgmt.receipt-wizard-form-size',
  documentPdfPreview: 'ordermgmt.document-pdf-preview-size',
  productCard: 'ordermgmt.product-card-modal-size',
  bankModal: 'ordermgmt.bank-modal-size',
  documentEmail: 'ordermgmt.document-email-modal-size',
  warehouseMovements: 'ordermgmt.warehouse-movements-modal-size',
  warehouseManage: 'ordermgmt.warehouse-manage-modal-size',
  warehouseReceipt: 'ordermgmt.warehouse-receipt-modal-size',
  complianceEmail: 'ordermgmt.compliance-email-modal-size',
} as const;

export const DOCUMENT_WIZARD_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.documentWizard,
  minWidth: 520,
  minHeight: 420,
  defaultSize: { width: 1000, height: 760 },
};

export const RECEIPT_WIZARD_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.receiptWizard,
  minWidth: 960,
  minHeight: 480,
  defaultSize: { width: 1280, height: 760 },
};

export const DOCUMENT_PDF_PREVIEW_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.documentPdfPreview,
  minWidth: 640,
  minHeight: 480,
  defaultSize: { width: 1000, height: 780 },
};

export const PRODUCT_CARD_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.productCard,
  minWidth: 420,
  minHeight: 380,
  defaultSize: { width: 720, height: 680 },
  applyDefaultWhenEmpty: false,
};

export const BANK_MODAL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.bankModal,
  minWidth: 640,
  minHeight: 420,
  defaultSize: { width: 860, height: 680 },
  applyDefaultWhenEmpty: false,
};

export const DOCUMENT_EMAIL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.documentEmail,
  minWidth: 480,
  minHeight: 420,
  defaultSize: { width: 720, height: 640 },
};

export const WAREHOUSE_MOVEMENTS_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.warehouseMovements,
  minWidth: 640,
  minHeight: 420,
  defaultSize: { width: 960, height: 720 },
};

export const WAREHOUSE_MANAGE_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.warehouseManage,
  minWidth: 640,
  minHeight: 420,
  defaultSize: { width: 920, height: 680 },
};

export const WAREHOUSE_RECEIPT_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.warehouseReceipt,
  minWidth: 400,
  minHeight: 380,
  defaultSize: { width: 480, height: 520 },
};

export const COMPLIANCE_EMAIL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.complianceEmail,
  minWidth: 480,
  minHeight: 420,
  defaultSize: { width: 720, height: 640 },
};
