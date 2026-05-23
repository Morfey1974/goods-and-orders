import { request } from './http';

export type AuthResponse = {
  token: string;
  tenantId: string;
  userId: string;
  email: string;
  businessName: string;
  defaultLanguage: string;
  trialEndsAt: string;
  subscriptionStatus: string;
};

export type TenantProfile = {
  id: string;
  businessName: string;
  ownerFullName: string;
  osekNumber?: string;
  teudatZehut?: string;
  email: string;
  phone?: string;
  address?: string;
  bankBeneficiary?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankDetails?: string;
  defaultLanguage: string;
  taxRegime: string;
  subscriptionStatus: string;
  registeredAt: string;
  trialEndsAt: string;
  version: number;
};

export const api = {
  health: () => request<{ status: string }>('/api/health'),

  register: (body: {
    email: string;
    password: string;
    businessName: string;
    ownerFullName: string;
    defaultLanguage: string;
  }) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getProfile: (token: string) =>
    request<TenantProfile>('/api/tenant/profile', {}, token),

  updateProfile: (token: string, body: Record<string, unknown>) =>
    request<TenantProfile>('/api/tenant/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }, token),

  updateBankDetails: (token: string, body: Record<string, unknown>) =>
    request<TenantProfile>('/api/tenant/bank-details', {
      method: 'PUT',
      body: JSON.stringify(body),
    }, token),
};
