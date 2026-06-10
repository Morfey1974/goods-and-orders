import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backupApi, type BackupSettings } from '../../api/backup';
import {
  applyBackupPath,
  ensureLauncherReady,
  LocalLauncherError,
  pickBackupFolder,
} from '../../api/localBackup';
import { useAuth } from '../../context/AuthContext';

function formatBytes(bytes: number | null | undefined, locale: string): string {
  if (bytes == null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

export function ProgramBackupSection() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [hostPath, setHostPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [browseStatus, setBrowseStatus] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await backupApi.getSettings(token);
      setSettings(data);
      setHostPath(data.backupHostPath ?? data.hostMountHint ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSavePath = async () => {
    if (!token) return;
    const path = hostPath.trim();
    if (!path) {
      setError(t('settings.programBackup.pathRequired'));
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await backupApi.updateSettings(token, {
        backupHostPath: path,
      });
      setSettings(updated);
      setHostPath(updated.backupHostPath ?? updated.hostMountHint ?? '');

      try {
        await ensureLauncherReady();
        await applyBackupPath(path);
        setMessage(t('settings.programBackup.pathSavedAndMounted'));
      } catch (launcherErr) {
        if (launcherErr instanceof LocalLauncherError && launcherErr.code === 'unavailable') {
          setMessage(t('settings.programBackup.pathSavedLauncherOff'));
        } else {
          throw launcherErr;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const onBrowseFolder = async () => {
    setBrowsing(true);
    setError('');
    setBrowseStatus(t('settings.programBackup.connectingHelper'));
    try {
      await ensureLauncherReady();
      setBrowseStatus(t('settings.programBackup.browsing'));
      const picked = await pickBackupFolder(
        hostPath || settings?.hostMountHint || settings?.effectiveRootPath || '',
        t('settings.programBackup.browseDialogTitle')
      );
      if (picked) setHostPath(picked);
    } catch (e) {
      if (e instanceof LocalLauncherError && e.code === 'unavailable') {
        setError(t('settings.programBackup.launcherUnavailable'));
      } else if (!(e instanceof LocalLauncherError && e.code === 'cancelled')) {
        setError(e instanceof Error ? e.message : 'Error');
      }
    } finally {
      setBrowsing(false);
      setBrowseStatus('');
    }
  };

  const onRunBackup = async () => {
    if (!token) return;
    setBackingUp(true);
    setError('');
    setMessage('');
    try {
      const result = await backupApi.runBackup(token);
      if (!result.success) {
        setError(result.error ?? t('settings.programBackup.failed'));
        await load();
        return;
      }
      setMessage(
        t('settings.programBackup.success', {
          file: result.fileName ?? '',
          size: formatBytes(result.sizeBytes, i18n.language),
        })
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      await load();
    } finally {
      setBackingUp(false);
    }
  };

  if (loading) {
    return <p className="muted">{t('settings.programBackup.loading')}</p>;
  }

  const effectiveHint = settings?.hostMountHint ?? settings?.effectiveRootPath ?? '';

  return (
    <div className="settings-program-backup">
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <p className="settings-program-backup-intro">{t('settings.programBackup.intro')}</p>

      <ul className="settings-program-backup-list">
        <li>{t('settings.programBackup.includesDb')}</li>
        <li>{t('settings.programBackup.includesFiles')}</li>
        <li>{t('settings.programBackup.includesGuide')}</li>
      </ul>

      <div className="settings-fields">
        <div className="settings-row settings-row--full">
          <label className="settings-field field-flex-grow">
            <span className="settings-field-label-row">
              {t('settings.programBackup.hostPathLabel')}
              <span className="field-hint">{t('settings.programBackup.hostPathHint')}</span>
            </span>
            <div className="settings-path-input-row">
              <input
                value={hostPath}
                readOnly
                placeholder={effectiveHint}
                spellCheck={false}
                className="settings-path-input"
              />
              <button
                type="button"
                className="btn btn-secondary settings-path-browse"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void onBrowseFolder();
                }}
                disabled={browsing || saving}
                title={t('settings.programBackup.browseFolder')}
                aria-label={t('settings.programBackup.browseFolder')}
                aria-busy={browsing}
              >
                …
              </button>
            </div>
            {browseStatus && (
              <p className="field-hint settings-path-browse-status">{browseStatus}</p>
            )}
          </label>
        </div>
      </div>

      <p className="field-hint settings-program-backup-mount">
        {t('settings.programBackup.dockerMountHint', { path: effectiveHint })}
      </p>

      <div className="settings-program-backup-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void onSavePath()} disabled={saving}>
          {saving ? t('settings.saving') : t('settings.programBackup.savePath')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void onRunBackup()} disabled={backingUp}>
          {backingUp ? t('settings.programBackup.running') : t('settings.programBackup.runNow')}
        </button>
      </div>

      <div className="settings-program-backup-status card settings-section settings-section--nested">
        <div className="settings-section-head">
          <h3 className="settings-section-title">{t('settings.programBackup.lastTitle')}</h3>
        </div>
        <div className="settings-section-body">
          <dl className="settings-program-backup-meta">
            <div>
              <dt>{t('settings.programBackup.lastWhen')}</dt>
              <dd>{formatDateTime(settings?.lastBackupUtc, i18n.language)}</dd>
            </div>
            <div>
              <dt>{t('settings.programBackup.lastFile')}</dt>
              <dd>{settings?.lastBackupFileName ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('settings.programBackup.lastSize')}</dt>
              <dd>{formatBytes(settings?.lastBackupSizeBytes, i18n.language)}</dd>
            </div>
          </dl>
          {settings?.lastBackupError && (
            <p className="settings-program-backup-last-error">{settings.lastBackupError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
