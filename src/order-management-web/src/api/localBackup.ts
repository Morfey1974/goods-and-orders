const DEFAULT_SCAN_LAUNCHER_URL = 'http://127.0.0.1:9181';

export class LocalLauncherError extends Error {
  readonly code: 'unavailable' | 'cancelled' | 'failed';

  constructor(message: string, code: 'unavailable' | 'cancelled' | 'failed' = 'failed') {
    super(message);
    this.name = 'LocalLauncherError';
    this.code = code;
  }
}

function launcherBase(): string {
  const raw = import.meta.env.VITE_SCAN_LAUNCHER_URL ?? DEFAULT_SCAN_LAUNCHER_URL;
  return raw.replace(/\/$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isLauncherHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${launcherBase()}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait until LocalScanLauncher responds (e.g. after auto-start). */
export async function ensureLauncherReady(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLauncherHealthy()) return;
    await sleep(500);
  }
  throw new LocalLauncherError('unavailable', 'unavailable');
}

type PickFolderResponse = {
  cancelled?: boolean;
  path?: string;
  message?: string;
};

type ApplyBackupPathResponse = {
  ok?: boolean;
  path?: string;
  message?: string;
};

export async function pickBackupFolder(
  initialPath?: string,
  description?: string
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${launcherBase()}/pick-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initialPath: initialPath?.trim() || null,
        description: description ?? null,
      }),
      cache: 'no-store',
    });
  } catch {
    throw new LocalLauncherError('unavailable', 'unavailable');
  }

  const body = (await res.json().catch(() => ({}))) as PickFolderResponse;
  if (!res.ok) {
    throw new LocalLauncherError(body.message ?? res.statusText, 'failed');
  }

  if (body.cancelled) return null;
  if (!body.path?.trim()) {
    throw new LocalLauncherError('failed', 'failed');
  }

  return body.path.trim();
}

export async function applyBackupPath(path: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${launcherBase()}/apply-backup-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path.trim() }),
      cache: 'no-store',
    });
  } catch {
    throw new LocalLauncherError('unavailable', 'unavailable');
  }

  const body = (await res.json().catch(() => ({}))) as ApplyBackupPathResponse;
  if (!res.ok) {
    throw new LocalLauncherError(body.message ?? res.statusText, 'failed');
  }
}
