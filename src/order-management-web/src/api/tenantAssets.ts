const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type ComplianceDocumentKind =
  | 'AccountOwnership'
  | 'BusinessCard'
  | 'BooksManagement'
  | 'WithholdingTax';

export const COMPLIANCE_DOCUMENT_KINDS: ComplianceDocumentKind[] = [
  'AccountOwnership',
  'BusinessCard',
  'BooksManagement',
  'WithholdingTax',
];

export type TenantComplianceDocumentInfo = {
  kind: ComplianceDocumentKind;
  originalFileName: string;
  fileSizeBytes: number;
  uploadedAt: string;
};

export type TenantAssetsSummary = {
  hasLogo: boolean;
  hasSignature: boolean;
  complianceDocuments: TenantComplianceDocumentInfo[];
};

export type SendComplianceEmailResponse = {
  sent: boolean;
  stub: boolean;
  message: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const message = typeof data.message === 'string' ? data.message : '';
    if (res.status === 404 && !message) {
      throw new Error(
        'API endpoint not found. Restart or rebuild the API container (docker compose up --build api).'
      );
    }
    throw new Error(message || text || res.statusText);
  }
  return data as T;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function mapSummary(raw: Record<string, unknown>): TenantAssetsSummary {
  const docs = (raw.complianceDocuments as Record<string, unknown>[] | undefined) ?? [];
  return {
    hasLogo: Boolean(raw.hasLogo),
    hasSignature: Boolean(raw.hasSignature),
    complianceDocuments: docs.map((d) => ({
      kind: d.kind as ComplianceDocumentKind,
      originalFileName: String(d.originalFileName ?? ''),
      fileSizeBytes: Number(d.fileSizeBytes ?? 0),
      uploadedAt: String(d.uploadedAt ?? ''),
    })),
  };
}

export const tenantAssetsApi = {
  getSummary: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets`, {
      headers: authHeaders(token),
    });
    return mapSummary((await parseJson<Record<string, unknown>>(res)) as Record<string, unknown>);
  },

  fetchLogoBlob: async (token: string, cacheBust?: number) => {
    const v = cacheBust ?? Date.now();
    const res = await fetch(`${API_BASE}/api/tenant/assets/logo?v=${v}`, {
      headers: authHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.blob();
  },

  fetchSignatureBlob: async (token: string, cacheBust?: number) => {
    const v = cacheBust ?? Date.now();
    const res = await fetch(`${API_BASE}/api/tenant/assets/signature?v=${v}`, {
      headers: authHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.blob();
  },

  fetchBrandingSamplePdfBlob: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets/branding-sample/pdf`, {
      headers: authHeaders(token),
      cache: 'no-store',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = typeof (data as { message?: string }).message === 'string'
        ? (data as { message: string }).message
        : res.statusText;
      throw new Error(message);
    }
    return res.blob();
  },

  uploadLogo: async (token: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/tenant/assets/logo`, {
      method: 'POST',
      headers: authHeaders(token),
      body: fd,
    });
    return mapSummary(await parseJson(res));
  },

  deleteLogo: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets/logo`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    return mapSummary(await parseJson(res));
  },

  uploadSignature: async (token: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/tenant/assets/signature`, {
      method: 'POST',
      headers: authHeaders(token),
      body: fd,
    });
    return mapSummary(await parseJson(res));
  },

  deleteSignature: async (token: string) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets/signature`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    return mapSummary(await parseJson(res));
  },

  fetchComplianceBlob: async (token: string, kind: ComplianceDocumentKind) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets/compliance/${kind}`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.blob();
  },

  uploadCompliance: async (token: string, kind: ComplianceDocumentKind, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/tenant/assets/compliance/${kind}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: fd,
    });
    return mapSummary(await parseJson(res));
  },

  deleteCompliance: async (token: string, kind: ComplianceDocumentKind) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets/compliance/${kind}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    return mapSummary(await parseJson(res));
  },

  sendComplianceEmail: async (
    token: string,
    body: {
      recipients: string[];
      subject?: string;
      body?: string;
      documentKinds: ComplianceDocumentKind[];
    }
  ) => {
    const res = await fetch(`${API_BASE}/api/tenant/assets/compliance/send-email`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return parseJson<SendComplianceEmailResponse>(res);
  },
};

export function findComplianceDoc(
  summary: TenantAssetsSummary | null,
  kind: ComplianceDocumentKind
) {
  return summary?.complianceDocuments.find((d) => d.kind === kind);
}
