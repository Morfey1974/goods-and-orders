import { request } from './http';

export type UsdIlsRate = {
  rate: number;
  rateDate: string;
  requestedDate: string;
  usedNearestAvailableDate: boolean;
  source: string;
};

function mapRate(raw: Record<string, unknown>): UsdIlsRate {
  return {
    rate: Number(raw.rate ?? raw.Rate ?? 0),
    rateDate: String(raw.rateDate ?? raw.RateDate ?? ''),
    requestedDate: String(raw.requestedDate ?? raw.RequestedDate ?? ''),
    usedNearestAvailableDate: Boolean(
      raw.usedNearestAvailableDate ?? raw.UsedNearestAvailableDate ?? false
    ),
    source: String(raw.source ?? raw.Source ?? ''),
  };
}

export const exchangeRatesApi = {
  usdIls: async (token: string, date: string) => {
    const data = await request<Record<string, unknown>>(
      `/api/exchange-rates/usd-ils?date=${encodeURIComponent(date)}`,
      {},
      token
    );
    return mapRate(data);
  },
};
