/**
 * Content-script UI primitives (09-ui-spec): button with the state machine
 * idle -> capturing -> added/failed, and a self-dismissing toast.
 *
 * Deliberately framework-free, zero dependencies (D-15/NFR-09). All labels
 * come from the i18n catalog (fa primary, RTL). DOM is only ever UI here -
 * never extraction (post-S-7 architecture).
 */

export type ButtonState = 'idle' | 'capturing' | 'added' | 'failed';

const BTN_BASE = 'dkopt-btn';
const HOST_BASE = 'dkopt-host';

/** Inline styles are versioned with the selectors module (site-coupled). */
const CSS = `
.${BTN_BASE} {
  all: unset;
  cursor: pointer;
  display: inline-block;
  margin: 8px 0;
  padding: 8px 16px;
  border-radius: 8px;
  background: #ef4056;
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
}
.${BTN_BASE}:focus-visible { outline: 2px solid #1e6fae; outline-offset: 2px; }
.${BTN_BASE}[data-state='capturing'] { opacity: 0.7; cursor: progress; }
.${BTN_BASE}[data-state='added'] { background: #1e6fae; }
.${BTN_BASE}[data-state='failed'] { background: #8a1f2d; }
.${HOST_BASE} { position: relative; }
.dkopt-toast {
  position: fixed;
  bottom: 24px;
  inset-inline-start: 24px;
  z-index: 2147483647;
  background: #23262b;
  color: #fff;
  padding: 10px 16px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
  direction: rtl;
}
.dkopt-progress {
  position: fixed;
  bottom: 24px;
  inset-inline-start: 24px;
  z-index: 2147483647;
  background: #23262b;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  display: flex;
  gap: 12px;
  align-items: center;
  direction: rtl;
}
.dkopt-progress button {
  all: unset;
  cursor: pointer;
  color: #ff7c8a;
  font-weight: 600;
}
`;

/** Injects the shared stylesheet once per document. */
export function ensureStyles(doc: Document): void {
  if (doc.getElementById('dkopt-styles')) return;
  const style = doc.createElement('style');
  style.id = 'dkopt-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}

export interface ButtonHandle {
  el: HTMLButtonElement;
  setState(next: ButtonState, label: string): void;
  remove(): void;
}

/**
 * Mounts the action button next to the anchor. The anchor gets a host
 * wrapper only if it can host one; otherwise the button is inserted after
 * the anchor (still inside the mount-point contract).
 */
export function mountButton(
  doc: Document,
  anchor: Element,
  label: string,
  onClick: () => void,
): ButtonHandle {
  ensureStyles(doc);
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = BTN_BASE;
  el.dataset.state = 'idle';
  el.textContent = label;
  el.addEventListener('click', onClick);
  anchor.insertAdjacentElement('afterend', el);
  return {
    el,
    setState(next, nextLabel) {
      el.dataset.state = next;
      el.textContent = nextLabel;
    },
    remove() {
      el.remove();
    },
  };
}

export interface ToastHandle {
  remove(): void;
}

/** Shows a toast that auto-dismisses after `ms` (default 4s). */
export function showToast(doc: Document, text: string, ms = 4000): ToastHandle {
  ensureStyles(doc);
  const el = doc.createElement('div');
  el.className = 'dkopt-toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  doc.body.appendChild(el);
  const timer = setTimeout(() => el.remove(), ms);
  return {
    remove() {
      clearTimeout(timer);
      el.remove();
    },
  };
}

/**
 * Progress overlay with an abort control (09 Surface 2: "an abort control
 * stops between navigations"). Returns both sinks.
 */
export function showProgressOverlay(
  doc: Document,
  labels: { abort: string },
  onAbort: () => void,
): { setText(text: string): void; remove(): void } {
  ensureStyles(doc);
  const el = doc.createElement('div');
  el.className = 'dkopt-progress';
  el.setAttribute('role', 'status');
  const text = doc.createElement('span');
  text.textContent = '';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = labels.abort;
  btn.addEventListener('click', onAbort);
  el.append(text, btn);
  doc.body.appendChild(el);
  return {
    setText(next) {
      text.textContent = next;
    },
    remove() {
      el.remove();
    },
  };
}
