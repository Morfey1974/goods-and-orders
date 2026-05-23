import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const MENU_MIN_WIDTH = 220;
const MENU_EST_HEIGHT = 220;
const GAP = 4;

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

export function CatalogRowMenu({ open, anchorRef, children }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const place = () => {
      const btn = anchorRef.current;
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

      const styleNext: CSSProperties = {
        position: 'fixed',
        top,
        zIndex: 3000,
        visibility: 'visible',
      };

      if (rtl) {
        styleNext.insetInlineStart = Math.max(8, rect.left);
      } else {
        styleNext.left = Math.max(8, rect.right - menuWidth);
      }

      setStyle(styleNext);
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, children]);

  if (!open) return null;

  return createPortal(
    <div ref={menuRef} className="row-menu row-menu--portal" style={style} role="menu">
      {children}
    </div>,
    document.body
  );
}
