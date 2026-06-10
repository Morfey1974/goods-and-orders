import { request } from './http';

export type BackupSettings = {
  backupHostPath: string | null;
  effectiveRootPath: string;
  hostMountHint: string | null;
  lastBackupUtc: string | null;
  lastBackupFileName: string | null;
  lastBackupSizeBytes: number | null;
  lastBackupError: string | null;
};

export type RunBackupResult = {
  success: boolean;
  fileName: string | null;
  fullPath: string | null;
  sizeBytes: number | null;
  createdUtc: string | null;
  error: string | null;
};

export const backupApi = {
  getSettings: (token: string) =>
    request<BackupSettings>('/api/backup/settings', {}, token),

  updateSettings: (token: string, body: { backupHostPath: string | null }) =>
    request<BackupSettings>(
      '/api/backup/settings',
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      token
    ),

  runBackup: (token: string) =>
    request<RunBackupResult>(
      '/api/backup/run',
      {
        method: 'POST',
      },
      token
    ),
};
