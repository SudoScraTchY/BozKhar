/**
 * Results page (T05.1/T05.2/T05.3) - 09-ui-spec Surface 3.
 *
 * Reads the comparison list and the append-only
 * snapshot store directly (an extension page has both
 * storages), assembles the solver input, solves, and
 * renders the verdict cards and the vendor-grouped
 * plan. Advise-only throughout (D-01): no apply
 * buttons, no urgency.
 *
 * T05.3: each item row carries the D-06 lock control
 * (Any vendor / Pin to … / Ban …, multi-ban) and a
 * quantity editor (FR-05). Changes persist to the
 * comparison list and re-solve debounced (NFR-03:
 * the re-solve itself is milliseconds; the debounce
 * window is 250ms, under the 300ms target).
 *
 * Bilingual fa-primary RTL (NFR-08); numerals via Intl so
 * fa shows Persian digits.
 */
import { t } from '../shared/i18n/messages';
import type { MessageKey } from '../shared/i18n/messages';
import type { Settings } from '../shared/types';
import { solve } from '../shared/solver';
import type { FeeFlag, Plan, PlanLine, UnsolvedReason } from '../shared/solver';
import type {
  ComparisonItem,
  Lock,
  LockMode,
  ShipmentRecord,
  Snapshot,
  UiLanguage,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { buildSolverInput, itemKeyOf, snapshotsForProduct } from './assemble';

type Lang = UiLanguage;

const FEE_FLAG_KEYS: Record<FeeFlag, MessageKey> = {
  regular: 'feeRegular',
  'plus-covered': 'feePlusCovered',
  'promo-waived': 'feePromoWaived',
  'large-item': 'feeLargeItem',
  'already-paid-by-lock': 'feeAlreadyPaidByLock',
};

const REASON_KEYS: Record<UnsolvedReason, MessageKey> = {
  'no-available-vendor': 'reasonNoVendor',
  'all-offers-out-of-stock': 'reasonOutOfStock',
  'pinned-vendor-unavailable': 'reasonPinnedUnavailable',
};

/** NFR-03: coalesce rapid lock/qty edits; re-solve lands < 300ms. */
const RESOLVE_DEBOUNCE_MS = 250;

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
};

function fmt(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(n);
}

