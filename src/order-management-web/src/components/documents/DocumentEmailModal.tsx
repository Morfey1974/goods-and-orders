import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type TenantProfile } from '../../api/client';
import { catalogApi, type Customer, type CustomerContact } from '../../api/catalog';
import type { Document } from '../../api/documents';
import { tenantAssetsApi } from '../../api/tenantAssets';
import {
  buildDocumentEmailSubject,
  composeDocumentEmailHtml,
} from '../../lib/documentEmail';
import { DOCUMENT_EMAIL_RESIZE } from '../../lib/resizablePanelKeys';
import { AppModal } from '../ui/AppModal';

type Props = {
  open: boolean;
  document: Document | null;
  token: string;
  onClose: () => void;
  onMessage: (text: string, isError?: boolean) => void;
};

export function DocumentEmailModal({ open, document: doc, token, onClose, onMessage }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const contactsWithEmail = useMemo(
    () => (customer?.contacts ?? []).filter((c) => c.email?.trim()),
    [customer]
  );

  const selectedContact = useMemo(
    () => contactsWithEmail.find((c) => c.id === contactId) ?? null,
    [contactsWithEmail, contactId]
  );

  const previewHtml = useMemo(() => {
    if (!profile) return '';
    return composeDocumentEmailHtml(body, profile, logoDataUrl);
  }, [body, profile, logoDataUrl]);

  useEffect(() => {
    if (!open || !doc || !token) return;
    setLoading(true);
    setCustomer(null);
    setProfile(null);
    setLogoDataUrl(null);
    setContactId('');
    setBody('');
    setSubject(buildDocumentEmailSubject(doc));

    Promise.all([
      catalogApi.customers.get(token, doc.customerId),
      api.getProfile(token),
      tenantAssetsApi.fetchLogoBlob(token).catch(() => null),
    ])
      .then(([cust, prof, logoBlob]) => {
        setCustomer(cust);
        setProfile(prof);
        if (logoBlob) {
          const url = URL.createObjectURL(logoBlob);
          setLogoDataUrl(url);
        }
        const first = cust.contacts?.find((c) => c.email?.trim());
        if (first) setContactId(first.id);
      })
      .catch((err) => onMessage(err instanceof Error ? err.message : 'Error', true))
      .finally(() => setLoading(false));

    return () => {
      setLogoDataUrl((url) => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        return null;
      });
    };
  }, [open, doc, token, onMessage]);

  if (!open || !doc) return null;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      resize={DOCUMENT_EMAIL_RESIZE}
      className="doc-email-modal"
      overlayClassName="doc-email-overlay"
      labelledBy="doc-email-title"
      zIndex={2800}
    >
      <h2 id="doc-email-title" className="doc-email-title">
        {t('documents.emailModalTitle')}
      </h2>
      <p className="muted doc-email-doc-ref">
        {t(`documents.types.${doc.documentType}`)} · {doc.customerName}
      </p>

      {loading ? (
        <p className="muted">{t('documents.loading')}</p>
      ) : (
        <form
          className="doc-email-form"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          {contactsWithEmail.length === 0 ? (
            <div className="error-banner">{t('documents.emailNoContacts')}</div>
          ) : (
            <>
              <label className="doc-email-field">
                <span>{t('documents.emailContact')}</span>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  required
                >
                  {contactsWithEmail.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatContactOption(c)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedContact && (
                <p className="doc-email-recipient">
                  <strong>{selectedContact.fullName}</strong>
                  <span className="muted"> · {selectedContact.email}</span>
                </p>
              )}

              <label className="doc-email-field">
                <span>{t('documents.emailSubject')}</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </label>

              <label className="doc-email-field">
                <span>{t('documents.emailBody')}</span>
                <textarea
                  className="doc-textarea"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('documents.emailBodyPlaceholder')}
                />
              </label>

              <div className="doc-email-preview-wrap">
                <span className="doc-panel-label">{t('documents.emailSignaturePreview')}</span>
                <div
                  className="doc-email-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </>
          )}

          <footer className="doc-email-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={onClose}>
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled
              title={t('documents.emailSendDisabledHint')}
            >
              {t('documents.emailSend')}
            </button>
          </footer>
          <p className="muted doc-email-stub-hint">{t('documents.emailSendDisabledHint')}</p>
        </form>
      )}
    </AppModal>
  );
}

function formatContactOption(c: CustomerContact) {
  const parts = [c.fullName];
  if (c.email?.trim()) parts.push(c.email.trim());
  return parts.join(' · ');
}
