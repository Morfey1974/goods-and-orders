import { request } from './http';

export type ProductGroup = {
  id: string;
  name: string;
  sortOrder: number;
  productIds: string[];
};

function mapGroup(raw: Record<string, unknown>): ProductGroup {
  const ids = (raw.productIds ?? raw.ProductIds ?? []) as unknown[];
  return {
    id: String(raw.id ?? raw.Id),
    name: String(raw.name ?? raw.Name ?? ''),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0),
    productIds: Array.isArray(ids) ? ids.map(String) : [],
  };
}

export const productGroupsApi = {
  list(token: string) {
    return request<Record<string, unknown>[]>('/api/product-groups', {}, token).then((rows) =>
      rows.map((r) => mapGroup(r))
    );
  },

  create(token: string, name: string) {
    return request<Record<string, unknown>>(
      '/api/product-groups',
      { method: 'POST', body: JSON.stringify({ name }) },
      token
    ).then(mapGroup);
  },

  update(token: string, id: string, name: string, sortOrder: number) {
    return request<Record<string, unknown>>(
      `/api/product-groups/${id}`,
      { method: 'PUT', body: JSON.stringify({ name, sortOrder }) },
      token
    ).then(mapGroup);
  },

  setMembers(token: string, id: string, productIds: string[]) {
    return request<Record<string, unknown>>(
      `/api/product-groups/${id}/members`,
      { method: 'PUT', body: JSON.stringify({ productIds }) },
      token
    ).then(mapGroup);
  },

  delete(token: string, id: string) {
    return request<void>(`/api/product-groups/${id}`, { method: 'DELETE' }, token);
  },
};
