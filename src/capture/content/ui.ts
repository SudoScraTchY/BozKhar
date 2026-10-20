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
.dkopt-torob {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  gap: 6px;
  margin-block: 8px;
  margin-inline-end: 8px;
  padding: 7px 14px;
  border: 1px solid #ef4056;
  border-radius: 8px;
  background: #fff;
  color: #c92c42;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  text-decoration: none;
}
.dkopt-torob:hover { background: #fff1f3; }
.dkopt-torob:focus-visible { outline: 2px solid #1e6fae; outline-offset: 2px; }
.dkopt-torob[aria-expanded='true'] { background: #fff1f3; }
.dkopt-torob-floating {
  position: fixed;
  inset-block-end: 18px;
  inset-inline-start: 18px;
  z-index: 2147483646;
  margin: 0;
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
}
.dkopt-torob-panel {
  position: fixed;
  inset-block-end: 20px;
  inset-inline-start: 20px;
  z-index: 2147483646;
  width: min(420px, calc(100vw - 32px));
  max-height: min(72vh, 620px);
  overflow: auto;
  background: #fff;
  color: #23262b;
  border: 1px solid #e3e3e3;
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0,0,0,.22);
  padding: 16px;
  direction: inherit;
  font-family: inherit;
  text-align: start;
  font-size: 13px;
  line-height: 1.6;
}
.dkopt-torob-panel * { box-sizing: border-box; }
.dkopt-torob-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.dkopt-torob-title { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.6; }
.dkopt-torob-sub { margin: 4px 0 0; color: #6b7280; font-size: 12px; line-height: 1.7; }
.dkopt-torob-close {
  all: unset;
  cursor: pointer;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #6b7280;
  font-size: 18px;
  line-height: 1;
}
.dkopt-torob-close:hover { background: #f3f4f6; color: #111827; }
.dkopt-torob-close:focus-visible { outline: 2px solid #1e6fae; outline-offset: 2px; }
.dkopt-torob-status { margin: 14px 0 0; color: #4b5563; font-size: 13px; line-height: 1.8; }
.dkopt-torob-count { margin: 12px 0 0; color: #6b7280; font-size: 12px; }
.dkopt-torob-offers { list-style: none; margin: 8px 0 0; padding: 0; }
.dkopt-torob-offer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 11px 0;
  border-top: 1px solid #eceef1;
}
.dkopt-torob-offer:first-child { border-top: 0; }
.dkopt-torob-offer-main { min-width: 0; }
.dkopt-torob-shop {
  display: block;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.dkopt-torob-meta { display: block; margin-top: 2px; color: #6b7280; font-size: 12px; line-height: 1.7; }
.dkopt-torob-postage { display: block; margin-top: 2px; color: #8a6d3b; font-size: 11px; line-height: 1.6; }
.dkopt-torob-side { text-align: end; white-space: nowrap; }
.dkopt-torob-price {
  display: block;
  color: #0b7a3b;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.dkopt-torob-offer-link {
  display: inline-block;
  margin-top: 6px;
  color: #c92c42;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.dkopt-torob-offer-link:hover { text-decoration: underline; }
.dkopt-torob-badge {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #e8f7ee;
  color: #0b7a3b;
  font-size: 10px;
  font-weight: 700;
}
.dkopt-torob-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #eceef1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.dkopt-torob-note { flex: 1 1 180px; color: #9ca3af; font-size: 11px; line-height: 1.7; }
.dkopt-torob-search { color: #c92c42; font-size: 12px; font-weight: 600; text-decoration: none; }
.dkopt-torob-search:hover { text-decoration: underline; }
.dkopt-pdp-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-block: 10px;
  padding: 10px;
  border: 1px solid #e3e6ee;
  border-radius: 10px;
  background: linear-gradient(180deg, #f7f8fc 0%, #ffffff 100%);
}
.dkopt-pdp-actions .dkopt-torob { margin: 0; align-self: stretch; }
.dkopt-btn-pdp {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  margin: 0;
  padding: 9px 14px;
  border-radius: 8px;
  background: #4338ca;
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  box-shadow: 0 1px 2px rgba(67,56,202,.35);
  transition: background-color .15s ease;
}
.dkopt-btn-pdp:hover { background: #3730a3; }
.dkopt-btn-pdp:focus-visible { outline: 2px solid #1e6fae; outline-offset: 2px; }
.dkopt-btn-pdp[data-state='capturing'] { opacity: .72; cursor: progress; }
.dkopt-btn-pdp[data-state='added'] { background: #0f766e; box-shadow: none; }
.dkopt-btn-pdp[data-state='failed'] { background: #8a1f2d; box-shadow: none; }
.dkopt-btn-icon { display: inline-flex; width: 16px; height: 16px; flex: none; }
.dkopt-btn-icon svg { display: block; width: 100%; height: 100%; }
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

export interface ButtonOptions {
  /** Decorative icon rendered before the label (e.g., the PDP scales). */
  icon?: Node;
  /** Extra classes for a context-specific variant. */
  className?: string;
  /** Append here instead of inserting after the anchor. */
  host?: Element;
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
  options: ButtonOptions = {},
): ButtonHandle {
  ensureStyles(doc);
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = BTN_BASE;
  if (options.className) {
    for (const name of options.className.split(/\s+/)) {
      if (name) el.classList.add(name);
    }
  }
  el.dataset.state = 'idle';

  const labelEl = doc.createElement('span');
  labelEl.className = 'dkopt-btn-label';
  labelEl.textContent = label;
  if (options.icon) {
    const icon = doc.createElement('span');
    icon.className = 'dkopt-btn-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.append(options.icon);
    el.append(icon, labelEl);
  } else {
    el.append(labelEl);
  }

  el.addEventListener('click', onClick);
  if (options.host) options.host.append(el);
  else anchor.insertAdjacentElement('afterend', el);
  return {
    el,
    setState(next, nextLabel) {
      el.dataset.state = next;
      labelEl.textContent = nextLabel;
    },
    remove() {
      el.remove();
    },
  };
}

export interface ToastHandle {
  remove(): void;
}

/**
 * Rotates `setText` through `lines` at a near-random interval (1.4-2.6s),
 * never showing the same line twice in a row, until the returned stop handle
 * is called. This fills the crawl overlay's opening silence (D-36): the real
 * "i of N" progress replaces it the moment it arrives, so the loop only ever
 * covers the seconds before the first capture.
 */
export function rotateTexts(
  setText: (text: string) => void,
  lines: readonly string[],
  random: () => number = Math.random,
): () => void {
  const MIN_MS = 1400;
  const SPREAD_MS = 1200;
  if (lines.length === 0) return () => undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = -1;
  const nextDelay = () => MIN_MS + Math.floor(random() * SPREAD_MS);
  const pick = (): string => {
    let index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
    if (index === last) index = (index + 1) % lines.length;
    last = index;
    return lines[index] as string;
  };
  const tick = () => {
    if (stopped) return;
    setText(pick());
    timer = setTimeout(tick, nextDelay());
  };
  timer = setTimeout(tick, nextDelay());
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
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
