/**
 * Results page — "the settled bill" (D-27, brief
 * Result-Page-Redesign.md).
 *
 * One honest bill: what you would pay today,
 * what you will pay, and where every toman
 * goes, grouped by مرسوله (shipment)
 * because that is how Digikala charges.
 *
 * Every figure goes through src/results/format.ts
 * (Persian digits, '٬' separator, currency
 * unit, relative times) — no Latin digits, no
 * ISO strings, no bare numbers reach the UI.
 *
 * The Apply-to-cart flow (D-26) runs behind
 * CartApplier (src/results/apply.ts); the
 * sheet below drives it and nothing else
 * mutates the cart.
 *
 * Controls (lock, quantity, Plus, hints)
 * persist and re-solve debounced (NFR-03:
 * the solve is milliseconds; the window is
 * 250ms, under the 300ms target).
 */
import { formatMessage, t } from '../shared/i18n/messages';
import type { MessageKey } from '../shared/i18n/messages';
import { solve } from '../shared/solver';
import type { Hint, Plan, PlanGroup, PlanLine, UnsolvedReason } from '../shared/solver';
import type {
  ComparisonItem,
  Offer,
  Settings,
  ShipmentRecord,
  Snapshot,
  UiLanguage,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { buildSolverInput, itemKeyOf } from './assemble';
import type { ApplyProgress, ApplyResult, CartTransport, PreflightResult } from './apply';
import { createCartApplier } from './apply';
import { cartTransport } from './cart-transport';
import { absoluteDateTime, formatMoney, formatPercent, relativeTime } from './format';
import {
  FORMAT_LABEL,
  downloadFile,
  lineIds,
  lineUrl,
  planCsv,
  planRows,
  planXlsx,
  type ExportFormat,
} from './export';
import { getCartSnapshot, putCartSnapshot } from '../shared/storage/db';

type Lang = UiLanguage;

/** The model's currency is Toman (SDD 08). */
const CURRENCY_UNIT = 'toman' as const;

const REASON_KEYS: Record<UnsolvedReason, MessageKey> = {
  'no-available-vendor': 'reasonNoVendor',
  'all-offers-out-of-stock': 'reasonOutOfStock',
  'pinned-vendor-unavailable': 'reasonPinnedUnavailable',
};

/** Why an apply step failed, in the sheet's terms (D-30). */
type ApplyErrorKind = 'auth' | 'no-tab' | 'other';

/**
 * How many alternative sellers the why-disclosure re-solves before it shows
 * three. A small pool, because the rows are ranked by their effect on the cart
 * total, not by unit price - the cheapest unit is often not the best row.
 */
const WHY_ALTERNATIVE_POOL = 5;

/**
 * The severity ramp for a rejected option (D-35): the hue slides from just
 * below the saving green (the least-bad loser) down to red (the worst one).
 * It deliberately starts BELOW green rather than at it - a green chip already
 * means "this is what the plan buys", and a loser must never read as chosen.
 */
const LOSS_HUE_BEST = 100;
const LOSS_HUE_WORST = 0;

/** Where `loss` sits on the ramp, as an HSL hue, given the worst `worst`. */
function lossHue(loss: number, worst: number): number {
  if (!(worst > 0)) return LOSS_HUE_BEST;
  const t = Math.min(1, Math.max(0, loss / worst));
  return Math.round(LOSS_HUE_BEST + (LOSS_HUE_WORST - LOSS_HUE_BEST) * t);
}

/**
 * Paints a chip with its position on the loss ramp. The scale is relative to
 * the worst loss in the set the user is looking at, so the ramp always spans
 * its full range instead of collapsing when every loser is nearly as good.
 * The magnitude is still the chip's own text; the colour only orders them.
 */
function paintLoss(node: HTMLElement, loss: number, worst: number): void {
  const hue = lossHue(loss, worst);
  node.classList.add('bk-chip-loss');
  node.dataset.lossHue = String(hue);
  node.style.setProperty('--loss-hue', String(hue));
}

/**
 * A failed apply step is never silent (D-30). 401/403 means the
 * session is gone; NO_TAB means there is no digikala tab to run the
 * cart call in; everything else is a generic failure.
 */
function classifyApplyError(err: unknown): ApplyErrorKind {
  const shaped = err as { status?: unknown; code?: unknown } | null;
  if (shaped?.status === 401 || shaped?.status === 403) return 'auth';
  if (shaped?.code === 'NO_TAB') return 'no-tab';
  return 'other';
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

/** A number span: Persian digits, bidi-isolated. */
function num(value: number, lang: Lang): HTMLSpanElement {
  const node = el('span', 'bk-num');
  node.dir = 'ltr';
  node.textContent = numText(lang, value);
  return node;
}

function numText(lang: Lang, value: number): string {
  return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(value);
}

function money(value: number, lang: Lang): string {
  return formatMoney(value, lang, CURRENCY_UNIT);
}

function fill(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  return formatMessage(lang, key, vars);
}

const ICON_PATHS = {
  external: 'M14 4h6v6M20 4L10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6zM12 15v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3',
  alert: 'M12 4L2 20h20L12 4zM12 10v5M12 18v.5',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
} as const;

type IconName = keyof typeof ICON_PATHS;

function iconSvg(name: IconName): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}

function iconSpan(name: IconName, cls: string): HTMLElement {
  const node = el('span', cls);
  node.innerHTML = iconSvg(name);
  return node;
}

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------

interface PageState {
  lang: Lang;
  settings: Settings;
  items: ComparisonItem[];
  snapshots: Snapshot[];
  shipment: ShipmentRecord | null;
  /** Plus switch override (persisted; null = follow detection). */
  plusOverride: boolean | null;
  /** Dismissed extra-unit hints (this session). */
  dismissedHints: Set<string>;
  /** True while a re-solve is pending after a control change. */
  recomputing: boolean;
  /** The last rendered plan, kept for the recompute overlay. */
  last: {
    input: ReturnType<typeof buildSolverInput>;
    plan: Plan;
    hints: Hint[];
  } | null;
}

// ---------------------------------------------------------------------------
// Sheet (modal) plumbing — focus trap, Esc, backdrop close
// ---------------------------------------------------------------------------

interface SheetHandle {
  close: () => void;
}

function openSheet(build: (sheet: HTMLElement, close: () => void) => void): SheetHandle {
  const overlay = el('div', 'bk-sheet-overlay');
  const sheet = el('section', 'bk-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  overlay.append(sheet);
  document.body.append(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    if (e.key === 'Tab') {
      // Minimal focus trap: cycle the sheet's focusables.
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button, a[href], input, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => !n.hasAttribute('disabled'));
      if (!focusables.length) return;
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  build(sheet, close);
  sheet.querySelector<HTMLElement>('button')?.focus();
  return { close };
}

// ---------------------------------------------------------------------------
// Report page
// ---------------------------------------------------------------------------

export interface ReportPageDeps {
  getItems(): Promise<ComparisonItem[]>;
  getSnapshots(): Promise<Snapshot[]>;
  /** D-19: the shipment quote captured with the crawl (optional). */
  getShipment?(): Promise<ShipmentRecord | null>;
  putItem(item: ComparisonItem): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings?(settings: Settings): Promise<void>;
  /**
   * The cart transport the apply flow runs on (D-30). Defaults to the
   * live one, which proxies the cart calls through the service worker;
   * tests inject a fake (jsdom has no chrome APIs).
   */
  transport?: CartTransport;
}

export function createReportPage(deps: ReportPageDeps): {
  run(): Promise<void>;
} {
  const state: PageState = {
    lang: 'fa',
    settings: DEFAULT_SETTINGS,
    items: [],
    snapshots: [],
    shipment: null,
    plusOverride: null,
    dismissedHints: new Set(),
    recomputing: false,
    last: null,
  };

  const root = el('div');
  const content = el('div');
  content.id = 'content';
  root.append(content);
  const rerender = () => {
    void renderAll();
  };

  // The polite live region for apply-progress announcements.
  const live = el('div', 'bk-visually-hidden');
  live.setAttribute('aria-live', 'polite');
  const announce = (msg: string) => {
    live.textContent = msg;
  };

  // -----------------------------------------------------------------------
  // Mutations (controls) — persist, then re-solve (D-06, D-09, NFR-03)
  // -----------------------------------------------------------------------

  async function mutateItem(itemKey: string, patch: Partial<ComparisonItem>): Promise<void> {
    const item = state.items.find(
      (i) => itemKeyOf(i.itemId.productId, i.itemId.variantId as string) === itemKey,
    );
    if (!item) return;
    Object.assign(item, patch);
    await deps.putItem(item);
    scheduleResolve();
  }

  let resolveTimer: number | undefined;
  function scheduleResolve(): void {
    state.recomputing = true;
    // Keep the previous bill visible at reduced opacity while
    // the re-solve is pending (brief §4).
    if (state.last) {
      const { input, plan, hints } = state.last;
      renderContent(input, plan, hints, { stale: true });
    }
    window.clearTimeout(resolveTimer);
    resolveTimer = window.setTimeout(() => {
      resolveTimer = undefined;
      void renderAll();
    }, 250);
  }

  async function togglePlus(): Promise<void> {
    const next = !(state.plusOverride ?? state.settings.hasPlus);
    // In-memory state is updated before any await: a
    // concurrent read-back of settings (IndexedDB/
    // chrome.storage are async) can never win the race
    // and revert the switch the user just flipped.
    state.plusOverride = next;
    state.settings.hasPlus = next;
    if (deps.saveSettings) {
      await deps.saveSettings({ ...state.settings, hasPlus: next });
    }
    scheduleResolve();
  }

  function dismissHint(hintId: string): void {
    state.dismissedHints.add(hintId);
    rerender();
  }

  /** Re-crawl: ask the service worker to crawl again, then re-render. */
  function refreshPrices(): void {
    // The crawl is owned by the service worker (D-21); the
    // results page only asks and re-renders what appears.
    void globalThis.chrome?.runtime?.sendMessage({
      kind: 'capture/crawl-start',
    });
    state.recomputing = true;
    rerender();
    window.setTimeout(() => {
      void renderAll();
    }, 3_000);
  }

  // -----------------------------------------------------------------------
  // Solve + render
  // -----------------------------------------------------------------------

  async function renderAll(): Promise<void> {
    state.items = await deps.getItems();
    state.snapshots = await deps.getSnapshots();
    state.shipment = (await deps.getShipment?.()) ?? null;
    state.settings = await deps.loadSettings();
    state.lang = state.settings.uiLanguage === 'en' ? 'en' : 'fa';
    state.recomputing = false;

    const hasPlus = state.plusOverride ?? state.settings.hasPlus;
    const input = buildSolverInput(
      state.items,
      state.snapshots,
      { hasPlus, tolerancePercent: state.settings.tolerancePercent },
      state.shipment,
    );
    const { plan, hints } = solve(input);
    state.last = { input, plan, hints };
    renderContent(input, plan, hints, { stale: false });
  }

  function renderContent(
    input: ReturnType<typeof buildSolverInput>,
    plan: Plan,
    rawHints: Hint[],
    opts: { stale: boolean },
  ): void {
    const lang = state.lang;
    content.replaceChildren();
    const page = el('div', 'bk-page');
    content.append(page);

    // ---- empty state (brief §9 copy) ----
    if (state.items.length === 0) {
      page.append(stateBlock(lang, 'errEmpty'));
      page.append(live);
      return;
    }

    // ---- header ----
    page.append(renderHeader(lang, plan));

    const savings = plan.comparison?.savings ?? 0;
    const currentTotal = plan.comparison?.currentCartTotal ?? 0;
    const hasSavings = savings > 0 && currentTotal > 0;

    // ---- hero (only when the plan saves) ----
    if (hasSavings) {
      page.append(renderHero(lang, plan, savings, currentTotal, rawHints));
    } else {
      // Already optimal: no bar, no Apply (brief §4).
      page.append(renderOptimal(lang, plan));
    }

    // The Plus switch is a control, not a saving: it stays visible in
    // every state, so a Plus subscriber can always turn it on and see
    // what it changes (the solve re-runs either way).
    page.append(renderPlusRow(lang, plan));
    // Tolerance next to it: the two settings the plan's shape depends on.
    page.append(renderToleranceRow(lang));

    // ---- notices ----
    const notices = renderNotices(lang, plan);
    if (notices) page.append(notices);

    // ---- recompute line ----
    if (state.recomputing) {
      const line = el('div', 'bk-recompute');
      line.setAttribute('role', 'status');
      line.append(text(fill(lang, 'recomputeLine')));
      page.append(line);
    }

    // ---- parcels ----
    page.append(renderParcels(lang, plan, opts));

    // ---- hints (max 3, brief §4) ----
    const hints = rawHints
      .filter((h) => !state.dismissedHints.has(h.promoId + h.itemKey))
      .slice(0, 3);
    if (hints.length && hasSavings) {
      page.append(renderHints(lang, hints));
    }

    // ---- ledger ----
    page.append(renderLedger(lang, plan));

    // ---- unsolved items ----
    const unsolved = renderUnsolved(lang, plan);
    if (unsolved) page.append(unsolved);

    if (hasSavings) {
      const copyRow = el('div', 'bk-copy-row');
      const header = el('div', 'bk-copy-label');
      header.textContent = t(lang, 'copyLabel');
      copyRow.append(header);
      const list = el('div', 'bk-copy-list');
      for (const format of ['markdown', 'text', 'pretty'] as const) {
        list.append(renderCopyButton(lang, plan, format));
      }
      copyRow.append(list);
      page.append(copyRow);
    }

    // ---- sticky action bar ---
    if (hasSavings) {
      page.append(renderActionBar(lang, plan));
    }

    // ---- print date (§6) ----
    const printDate = el('div', 'bk-print-date');
    printDate.textContent = absoluteDateTime(new Date().toISOString(), lang);
    page.append(printDate);
    page.append(live);
  }

  // -----------------------------------------------------------------------
  // Blocks
  // -----------------------------------------------------------------------

  function stateBlock(lang: Lang, msgKey: MessageKey): HTMLElement {
    const block = el('div', 'bk-state');
    block.append(text(t(lang, msgKey)));
    return block;
  }

  function renderHeader(lang: Lang, plan: Plan): HTMLElement {
    const header = el('header', 'bk-header');
    // The brand mark is the whole 3D badge at 96px (the 256px asset, so
    // it stays crisp on a 2x display) - the top of the page is where the
    // tool gets to look like itself.
    const mark = el('img', 'bk-brand-icon');
    mark.src = '/icons/logo-256.png';
    mark.alt = '';
    mark.width = 96;
    mark.height = 96;
    const text = el('div', 'bk-header-text');
    const brand = el('span', 'bk-wordmark');
    brand.textContent = t(lang, 'wordmark');
    const label = el('span', 'bk-header-label');
    label.textContent = t(lang, 'headerLabel');
    text.append(brand, label);
    header.append(mark, text, renderExportMenu(plan));
    return header;
  }

  /**
   * Everything that leaves the page: PDF, CSV, Excel, pretty text,
   * Markdown, plain text.
   *
   * The menu is labelled in English in both UI languages (FORMAT_LABEL):
   * these are file formats, not UI copy, and an exported file is read by
   * whoever it is sent to.
   */
  function renderExportMenu(plan: Plan): HTMLElement {
    const wrap = el('div', 'bk-export');
    const btn = el('button', 'bk-menu');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const word = el('span', 'bk-menu-word');
    word.textContent = 'Export';
    btn.append(word);
    btn.insertAdjacentHTML('beforeend', iconSvg('chevron'));

    const popover = el('div', 'bk-menu-popover');
    popover.setAttribute('role', 'menu');

    const close = (): void => {
      popover.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDocClick);
    };
    const onDocClick = (e: MouseEvent): void => {
      if (!wrap.contains(e.target as Node)) close();
    };

    const actions: Array<[ExportFormat, () => void]> = [
      // "Save as PDF" stays the print dialog's Save-as-PDF: the print
      // stylesheet (§6) makes it clean, and it needs no dependency.
      ['pdf', () => window.print()],
      ['csv', () => runExport('csv', plan)],
      ['xlsx', () => runExport('xlsx', plan)],
      ['pretty', () => runExport('pretty', plan)],
      ['markdown', () => runExport('markdown', plan)],
      ['text', () => runExport('text', plan)],
    ];
    for (const [format, run] of actions) {
      const item = el('button', 'bk-menu-item');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.textContent = FORMAT_LABEL[format];
      item.addEventListener('click', () => {
        close();
        run();
      });
      popover.append(item);
    }

    btn.addEventListener('click', () => {
      const open = popover.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      // The click-away listener only lives while the menu is open, so
      // re-rendering the page never piles more listeners onto document.
      if (open) document.addEventListener('click', onDocClick);
      else document.removeEventListener('click', onDocClick);
    });
    wrap.append(btn, popover);
    return wrap;
  }

  /** Write the plan to a file. The text formats reuse the copy text. */
  function runExport(format: Exclude<ExportFormat, 'pdf'>, plan: Plan): void {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `bozkhar-plan-${stamp}`;
    if (format === 'csv') {
      downloadFile(`${name}.csv`, 'text/csv;charset=utf-8', planCsv(planRows(plan)));
      return;
    }
    if (format === 'xlsx') {
      downloadFile(
        `${name}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        planXlsx('BozKhar plan', planRows(plan)),
      );
      return;
    }
    downloadFile(
      `${name}.${format === 'markdown' ? 'md' : 'txt'}`,
      format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
      buildCopyText(state.lang, plan, format),
    );
  }

  function renderHero(
    lang: Lang,
    plan: Plan,
    savings: number,
    currentTotal: number,
    hints: Hint[],
  ): HTMLElement {
    const hero = el('section', 'bk-hero');
    const h1 = el('h1', 'bk-hero-title');
    h1.textContent = fill(lang, 'heroTitle', {
      saved: money(savings, lang),
    });
    hero.append(h1);

    // Price bar: the full length is today's bill; the plan
    // segment is solid ink, the rest turquoise.
    const planTotal = plan.grandTotal;
    const planPct = Math.max(0, Math.min(100, (planTotal / currentTotal) * 100));
    const bar = el('div', 'bk-pricebar');
    bar.setAttribute('role', 'img');
    bar.setAttribute(
      'aria-label',
      `${t(lang, 'barCurrent')}: ${money(currentTotal, lang)} — ${t(lang, 'barPlan')}: ${money(planTotal, lang)}`,
    );
    const planSeg = el('div', 'bk-pricebar-plan');
    planSeg.style.width = `${planPct}%`;
    const savedSeg = el('div', 'bk-pricebar-saved');
    savedSeg.style.insetInlineStart = `${planPct}%`;
    savedSeg.style.width = `${100 - planPct}%`;
    bar.append(planSeg, savedSeg);
    hero.append(bar);

    const meta = el('div', 'bk-hero-meta');
    const planTotalNode = el('strong', 'bk-hero-total bk-num');
    planTotalNode.dir = 'ltr';
    if (plan.totalIsEstimate && plan.estimateRange) {
      // Unknown fees: quote the honest range (SDD 08).
      planTotalNode.textContent = fill(lang, 'heroRange', {
        low: money(plan.estimateRange.low, lang),
        high: money(plan.estimateRange.high, lang),
      });
    } else {
      planTotalNode.textContent = money(planTotal, lang);
    }
    const currentNode = el('span', 'bk-hero-total-current bk-num');
    currentNode.dir = 'ltr';
    currentNode.textContent = money(currentTotal, lang);
    const pct = Math.round((savings / currentTotal) * 100);
    const chip = el('span', 'bk-chip bk-chip-saving');
    chip.append(text(fill(lang, 'pctLess', { pct: numText(lang, pct) })));
    const counts = el('div', 'bk-hero-counts');
    counts.textContent = fill(lang, 'heroLine', {
      items: numText(lang, plan.assignments.length),
      shipments: numText(lang, plan.groups.length),
    });
    meta.append(planTotalNode, currentNode, chip, counts);
    hero.append(meta);

    if (hints.length) {
      const hintsLink = el('a', 'bk-hero-hints-link');
      hintsLink.href = '#bk-hints';
      hintsLink.textContent = fill(lang, 'heroHintsLink', {
        n: numText(lang, hints.length),
      });
      hero.append(hintsLink);
    }
    return hero;
  }

  function renderPlusRow(lang: Lang, plan: Plan): HTMLElement {
    const row = el('div', 'bk-plus-row');
    const id = 'bk-plus-switch';
    // The switch IS a label wrapping the input: the visible track paints
    // over the (invisible) input, so a bare div here would swallow every
    // click on the switch and nothing would ever toggle.
    const wrap = el('label', 'bk-switch');
    wrap.htmlFor = id;
    const input = el('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.id = id;
    input.className = 'bk-switch-input';
    input.checked = state.plusOverride ?? state.settings.hasPlus;
    const track = el('span', 'bk-switch-track');
    const thumb = el('span', 'bk-switch-thumb');
    track.append(thumb);
    wrap.append(input, track);
    input.addEventListener('change', () => {
      void togglePlus();
    });

    const label = el('label', 'bk-plus-label');
    label.htmlFor = id;
    label.textContent = t(lang, 'plusLabel');
    row.append(wrap, label);

    const hasPlus = state.plusOverride ?? state.settings.hasPlus;
    if (hasPlus) {
      const note = el('div', 'bk-plus-note');
      note.textContent = t(lang, 'plusNote');
      row.append(note);
      // The delta vs solving without Plus.
      const without = solve(
        buildSolverInput(
          state.items,
          state.snapshots,
          {
            hasPlus: false,
            tolerancePercent: state.settings.tolerancePercent,
          },
          state.shipment,
        ),
      );
      const delta = without.plan.grandTotal - plan.grandTotal;
      if (delta > 0) {
        const deltaNode = el('div', 'bk-plus-delta');
        deltaNode.textContent = fill(lang, 'plusDelta', {
          x: money(delta, lang),
        });
        row.append(deltaNode);
      } else {
        // Say so explicitly: a switch that visibly does nothing
        // reads as broken.
        const noChange = el('div', 'bk-plus-note');
        noChange.textContent = t(lang, 'plusNoChange');
        row.append(noChange);
      }
    }
    return row;
  }

  /**
   * The hint tolerance (FR-14): how much more the cart total may cost for
   * a suggestion to still be offered. Same setting the options page
   * edits, so the two stay in step; moving it re-solves, so the hint set
   * changes live.
   */
  function renderToleranceRow(lang: Lang): HTMLElement {
    const row = el('div', 'bk-tolerance-row');
    const id = 'bk-tolerance';
    const label = el('label', 'bk-tolerance-label');
    label.htmlFor = id;
    label.textContent = t(lang, 'tolerancePercent');
    const input = el('input', 'bk-tolerance-input') as HTMLInputElement;
    input.type = 'range';
    input.id = id;
    input.min = '0';
    input.max = '10';
    input.step = '0.5';
    input.value = String(state.settings.tolerancePercent);
    const out = el('output', 'bk-tolerance-out bk-num');
    out.setAttribute('for', id);
    out.dir = 'ltr';
    const paint = (): void => {
      out.textContent = formatPercent(state.settings.tolerancePercent, lang);
    };
    paint();

    // Re-rendering mid-drag would rebuild this control under the
    // pointer, so the solve waits for the drag to settle.
    let solveTimer: number | undefined;
    input.addEventListener('input', () => {
      state.settings.tolerancePercent = Number(input.value);
      paint();
      window.clearTimeout(solveTimer);
      solveTimer = window.setTimeout(() => {
        const refocus = document.activeElement === input;
        void (async () => {
          if (deps.saveSettings) await deps.saveSettings({ ...state.settings });
          await renderAll();
          if (refocus) document.querySelector<HTMLInputElement>(`#${id}`)?.focus();
        })();
      }, 250);
    });

    const hint = el('p', 'bk-control-hint');
    hint.textContent = t(lang, 'toleranceHint');
    row.append(label, input, out, hint);
    return row;
  }

  function renderNotices(lang: Lang, plan: Plan): HTMLElement | null {
    const wrap = el('div', 'bk-notices');
    let any = false;

    // Staleness (FR-04): the threshold is the user's setting, not a
    // constant, so the banner appears exactly when the options page says
    // prices have gone old.
    const thresholdMs = state.settings.stalenessWarnHours * 60 * 60_000;
    const stale: PlanLine[] = [];
    let oldest: string | null = null;
    for (const a of plan.assignments) {
      if (!a.capturedAt) continue;
      if (Date.now() - Date.parse(a.capturedAt) <= thresholdMs) continue;
      stale.push(a);
      if (!oldest || a.capturedAt < oldest) oldest = a.capturedAt;
    }
    if (stale.length > 0 && oldest) {
      any = true;
      const notice = el('div', 'bk-notice bk-notice-caution');
      notice.append(iconSpan('clock', 'bk-notice-icon'));
      const body = el('div', 'bk-notice-body');
      const p = el('p');
      p.textContent = fill(lang, 'staleNotice', {
        n: numText(lang, stale.length),
        ago: relativeTime(oldest, lang),
      });
      const action = el('button', 'bk-btn bk-btn-quiet');
      action.type = 'button';
      action.textContent = t(lang, 'staleAction');
      action.addEventListener('click', refreshPrices);
      body.append(p, action);

      // …or re-capture just the line you are looking at, which is the
      // cheaper answer and needs no crawl.
      const list = el('ul', 'bk-stale-list');
      for (const line of stale) {
        const item = el('li', 'bk-stale-row');
        const name = el('span', 'bk-stale-name');
        name.textContent = line.title ?? line.itemKey;
        const ago = el('span', 'bk-stale-ago');
        ago.textContent = relativeTime(line.capturedAt ?? '', lang);
        const refresh = el('button', 'bk-btn bk-btn-quiet bk-stale-refresh');
        refresh.type = 'button';
        refresh.textContent = t(lang, 'staleItemAction');
        refresh.setAttribute('aria-label', `${t(lang, 'staleItemAction')} — ${name.textContent}`);
        refresh.addEventListener('click', () => refreshLine(line));
        item.append(name, ago, refresh);
        list.append(item);
      }
      body.append(list);
      notice.append(body);
      wrap.append(notice);
    }

    return any ? wrap : null;
  }

  /**
   * Re-capture one stale line (FR-04). `capture/pdp` fetches the product
   * API for the variant the plan BUYS — the offer this line's price rests
   * on — and appends a snapshot to the store the crawl writes to, so the
   * re-solve below picks it up. Unlike the crawl this needs no tab: the
   * product API answers any origin.
   */
  function refreshLine(line: PlanLine): void {
    const { productId, variantId } = lineIds(line);
    if (!variantId) return;
    const done = globalThis.chrome?.runtime?.sendMessage({
      kind: 'capture/pdp',
      productId,
      variantId,
    }) as Promise<unknown> | undefined;
    state.recomputing = true;
    rerender();
    void Promise.resolve(done).then(
      () => renderAll(),
      () => renderAll(),
    );
  }

  function renderOptimal(lang: Lang, plan: Plan): HTMLElement {
    const block = el('div', 'bk-optimal');
    const p = el('p');
    p.textContent = t(lang, 'optimalMsg');
    const total = el('div', 'bk-optimal-total bk-num');
    total.dir = 'ltr';
    total.textContent = money(plan.grandTotal, lang);
    block.append(p, total);
    return block;
  }

  // ---- parcels ----

  function renderParcels(lang: Lang, plan: Plan, opts: { stale: boolean }): HTMLElement {
    const wrap = el('section', 'bk-parcels');
    const h2 = el('h2', 'bk-parcels-title');
    h2.textContent = t(lang, 'parcelsTitle');
    wrap.append(h2);

    const itemByKey = new Map(
      state.items.map((i) => [itemKeyOf(i.itemId.productId, i.itemId.variantId as string), i]),
    );

    // The worst unit-price rise anywhere in this plan is the red end of the
    // loss ramp, so the change chips are coloured relative to the bill the
    // user is looking at rather than to an arbitrary toman scale (D-35).
    let worstRise = 0;
    for (const group of plan.groups) {
      for (const line of group.lines) {
        const item = itemByKey.get(line.itemKey);
        const offer = item ? cartOffer(item) : undefined;
        if (offer) worstRise = Math.max(worstRise, line.unitPrice - offer.price);
      }
    }

    for (const group of plan.groups) {
      wrap.append(renderParcel(lang, plan, group, itemByKey, opts, worstRise));
    }
    return wrap;
  }

  function renderParcel(
    lang: Lang,
    plan: Plan,
    group: PlanGroup,
    itemByKey: Map<string, ComparisonItem>,
    opts: { stale: boolean },
    worstRise: number,
  ): HTMLElement {
    const card = el('article', 'bk-parcel');
    if (opts.stale) card.classList.add('bk-stale-content');

    // Head: seller name. The ship-source badge (shipped by
    // Digikala vs by the seller) lights up when the offer
    // model carries shipSource (brief §8 — hidden until
    // the data exists).
    const head = el('div', 'bk-parcel-head');
    const seller = el('span', 'bk-seller-name');
    seller.textContent = group.vendorName ?? group.vendorId;
    head.append(seller);
    card.append(head);

    // Items table (column headers visible ≥560px via the
    // CSS container query; on small screens the values sit
    // on the row itself).
    const table = el('div', 'bk-items');
    const thead = el('div', 'bk-items-head');
    for (const key of ['colQty', 'colUnit', 'colLine'] as const) {
      const h = el('span', 'bk-items-th');
      h.textContent = t(lang, key);
      thead.append(h);
    }
    table.append(thead);

    for (const line of group.lines) {
      table.append(renderItemRow(lang, plan, group, line, itemByKey, worstRise));
    }
    card.append(table);

    // Foot: shipping + the parcel total. Shipping lives
    // INSIDE the parcel total (brief §2 P0.2) — the hero,
    // the ledger and the action bar all sum to the same
    // grand total (brief §11).
    const foot = el('div', 'bk-parcel-foot');
    const shipRow = el('div', 'bk-ship-row');
    const shipLabel = el('span', 'bk-ship-label');
    shipLabel.textContent = t(lang, 'shippingFee');
    const shipValue = el('span', 'bk-ship-value');
    if (group.fee === null) {
      // Unknown fee: the total is an estimate (SDD 08).
      shipValue.append(text(t(lang, 'feeUnknown')));
      shipValue.classList.add('bk-fee-unknown');
    } else if (group.fee === 0) {
      shipValue.append(text(t(lang, 'freeLabel')));
      const reason = shippingReasonChip(lang, plan, group);
      if (reason) shipValue.append(reason);
    } else {
      const feeNode = el('span', 'bk-num');
      feeNode.dir = 'ltr';
      feeNode.textContent = money(group.fee, lang);
      shipValue.append(feeNode);
      const reason = shippingReasonChip(lang, plan, group);
      if (reason) shipValue.append(reason);
    }
    shipRow.append(shipLabel, shipValue);
    foot.append(shipRow);

    const totalRow = el('div', 'bk-parcel-total');
    const label = el('span');
    label.textContent = t(lang, 'parcelTotal');
    const value = el('strong', 'bk-num');
    value.dir = 'ltr';
    value.textContent = money(group.subtotal + (group.fee ?? 0), lang);
    totalRow.append(label, value);
    foot.append(totalRow);
    card.append(foot);

    return card;
  }

  /** The reason chip for a waived shipping fee (brief §8). */
  function shippingReasonChip(lang: Lang, plan: Plan, group: PlanGroup): HTMLElement | null {
    if (group.feeFlag === 'plus-covered') {
      return chip(lang, 'reasonPlus');
    }
    if (group.feeFlag === 'large-item') {
      return chip(lang, 'reasonLarge');
    }
    if (group.feeFlag === 'promo-waived') {
      // The promos live on the solver input; the page
      // looks them up from the last render.
      const input = state.last?.input;
      const found = input?.promos.find((p) => group.promoIds.includes(p.promoId));
      if (found && (found.type === 'same-item-count' || found.type === 'vendor-count')) {
        return chip(lang, 'reasonCount', {
          n: numText(lang, found.thresholdValue),
        });
      }
      // amount-threshold promos are not in the model yet —
      // the chip stays hidden until they are (brief §8).
    }
    return null;
  }

  function chip(
    lang: Lang,
    key: MessageKey,
    vars: Record<string, string | number> = {},
  ): HTMLElement {
    const node = el('span', 'bk-chip bk-chip-reason');
    node.textContent = fill(lang, key, vars);
    return node;
  }

  function renderItemRow(
    lang: Lang,
    plan: Plan,
    group: PlanGroup,
    line: PlanLine,
    itemByKey: Map<string, ComparisonItem>,
    worstRise: number,
  ): HTMLElement {
    void plan;
    void group;
    const item = itemByKey.get(line.itemKey);
    const locked = item?.lock.mode === 'pin';
    const row = el('div', 'bk-item');
    if (locked) row.classList.add('bk-item-locked');

    // Main picture (display-only passthrough, issue #10).
    const picture =
      item?.product.image ??
      state.last?.input.items.find((i) => i.itemKey === line.itemKey)?.imageUrl;
    if (picture) {
      const img = el('img', 'bk-picture');
      img.src = picture;
      img.alt = '';
      img.loading = 'lazy';
      row.append(img);
    }

    const cell = el('div', 'bk-item-cell');

    // Title: the product page, with the external glyph
    // (brief §2 P1.9 — a machine id is never the link).
    const titleLink = el('a', 'bk-item-title');
    if (item?.productUrl) {
      titleLink.href = item.productUrl;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener';
      titleLink.append(text(line.title ?? ''));
      titleLink.append(iconSpan('external', 'bk-ext-icon'));
      titleLink.setAttribute('aria-label', `${line.title ?? ''} — ${t(lang, 'openProduct')}`);
    } else {
      titleLink.textContent = line.title ?? '';
    }
    cell.append(titleLink);

    // Variant label: human text only (D-17). When the
    // plan switched variants, the cart item's label
    // names the OLD variant — the chosen variant's id
    // is shown instead.
    const switched =
      line.variantId !== undefined && item && line.variantId !== item.itemId.variantId;
    if (line.variantLabel && !switched) {
      const variant = el('div', 'bk-item-variant');
      variant.textContent = line.variantLabel;
      cell.append(variant);
    } else if (switched && line.variantId) {
      const variant = el('div', 'bk-item-variant');
      variant.textContent = fill(lang, 'variantFallback', {
        id: line.variantId,
      });
      cell.append(variant);
    }

    // Change line: what the cart holds today (the "قبل"
    // disclosure, brief §2 P1.5).
    const change = changeLine(lang, item, group.vendorId, line, worstRise);
    if (change) cell.append(change);

    row.append(cell);

    // Qty / unit / line total.
    const qty = el('span', 'bk-item-qty');
    qty.append(num(line.quantity, lang));
    row.append(qty);

    const unit = el('span', 'bk-item-unit bk-num');
    unit.dir = 'ltr';
    unit.textContent = money(line.unitPrice, lang);
    row.append(unit);

    const total = el('strong', 'bk-item-total bk-num');
    total.dir = 'ltr';
    total.textContent = money(line.lineTotal, lang);
    row.append(total);

    // Actions: why-disclosure + the seller control.
    const actions = el('div', 'bk-item-actions');
    if (item) {
      actions.append(whyButton(lang, item, group.vendorId, line));
      actions.append(sellerControl(lang, item));
    }
    row.append(actions);

    // Locked chip + helper (brief §2 P1.6/P1.7).
    if (locked) {
      const lockChip = el('span', 'bk-chip bk-chip-locked');
      lockChip.innerHTML = `${iconSvg('lock')} ${t(lang, 'lockedChip')}`;
      const helper = el('div', 'bk-lock-helper');
      helper.textContent = t(lang, 'lockHelper');
      actions.append(lockChip, helper);
    }

    return row;
  }

  /**
   * The cart's current offer for an item: the cart seller's offer on the
   * cart's variant, from the latest capture that still shows it (snapshots
   * are stored oldest-first). Also the baseline the loss ramp measures.
   */
  function cartOffer(item: ComparisonItem): Offer | undefined {
    const cartVariant = item.itemId.variantId as string;
    const snaps = state.snapshots
      .filter(
        (s) => s.itemId.productId === item.itemId.productId && s.itemId.variantId === cartVariant,
      )
      .reverse();
    for (const snap of snaps) {
      const offer = snap.offers.find((o) => o.vendor.id === item.sellerId);
      if (offer) return offer;
    }
    return undefined;
  }

  /** "قبلاً: seller، price" + the difference chip. */
  function changeLine(
    lang: Lang,
    item: ComparisonItem | undefined,
    chosenVendorId: string,
    line: PlanLine,
    worstRise: number,
  ): HTMLElement | null {
    if (!item?.sellerId || !item?.sellerName) return null;
    const currentOffer = cartOffer(item);
    if (!currentOffer) return null;

    const changedSeller = currentOffer.vendor.id !== chosenVendorId;
    const priceDiff = line.unitPrice - currentOffer.price;
    if (!changedSeller && priceDiff === 0) {
      return null; // identical: no change line
    }

    const wrap = el('div', 'bk-item-change');
    const was = el('span', 'bk-item-was');
    was.textContent = fill(lang, 'itemChange', {
      seller: item.sellerName,
      price: money(currentOffer.price, lang),
    });
    wrap.append(was);
    if (priceDiff < 0) {
      const less = el('span', 'bk-chip bk-chip-saving');
      less.textContent = fill(lang, 'changeLess', {
        n: money(-priceDiff, lang),
      });
      wrap.append(less);
    } else if (priceDiff === 0) {
      const none = el('span', 'bk-chip');
      none.textContent = t(lang, 'changeNone');
      wrap.append(none);
    } else {
      // The item moved to a dearer unit to join a cheaper package. Saying so
      // is the whole point: silently raising the unit price reads as a wrong
      // calculation (2026-10-16 report). The chip rides the loss ramp so the
      // size of the trade-off is legible at a glance (D-35).
      const more = el('span', 'bk-chip');
      more.textContent = fill(lang, 'changeMore', {
        n: money(priceDiff, lang),
      });
      paintLoss(more, priceDiff, worstRise);
      wrap.append(more);
    }
    return wrap;
  }

  // ---- why-disclosure (brief §2 P1.5, §4) ----

  function whyButton(
    lang: Lang,
    item: ComparisonItem,
    chosenVendorId: string,
    line: PlanLine,
  ): HTMLElement {
    const btn = el('button', 'bk-btn bk-btn-quiet bk-why-btn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = t(lang, 'whyBtn');

    let expanded = false;
    let panel: HTMLElement | null = null;

    btn.addEventListener('click', () => {
      expanded = !expanded;
      btn.setAttribute('aria-expanded', String(expanded));
      if (!expanded) {
        panel?.remove();
        panel = null;
        return;
      }
      panel = el('div', 'bk-why');
      const loading = el('p', 'bk-why-loading');
      loading.textContent = t(lang, 'loadingCalc');
      panel.append(loading);
      btn.after(panel);
      // Compute the alternatives lazily (the solves are
      // fast, but they run on demand).
      void (async () => {
        const alts = whyAlternatives(item, chosenVendorId, line);
        if (!panel) return;
        panel.replaceChildren();
        if (!alts.length) {
          panel.remove();
          panel = null;
          return;
        }
        const table = el('div', 'bk-why-table');
        for (const head of ['whySeller', 'whyPrice', 'whyEffect'] as const) {
          const h = el('span', 'bk-why-th');
          h.textContent = t(lang, head);
          table.append(h);
        }
        // The heaviest loss in this list anchors the ramp: the best loser
        // sits just under green, the worst is fully red (D-35).
        const worst = alts.reduce((max, a) => Math.max(max, a.effect), 0);
        for (const alt of alts) {
          const sellerCell = el('span', 'bk-why-seller');
          sellerCell.textContent = alt.sellerName;
          const priceCell = el('span', 'bk-why-price bk-num');
          priceCell.dir = 'ltr';
          priceCell.textContent = money(alt.price, lang);
          const effectCell = el('span', 'bk-why-effect');
          const effectChip = el('span', alt.effect < 0 ? 'bk-chip bk-chip-saving' : 'bk-chip');
          if (alt.effect >= 0) paintLoss(effectChip, alt.effect, worst);
          effectChip.textContent =
            alt.effect < 0
              ? fill(lang, 'changeLess', { n: money(-alt.effect, lang) })
              : fill(lang, 'changeMore', { n: money(alt.effect, lang) });
          effectCell.append(effectChip);
          table.append(sellerCell, priceCell, effectCell);
        }
        panel.append(table);
        // The trade-off sentence: cheaper unit, costlier total.
        const tradeOff = alts.find((a) => a.price < line.unitPrice && a.effect > 0);
        if (tradeOff) {
          const p = el('p', 'bk-why-sentence');
          p.textContent = fill(lang, 'whySentence', {
            seller: tradeOff.sellerName,
            x: money(tradeOff.price, lang),
            y: money(tradeOff.effect, lang),
          });
          panel.append(p);
        }
      })();
    });
    return btn;
  }

  interface WhyAlternative {
    sellerName: string;
    vendorId: string;
    price: number;
    /** grandTotal with this vendor pinned, minus the plan total. */
    effect: number;
  }

  /**
   * Up to three alternative sellers for the item's product
   * (in-stock offers on any variant), with the exact
   * effect on the cart total when the vendor is pinned.
   */
  function whyAlternatives(
    item: ComparisonItem,
    chosenVendorId: string,
    line: PlanLine,
  ): WhyAlternative[] {
    const input = state.last?.input;
    const plan = state.last?.plan;
    if (!input || !plan) return [];
    const productId = item.itemId.productId;

    // Cheapest in-stock offer per alternative vendor, ranked by TOTAL (unit
    // price + that vendor's own package fee). Ranking by unit price alone put
    // a dearer-total seller at the top of this list, which reads as the
    // extension recommending it (2026-10-16 report).
    const fallback = input.unknownFeeFallback ?? 0;
    const totalOf = (o: { price: number; fee: number | null }): number =>
      o.price + (o.fee ?? fallback);
    const seen = new Map<string, { sellerName: string; price: number; fee: number | null }>();
    for (const solverItem of input.items) {
      if (!solverItem.itemKey.startsWith(`${productId}::`)) continue;
      for (const offer of solverItem.offers) {
        if (offer.stock !== 'in-stock') continue;
        if (offer.vendorId === chosenVendorId) continue;
        if (offer.unitPrice <= 0) continue;
        const known = seen.get(offer.vendorId);
        const next = {
          sellerName: offer.vendorName ?? offer.vendorId,
          price: offer.unitPrice,
          fee: offer.fee,
        };
        if (!known || totalOf(next) < totalOf(known)) {
          seen.set(offer.vendorId, next);
        }
      }
    }
    const candidates = [...seen.entries()]
      .sort((a, b) => totalOf(a[1]) - totalOf(b[1]) || a[0].localeCompare(b[0]))
      .slice(0, WHY_ALTERNATIVE_POOL);

    const out: WhyAlternative[] = [];
    for (const [vendorId, data] of candidates) {
      const pinned = buildSolverInput(
        state.items.map((i) =>
          itemKeyOf(i.itemId.productId, i.itemId.variantId as string) === line.itemKey
            ? { ...i, lock: { mode: 'pin', vendorIds: [vendorId] } }
            : i,
        ),
        state.snapshots,
        {
          hasPlus: state.plusOverride ?? state.settings.hasPlus,
          tolerancePercent: state.settings.tolerancePercent,
        },
        state.shipment,
      );
      const pinnedSolve = solve(pinned);
      out.push({
        sellerName: data.sellerName,
        vendorId,
        price: data.price,
        effect: pinnedSolve.plan.grandTotal - plan.grandTotal,
      });
    }
    // Best three by effect on the cart total: the list then leads with the
    // arrangement that is actually cheapest, not with the cheapest sticker.
    return out
      .sort((a, b) => a.effect - b.effect || a.vendorId.localeCompare(b.vendorId))
      .slice(0, 3);
  }

  // ---- the seller control (replaces 'هر فروشنده‌ای', brief §2 P1.6) ----

  function sellerControl(lang: Lang, item: ComparisonItem): HTMLElement {
    const locked = item.lock.mode === 'pin';
    const pinnedVendor = locked ? item.lock.vendorIds[0] : undefined;

    const wrap = el('div', 'bk-seller-control');
    const btn = el('button', 'bk-seller-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (locked && pinnedVendor) {
      const name = state.last?.input.items
        .flatMap((i) => i.offers)
        .find((o) => o.vendorId === pinnedVendor)?.vendorName;
      btn.innerHTML = `${iconSvg('lock')} ${name ?? pinnedVendor}`;
    } else {
      btn.textContent = t(lang, 'sellerAuto');
    }

    btn.addEventListener('click', () => {
      const open = wrap.querySelector('.bk-popover');
      if (open) {
        open.remove();
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      const popover = el('div', 'bk-popover');
      popover.setAttribute('role', 'listbox');
      popover.setAttribute('aria-label', `${t(lang, 'sellerAuto')} — ${item.product.title}`);
      // Automatic first.
      popover.append(
        sellerOption(lang, t(lang, 'sellerAuto'), null, !locked, () => {
          void mutateItem(itemKeyOf(item.itemId.productId, item.itemId.variantId as string), {
            lock: { mode: 'none', vendorIds: [] },
          });
        }),
      );
      // Then every seller with an in-stock offer on this
      // product, cheapest TOTAL first (unit price + its
      // own shipment), each showing both numbers.
      for (const offer of offersForProduct(item.itemId.productId)) {
        popover.append(
          sellerOption(
            lang,
            offer.sellerName,
            { price: offer.price, fee: offer.fee },
            locked && pinnedVendor === offer.vendorId,
            () => {
              void mutateItem(itemKeyOf(item.itemId.productId, item.itemId.variantId as string), {
                lock: { mode: 'pin', vendorIds: [offer.vendorId] },
              });
            },
          ),
        );
      }
      wrap.append(popover);
      btn.setAttribute('aria-expanded', 'true');
      // Close on outside click.
      const onDoc = (e: MouseEvent) => {
        if (!wrap.contains(e.target as Node)) {
          popover.remove();
          btn.setAttribute('aria-expanded', 'false');
          document.removeEventListener('click', onDoc);
        }
      };
      document.addEventListener('click', onDoc);
    });

    wrap.append(btn);
    return wrap;
  }

  /**
   * In-stock offers for a product, one per vendor, ranked by TOTAL (unit price
   * + that vendor's own package fee). A price-only order put the fee-blind
   * cheapest at the top, which reads as the tool's own recommendation even
   * when the shipment makes it the dearer choice (2026-10-16 report).
   */
  function offersForProduct(productId: string) {
    const input = state.last?.input;
    if (!input) return [];
    const fallback = input.unknownFeeFallback ?? 0;
    const totalOf = (o: { price: number; fee: number | null }): number =>
      o.price + (o.fee ?? fallback);
    const seen = new Map<
      string,
      { vendorId: string; sellerName: string; price: number; fee: number | null }
    >();
    for (const solverItem of input.items) {
      if (!solverItem.itemKey.startsWith(`${productId}::`)) continue;
      for (const offer of solverItem.offers) {
        if (offer.stock !== 'in-stock') continue;
        const next = {
          vendorId: offer.vendorId,
          sellerName: offer.vendorName ?? offer.vendorId,
          price: offer.unitPrice,
          fee: offer.fee,
        };
        const known = seen.get(offer.vendorId);
        if (!known || totalOf(next) < totalOf(known)) {
          seen.set(offer.vendorId, next);
        }
      }
    }
    return [...seen.values()].sort(
      (a, b) => totalOf(a) - totalOf(b) || a.vendorId.localeCompare(b.vendorId),
    );
  }

  function sellerOption(
    lang: Lang,
    label: string,
    quote: { price: number; fee: number | null } | null,
    checked: boolean,
    onPick: () => void,
  ): HTMLElement {
    const option = el('button', 'bk-popover-option');
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(checked));
    if (checked) option.classList.add('is-selected');
    const name = el('span', 'bk-popover-name');
    name.textContent = label;
    option.append(name);
    if (quote) {
      // Unit price AND the shipment it implies: the pair is what the choice
      // actually costs, and showing only the first is how a dearer total came
      // to look like the cheapest offer (2026-10-16 report).
      const box = el('span', 'bk-popover-quote');
      const priceNode = el('span', 'bk-popover-price bk-num');
      priceNode.dir = 'ltr';
      priceNode.textContent = money(quote.price, lang);
      const ship = el('span', 'bk-popover-ship');
      ship.dir = 'ltr';
      ship.textContent =
        quote.fee === null
          ? t(lang, 'feeUnknownShort')
          : `${t(lang, 'shippingFee')} ${money(quote.fee, lang)}`;
      box.append(priceNode, ship);
      option.append(box);
    }
    if (checked) {
      const check = el('span', 'bk-popover-check');
      check.innerHTML = iconSvg('check');
      option.append(check);
    }
    option.addEventListener('click', onPick);
    return option;
  }

  // ---- hints (D-09) ----

  function renderHints(lang: Lang, hints: Hint[]): HTMLElement {
    const section = el('section', 'bk-hints');
    section.id = 'bk-hints';
    const h2 = el('h2', 'bk-hints-title');
    h2.textContent = t(lang, 'hintsTitle');
    section.append(h2);

    const list = el('div', 'bk-hint-list');
    for (const hint of hints) {
      list.append(renderHint(lang, hint));
    }
    section.append(list);
    return section;
  }

  function renderHint(lang: Lang, hint: Hint): HTMLElement {
    const card = el('div', 'bk-hint');
    const p = el('p', 'bk-hint-sentence');
    const itemTitle = state.items.find(
      (i) => itemKeyOf(i.itemId.productId, i.itemId.variantId as string) === hint.itemKey,
    )?.product.title;
    const vendorName = state.last?.input.items
      .find((i) => i.itemKey === hint.itemKey)
      ?.offers.find((o) => o.vendorId === hint.vendorId)?.vendorName;
    p.textContent = fill(lang, 'hintSentence', {
      item: itemTitle ?? '',
      n: numText(lang, 1),
      vendor: vendorName ?? '',
    });
    card.append(p);

    // The arithmetic, figure by figure (09-ui-spec Surface 3 §4): what
    // one more unit costs, what it removes from delivery, and the net.
    // A card that shows only the net asks to be taken on faith.
    const math = el('dl', 'bk-hint-math');
    const mathRow = (labelKey: MessageKey, amount: number): void => {
      const item = el('div', 'bk-hint-math-row');
      const term = el('dt', 'bk-hint-math-term');
      term.textContent = t(lang, labelKey);
      const value = el('dd', 'bk-hint-math-value bk-num');
      value.dir = 'ltr';
      value.textContent = money(amount, lang);
      item.append(term, value);
      math.append(item);
    };
    mathRow('hintMathFee', hint.feeRemoved);
    mathRow('hintMathUnit', -hint.extraUnitCost);
    mathRow('hintMathNet', hint.netEffect);
    card.append(math);

    const outcome = el('div', 'bk-hint-outcome');
    if (hint.verdict === 'saving') {
      outcome.classList.add('bk-hint-saving');
      outcome.textContent = fill(lang, 'hintSaving', {
        x: money(hint.netEffect, lang),
      });
    } else {
      outcome.classList.add('bk-hint-more');
      // "more" already carries the direction: a negative net would read
      // as "only -1 toman more".
      outcome.textContent = fill(lang, 'hintMore', {
        x: money(Math.abs(hint.netEffect), lang),
      });
      // Why a suggestion that costs more is here at all: say so, with
      // the tolerance it fits inside (D-10).
      const tolerance = el('span', 'bk-hint-tolerance');
      tolerance.textContent = fill(lang, 'hintTolerance', {
        pct: numText(lang, state.settings.tolerancePercent),
      });
      outcome.append(' ', tolerance);
    }
    card.append(outcome);

    const actions = el('div', 'bk-hint-actions');
    const add = el('button', 'bk-btn bk-btn-primary');
    add.type = 'button';
    add.textContent = t(lang, 'hintAdd');
    add.addEventListener('click', () => {
      const item = state.items.find(
        (i) => itemKeyOf(i.itemId.productId, i.itemId.variantId as string) === hint.itemKey,
      );
      if (!item) return;
      void mutateItem(hint.itemKey, { quantity: item.quantity + 1 });
    });
    const dismiss = el('button', 'bk-btn bk-btn-quiet');
    dismiss.type = 'button';
    dismiss.textContent = t(lang, 'hintDismiss');
    dismiss.addEventListener('click', () => {
      dismissHint(hint.promoId + hint.itemKey);
    });
    actions.append(add, dismiss);
    card.append(actions);
    return card;
  }

  // ---- ledger (the bill footer) ----

  function renderLedger(lang: Lang, plan: Plan): HTMLElement {
    const ledger = el('section', 'bk-ledger');

    const rows: Array<{ key: MessageKey; value: number }> = [
      { key: 'ledgerItems', value: plan.itemSubtotal },
      { key: 'ledgerShipping', value: plan.deliverySubtotal },
    ];
    for (const row of rows) {
      const line = el('div', 'bk-ledger-row');
      const label = el('span');
      label.textContent = t(lang, row.key);
      const value = el('span', 'bk-num');
      value.dir = 'ltr';
      value.textContent = money(row.value, lang);
      line.append(label, value);
      ledger.append(line);
    }

    const payable = el('div', 'bk-ledger-row bk-ledger-payable');
    const label = el('span');
    label.textContent = t(lang, 'ledgerPayable');
    const value = el('strong', 'bk-num');
    value.dir = 'ltr';
    if (plan.totalIsEstimate && plan.estimateRange) {
      value.textContent = fill(lang, 'heroRange', {
        low: money(plan.estimateRange.low, lang),
        high: money(plan.estimateRange.high, lang),
      });
    } else {
      value.textContent = money(plan.grandTotal, lang);
    }
    payable.append(label, value);
    ledger.append(payable);

    // Oldest price across the plan (the honesty footnote).
    let oldest: string | null = null;
    for (const a of plan.assignments) {
      if (a.capturedAt && (!oldest || a.capturedAt < oldest)) {
        oldest = a.capturedAt;
      }
    }
    if (oldest) {
      const foot = el('div', 'bk-ledger-oldest');
      const ago = el('span');
      ago.textContent = fill(lang, 'ledgerOldest', {
        ago: relativeTime(oldest, lang),
      });
      ago.title = absoluteDateTime(oldest, lang);
      const refresh = el('button', 'bk-btn bk-btn-quiet');
      refresh.type = 'button';
      refresh.textContent = t(lang, 'staleAction');
      refresh.addEventListener('click', refreshPrices);
      foot.append(ago, refresh);
      ledger.append(foot);
    }

    return ledger;
  }

  function renderUnsolved(lang: Lang, plan: Plan): HTMLElement | null {
    if (!plan.unsolved.length) return null;
    const wrap = el('div', 'bk-unsolved');
    const h2 = el('h2');
    h2.textContent = t(lang, 'unsolvedTitle');
    wrap.append(h2);
    for (const u of plan.unsolved) {
      const row = el('div', 'bk-unsolved-row');
      const name = el('span', 'bk-unsolved-name');
      name.textContent = u.title ?? u.itemKey;
      const reason = el('span', 'bk-unsolved-reason');
      reason.textContent = t(lang, REASON_KEYS[u.reason]);
      row.append(name, reason);
      wrap.append(row);
    }
    return wrap;
  }

  /** Build the plan's text in the requested copy format. */
  function buildCopyText(lang: Lang, plan: Plan, format: 'markdown' | 'text' | 'pretty'): string {
    const summary = t(lang, 'copySummary');
    const saving = t(lang, 'copySaving');
    const payable = t(lang, 'ledgerPayable');
    const fee = t(lang, 'copyShipment');
    // Every line carries its product's Digikala page so a pasted
    // plan is actionable. The link is always rebuilt from the
    // product id and the CHOSEN variant, so a line the plan
    // switched points at the variant it actually buys.
    const blocks: string[] = [];
    for (const group of plan.groups) {
      const name = group.vendorName ?? group.vendorId;
      const head = format === 'markdown' ? `## ${name}` : format === 'pretty' ? `▸ ${name}` : name;
      const rows: string[] = [head];
      for (const line of group.lines) {
        const qty = numText(lang, line.quantity);
        const label =
          line.quantity > 1
            ? `${line.title ?? line.itemKey} × ${qty}`
            : (line.title ?? line.itemKey);
        const price = format === 'text' ? '' : ` — ${money(line.lineTotal, lang)}`;
        const url = lineUrl(line);
        if (format === 'markdown') {
          rows.push(`- ${url ? `[${label}](${url})` : label}${price}`);
        } else if (format === 'pretty') {
          rows.push(`  ✓ ${label}${price}`);
          // The link sits on its own indented line so the
          // title stays scannable.
          if (url) rows.push(`      ${url}`);
        } else {
          rows.push(`  ${label}`);
          if (url) rows.push(`    ${url}`);
        }
      }
      const groupFee =
        group.fee === null
          ? t(lang, 'feeUnknown')
          : group.fee === 0
            ? t(lang, 'freeLabel')
            : money(group.fee, lang);
      const feeRow = format === 'markdown' ? `- ${fee}: ${groupFee}` : `${fee}: ${groupFee}`;
      rows.push(feeRow);
      rows.push(
        format === 'markdown'
          ? `- **${payable}**: ${money(group.subtotal + (group.fee ?? 0), lang)}`
          : `${payable}: ${money(group.subtotal + (group.fee ?? 0), lang)}`,
      );
      blocks.push(rows.join('\n'));
    }
    const saved = plan.comparison?.savings ?? 0;
    const header = saved > 0 ? `${summary}\n${saving}: ${money(saved, lang)}\n` : `${summary}\n`;
    return `${header}${blocks.join('\n\n')}\n\n${payable}: ${money(plan.grandTotal, lang)}`;
  }

  function renderCopyButton(
    lang: Lang,
    plan: Plan,
    format: 'markdown' | 'text' | 'pretty',
  ): HTMLElement {
    const btn = el('button', 'bk-btn bk-btn-quiet bk-copy-btn');
    btn.type = 'button';
    btn.textContent = FORMAT_LABEL[format];
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.disabled = true;
      try {
        await navigator.clipboard.writeText(buildCopyText(lang, plan, format));
        btn.textContent = t(lang, 'copyDone');
      } catch {
        btn.textContent = t(lang, 'copyFailed');
      } finally {
        window.setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 1600);
      }
    });
    return btn;
  }

  // ---- sticky action bar ----

  function renderActionBar(lang: Lang, plan: Plan): HTMLElement {
    const bar = el('div', 'bk-actionbar');
    const info = el('div', 'bk-actionbar-info');
    const label = el('span', 'bk-actionbar-label');
    label.textContent = t(lang, 'ledgerPayable');
    const total = el('strong', 'bk-actionbar-total bk-num');
    total.dir = 'ltr';
    total.textContent = money(plan.grandTotal, lang);
    const shipments = el('span', 'bk-actionbar-shipments');
    shipments.textContent = fill(lang, 'actionShipments', {
      n: numText(lang, plan.groups.length),
    });
    info.append(label, total, shipments);
    bar.append(info);

    const flow = applyFlowFor(plan);
    const btn = el('button', 'bk-btn bk-btn-primary bk-apply-btn');
    btn.type = 'button';
    btn.textContent = state.recomputing ? t(lang, 'applyingBtn') : t(lang, 'applyBtn');
    btn.disabled = state.recomputing || flow.ui.changedLines === 0;
    if (flow.ui.changedLines === 0) {
      btn.title = t(lang, 'optimalMsg');
      // A disabled primary button whose reason lives only in a
      // tooltip reads as broken: state it in the page (brief §4.9).
      const note = el('p', 'bk-apply-note');
      note.textContent = t(lang, 'sellerOnlyNote');
      bar.append(note);
    }
    btn.addEventListener('click', flow.openSheet);
    bar.append(btn);
    return bar;
  }

  /**
   * Per-plan apply flow (D-26). The sheet machine:
   * preflight → price-change sheet / out-of-stock sheet /
   * confirm sheet → running progress → success or
   * partial-failure sheet with per-item retry and undo.
   */
  function applyFlowFor(plan: Plan) {
    const lang = state.lang;

    // Changed lines: the plan's chosen variant differs from
    // the cart item's variant (the item key's variant part).
    let changedLines = 0;
    const vendorByItem = new Map<string, string>();
    for (const group of plan.groups) {
      for (const line of group.lines) {
        vendorByItem.set(line.itemKey, group.vendorId);
      }
    }
    const changedVendors = new Set<string>();
    for (const a of plan.assignments) {
      if (!a.variantId) continue;
      const cartVariant = a.itemKey.slice(a.itemKey.lastIndexOf('::') + 2);
      if (a.variantId !== cartVariant) {
        changedLines++;
        const vendor = vendorByItem.get(a.itemKey);
        if (vendor) changedVendors.add(vendor);
      }
    }

    const ui = {
      phase: 'idle' as string,
      progress: [] as ApplyProgress[],
      result: null as ApplyResult | null,
      preflight: null as PreflightResult | null,
      errorKind: null as ApplyErrorKind | null,
      changedLines,
    };

    const applier = createCartApplier(deps.transport ?? cartTransport, {
      loadSnapshot: () => getCartSnapshot(indexedDB),
      saveSnapshot: (record) => putCartSnapshot(indexedDB, record),
    });

    let sheet: SheetHandle | null = null;
    let progressList: HTMLElement | null = null;

    const openSheetForUi = () => {
      sheet?.close();
      progressList = null;
      sheet = openSheet((sheetEl, close) => buildApplySheet(sheetEl, close));
    };

    /** A failed step becomes a sheet with the reason, never a stuck one. */
    function failApply(err: unknown): void {
      ui.errorKind = classifyApplyError(err);
      ui.phase = 'error';
    }

    async function runPreflight(): Promise<void> {
      ui.phase = 'preflight';
      ui.preflight = null;
      ui.errorKind = null;
      openSheetForUi();
      try {
        const result = await applier.preflight(plan);
        ui.preflight = result;
        ui.phase =
          result.status === 'price-changed'
            ? 'price-change'
            : result.status === 'out-of-stock'
              ? 'out-of-stock'
              : 'confirm';
      } catch (err) {
        // Every throw here happens before any mutation (preflight
        // only reads), so retrying from the sheet is always safe.
        failApply(err);
      }
      openSheetForUi();
    }

    async function runApply(): Promise<void> {
      ui.phase = 'running';
      ui.errorKind = null;
      ui.progress = plan.assignments
        .filter((a) => a.variantId)
        .map((a) => ({
          itemKey: a.itemKey,
          title: a.title,
          status: 'pending' as const,
        }));
      openSheetForUi();
      try {
        const result = await applier.apply(plan, (p) => {
          const row = ui.progress.find((r) => r.itemKey === p.itemKey);
          if (row) {
            row.status = p.status;
            row.title = p.title ?? row.title;
          }
          updateProgressRow(p);
          if (p.status === 'adding' || p.status === 'failed') {
            announce(
              `${p.title ?? p.itemKey} — ${t(
                lang,
                p.status === 'adding' ? 'statusAdding' : 'statusFailed',
              )}`,
            );
          }
        });
        ui.result = result;
        ui.phase = 'done';
      } catch (err) {
        // apply() reads the cart (and snapshots it) before the first
        // mutation, so a thrown transport failure left nothing half
        // applied.
        failApply(err);
      }
      openSheetForUi();
    }

    async function runUndo(): Promise<void> {
      ui.phase = 'running';
      ui.errorKind = null;
      ui.progress = [];
      openSheetForUi();
      try {
        const result = await applier.undo((p) => {
          const row = ui.progress.find((r) => r.itemKey === p.itemKey);
          if (row) {
            row.status = p.status;
            row.title = p.title ?? row.title;
          } else {
            ui.progress.push({
              itemKey: p.itemKey,
              title: p.title,
              status: p.status,
            });
          }
          updateProgressRow(p);
        });
        ui.result = result;
        ui.phase = 'done';
      } catch (err) {
        failApply(err);
      }
      openSheetForUi();
    }

    /** Update one progress row in place (no focus steal). */
    function updateProgressRow(p: ApplyProgress): void {
      if (!progressList) return;
      for (const child of Array.from(progressList.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.dataset.itemKey !== p.itemKey) continue;
        const status = child.querySelector<HTMLElement>('.bk-progress-status');
        if (status) {
          status.className = `bk-progress-status bk-status-${p.status}`;
          status.textContent = t(lang, statusKey(p.status));
        }
        return;
      }
    }

    function buildApplySheet(sheetEl: HTMLElement, close: () => void) {
      if (ui.phase === 'preflight') {
        sheetEl.setAttribute('aria-label', t(lang, 'applyingBtn'));
        const p = el('p');
        p.textContent = fill(lang, 'preflightProgress', {
          i: numText(lang, 0),
          n: numText(lang, plan.assignments.length),
        });
        sheetEl.append(p);
        return;
      }

      if (ui.phase === 'price-change') {
        const pf = ui.preflight;
        if (pf?.status !== 'price-changed') return;
        sheetEl.setAttribute('aria-label', t(lang, 'priceChangedTitle'));
        const h = el('h2');
        h.textContent = t(lang, 'priceChangedTitle');
        const p = el('p');
        p.textContent = fill(lang, 'priceChanged', {
          n: numText(lang, pf.changedCount),
          total: money(pf.newTotal, lang),
          delta: money(Math.abs(pf.delta), lang),
        });
        const actions = el('div', 'bk-sheet-actions');
        const keep = el('button', 'bk-btn bk-btn-primary');
        keep.type = 'button';
        keep.textContent = t(lang, 'continueNewPrice');
        keep.addEventListener('click', () => {
          close();
          ui.phase = 'confirm';
          openSheetForUi();
        });
        const recalc = el('button', 'bk-btn bk-btn-quiet');
        recalc.type = 'button';
        recalc.textContent = t(lang, 'recalcBtn');
        recalc.addEventListener('click', () => {
          close();
          void renderAll();
        });
        const cancel = el('button', 'bk-btn bk-btn-quiet');
        cancel.type = 'button';
        cancel.textContent = t(lang, 'cancelBtn');
        cancel.addEventListener('click', close);
        actions.append(keep, recalc, cancel);
        sheetEl.append(h, p, actions);
        return;
      }

      if (ui.phase === 'out-of-stock') {
        const pf = ui.preflight;
        if (pf?.status !== 'out-of-stock') return;
        sheetEl.setAttribute('aria-label', t(lang, 'outOfStockTitle'));
        const h = el('h2');
        h.textContent = t(lang, 'outOfStockTitle');
        const p = el('p');
        p.textContent = fill(lang, 'outOfStock', {
          items: pf.titles.join('، '),
        });
        const actions = el('div', 'bk-sheet-actions');
        const recalc = el('button', 'bk-btn bk-btn-primary');
        recalc.type = 'button';
        recalc.textContent = t(lang, 'recalcBtn');
        recalc.addEventListener('click', () => {
          close();
          void renderAll();
        });
        const cancel = el('button', 'bk-btn bk-btn-quiet');
        cancel.type = 'button';
        cancel.textContent = t(lang, 'cancelBtn');
        cancel.addEventListener('click', close);
        actions.append(recalc, cancel);
        sheetEl.append(h, p, actions);
        return;
      }

      if (ui.phase === 'confirm') {
        sheetEl.setAttribute('aria-label', t(lang, 'confirmTitle'));
        const h = el('h2');
        h.textContent = t(lang, 'confirmTitle');
        const p = el('p');
        p.textContent = fill(lang, 'confirmBody', {
          n: numText(lang, ui.changedLines),
          m: numText(lang, changedVendors.size),
        });
        const actions = el('div', 'bk-sheet-actions');
        const confirm = el('button', 'bk-btn bk-btn-primary');
        confirm.type = 'button';
        confirm.textContent = t(lang, 'applyBtn');
        confirm.addEventListener('click', () => {
          close();
          void runApply();
        });
        const cancel = el('button', 'bk-btn bk-btn-quiet');
        cancel.type = 'button';
        cancel.textContent = t(lang, 'cancelBtn');
        cancel.addEventListener('click', close);
        actions.append(confirm, cancel);
        sheetEl.append(h, p, actions);
        return;
      }

      if (ui.phase === 'error') {
        const kind = ui.errorKind ?? 'other';
        const messageKey: MessageKey =
          kind === 'auth' ? 'errLogin' : kind === 'no-tab' ? 'errApplyNoTab' : 'errApplyFailed';
        sheetEl.setAttribute('aria-label', t(lang, 'applyBtn'));
        const p = el('p', 'bk-sheet-error');
        p.setAttribute('role', 'alert');
        p.textContent = t(lang, messageKey);
        const actions = el('div', 'bk-sheet-actions');
        // The cart page is where the user fixes both causes (sign in,
        // or keep a digikala tab open); never opened for them.
        const goCart = el('a', 'bk-btn bk-btn-primary');
        goCart.href = 'https://www.digikala.com/cart/';
        goCart.target = '_blank';
        goCart.rel = 'noopener';
        goCart.textContent = t(lang, 'goToCart');
        const retry = el('button', 'bk-btn bk-btn-quiet');
        retry.type = 'button';
        retry.textContent = t(lang, 'tryAgain');
        retry.addEventListener('click', () => {
          close();
          void runPreflight();
        });
        const cancel = el('button', 'bk-btn bk-btn-quiet');
        cancel.type = 'button';
        cancel.textContent = t(lang, 'cancelBtn');
        cancel.addEventListener('click', close);
        actions.append(goCart, retry, cancel);
        sheetEl.append(p, actions);
        return;
      }

      // running / done
      const h = el('h2');
      if (ui.phase === 'running') {
        h.textContent = t(lang, 'applyingBtn');
      } else if (ui.result?.ok) {
        h.textContent = t(lang, 'successTitle');
      } else if (ui.result && ui.result.failed.length > 0) {
        h.textContent = fill(lang, 'partialTitle', {
          k: numText(lang, ui.result.failed.length),
          n: numText(lang, ui.result.failed.length + ui.result.applied.length),
        });
      } else {
        h.textContent = t(lang, 'errCalc');
      }
      sheetEl.append(h);

      if (ui.phase === 'running') {
        const list = el('div', 'bk-progress-list');
        for (const row of ui.progress) {
          list.append(progressRow(lang, row));
        }
        sheetEl.append(list);
        progressList = list;
        return;
      }

      // Result states.
      const result = ui.result;
      if (result?.ok) {
        const p = el('p');
        p.textContent = t(lang, 'successTitle');
        sheetEl.append(p);
      } else if (result && result.failed.length > 0) {
        const p = el('p');
        p.textContent = fill(lang, 'partialBody', {
          k: numText(lang, result.failed.length),
        });
        sheetEl.append(p);
      }

      const list = el('div', 'bk-progress-list');
      for (const row of ui.progress) {
        const node = progressRow(lang, row);
        if (result && row.status === 'failed') {
          const retry = el('button', 'bk-btn bk-btn-quiet');
          retry.type = 'button';
          retry.textContent = t(lang, 'retryItem');
          retry.addEventListener('click', () => {
            void runApply();
          });
          node.append(retry);
        }
        list.append(node);
      }
      if (list.children.length) {
        sheetEl.append(list);
        progressList = list;
      }

      const actions = el('div', 'bk-sheet-actions');
      const goCart = el('a', 'bk-btn bk-btn-primary');
      goCart.href = 'https://www.digikala.com/cart/';
      goCart.target = '_blank';
      goCart.rel = 'noopener';
      goCart.textContent = t(lang, 'goToCart');
      actions.append(goCart);
      if (result && result.applied.length > 0) {
        const undo = el('button', 'bk-btn bk-btn-quiet');
        undo.type = 'button';
        undo.textContent = t(lang, 'undoCart');
        undo.addEventListener('click', () => {
          void runUndo();
        });
        actions.append(undo);
      }
      if (result && result.failed.length > 0) {
        const undoAll = el('button', 'bk-btn bk-btn-quiet');
        undoAll.type = 'button';
        undoAll.textContent = t(lang, 'undoAll');
        undoAll.addEventListener('click', () => {
          void runUndo();
        });
        actions.append(undoAll);
      }
      const done = el('button', 'bk-btn bk-btn-quiet');
      done.type = 'button';
      done.textContent = t(lang, 'cancelBtn');
      done.addEventListener('click', () => {
        close();
        rerender();
      });
      actions.append(done);
      sheetEl.append(actions);
    }

    return { ui, openSheet: runPreflight };
  }

  function progressRow(lang: Lang, row: ApplyProgress): HTMLElement {
    const node = el('div', 'bk-progress-row');
    node.dataset.itemKey = row.itemKey;
    const status = el('span', `bk-progress-status bk-status-${row.status}`);
    status.textContent = t(lang, statusKey(row.status));
    const title = el('span', 'bk-progress-title');
    title.textContent = row.title ?? row.itemKey;
    node.append(status, title);
    return node;
  }

  function statusKey(status: ApplyProgress['status']): MessageKey {
    switch (status) {
      case 'pending':
        return 'statusPending';
      case 'adding':
        return 'statusAdding';
      case 'added':
        return 'statusAdded';
      case 'unchanged':
        return 'statusUnchanged';
      case 'manual':
        return 'statusManual';
      case 'failed':
        return 'statusFailed';
    }
  }

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(root);
    void renderAll();
  });
  if (document.readyState !== 'loading') {
    document.body.append(root);
    void renderAll();
  }

  return {
    run: renderAll,
  };
}
