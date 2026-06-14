import i18n from '../i18n';

export type BuildPdfFileNameOptions = {
  from?: string | null;
  to?: string | null;
  asOf?: string | null;
  year?: number | string;
  suffix?: string;
};

/** i18n string in Hebrew — used for PDF save names regardless of UI language. */
export function tHe(key: string): string {
  return i18n.t(key, { lng: 'he' });
}

/** Build a report PDF file name with a Hebrew title (dates/numbers stay as-is). */
export function buildReportPdfFileName(key: string, options?: BuildPdfFileNameOptions): string {
  return buildPdfFileName(tHe(key), options);
}

export function formatPdfDisplayDate(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function sanitizePdfFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const pdfSavePickerTypes = [
  {
    description: 'PDF',
    accept: { 'application/pdf': ['.pdf'] },
  },
];

async function writeBlobToSaveHandle(blob: Blob, handle: FileSystemFileHandle): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

type PickSaveResult =
  | { status: 'picked'; handle: FileSystemFileHandle }
  | { status: 'cancelled' }
  | { status: 'unsupported' };

async function pickSaveFileHandle(suggestedName: string): Promise<PickSaveResult> {
  const picker = (window as Window & { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  if (typeof picker !== 'function') return { status: 'unsupported' };

  try {
    const handle = await picker({
      suggestedName,
      types: pdfSavePickerTypes,
    });
    return { status: 'picked', handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { status: 'cancelled' };
    throw err;
  }
}

type ShowSaveFilePicker = (options?: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/** Opens the system "Save as" dialog when supported; never opens the file for viewing. */
export async function saveBlobAsFile(blob: Blob, suggestedName: string): Promise<boolean> {
  const fileName = sanitizePdfFileName(suggestedName);
  const pick = await pickSaveFileHandle(fileName);

  if (pick.status === 'cancelled') return false;

  if (pick.status === 'picked') {
    await writeBlobToSaveHandle(blob, pick.handle);
    return true;
  }

  downloadBlobAsFile(blob, fileName);
  return true;
}

export async function saveUrlAsFile(url: string, suggestedName: string): Promise<boolean> {
  const response = await fetch(url);
  const blob = await response.blob();
  return saveBlobAsFile(blob, suggestedName);
}

export function buildPdfFileName(title: string, options?: BuildPdfFileNameOptions): string {
  const parts = [title.trim()];
  if (options?.suffix?.trim()) parts.push(options.suffix.trim());
  if (options?.year != null && String(options.year).length > 0) {
    parts.push(String(options.year));
  } else if (options?.asOf) {
    parts.push(formatPdfDisplayDate(options.asOf));
  } else if (options?.from && options?.to) {
    parts.push(`${formatPdfDisplayDate(options.from)} – ${formatPdfDisplayDate(options.to)}`);
  } else if (options?.from) {
    parts.push(formatPdfDisplayDate(options.from));
  } else if (options?.to) {
    parts.push(formatPdfDisplayDate(options.to));
  }
  return sanitizePdfFileName(`${parts.join(' ')}.pdf`);
}

export function downloadUrlAsFile(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlobAsFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  downloadUrlAsFile(url, fileName);
  URL.revokeObjectURL(url);
}

export function pdfPreviewFrameSrc(pdfUrl: string): string {
  return `${pdfUrl}#toolbar=0&navpanes=0`;
}
