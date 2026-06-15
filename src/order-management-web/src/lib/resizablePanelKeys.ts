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
  productsCatalogColumns: 'ordermgmt.products-catalog-column-widths',
  productGroups: 'ordermgmt.product-groups-modal-size',
  documentProductPicker: 'ordermgmt.document-product-picker-size',
  purchaseReceiptPicker: 'ordermgmt.purchase-receipt-picker-size',
  bomComponentPicker: 'ordermgmt.bom-component-picker-size',
  purchaseReceiptLinesColumns: 'ordermgmt.purchase-receipt-lines-column-widths',
  inventoryValuationColumns: 'ordermgmt.inventory-valuation-column-widths',
  inventoryValuationReport: 'ordermgmt.inventory-valuation-report-size',
  warehouseBalancesColumns: 'ordermgmt.warehouse-balances-column-widths',
  warehouseBalancesPanel: 'ordermgmt.warehouse-balances-panel-size',
  productPhotoPreview: 'ordermgmt.product-photo-preview-size',
  ordersColumns: 'ordermgmt.orders-column-widths',
  ordersPanel: 'ordermgmt.orders-panel-size',
  customersColumns: 'ordermgmt.customers-column-widths',
  customersPanel: 'ordermgmt.customers-panel-size',
  suppliersColumns: 'ordermgmt.suppliers-column-widths',
  suppliersPanel: 'ordermgmt.suppliers-panel-size',
  productsPanel: 'ordermgmt.products-panel-size',
  purchaseReceiptsColumns: 'ordermgmt.purchase-receipts-column-widths',
  purchaseReceiptsPanel: 'ordermgmt.purchase-receipts-panel-size',
  assembliesPanel: 'ordermgmt.assemblies-panel-size',
  assemblyDetailPanel: 'ordermgmt.assembly-detail-panel-size',
  documentsColumns: 'ordermgmt.documents-column-widths',
  documentsPanel: 'ordermgmt.documents-panel-size',
  businessExpensesColumns: 'ordermgmt.business-expenses-column-widths',
  incomeReportPanel: 'ordermgmt.income-report-panel-size',
  expenseReportPanel: 'ordermgmt.expense-report-panel-size',
  businessExpensesPanel: 'ordermgmt.business-expenses-panel-size',
  businessExpenseModal: 'ordermgmt.business-expense-modal-size',
  fixedAssetsPanel: 'ordermgmt.fixed-assets-panel-size',
  fixedAssetsColumns: 'ordermgmt.fixed-assets-column-widths',
  fixedAssetModal: 'ordermgmt.fixed-asset-modal-size',
  cogsReportPanel: 'ordermgmt.cogs-report-panel-size',
  operatingExpensesReportPanel: 'ordermgmt.operating-expenses-report-panel-size',
  form1342ReportPanel: 'ordermgmt.form1342-report-panel-size',
  vendorServicesReportPanel: 'ordermgmt.vendor-services-report-panel-size',
  dashboardOpenDocsPanel: 'ordermgmt.dashboard-open-docs-panel-size',
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

export const PRODUCT_GROUPS_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.productGroups,
  minWidth: 720,
  minHeight: 480,
  defaultSize: { width: 1000, height: 720 },
};

export const DOCUMENT_PRODUCT_PICKER_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.documentProductPicker,
  minWidth: 720,
  minHeight: 480,
  defaultSize: { width: 1100, height: 760 },
};

export const PURCHASE_RECEIPT_PICKER_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.purchaseReceiptPicker,
  minWidth: 720,
  minHeight: 480,
  defaultSize: { width: 1100, height: 760 },
};

export const BOM_COMPONENT_PICKER_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.bomComponentPicker,
  minWidth: 720,
  minHeight: 480,
  defaultSize: { width: 1100, height: 760 },
};

export const PRODUCT_PHOTO_PREVIEW_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.productPhotoPreview,
  minWidth: 320,
  minHeight: 280,
  defaultSize: { width: 640, height: 720 },
};

export const INVENTORY_VALUATION_REPORT_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.inventoryValuationReport,
  minWidth: 640,
  minHeight: 360,
  defaultSize: { width: 1120, height: 560 },
  expandToParent: true,
  resizeWidthFromCenter: true,
};

export const WAREHOUSE_BALANCES_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.warehouseBalancesPanel,
  minWidth: 560,
  minHeight: 320,
  defaultSize: { width: 1120, height: 520 },
  expandToParent: true,
  resizeWidthFromCenter: true,
};

const LIST_PANEL_DEFAULT: Omit<ResizablePanelConfig, 'storageKey'> = {
  minWidth: 560,
  minHeight: 320,
  defaultSize: { width: 1120, height: 520 },
  expandToParent: true,
  resizeWidthFromCenter: true,
};

export const ORDERS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.ordersPanel,
  ...LIST_PANEL_DEFAULT,
};

export const CUSTOMERS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.customersPanel,
  ...LIST_PANEL_DEFAULT,
};

export const SUPPLIERS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.suppliersPanel,
  ...LIST_PANEL_DEFAULT,
};

export const PRODUCTS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.productsPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 560 },
};

export const PURCHASE_RECEIPTS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.purchaseReceiptsPanel,
  ...LIST_PANEL_DEFAULT,
};

export const ASSEMBLIES_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.assembliesPanel,
  ...LIST_PANEL_DEFAULT,
};

export const ASSEMBLY_DETAIL_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.assemblyDetailPanel,
  minWidth: 640,
  minHeight: 420,
  defaultSize: { width: 1120, height: 720 },
  expandToParent: true,
  resizeWidthFromCenter: true,
};

export const DOCUMENTS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.documentsPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 600 },
};

export const INCOME_REPORT_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.incomeReportPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 600 },
};

export const EXPENSE_REPORT_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.expenseReportPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 600 },
};

export const BUSINESS_EXPENSES_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.businessExpensesPanel,
  ...LIST_PANEL_DEFAULT,
};

export const BUSINESS_EXPENSE_MODAL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.businessExpenseModal,
  minWidth: 480,
  minHeight: 460,
  defaultSize: { width: 680, height: 680 },
};

export const FIXED_ASSETS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.fixedAssetsPanel,
  ...LIST_PANEL_DEFAULT,
};

export const FIXED_ASSET_MODAL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.fixedAssetModal,
  minWidth: 420,
  minHeight: 420,
  defaultSize: { width: 560, height: 580 },
};

export const COGS_REPORT_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.cogsReportPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 600 },
};

export const OPERATING_EXPENSES_REPORT_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.operatingExpensesReportPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 600 },
};

export const FORM1342_REPORT_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.form1342ReportPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 640 },
};

export const VENDOR_SERVICES_REPORT_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.vendorServicesReportPanel,
  ...LIST_PANEL_DEFAULT,
  defaultSize: { width: 1280, height: 600 },
};

export const DASHBOARD_OPEN_DOCS_PANEL_RESIZE: ResizablePanelConfig = {
  storageKey: RESIZABLE_PANEL_KEYS.dashboardOpenDocsPanel,
  minWidth: 560,
  minHeight: 220,
  defaultSize: { width: 2400, height: 420 },
  expandToParent: true,
  resizeWidthFromCenter: true,
};
