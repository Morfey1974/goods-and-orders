import type { TenantProfile } from '../api/client';
import type { Document } from '../api/documents';

const DOC_TITLE_HE: Record<string, string> = {
  Quote: 'הצעת מחיר',
  ChargeInvoice: 'חשבון חיוב',
  Receipt: 'קבלה',
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function documentDisplayNumber(documentNumber: string) {
  const idx = documentNumber.indexOf('-');
  return idx >= 0 && idx < documentNumber.length - 1
    ? documentNumber.slice(idx + 1)
    : documentNumber;
}

/** First paragraph of document description = project name (same as PDF banner). */
export function projectLineFromDescription(description?: string | null): string {
  if (!description?.trim()) return '';
  const text = description.split('\n\n')[0]?.trim().replace(/\s+/g, ' ') ?? '';
  if (!text) return '';
  if (/לפרויקט/i.test(text)) return text;
  return `לפרויקט ${text}`;
}

/** Subject line matching PDF document title band + project. */
export function buildDocumentEmailSubject(doc: Document) {
  const title = DOC_TITLE_HE[doc.documentType] ?? doc.documentType;
  const num = documentDisplayNumber(doc.documentNumber);
  const base = `${title} מס׳ ${num}`;
  const project = projectLineFromDescription(doc.description);
  return project ? `${base} — ${project}` : base;
}

function formatAddress(street?: string, city?: string, zip?: string) {
  const parts = [street, city, zip].map((p) => p?.trim()).filter(Boolean) as string[];
  if (parts.length === 0) return '';
  let line = parts.join(', ');
  if (!line.includes('ישראל')) line += ', ישראל';
  return line;
}

function supplierTaxLine(profile: TenantProfile) {
  const number = profile.osekNumber?.trim() || profile.teudatZehut?.trim();
  if (!number) return '';
  const label =
    profile.taxRegime === 'Murshe'
      ? 'עוסק מורשה'
      : profile.taxRegime === 'Patur'
        ? 'פטור עוסק'
        : 'ח.פ';
  return `${number} : ${label}`;
}

/** Business letterhead for email (no bank details). */
export function buildEmailSignatureHtml(profile: TenantProfile, logoDataUrl?: string | null) {
  const parts: string[] = ['<div class="doc-email-signature">'];
  if (logoDataUrl) {
    parts.push(
      `<p style="margin:0 0 8px;"><img src="${logoDataUrl}" alt="" style="max-height:52px;max-width:180px;" /></p>`
    );
  }
  if (profile.businessName?.trim()) {
    parts.push(`<p style="margin:0;font-size:16px;font-weight:700;">${escapeHtml(profile.businessName.trim())}</p>`);
  }
  const tagline = profile.businessCategory?.trim() || profile.businessField?.trim();
  if (tagline) {
    parts.push(`<p style="margin:4px 0 0;font-size:13px;color:#444;">${escapeHtml(tagline)}</p>`);
  }
  const tax = supplierTaxLine(profile);
  if (tax) parts.push(`<p style="margin:4px 0 0;font-size:13px;">${escapeHtml(tax)}</p>`);
  const addr = formatAddress(profile.address, profile.city, profile.zipCode);
  if (addr) parts.push(`<p style="margin:4px 0 0;font-size:13px;">${escapeHtml(addr)}</p>`);
  const mobile = profile.mobilePhone?.trim() || profile.phone?.trim();
  if (mobile) parts.push(`<p style="margin:4px 0 0;font-size:13px;">נייד: ${escapeHtml(mobile)}</p>`);
  if (profile.email?.trim()) {
    parts.push(`<p style="margin:4px 0 0;font-size:13px;">אימייל: ${escapeHtml(profile.email.trim())}</p>`);
  }
  if (profile.website?.trim()) {
    parts.push(`<p style="margin:4px 0 0;font-size:13px;">אתר: ${escapeHtml(profile.website.trim())}</p>`);
  }
  parts.push('</div>');
  return parts.join('\n');
}

export function composeDocumentEmailHtml(
  bodyText: string,
  profile: TenantProfile,
  logoDataUrl?: string | null
) {
  const bodyHtml = bodyText.trim()
    ? `<div class="doc-email-body"><p style="margin:0;white-space:pre-wrap;">${escapeHtml(bodyText.trim())}</p></div>`
    : '';
  const signature = buildEmailSignatureHtml(profile, logoDataUrl);
  return `${bodyHtml}${bodyHtml ? '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;" />' : ''}${signature}`;
}
