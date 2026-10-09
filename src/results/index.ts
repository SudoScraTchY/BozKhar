/**
 * Results page (T05.1/T05.2) - 09-ui-spec Surface 3.
 *
 * Reads the comparison list and the append-only snapshot
 * store directly (an extension page has both storages),
 * assembles the solver input, solves, and renders the
 * verdict cards and the vendor-grouped plan. Advise-only
 * throughout (D-01): no apply buttons, no urgency.
 *
 * Bilingual fa-primary RTL (NFR-08); numerals via Intl so
 * fa shows Persian digits.
 */
import { t } from '../shared/i18n/messages';
import type { MessageKey } from '../shared/i18n/messages';
import { loadSettings } from '../shared/settings/settings';
import { getAllItems, getAllSnapshots } from '../shared/storage/db';
import { solve } from '../shared/solver';
import type { FeeFlag, Plan, UnsolvedReason } from '../shared/solver';
import type { UiLanguage } from '../shared/types';
import { buildSolverInput } from './assemble';

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

function renderPlan(lang: Lang, plan: Plan, unknownFeeFallback: number): HTMLElement {
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
      row.append(
        nameCell,
        el('td', 'num', fmt(lang, line.unitPrice)),
        el('td', 'num', String(line.quantity)),
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
    feeRow.append(
      el('td', 'num', group.fee === null ? fmt(lang, unknownFeeFallback) : fmt(lang, group.fee)),
    );
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

async function run(): Promise<void> {
  const settings = await loadSettings();
  const lang: Lang = settings.uiLanguage ?? 'fa';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  $('h-title').textContent = t(lang, 'resultsTitle');

  const items = await getAllItems(indexedDB);
  if (items.length === 0) {
    renderEmpty(lang);
    return;
  }
  const snapshots = await getAllSnapshots(indexedDB);

  const input = buildSolverInput(items, snapshots, settings);
  const { plan } = solve(input);

  const content = $('content');
  content.append(renderVerdict(lang, plan));

  if (plan.totalIsEstimate) {
    content.append(el('p', 'note warn', t(lang, 'estimateCaveat')));
  }
  if (plan.mode === 'approximate') {
    content.append(el('p', 'note warn', t(lang, 'approximateNotice')));
  }

  content.append(el('h2', 'card-title', t(lang, 'planTitle')));
  content.append(renderPlan(lang, plan, input.unknownFeeFallback ?? 0));
  const unsolved = renderUnsolved(lang, plan);
  if (unsolved) content.append(unsolved);
}

run().catch((err) => {
  // Never a silent blank page (NFR-05): the error is visible.
  $('content').append(el('p', 'note warn', `Results failed to build: ${String(err)}`));
});
