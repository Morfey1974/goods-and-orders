const DEFAULT_SCAN_AGENT_URL = 'http://127.0.0.1:9182';
const DEFAULT_SCAN_LAUNCHER_URL = 'http://127.0.0.1:9181';

export class LocalScanAgentError extends Error {
  readonly code: 'unavailable' | 'scan_failed';

  constructor(message: string, code: 'unavailable' | 'scan_failed' = 'scan_failed') {
    super(message);
    this.name = 'LocalScanAgentError';
    this.code = code;
  }
}

function scanAgentBase(): string {
  const raw = import.meta.env.VITE_SCAN_AGENT_URL ?? DEFAULT_SCAN_AGENT_URL;
  return raw.replace(/\/$/, '');
}

function scanLauncherBase(): string {
  const raw = import.meta.env.VITE_SCAN_LAUNCHER_URL ?? DEFAULT_SCAN_LAUNCHER_URL;
  return raw.replace(/\/$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isAgentHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${scanAgentBase()}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ask the local launcher to start the scan agent if it is not running. */
export async function ensureScanAgentReady(
  onProgress?: (phase: 'starting') => void
): Promise<void> {
  if (await isAgentHealthy()) return;

  onProgress?.('starting');

  try {
    const res = await fetch(`${scanLauncherBase()}/ensure`, { method: 'POST', cache: 'no-store' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new LocalScanAgentError(body.message ?? res.statusText, 'unavailable');
    }
  } catch (err) {
    if (err instanceof LocalScanAgentError) throw err;
    throw new LocalScanAgentError('unavailable', 'unavailable');
  }

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await isAgentHealthy()) return;
    await sleep(500);
  }

  throw new LocalScanAgentError('unavailable', 'unavailable');
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1].replace(/"/g, '').trim());
  } catch {
    return match[1].replace(/"/g, '').trim();
  }
}

export async function fetchScanPdf(
  onProgress?: (phase: 'starting' | 'scanning') => void
): Promise<{ blob: Blob; fileName: string }> {
  await ensureScanAgentReady(onProgress);

  onProgress?.('scanning');

  const base = scanAgentBase();
  let res: Response;
  try {
    res = await fetch(`${base}/scan`, { method: 'POST', cache: 'no-store' });
  } catch {
    throw new LocalScanAgentError('unavailable', 'unavailable');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const message = body.message ?? res.statusText;
    if (res.status === 503 || res.status === 404)
      throw new LocalScanAgentError(message, 'unavailable');
    throw new LocalScanAgentError(message, 'scan_failed');
  }

  const blob = await res.blob();
  const fileName =
    fileNameFromDisposition(res.headers.get('Content-Disposition')) ??
    `scan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`;
  return { blob, fileName };
}