function fill(lang: Lang, key: MessageKey, vars: Record<string, string>): string {
  let s = t(lang, key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The item's own variant id, from the item key (productId::variantId). */
function currentVariantId(itemKey: string): string | undefined {
  const sep = itemKey.lastIndexOf('::');
  return sep === -1 ? undefined : itemKey.slice(sep + 2);
}

function renderVerdict(lang: Lang, plan: Plan): HTMLElement {
  const cards = el('div', 'cards');

  const current = el('div', 'verdict');
  current.append(
    el('span', 'card-label', t(lang, 'currentTotal')),
    el(
      'span',
      'card-value',
      plan.comparison?.currentCartTotal === null || plan.comparison?.currentCartTotal === undefined
        ? '—'
        : fmt(lang, plan.comparison.currentCartTotal),
    ),
  );

  const optimized = el('div', 'verdict');
  optimized.append(
    el('span', 'card-label', t(lang, 'optimizedTotal')),
    el(
      'span',
      'card-value',
      plan.totalIsEstimate && plan.estimateRange
        ? `${fmt(lang, plan.estimateRange.low)} … ${fmt(lang, plan.estimateRange.high)}`
        : fmt(lang, plan.grandTotal),
    ),
  );

  const savings = plan.comparison?.savings ?? null;
  const savingCard = el(
    'div',
    savings !== null && savings > 0
      ? 'verdict savings'
      : savings === null
        ? 'verdict savings unknown'
        : 'verdict savings none',
  );
  savingCard.append(
    el('span', 'card-label', t(lang, 'savings')),
    el(
      'span',
      'card-value',
      savings !== null && savings > 0
        ? fmt(lang, savings)
        : savings === null
          ? t(lang, 'savingsUnknown')
          : t(lang, 'savingsNone'),
    ),
  );

  cards.append(current, optimized, savingCard);
  return cards;
}

/** A vendor a product's snapshots saw, for the lock chips. */
interface VendorRef {
  id: string;
  name?: string;
}

/**
 * The D-06 lock control, made visible (09-ui-spec Surface 3 §2):
 * a mode dropdown (Any vendor / Pin to … / Ban …) plus vendor
 * chips. Pin selects exactly one vendor; Ban accumulates
 * (multi-ban). Chips are hidden in Any mode.
 */
function renderLockControl(
  lang: Lang,
  item: ComparisonItem,
  vendors: VendorRef[],
  onCommit: (lock: Lock) => void,
): HTMLElement {
  const wrap = el('span', 'lock-control');

  const mode = el('select', 'lock-mode') as HTMLSelectElement;
  for (const [value, label] of [
    ['none', t(lang, 'lockAny')],
    ['pin', t(lang, 'lockPin')],
    ['ban', t(lang, 'lockBan')],
  ] as const) {
    const opt = el('option', undefined, label) as HTMLOptionElement;
    opt.value = value;
    mode.append(opt);
  }
  mode.value = item.lock.mode;
  mode.addEventListener('change', () => {
    const m = mode.value as LockMode;
    if (m === 'none') {
      onCommit({ mode: 'none', vendorIds: [] });
    } else if (m === 'pin') {
      // Keep the current pin if one is set, else the first vendor.
      const keep =
        item.lock.mode === 'pin' && item.lock.vendorIds.length > 0
          ? item.lock.vendorIds
          : vendors[0]
            ? [vendors[0].id]
            : [];
      onCommit({ mode: 'pin', vendorIds: keep });
    } else {
      // Keep the current ban set when switching into ban mode.
      const keep = item.lock.mode === 'ban' ? item.lock.vendorIds : [];
      onCommit({ mode: 'ban', vendorIds: keep });
    }
  });

  const chips = el('span', 'vendor-chips');
  for (const v of vendors) {
    const chip = el('button', 'vendor-chip', v.name ?? v.id) as HTMLButtonElement;
    chip.type = 'button';
    const active =
      item.lock.mode === 'pin'
        ? item.lock.vendorIds[0] === v.id
        : item.lock.mode === 'ban' && item.lock.vendorIds.includes(v.id);
    chip.setAttribute('aria-pressed', String(active));
    if (active) chip.classList.add('active');
    chip.title =
      item.lock.mode === 'pin'
        ? fill(lang, 'lockPin', { vendor: v.name ?? v.id })
        : t(lang, 'lockBan');
    chip.addEventListener('click', () => {
      if (item.lock.mode === 'pin') {
        onCommit({ mode: 'pin', vendorIds: [v.id] });
      } else if (item.lock.mode === 'ban') {
        const banned = new Set(item.lock.vendorIds);
        if (banned.has(v.id)) banned.delete(v.id);
        else banned.add(v.id);
        onCommit({ mode: 'ban', vendorIds: [...banned] });
      }
    });
    chips.append(chip);
  }
  if (item.lock.mode === 'none') chips.classList.add('hidden');

  wrap.append(mode, chips);
  return wrap;
}

/** Quantity editor (FR-05); commits on change, clamped to >= 1. */
function renderQtyInput(
  lang: Lang,
  line: PlanLine,
  onCommit: (quantity: number) => void,
): HTMLElement {
  const input = el('input', 'qty-input') as HTMLInputElement;
  input.type = 'number';
  input.min = '1';
  input.value = String(line.quantity);
  input.setAttribute('aria-label', t(lang, 'quantity'));
  input.addEventListener('change', () => {
    const n = Number.parseInt(input.value, 10);
    const qty = Number.isFinite(n) && n >= 1 ? n : 1;
    input.value = String(qty);
    onCommit(qty);
  });
  return input;
}

/** Row controls injected by the page so renderPlan stays render-only. */
interface RowControls {
  lockFor: (itemKey: string) => HTMLElement;
  /** Quantity editor with its commit already bound to the item. */
  qtyFor: (line: PlanLine) => HTMLElement;
}

function renderPlan(
  lang: Lang,
  plan: Plan,
  unknownFeeFallback: number,
  controls: RowControls,
  pictures: Map<string, string> = new Map(),
): HTMLElement {
  const wrap = el('div');

  for (const group of plan.groups) {
    const card = el('section', 'card');
    card.append(
      el(
        'h2',
        'card-title',
        group.vendorName
          ? `${group.vendorName}${
              group.shipmentClass === 'large-item' ? ' — کالای بزرگ و سنگین' : ''
            }`
          : group.vendorId,
      ),
    );

    const table = el('table', 'plan');
    const thead = el('thead');
    const headRow = el('tr');
    for (const [label, num] of [
      [t(lang, 'unitPrice'), true],
      [t(lang, 'quantity'), true],
      [t(lang, 'lineTotal'), true],
    ] as const) {
      headRow.append(el('th', num ? 'num' : undefined, label));
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = el('tbody');
    for (const line of group.lines) {
      const row = el('tr');
      const nameCell = el('td');
      const picture = pictures.get(line.itemKey);
      if (picture) {
        const img = document.createElement('img');
        img.src = picture;
        img.alt = line.title ?? line.itemKey;
        img.className = 'plan-picture';
        img.loading = 'lazy';
        nameCell.append(img);
      }
      nameCell.append(el('span', undefined, line.title ?? line.itemKey));
      const chosenVariant = line.variantId;
      const ownVariant = currentVariantId(line.itemKey);
      if (chosenVariant !== undefined && chosenVariant !== ownVariant) {
        nameCell.append(
          el('span', 'variant-note', fill(lang, 'switchToVariant', { variant: chosenVariant })),
        );
      }
      if (line.capturedAt) {
        nameCell.append(el('span', 'captured-at', line.capturedAt));
      }
      // T05.3: the row carries its lock control (D-06 model).
      nameCell.append(controls.lockFor(line.itemKey));
      const qtyCell = el('td', 'num');
      qtyCell.append(controls.qtyFor(line));
      row.append(
        nameCell,
        el('td', 'num', fmt(lang, line.unitPrice)),
        qtyCell,
        el('td', 'num', fmt(lang, line.lineTotal)),
      );
      tbody.append(row);
    }

    // Exactly one fee line per group, carrying its flag (FR-12).
    const feeRow = el('tr', 'fee-line');
    feeRow.append(
      el('td', undefined, `${t(lang, 'deliveryFee')} — ${t(lang, FEE_FLAG_KEYS[group.feeFlag])}`),
    );
    feeRow.append(el('td'));
    feeRow.append(el('td'));
    const feeCell = el(
      'td',
      'num',
      group.fee === null ? fmt(lang, unknownFeeFallback) : fmt(lang, group.fee),
    );
    if (group.fee === null) {
      // Unknown fees are scored at the fallback (SDD 08) -
      // say so on the row itself, not only in the page-level
      // caveat, so the user sees exactly which seller is
      // unpriced (live report 2026-10-09).
      feeCell.append(el('span', 'fee-unknown', t(lang, 'feeUnknown')));
    }
    feeRow.append(feeCell);
    tbody.append(feeRow);

    const subtotalRow = el('tr', 'subtotal-row');
    subtotalRow.append(el('td'));
    subtotalRow.append(el('td'));
    subtotalRow.append(el('td'));
    subtotalRow.append(el('td', 'num', fmt(lang, group.subtotal)));
    tbody.append(subtotalRow);

    table.append(tbody);
    card.append(table);
    wrap.append(card);
  }

  const totals = el('dl', 'totals');
  for (const [key, value, grand] of [
    [t(lang, 'itemsSubtotal'), fmt(lang, plan.itemSubtotal), false],
    [t(lang, 'deliverySubtotal'), fmt(lang, plan.deliverySubtotal), false],
    [t(lang, 'grandTotal'), fmt(lang, plan.grandTotal), true],
  ] as const) {
    const row = el('div', grand ? 'grand' : undefined);
    row.append(el('dt', undefined, key), el('dd', undefined, value));
    totals.append(row);
  }
  wrap.append(totals);

  const latest = plan.assignments
    .map((a) => a.capturedAt)
    .filter((x): x is string => x !== undefined)
    .sort()
    .at(-1);
  if (latest) {
    wrap.append(el('p', 'note', fill(lang, 'pricesAsOf', { time: latest })));
  }

  return wrap;
}

function renderUnsolved(lang: Lang, plan: Plan): HTMLElement | null {
  if (plan.unsolved.length === 0) return null;
  const card = el('section', 'card');
  card.append(el('h2', 'card-title', t(lang, 'unsolvedTitle')));
  const list = el('ul', 'unsolved');
  for (const item of plan.unsolved) {
    list.append(
      el('li', undefined, `${item.title ?? item.itemKey} — ${t(lang, REASON_KEYS[item.reason])}`),
    );
  }
  card.append(list);
  return card;
}

function renderEmpty(lang: Lang): void {
  const empty = el('div', 'empty');
  empty.append(
    el('h2', 'card-title', t(lang, 'emptyTitle')),
    el('p', undefined, t(lang, 'emptyBody')),
  );
  $('content').append(empty);
}

/**
 * The page as a factory so the render + re-solve loop is
 * testable with injected storage (the module entry below
 * wires the real IndexedDB + settings).
 */
export interface ReportPageDeps {
  getItems(): Promise<ComparisonItem[]>;
  getSnapshots(): Promise<Snapshot[]>;
  /** D-19: the shipment quote captured with the crawl (optional). */
  getShipment?(): Promise<ShipmentRecord | null>;
  putItem(item: ComparisonItem): Promise<void>;
  loadSettings(): Promise<Settings>;
}

interface PageState {
  lang: Lang;
  settings: Settings;
  items: ComparisonItem[];
  snapshots: Snapshot[];
  shipment: ShipmentRecord | null;
}

export function createReportPage(deps: ReportPageDeps) {
  const state: PageState = {
    lang: 'fa',
    settings: DEFAULT_SETTINGS,
    items: [],
    snapshots: [],
    shipment: null,
  };
  let resolveTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleResolve(): void {
    clearTimeout(resolveTimer);
    resolveTimer = setTimeout(() => {
      void renderAll();
    }, RESOLVE_DEBOUNCE_MS);
  }

  /** Candidate vendors for a product, from its captured snapshots. */
  function candidateVendors(productId: string): VendorRef[] {
    const seen = new Map<string, VendorRef>();
    for (const snap of snapshotsForProduct(state.snapshots, productId)) {
      for (const offer of snap.offers) {
        if (!seen.has(offer.vendor.id)) {
          seen.set(offer.vendor.id, {
            id: offer.vendor.id,
            name: offer.vendor.name,
          });
        }
      }
    }
    return [...seen.values()];
  }

  function findItem(itemKey: string): ComparisonItem | undefined {
    return state.items.find((i) => itemKeyOf(i.itemId.productId, i.itemId.variantId) === itemKey);
  }

  /** Persist a mutation to the comparison list, then re-solve. */
  async function mutateItem(
    itemKey: string,
    mutate: (item: ComparisonItem) => void,
  ): Promise<void> {
    const item = findItem(itemKey);
    if (!item) return;
    mutate(item);
    await deps.putItem(item);
    // Re-read so what renders is the persisted state.
    state.items = await deps.getItems();
    scheduleResolve();
  }

  function onQtyCommit(itemKey: string, quantity: number): void {
    void mutateItem(itemKey, (item) => {
      item.quantity = quantity;
    });
  }

  function onLockCommit(itemKey: string, lock: Lock): void {
    void mutateItem(itemKey, (item) => {
      item.lock = lock;
    });
  }

  function rowControls(): RowControls {
    return {
      lockFor: (itemKey: string): HTMLElement => {
        const item = findItem(itemKey);
        if (!item) return el('span', 'lock-control');
        const vendors = candidateVendors(item.itemId.productId);
        return renderLockControl(state.lang, item, vendors, (lock) => onLockCommit(itemKey, lock));
      },
      qtyFor: (line: PlanLine) =>
        renderQtyInput(state.lang, line, (qty) => onQtyCommit(line.itemKey, qty)),
    };
  }

  async function renderAll(): Promise<void> {
    const input = buildSolverInput(state.items, state.snapshots, state.settings, state.shipment);
    const { plan } = solve(input);
    // itemKey -> product picture (display-only passthrough).
    const pictures = new Map<string, string>(
      input.items
        .filter((it) => it.imageUrl !== undefined)
        .map((it) => [it.itemKey, it.imageUrl as string]),
    );

    const content = $('content');
    content.replaceChildren();
    content.append(renderVerdict(state.lang, plan));

    if (plan.totalIsEstimate) {
      content.append(el('p', 'note warn', t(state.lang, 'estimateCaveat')));
    }
    if (plan.mode === 'approximate') {
      content.append(el('p', 'note warn', t(state.lang, 'approximateNotice')));
    }

    content.append(el('h2', 'card-title', t(state.lang, 'planTitle')));
    content.append(
      renderPlan(state.lang, plan, input.unknownFeeFallback ?? 0, rowControls(), pictures),
    );
    const unsolved = renderUnsolved(state.lang, plan);
    if (unsolved) content.append(unsolved);
  }

  async function run(): Promise<void> {
    const settings = await deps.loadSettings();
    const lang: Lang = settings.uiLanguage ?? 'fa';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    $('h-title').textContent = t(lang, 'resultsTitle');
    state.lang = lang;
    state.settings = settings;

    state.items = await deps.getItems();
    if (state.items.length === 0) {
      renderEmpty(lang);
      return;
    }
    state.snapshots = await deps.getSnapshots();
    // D-19: the shipment quote prices the current
    // arrangement with the real package fees (when
    // the crawl captured one).
    state.shipment = deps.getShipment ? await deps.getShipment() : null;
    await renderAll();
  }

  return { run };
}
