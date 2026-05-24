import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Document } from '../../api/documents';

const MENU_MIN_WIDTH = 168;
const MENU_EST_HEIGHT = 88;
const GAP = 6;

export type DocumentIssueContext = {
  chargeForQuote?: Document;
  receiptForCharge?: Document;
};

type Props = {
  doc: Document;
  context: DocumentIssueContext;
  busy?: boolean;
  onIssueCharge: (quote: Document) => void;
  onIssueReceipt: (doc: Document) => void;
};

export function DocumentIssueMenu({ doc, context, busy, onIssueCharge, onIssueReceipt }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  const canIssueCharge =
    doc.documentType === 'Quote' &&
    !doc.orderId &&
    !context.chargeForQuote;

  const existingReceipt = context.receiptForCharge;
  const receiptIsDraft = existingReceipt?.status === 'Draft';
  const chargeForReceipt =
    doc.documentType === 'ChargeInvoice' ? doc : context.chargeForQuote;

  const canIssueNewReceipt =
    (doc.documentType === 'Quote' || doc.documentType === 'ChargeInvoice') &&
    !existingReceipt &&
    chargeForReceipt != null &&
    (chargeForReceipt.status === 'Open' || chargeForReceipt.status === 'Paid');

  const canOpenReceipt = Boolean(existingReceipt);

  const showMenu = canIssueCharge || canIssueNewReceipt || canOpenReceipt;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;

    const place = () => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const menuWidth = menu?.offsetWidth ?? MENU_MIN_WIDTH;
      const menuHeight = menu?.offsetHeight ?? MENU_EST_HEIGHT;
      const rtl = document.documentElement.dir === 'rtl';

      let top = rect.bottom + GAP;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - GAP - menuHeight);
      }

      let left: number;
      if (rtl) {
        left = rect.left;
      } else {
        left = rect.right - menuWidth;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

      setMenuStyle({
        position: 'fixed',
        top,
        left,
        width: 'max-content',
        minWidth: MENU_MIN_WIDTH,
        maxWidth: 220,
        zIndex: 3000,
        visibility: 'visible',
      });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, canIssueCharge, canIssueNewReceipt, canOpenReceipt]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!showMenu) return null;

  return (
    <div className="doc-issue-wrap">
      <button
        ref={btnRef}
        type="button"
        className="doc-issue-btn"
        title={t('documents.issueNewTitle')}
        aria-label={t('documents.issueNewTitle')}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        +
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="row-menu row-menu--portal doc-issue-dropdown"
            style={menuStyle}
            role="menu"
          >
            <p className="row-menu-heading">{t('documents.issueNewTitle')}</p>
            {canIssueCharge && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onIssueCharge(doc);
                }}
              >
                {t('documents.issueMenuCharge')}
              </button>
            )}
            {canOpenReceipt && existingReceipt && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onIssueReceipt(doc);
                }}
              >
                {receiptIsDraft
                  ? t('documents.issueMenuReceiptDraft')
                  : t('documents.issueMenuReceiptView')}
              </button>
            )}
            {canIssueNewReceipt && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onIssueReceipt(doc);
                }}
              >
                {t('documents.issueMenuReceipt')}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export function buildIssueContextMap(documents: Document[]): Map<string, DocumentIssueContext> {
  const ctx = new Map<string, DocumentIssueContext>();

  for (const d of documents) {
    if (!d.parentDocumentId) continue;
    const parentId = d.parentDocumentId;
    const entry = ctx.get(parentId) ?? {};
    if (d.documentType === 'ChargeInvoice') entry.chargeForQuote = d;
    if (d.documentType === 'Receipt') entry.receiptForCharge = d;
    ctx.set(parentId, entry);
  }

  for (const d of documents) {
    if (d.documentType !== 'Quote') continue;
    const quoteCtx = ctx.get(d.id) ?? {};
    const charge = quoteCtx.chargeForQuote;
    if (charge) {
      const chargeCtx = ctx.get(charge.id) ?? {};
      quoteCtx.receiptForCharge = chargeCtx.receiptForCharge;
      ctx.set(d.id, quoteCtx);
    }
  }

  for (const d of documents) {
    if (d.documentType === 'ChargeInvoice' && !ctx.has(d.id)) {
      ctx.set(d.id, {});
    }
  }

  return ctx;
}
