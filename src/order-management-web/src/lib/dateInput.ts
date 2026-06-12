const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valid calendar date in YYYY-MM-DD (year exactly 4 digits). */
export function isValidDateInput(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map((x) => parseInt(x, 10));
  if (y < 1000 || y > 9999) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** While typing in <input type="date"> — keep year at most 4 digits. */
export function normalizeDateInputValue(value: string): string {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  if (year.length > 4) {
    return `${year.slice(0, 4)}-${month}-${day}`;
  }
  return value;
}

/** On blur — accept only a complete valid date or clear. */
export function finalizeDateInput(value: string): string {
  const normalized = normalizeDateInputValue(value);
  return isValidDateInput(normalized) ? normalized : '';
}

export function isoToDateInput(iso: string): string {
  if (!iso) return '';
  const slice = iso.slice(0, 10);
  return isValidDateInput(slice) ? slice : '';
}

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}
