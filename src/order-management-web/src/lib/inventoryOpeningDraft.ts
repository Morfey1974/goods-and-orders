export type OpeningBalanceDraftRow = {
  key: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCostIls: string;
};

export type OpeningBalanceDraft = {
  asOfDate: string;
  notes: string;
  rows: OpeningBalanceDraftRow[];
  savedAt: string;
};

const KEY_PREFIX = 'ordermgmt.inventory-opening-draft';

function storageKey(tenantId: string) {
  return `${KEY_PREFIX}.${tenantId}`;
}

export function loadOpeningDraft(tenantId: string): OpeningBalanceDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpeningBalanceDraft;
    if (!parsed || typeof parsed.asOfDate !== 'string' || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOpeningDraft(tenantId: string, draft: Omit<OpeningBalanceDraft, 'savedAt'>) {
  const payload: OpeningBalanceDraft = {
    ...draft,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey(tenantId), JSON.stringify(payload));
  return payload.savedAt;
}

export function clearOpeningDraft(tenantId: string) {
  localStorage.removeItem(storageKey(tenantId));
}

export function hasOpeningDraftContent(draft: Pick<OpeningBalanceDraft, 'notes' | 'rows'>) {
  return draft.rows.length > 0 || draft.notes.trim().length > 0;
}
