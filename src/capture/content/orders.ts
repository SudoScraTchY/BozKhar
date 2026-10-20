/**
 * Orders-tab surface: a single floating button that opens Order Insights.
 *
 * This is the discoverability fix the user asked for: the feature is no
 * longer buried in the options page. The content script only renders a
 * button; opening the extension page is done by the service worker, so
 * no new permission and no automatic tab (D-30).
 */
import { isOrderHistoryPage } from '../dom/selectors';
import { showToast } from './ui';

export interface OrdersSurfaceDeps {
  doc: Document;
  location?: { pathname: string };
  lang: 'fa' | 'en';
  label: string;
  sendMessage(req: unknown): Promise<{ ok?: boolean }>;
}

export interface OrdersSurface {
  destroy(): void;
}

const FAB_ID = 'dkopt-insights-fab';

export function mountOrdersSurface(deps: OrdersSurfaceDeps): OrdersSurface | null {
  const { doc } = deps;
  const pathname = deps.location?.pathname ?? doc.location.pathname;
  if (!isOrderHistoryPage(pathname)) return null;
  if (doc.getElementById(FAB_ID)) return null;

  const button = doc.createElement('button');
  button.id = FAB_ID;
  button.type = 'button';
  button.textContent = deps.label;
  button.setAttribute('aria-label', deps.label);
  button.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'inset-inline-start:24px',
    'z-index:2147483646',
    'display:inline-flex',
    'align-items:center',
    'gap:8px',
    'border:1px solid rgba(255,255,255,.22)',
    'border-radius:999px',
    'padding:11px 18px',
    'background:linear-gradient(135deg,#1b2b5b,#067a6b)',
    'color:#fff',
    'font:600 13px/1.4 Vazirmatn,system-ui,sans-serif',
    'box-shadow:0 10px 28px rgba(15,32,55,.28)',
    'cursor:pointer',
    'direction:rtl',
  ].join(';');

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
  });
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    void deps
      .sendMessage({ kind: 'insights/open' })
      .then((res) => {
        if (res?.ok === false) showToast(doc, deps.label);
      })
      .catch(() => showToast(doc, deps.label))
      .finally(() => {
        button.disabled = false;
      });
  });

  doc.body.append(button);
  return {
    destroy() {
      button.remove();
    },
  };
}
