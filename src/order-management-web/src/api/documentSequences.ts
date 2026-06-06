import { request } from './http';

export type DocumentSequence = {
  kind: string;
  labelKey: string;
  nextNumber: number;
  maxUsedNumber: number | null;
  preview: string;
};

function mapSequence(raw: Record<string, unknown>): DocumentSequence {
  return {
    kind: String(raw.kind ?? raw.Kind ?? ''),
    labelKey: String(raw.labelKey ?? raw.LabelKey ?? ''),
    nextNumber: Number(raw.nextNumber ?? raw.NextNumber ?? 1),
    maxUsedNumber:
      raw.maxUsedNumber != null || raw.MaxUsedNumber != null
        ? Number(raw.maxUsedNumber ?? raw.MaxUsedNumber)
        : null,
    preview: String(raw.preview ?? raw.Preview ?? ''),
  };
}

export const documentSequencesApi = {
  list: async (token: string) => {
    const data = await request<Record<string, unknown>[]>('/api/document-sequences', {}, token);
    return data.map(mapSequence);
  },

  update: async (token: string, items: { kind: string; nextNumber: number }[]) => {
    const data = await request<Record<string, unknown>[]>(
      '/api/document-sequences',
      { method: 'PUT', body: JSON.stringify({ items }) },
      token
    );
    return data.map(mapSequence);
  },
};
