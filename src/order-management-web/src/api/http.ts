const API_BASE = import.meta.env.VITE_API_URL ?? '';

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
    const body = data as { message?: string; detail?: string };
    const msg = body.message ?? res.statusText;
    const detail = body.detail?.trim();
    throw new Error(detail && detail !== msg ? `${msg} (${detail})` : msg);
  }
  return data as T;
}
