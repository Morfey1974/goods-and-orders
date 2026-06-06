const API_BASE = import.meta.env.VITE_API_URL ?? '';

let onUnauthorized: (() => void) | null = null;

/** Register handler (e.g. logout) when API returns 401 with a token present. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && token) {
      onUnauthorized?.();
    }
    const body = data as { message?: string; detail?: string };
    const msg = body.message ?? res.statusText;
    const detail = body.detail?.trim();
    throw new Error(detail && detail !== msg ? `${msg} (${detail})` : msg);
  }
  return data as T;
}
