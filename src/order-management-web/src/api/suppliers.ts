import { request } from './http';

export type SupplierContact = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  sortOrder: number;
};

export type SupplierContactInput = {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  legalName?: string;
  countryCode?: string;
  taxId?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  fax?: string;
  website?: string;
  address?: string;
  city?: string;
  stateRegion?: string;
  zipCode?: string;
  bankBeneficiary?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankSwift?: string;
  bankIban?: string;
  defaultCurrency: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  version: number;
  contacts: SupplierContact[];
};

function mapContact(raw: Record<string, unknown>): SupplierContact {
  return {
    id: String(raw.id ?? raw.Id),
    fullName: String(raw.fullName ?? raw.FullName ?? ''),
    phone: (raw.phone ?? raw.Phone) as string | undefined,
    email: (raw.email ?? raw.Email) as string | undefined,
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
  };
}

export function mapSupplier(raw: Record<string, unknown>): Supplier {
  const contactsRaw = raw.contacts ?? raw.Contacts;
  const contacts = Array.isArray(contactsRaw)
    ? contactsRaw.map((c) => mapContact(c as Record<string, unknown>))
    : [];
  return {
    id: String(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
    legalName: (raw.legalName ?? raw.LegalName) as string | undefined,
    countryCode: (raw.countryCode ?? raw.CountryCode) as string | undefined,
    taxId: (raw.taxId ?? raw.TaxId) as string | undefined,
    contactPerson: (raw.contactPerson ?? raw.ContactPerson) as string | undefined,
    email: (raw.email ?? raw.Email) as string | undefined,
    phone: (raw.phone ?? raw.Phone) as string | undefined,
    mobilePhone: (raw.mobilePhone ?? raw.MobilePhone) as string | undefined,
    fax: (raw.fax ?? raw.Fax) as string | undefined,
    website: (raw.website ?? raw.Website) as string | undefined,
    address: (raw.address ?? raw.Address) as string | undefined,
    city: (raw.city ?? raw.City) as string | undefined,
    stateRegion: (raw.stateRegion ?? raw.StateRegion) as string | undefined,
    zipCode: (raw.zipCode ?? raw.ZipCode) as string | undefined,
    bankBeneficiary: (raw.bankBeneficiary ?? raw.BankBeneficiary) as string | undefined,
    bankName: (raw.bankName ?? raw.BankName) as string | undefined,
    bankBranch: (raw.bankBranch ?? raw.BankBranch) as string | undefined,
    bankAccountNumber: (raw.bankAccountNumber ?? raw.BankAccountNumber) as string | undefined,
    bankSwift: (raw.bankSwift ?? raw.BankSwift) as string | undefined,
    bankIban: (raw.bankIban ?? raw.BankIban) as string | undefined,
    defaultCurrency: String(raw.defaultCurrency ?? raw.DefaultCurrency ?? 'ILS'),
    notes: (raw.notes ?? raw.Notes) as string | undefined,
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
    version: Number(raw.version ?? raw.Version ?? 1),
    contacts,
  };
}

export type SupplierPayload = {
  name: string;
  legalName?: string | null;
  countryCode?: string | null;
  taxId?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  fax?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  zipCode?: string | null;
  bankBeneficiary?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountNumber?: string | null;
  bankSwift?: string | null;
  bankIban?: string | null;
  defaultCurrency?: string | null;
  notes?: string | null;
  isActive?: boolean;
  version?: number;
  contacts?: SupplierContactInput[];
};

export const suppliersApi = {
  list: async (
    token: string,
    opts?: { includeInactive?: boolean; country?: string; search?: string }
  ) => {
    const q = new URLSearchParams();
    if (opts?.includeInactive) q.set('includeInactive', 'true');
    if (opts?.country) q.set('country', opts.country);
    if (opts?.search) q.set('search', opts.search);
    const qs = q.toString();
    const raw = await request<Record<string, unknown>[]>(
      `/api/suppliers${qs ? `?${qs}` : ''}`,
      {},
      token
    );
    return raw.map(mapSupplier);
  },

  get: async (token: string, id: string) => {
    const raw = await request<Record<string, unknown>>(`/api/suppliers/${id}`, {}, token);
    return mapSupplier(raw);
  },

  create: async (token: string, body: SupplierPayload) => {
    const raw = await request<Record<string, unknown>>(
      '/api/suppliers',
      { method: 'POST', body: JSON.stringify(body) },
      token
    );
    return mapSupplier(raw);
  },

  update: async (token: string, id: string, body: SupplierPayload) => {
    const raw = await request<Record<string, unknown>>(
      `/api/suppliers/${id}`,
      { method: 'PUT', body: JSON.stringify(body) },
      token
    );
    return mapSupplier(raw);
  },

  delete: (token: string, id: string) =>
    request<void>(`/api/suppliers/${id}`, { method: 'DELETE' }, token),

  activateAll: async (token: string) => {
    const raw = await request<Record<string, unknown>>(
      '/api/suppliers/activate-all',
      { method: 'POST' },
      token
    );
    return Number(raw.activatedCount ?? raw.ActivatedCount ?? 0);
  },

  importCsv: async (token: string, file: File, updateExisting: boolean) => {
    const API_BASE = import.meta.env.VITE_API_URL ?? '';
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(
      `${API_BASE}/api/suppliers/import?updateExisting=${updateExisting}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { message?: string }).message ?? res.statusText);
    const raw = data as Record<string, unknown>;
    return {
      importedCount: Number(raw.importedCount ?? raw.ImportedCount ?? 0),
      updatedCount: Number(raw.updatedCount ?? raw.UpdatedCount ?? 0),
      skippedCount: Number(raw.skippedCount ?? raw.SkippedCount ?? 0),
      errorCount: Number(raw.errorCount ?? raw.ErrorCount ?? 0),
      errors: (raw.errors ?? raw.Errors ?? []) as { lineNumber: number; message: string }[],
    };
  },
};
