/**
 * Order Insights page (D-39).
 *
 * Nothing is fetched on open: the page renders the local cache and waits
 * for an explicit "Read order history". Every control re-aggregates the
 * in-memory snapshot; only the two explicit actions (history sync and
 * deep details) touch the network.
 *
 * The persona and the share card are built from the same aggregate the
 * summary shows, so the card can never disagree with the page.
 */
import { t, formatMessage } from '../shared/i18n/messages';
import type { MessageKey } from '../shared/i18n/messages';
import { rialToToman } from '../capture/normalize';
import type { Settings, UiLanguage } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { formatMoney, formatNumber, formatPercent, relativeTime } from '../results/format';
import { aggregate, type Aggregate, type StatusFilter } from './aggregate';
import { ttlFor } from './cache';
import { barChartSvg, lineChartSvg, type ChartPoint } from './charts';
import { createInsightsClient, type InsightsClient, type SendMessage } from './client';
import {
  addDays,
  dayIndexToJalali,
  formatJalali,
  JALALI_MONTH_NAMES,
  parseJalaliDate,
  tehranToday,
  tehranTodayDayIndex,
} from './jalali';
import { pickPersona, type PersonaId } from './persona';
import {
  canvasToBlob,
  copyImage,
  downloadBlob,
  openXIntent,
  renderShareCard,
  SHARE_SIZES,
  SHARE_STYLES,
  SHARE_THEMES,
  themeForPersona,
  type ShareCardModel,
  type ShareSize,
  type ShareStyle,
  type ShareTheme,
} from './share';
import { deepAnalyze, syncOrders, type SyncCacheWriter, type SyncError } from './sync';
import { emptySnapshot } from './types';
import type { InsightOrder, InsightSnapshot, InsightTabs, OrderStatus } from './types';

type Lang = UiLanguage;
type RangePreset = 'all' | '30' | '90' | '180' | '365' | 'custom';
type Busy = 'idle' | 'reading' | 'deep';
type ErrorKind = 'auth' | 'no-tab' | 'network' | 'structure' | 'other';

export interface InsightsPageDeps {
  getSnapshot(): Promise<InsightSnapshot>;
  cache: SyncCacheWriter;
  clearCache(): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  send: SendMessage;
  /** Opens Digikala - only from an explicit click, never automatically (D-30). */
  openDigikala(): void;
  now?: () => number;
  /** Tests inject a client; production creates one over `send`. */
  client?: InsightsClient;
}

interface PageState {
  lang: Lang;
  settings: Settings;
  snapshot: InsightSnapshot;
  busy: Busy;
  error?: { kind: ErrorKind; message: string };
  partial: boolean;
  aborted: boolean;
  range: {
    preset: RangePreset;
    startDay: number | null;
    endDay: number | null;
  };
  custom: { start: string; end: string; error: boolean };
  statusFilter: StatusFilter;
  includeInProgress: boolean;
  deep: { fetched: number; failed: number; aborted: boolean; total: number };
  deepError?: string;
  share: {
    theme: ShareTheme;
    themeTouched: boolean;
    style: ShareStyle;
    size: ShareSize;
    showVendors: boolean;
    built: boolean;
  };
}

const PERSONA_KEY: Record<PersonaId, MessageKey> = {
  newcomer: 'personaNewcomer',
  replenisher: 'personaReplenisher',
  loyalist: 'personaLoyalist',
  devotee: 'personaDevotee',
  bargain: 'personaBargain',
  bulk: 'personaBulk',
  weekend: 'personaWeekend',
  regular: 'personaRegular',
};

const STATUS_KEY: Record<OrderStatus, MessageKey> = {
  in_progress: 'insightsStatusInProgress',
  sent: 'insightsStatusSent',
  cancelled: 'insightsStatusCancelled',
  returned: 'insightsStatusReturned',
};

/** Status bars carry their own colour; labels remain the primary signal. */
const STATUS_COLORS: Record<OrderStatus, string> = {
  sent: '#067a6b',
  returned: '#b26a00',
  in_progress: '#1e6fae',
  cancelled: '#b42318',
};

const BUCKET_KEYS: MessageKey[] = [
  'insightsBucketUnder500',
  'insightsBucket500to1m',
  'insightsBucket1to2m',
  'insightsBucket2to5m',
  'insightsBucket5to10m',
  'insightsBucketOver10m',
];

const WEEKDAY_KEYS: Record<number, MessageKey> = {
  0: 'insightsDaySun',
  1: 'insightsDayMon',
  2: 'insightsDayTue',
  3: 'insightsDayWed',
  4: 'insightsDayThu',
  5: 'insightsDayFri',
  6: 'insightsDaySat',
};

const EN_MONTHS = [
  'Farvardin',
  'Ordibehesht',
  'Khordad',
  'Tir',
  'Mordad',
  'Shahrivar',
  'Mehr',
  'Aban',
  'Azar',
  'Dey',
  'Bahman',
  'Esfand',
];

const PRESETS: Array<{ preset: RangePreset; key: MessageKey; days?: number }> = [
  { preset: 'all', key: 'insightsRangeAll' },
  { preset: '30', key: 'insightsRange30', days: 30 },
  { preset: '90', key: 'insightsRange90', days: 90 },
  { preset: '180', key: 'insightsRange180', days: 180 },
  { preset: '365', key: 'insightsRange365', days: 365 },
  { preset: 'custom', key: 'insightsRangeCustom' },
];

const ERROR_KEY: Record<ErrorKind, MessageKey> = {
  auth: 'insightsAuthError',
  'no-tab': 'insightsNoTab',
  network: 'insightsNetworkError',
  structure: 'insightsNetworkError',
  other: 'insightsNetworkError',
};

const MAX_DEEP = 300;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function createInsightsPage(deps: InsightsPageDeps): { run(): Promise<void> } {
  const now = deps.now ?? Date.now;
  const state: PageState = {
    lang: 'fa',
    settings: { ...DEFAULT_SETTINGS },
    snapshot: emptySnapshot(),
    busy: 'idle',
    partial: false,
    aborted: false,
    range: { preset: 'all', startDay: null, endDay: null },
    custom: { start: '', end: '', error: false },
    statusFilter: 'all',
    includeInProgress: true,
    deep: { fetched: 0, failed: 0, aborted: false, total: 0 },
    share: {
      theme: 'ledger',
      themeTouched: false,
      style: 'cards',
      size: 'portrait',
      showVendors: false,
      built: false,
    },
  };

  let abortFlag = false;
  let toastTimer: number | undefined;
  let client: InsightsClient | undefined = deps.client;

  const root = el('div', 'bk-page');
  const content = el('div', 'bk-content');
  content.id = 'content';
  const live = el('p', 'bk-toast');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.hidden = true;
  root.append(content, live);

  const lang = (): Lang => state.lang;
  const money = (value: number): string => formatMoney(value, lang(), 'toman');
  const count = (value: number): string => formatNumber(value, lang());
  const pct = (rate: number): string => formatPercent(rate * 100, lang());

  function jalaliText(day: number): string {
    return formatJalali(dayIndexToJalali(day), {
      digits: lang() === 'fa' ? 'fa' : 'latin',
    });
  }

  function toast(text: string): void {
    live.textContent = text;
    live.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      live.hidden = true;
    }, 2500);
  }

  function getClient(): InsightsClient {
    client ??= createInsightsClient(deps.send);
    return client;
  }

  // ------------------------------------------------------------------
  // Aggregate inputs
  // ------------------------------------------------------------------

  function aggregateNow(): Aggregate {
    return aggregate(state.snapshot, {
      startDay: state.range.startDay,
      endDay: state.range.endDay,
      statusFilter: state.statusFilter,
      includeInProgress: state.includeInProgress,
    });
  }

  function tabCounts(): InsightTabs {
    const fromMeta = state.snapshot.tabs;
    const sum = fromMeta.in_progress + fromMeta.sent + fromMeta.cancelled + fromMeta.returned;
    if (sum > 0) return fromMeta;
    const computed: InsightTabs = { in_progress: 0, sent: 0, cancelled: 0, returned: 0 };
    for (const order of state.snapshot.orders) computed[order.status] += 1;
    return computed;
  }

  function detailTargets(): InsightOrder[] {
    const nowMs = now();
    // Every status is eligible: in-progress rows are today's deliveries,
    // and cancelled rows are what the cancel-rate metric is made of.
    // Current deliveries go first so the 300-order cap can never starve
    // the orders the user is waiting on; the rest are newest first.
    const stale = state.snapshot.orders.filter(
      (order) =>
        order.detailFetchedAt === null || nowMs - order.detailFetchedAt >= ttlFor(order.status),
    );
    const byNewest = (a: InsightOrder, b: InsightOrder): number =>
      (b.createdDay ?? 0) - (a.createdDay ?? 0) || b.orderId - a.orderId;
    const running = stale.filter((order) => order.status === 'in_progress').sort(byNewest);
    const rest = stale.filter((order) => order.status !== 'in_progress').sort(byNewest);
    return [...running, ...rest].slice(0, MAX_DEEP);
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  async function runSync(): Promise<void> {
    if (state.busy !== 'idle') return;
    abortFlag = false;
    state.busy = 'reading';
    state.error = undefined;
    state.partial = false;
    state.aborted = false;
    render();

    const result = await syncOrders(getClient(), deps.cache, {
      isAborted: () => abortFlag,
      now,
      onProgress: (progress) => {
        const line = document.getElementById('insights-sync-progress');
        if (!line) return;
        if (progress.phase === 'tabs') {
          line.textContent = t(lang(), 'insightsLoading');
        } else {
          line.textContent = formatMessage(lang(), 'insightsDeepProgress', {
            done: progress.done,
            total: progress.total,
          });
        }
      },
    });

    state.snapshot = await deps.getSnapshot();
    state.busy = 'idle';
    state.aborted = result.aborted;
    state.partial = (result.fetched > 0 && !result.ok) || result.truncated;

    if (!result.ok && !result.aborted) {
      state.error = {
        kind: errorKindOf(result.error),
        message: result.error?.message ?? '',
      };
    }
    render();
    if (result.aborted) toast(t(lang(), 'insightsAborted'));
  }

  function errorKindOf(error: SyncError | undefined): ErrorKind {
    switch (error?.errorCode) {
      case 'AUTH':
        return 'auth';
      case 'NO_TAB':
        return 'no-tab';
      case 'NETWORK':
        return 'network';
      case 'STRUCTURE_UNRECOGNIZED':
        return 'structure';
      default:
        return 'other';
    }
  }

  async function runDeep(): Promise<void> {
    if (state.busy !== 'idle') return;
    const targets = detailTargets();
    if (targets.length === 0) return;
    abortFlag = false;
    state.busy = 'deep';
    state.deep = { fetched: 0, failed: 0, aborted: false, total: targets.length };
    state.deepError = undefined;
    render();

    const result = await deepAnalyze(getClient(), deps.cache, targets, {
      isAborted: () => abortFlag,
      now,
      onProgress: (progress) => {
        state.deep.total = progress.total;
        const line = document.getElementById('insights-deep-progress');
        if (line) {
          line.textContent = formatMessage(lang(), 'insightsDeepProgress', {
            done: progress.done,
            total: progress.total,
          });
        }
      },
    });

    state.snapshot = await deps.getSnapshot();
    state.busy = 'idle';
    state.deep = {
      fetched: result.fetched,
      failed: result.failed,
      aborted: result.aborted,
      total: targets.length,
    };
    state.deepError = result.error?.message;
    render();
  }

  function stop(): void {
    abortFlag = true;
  }

  function selectPreset(preset: RangePreset): void {
    state.range.preset = preset;
    state.custom.error = false;
    if (preset === 'all') {
      state.range.startDay = null;
      state.range.endDay = null;
    } else if (preset === 'custom') {
      if (state.custom.start === '' && state.custom.end === '') {
        const today = tehranToday(new Date(now()));
        state.custom.end = formatJalali(today);
        state.custom.start = formatJalali(addDays(today, -365));
      }
    } else {
      const days = PRESETS.find((p) => p.preset === preset)?.days ?? 30;
      const today = tehranTodayDayIndex(new Date(now()));
      state.range.endDay = today;
      state.range.startDay = today - (days - 1);
    }
    render();
  }

  function applyCustomRange(): void {
    const start = parseJalaliDate(state.custom.start);
    const end = parseJalaliDate(state.custom.end);
    if (!start || !end || start.dayIndex > end.dayIndex) {
      state.custom.error = true;
      render();
      return;
    }
    state.custom.error = false;
    state.range.preset = 'custom';
    state.range.startDay = start.dayIndex;
    state.range.endDay = end.dayIndex;
    render();
  }

  function setLang(next: Lang): void {
    if (state.lang === next) return;
    state.lang = next;
    state.settings = { ...state.settings, uiLanguage: next };
    void deps.saveSettings(state.settings).catch(() => undefined);
    render();
  }

  async function clearCachedOrders(): Promise<void> {
    if (!window.confirm(t(lang(), 'insightsClearCacheConfirm'))) return;
    await deps.clearCache();
    state.snapshot = emptySnapshot();
    state.error = undefined;
    state.partial = false;
    state.aborted = false;
    state.deep = { fetched: 0, failed: 0, aborted: false, total: 0 };
    state.share.built = false;
    render();
    toast(t(lang(), 'insightsClearCacheDone'));
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  function statCard(label: string, value: string): HTMLElement {
    const card = el('div', 'bk-stat');
    card.append(el('span', 'bk-stat-label', label), el('span', 'bk-stat-value', value));
    return card;
  }

  function note(text: string): HTMLElement {
    return el('p', 'bk-note', text);
  }

  function notice(key: MessageKey, className = 'bk-notice'): HTMLElement {
    return el('p', className, t(lang(), key));
  }

  function renderHeader(): HTMLElement {
    const header = el('header', 'bk-header');
    const mark = el('img', 'bk-brand-icon');
    mark.src = '/icons/logo-256.png';
    mark.alt = '';
    mark.width = 72;
    mark.height = 72;

    const text = el('div', 'bk-header-text');
    text.append(
      el('h1', 'bk-title', t(lang(), 'insightsTitle')),
      el('p', 'bk-muted', t(lang(), 'insightsPrivacy')),
    );

    const controls = el('div', 'bk-header-controls');
    const fa = button('فارسی', 'bk-chip', () => setLang('fa'));
    const en = button('English', 'bk-chip', () => setLang('en'));
    fa.setAttribute('aria-pressed', String(lang() === 'fa'));
    en.setAttribute('aria-pressed', String(lang() === 'en'));
    fa.classList.toggle('is-active', lang() === 'fa');
    en.classList.toggle('is-active', lang() === 'en');
    controls.append(fa, en);
    header.append(mark, text, controls);
    return header;
  }

  function renderToolbar(): HTMLElement {
    const section = el('section', 'bk-section bk-toolbar');
    const top = el('div', 'bk-toolbar-top');

    const status = el('div', 'bk-sync-status');
    status.append(
      el(
        'span',
        'bk-muted',
        state.snapshot.syncedAt > 0
          ? formatMessage(lang(), 'insightsLastSynced', {
              time: relativeTime(new Date(state.snapshot.syncedAt).toISOString(), lang()),
            })
          : t(lang(), 'insightsNeverSynced'),
      ),
    );

    const actions = el('div', 'bk-toolbar-actions');
    const cta = button(
      t(lang(), state.snapshot.orders.length > 0 ? 'insightsRefreshCta' : 'insightsReadCta'),
      'bk-btn bk-btn-primary',
      () => void runSync(),
    );
    cta.disabled = state.busy !== 'idle';
    actions.append(cta);
    if (state.busy === 'reading') {
      actions.append(button(t(lang(), 'abortCrawl'), 'bk-btn bk-btn-quiet', stop));
    }
    top.append(status, actions);
    section.append(top);

    if (state.busy === 'reading') {
      const progress = el('p', 'bk-progress');
      progress.id = 'insights-sync-progress';
      progress.setAttribute('role', 'status');
      progress.textContent = t(lang(), 'insightsLoading');
      section.append(progress);
    }

    const rangeRow = el('div', 'bk-chip-row');
    rangeRow.setAttribute('role', 'group');
    rangeRow.setAttribute('aria-label', t(lang(), 'insightsRange'));
    for (const preset of PRESETS) {
      const chip = button(t(lang(), preset.key), 'bk-chip', () => selectPreset(preset.preset));
      chip.classList.toggle('is-active', state.range.preset === preset.preset);
      rangeRow.append(chip);
    }
    section.append(rangeRow);

    if (state.range.preset === 'custom') {
      const dates = el('div', 'bk-date-row');
      const fromLabel = el('label', 'bk-date-label', t(lang(), 'insightsFrom'));
      const from = el('input', 'bk-date-input');
      from.type = 'text';
      from.inputMode = 'numeric';
      from.dir = 'ltr';
      from.placeholder = '1404/08/13';
      from.value = state.custom.start;
      from.setAttribute('aria-label', t(lang(), 'insightsFrom'));
      from.addEventListener('input', () => {
        state.custom.start = from.value;
      });

      const toLabel = el('label', 'bk-date-label', t(lang(), 'insightsTo'));
      const to = el('input', 'bk-date-input');
      to.type = 'text';
      to.inputMode = 'numeric';
      to.dir = 'ltr';
      to.placeholder = '1404/08/13';
      to.value = state.custom.end;
      to.setAttribute('aria-label', t(lang(), 'insightsTo'));
      to.addEventListener('input', () => {
        state.custom.end = to.value;
      });

      fromLabel.append(from);
      toLabel.append(to);
      dates.append(
        fromLabel,
        toLabel,
        button(t(lang(), 'insightsApplyRange'), 'bk-btn bk-btn-small', applyCustomRange),
      );
      section.append(dates);
      if (state.custom.error) {
        section.append(el('p', 'bk-error-text', t(lang(), 'insightsInvalidDate')));
      }
    }

    const progressRow = el('label', 'bk-check');
    const include = el('input');
    include.type = 'checkbox';
    include.checked = state.includeInProgress;
    include.addEventListener('change', () => {
      state.includeInProgress = include.checked;
      render();
    });
    progressRow.append(include, el('span', '', t(lang(), 'insightsIncludeInProgress')));
    section.append(progressRow);

    const counts = tabCounts();
    const chips = el('div', 'bk-chip-row');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', t(lang(), 'insightsStatusAll'));
    const filters: Array<{ value: StatusFilter; key: MessageKey; valueCount: number }> = [
      {
        value: 'all',
        key: 'insightsStatusAll',
        valueCount: counts.in_progress + counts.sent + counts.cancelled + counts.returned,
      },
      { value: 'sent', key: STATUS_KEY.sent, valueCount: counts.sent },
      { value: 'returned', key: STATUS_KEY.returned, valueCount: counts.returned },
      { value: 'in_progress', key: STATUS_KEY.in_progress, valueCount: counts.in_progress },
      { value: 'cancelled', key: STATUS_KEY.cancelled, valueCount: counts.cancelled },
    ];
    for (const filter of filters) {
      const chip = button(
        `${t(lang(), filter.key)} · ${count(filter.valueCount)}`,
        'bk-chip',
        () => {
          state.statusFilter = filter.value;
          render();
        },
      );
      chip.classList.toggle('is-active', state.statusFilter === filter.value);
      chip.setAttribute('aria-pressed', String(state.statusFilter === filter.value));
      chips.append(chip);
    }
    section.append(chips);
    return section;
  }

  function renderError(): HTMLElement {
    if (!state.error) return el('div');
    const box = el('div', 'bk-error');
    box.setAttribute('role', 'alert');
    box.append(el('p', '', t(lang(), ERROR_KEY[state.error.kind])));
    const actions = el('div', 'bk-error-actions');
    if (state.error.kind === 'auth' || state.error.kind === 'no-tab') {
      actions.append(
        button(t(lang(), 'insightsOpenDigikala'), 'bk-btn bk-btn-small', deps.openDigikala),
      );
    }
    actions.append(button(t(lang(), 'tryAgain'), 'bk-btn bk-btn-small', () => void runSync()));
    box.append(actions);
    return box;
  }

  function renderEmpty(): HTMLElement {
    const box = el('section', 'bk-section bk-empty');
    box.append(
      el('h2', 'bk-section-title', t(lang(), 'insightsEmptyTitle')),
      el('p', 'bk-muted', t(lang(), 'insightsEmptyBody')),
    );
    return box;
  }

  function renderSummary(agg: Aggregate): HTMLElement {
    const section = el('section', 'bk-section');
    section.append(el('h2', 'bk-section-title', t(lang(), 'insightsSummary')));
    const grid = el('div', 'bk-stats');
    grid.append(
      statCard(t(lang(), 'insightsNetPaid'), money(agg.netPaidToman)),
      statCard(t(lang(), 'insightsOrders'), count(agg.paidOrders)),
      statCard(t(lang(), 'insightsAverageOrder'), money(agg.averageOrderToman)),
      statCard(t(lang(), 'insightsLargestOrder'), money(agg.largestOrderToman)),
    );
    if (agg.refundsToman > 0) {
      grid.append(statCard(t(lang(), 'insightsRefunds'), money(agg.refundsToman)));
    }
    if (agg.shippingToman > 0) {
      grid.append(statCard(t(lang(), 'insightsShipping'), money(agg.shippingToman)));
    }
    grid.append(statCard(t(lang(), 'insightsDiscountRate'), pct(agg.discountRate)));
    if (agg.inProgressOrders > 0) {
      grid.append(statCard(t(lang(), 'insightsInProgressAmount'), money(agg.inProgressToman)));
    }
    if (agg.cancelledOrders > 0) {
      grid.append(statCard(t(lang(), 'insightsCancelledAmount'), money(agg.cancelledToman)));
    }
    if (agg.hasDeep) {
      grid.append(statCard(t(lang(), 'insightsItems'), count(agg.itemCount)));
      grid.append(statCard(t(lang(), 'insightsVendors'), count(agg.distinctVendors)));
    }
    section.append(grid);

    if (agg.cancelledOrders > 0) section.append(note(t(lang(), 'insightsCancelledExcluded')));
    if (agg.inProgressOrders > 0) section.append(note(t(lang(), 'insightsInProgressNote')));
    if (agg.unknownRefundOrders > 0) {
      section.append(
        note(
          formatMessage(lang(), 'insightsUnknownRefunds', {
            n: count(agg.unknownRefundOrders),
          }),
        ),
      );
    }
    return section;
  }

  /**
   * Current deliveries are their own section: the user asked to see what
   * is still on the way, independent of the selected status filter.
   */
  function renderCurrentDeliveries(): HTMLElement | null {
    const current = aggregate(state.snapshot, {
      startDay: state.range.startDay,
      endDay: state.range.endDay,
      statusFilter: 'in_progress',
      includeInProgress: true,
    });
    if (current.orders.length === 0) return null;

    const section = el('section', 'bk-section');
    section.append(
      el('h2', 'bk-section-title', t(lang(), 'insightsCurrentDeliveries')),
      el('p', 'bk-muted', t(lang(), 'insightsCurrentDeliveriesBody')),
    );

    const list = el('ul', 'bk-order-list');
    for (const order of current.orders) {
      const row = el('li', 'bk-order-row');
      const when = el('div', 'bk-order-when');
      when.append(
        el('strong', '', order.createdDay === null ? '—' : jalaliText(order.createdDay)),
        el('span', 'bk-muted', order.statusFa || t(lang(), STATUS_KEY[order.status])),
      );
      const amount = el('div', 'bk-order-amount');
      amount.append(
        el('strong', '', money(rialToToman(order.paidRial ?? order.payableRial))),
        el(
          'span',
          'bk-muted',
          formatMessage(lang(), 'insightsOrderRef', { id: count(order.orderId) }),
        ),
      );
      row.append(when, amount);
      list.append(row);
    }
    section.append(list);
    return section;
  }

  /**
   * Cancelled orders have their own table and stay out of every spend/item
   * total. Item counts are shown only when the order's detail was read; the
   * hint says so instead of implying zero.
   */
  function renderCancelledOrders(): HTMLElement | null {
    const cancelled = aggregate(state.snapshot, {
      startDay: state.range.startDay,
      endDay: state.range.endDay,
      statusFilter: 'cancelled',
    });
    if (cancelled.orders.length === 0) return null;

    const rows = cancelled.orders.map((order) => {
      const items = state.snapshot.itemsByOrder[order.orderId] ?? [];
      const itemCount =
        items.length === 0
          ? null
          : items.reduce(
              (sum, item) =>
                sum +
                Math.max(0, item.cancelledQuantity > 0 ? item.cancelledQuantity : item.quantity),
              0,
            );
      return { order, itemCount };
    });
    const detailedOrders = rows.filter((row) => row.itemCount !== null).length;
    const knownItems = rows.reduce((sum, row) => sum + (row.itemCount ?? 0), 0);

    const section = el('section', 'bk-section bk-cancelled');
    section.append(
      el('h2', 'bk-section-title', t(lang(), 'insightsCancelledTitle')),
      el('p', 'bk-muted', t(lang(), 'insightsCancelledBody')),
    );

    const summary = [formatMessage(lang(), 'insightsCancelledCount', { n: count(rows.length) })];
    if (detailedOrders > 0) {
      summary.push(formatMessage(lang(), 'insightsCancelledItems', { n: count(knownItems) }));
    }
    section.append(el('p', 'bk-cancelled-summary', summary.join(' · ')));

    const list = el('ul', 'bk-order-list');
    for (const { order, itemCount } of rows) {
      const row = el('li', 'bk-order-row is-cancelled');
      const when = el('div', 'bk-order-when');
      when.append(
        el('strong', '', order.createdDay === null ? '—' : jalaliText(order.createdDay)),
        el('span', 'bk-cancel-tag', order.statusFa || t(lang(), 'insightsStatusCancelled')),
      );

      const items = el('div', 'bk-order-items');
      items.append(
        itemCount === null
          ? el('span', 'bk-muted', t(lang(), 'insightsCancelledNoItems'))
          : el(
              'strong',
              '',
              formatMessage(lang(), 'insightsCancelledItems', { n: count(itemCount) }),
            ),
      );

      const amount = el('div', 'bk-order-amount');
      amount.append(
        el('strong', '', money(rialToToman(order.paidRial ?? order.payableRial))),
        el(
          'span',
          'bk-muted',
          formatMessage(lang(), 'insightsOrderRef', { id: count(order.orderId) }),
        ),
      );

      row.append(when, items, amount);
      list.append(row);
    }
    section.append(list);

    if (detailedOrders < rows.length) {
      section.append(note(t(lang(), 'insightsCancelledDeepHint')));
    }
    return section;
  }

  function chartBlock(
    titleKey: MessageKey,
    points: ChartPoint[],
    formatValue?: (v: number) => string,
  ): HTMLElement {
    const block = el('div', 'bk-chart-block');
    block.append(el('h3', 'bk-chart-title', t(lang(), titleKey)));
    block.insertAdjacentHTML(
      'beforeend',
      barChartSvg({
        title: t(lang(), titleKey),
        desc: t(lang(), titleKey),
        points,
        width: 960,
        height: 380,
        formatValue,
        emptyLabel: t(lang(), 'insightsChartEmpty'),
      }),
    );
    return block;
  }

  function lineChartBlock(
    titleKey: MessageKey,
    points: ChartPoint[],
    formatValue: (v: number) => string,
    area = true,
  ): HTMLElement {
    const block = el('div', 'bk-chart-block');
    block.append(el('h3', 'bk-chart-title', t(lang(), titleKey)));
    block.insertAdjacentHTML(
      'beforeend',
      lineChartSvg({
        title: t(lang(), titleKey),
        desc: t(lang(), titleKey),
        points,
        width: 960,
        height: 380,
        formatValue,
        area,
        emptyLabel: t(lang(), 'insightsChartEmpty'),
      }),
    );
    return block;
  }

  function monthLabel(year: number, month: number): string {
    const name =
      lang() === 'fa' ? (JALALI_MONTH_NAMES[month - 1] ?? '') : (EN_MONTHS[month - 1] ?? '');
    return `${name} ${count(year)}`;
  }

  function renderInsights(agg: Aggregate): HTMLElement {
    const section = el('section', 'bk-section');
    section.append(
      el('h2', 'bk-section-title', t(lang(), 'insightsInsights')),
      el('p', 'bk-muted', t(lang(), 'insightsInsightsBody')),
    );

    const grid = el('div', 'bk-stats');
    grid.append(
      statCard(t(lang(), 'insightsMedianOrder'), money(agg.medianOrderToman)),
      statCard(t(lang(), 'insightsP90Order'), money(agg.p90OrderToman)),
      statCard(
        t(lang(), 'insightsAverageOrdersPerMonth'),
        formatNumber(Math.round(agg.averageOrdersPerMonth * 10) / 10, lang()),
      ),
      statCard(t(lang(), 'insightsRefundRate'), pct(agg.refundRate)),
      statCard(t(lang(), 'insightsShippingShare'), pct(agg.shippingShare)),
    );
    if (agg.hasDeep) {
      grid.append(statCard(t(lang(), 'insightsTopThreeVendors'), pct(agg.topThreeVendorShare)));
    }
    section.append(grid);

    const bestMonth =
      agg.monthly.length > 0
        ? agg.monthly.reduce((best, bucket) =>
            bucket.valueToman > best.valueToman ? bucket : best,
          )
        : null;
    if (bestMonth && bestMonth.valueToman > 0) {
      section.append(
        note(
          formatMessage(lang(), 'insightsBusiestMonth', {
            month: monthLabel(bestMonth.year, bestMonth.month),
            amount: money(bestMonth.valueToman),
          }),
        ),
      );
    }

    const busiestDay =
      agg.weekdays.length > 0
        ? agg.weekdays.reduce((best, bucket) => (bucket.orders > best.orders ? bucket : best))
        : null;
    if (busiestDay && busiestDay.orders > 0) {
      section.append(
        note(
          formatMessage(lang(), 'insightsBusiestWeekday', {
            day: t(lang(), WEEKDAY_KEYS[busiestDay.weekday] as MessageKey),
            n: count(busiestDay.orders),
          }),
        ),
      );
    }
    return section;
  }

  function renderCharts(agg: Aggregate): HTMLElement {
    const section = el('section', 'bk-section');
    section.append(
      el('h2', 'bk-section-title', t(lang(), 'insightsCharts')),
      el('p', 'bk-muted', t(lang(), 'insightsChartHint')),
    );
    const grid = el('div', 'bk-chart-grid');

    let running = 0;
    const cumulative = agg.monthly.map((bucket) => {
      running += bucket.valueToman;
      return {
        label: monthLabel(bucket.year, bucket.month),
        value: running,
      };
    });
    const monthlyAverage = agg.monthly.map((bucket) => ({
      label: monthLabel(bucket.year, bucket.month),
      value: bucket.orders > 0 ? Math.round(bucket.valueToman / bucket.orders) : 0,
    }));

    grid.append(
      chartBlock(
        'insightsMonthly',
        agg.monthly.map((bucket) => ({
          label: monthLabel(bucket.year, bucket.month),
          value: bucket.valueToman,
        })),
        (v) => money(v),
      ),
      chartBlock(
        'insightsMonthlyOrders',
        agg.monthly.map((bucket) => ({
          label: monthLabel(bucket.year, bucket.month),
          value: bucket.orders,
        })),
        (v) => count(v),
      ),
      lineChartBlock('insightsCumulative', cumulative, (v) => money(v)),
      lineChartBlock('insightsAverageOrderMonthly', monthlyAverage, (v) => money(v), false),
      chartBlock(
        'insightsOrderValues',
        agg.valueBuckets.map((bucket, index) => ({
          label: t(lang(), BUCKET_KEYS[index] as MessageKey),
          value: bucket.orders,
        })),
        (v) => count(v),
      ),
      chartBlock(
        'insightsWeekdays',
        agg.weekdays.map((bucket) => ({
          label: t(lang(), WEEKDAY_KEYS[bucket.weekday] as MessageKey),
          value: bucket.orders,
        })),
        (v) => count(v),
      ),
      chartBlock(
        'insightsStatusBreakdown',
        [
          {
            label: t(lang(), STATUS_KEY.sent),
            value: agg.sentOrders,
            color: STATUS_COLORS.sent,
          },
          {
            label: t(lang(), STATUS_KEY.returned),
            value: agg.returnedOrders,
            color: STATUS_COLORS.returned,
          },
          {
            label: t(lang(), STATUS_KEY.in_progress),
            value: agg.inProgressOrders,
            color: STATUS_COLORS.in_progress,
          },
          {
            label: t(lang(), STATUS_KEY.cancelled),
            value: agg.cancelledOrders,
            color: STATUS_COLORS.cancelled,
          },
        ],
        (v) => count(v),
      ),
    );
    section.append(grid);
    return section;
  }

  function renderPersona(persona: PersonaId): HTMLElement {
    const section = el('section', 'bk-section bk-persona');
    section.append(el('h2', 'bk-section-title', t(lang(), 'insightsPersonaTitle')));
    const card = el('div', 'bk-persona-card');
    card.append(
      el('strong', 'bk-persona-name', t(lang(), PERSONA_KEY[persona])),
      el('p', 'bk-muted', t(lang(), 'insightsPersonaHint')),
    );
    section.append(card);
    return section;
  }

  function renderDeep(agg: Aggregate): HTMLElement {
    const section = el('section', 'bk-section');
    section.append(el('h2', 'bk-section-title', t(lang(), 'insightsDeepTitle')));
    section.append(el('p', 'bk-muted', t(lang(), 'insightsDeepBody')));

    if (agg.hasDeep) {
      section.append(
        el(
          'p',
          'bk-muted',
          formatMessage(lang(), 'insightsDeepBased', {
            orders: count(agg.orders.length),
            details: count(agg.deepOrders),
          }),
        ),
      );

      const grid = el('div', 'bk-stats');
      grid.append(
        statCard(t(lang(), 'insightsRepeatProducts'), count(agg.repeatProducts)),
        statCard(t(lang(), 'insightsRepeatRate'), pct(agg.repeatRate)),
        statCard(
          t(lang(), 'insightsReorderGap'),
          agg.reorderGapDays === null
            ? '—'
            : formatMessage(lang(), 'insightsDays', { n: count(agg.reorderGapDays) }),
        ),
        statCard(t(lang(), 'insightsReturnRate'), pct(agg.returnRate)),
        statCard(t(lang(), 'insightsItemDiscount'), pct(agg.itemDiscountRate)),
        statCard(t(lang(), 'insightsShipments'), count(agg.shipmentCount)),
        statCard(t(lang(), 'insightsVendors'), count(agg.distinctVendors)),
        statCard(t(lang(), 'insightsItems'), count(agg.itemCount)),
      );
      section.append(grid);

      const charts = el('div', 'bk-chart-grid');
      if (agg.vendors.length > 0) {
        charts.append(
          chartBlock(
            'insightsTopVendors',
            agg.vendors.slice(0, 5).map((vendor) => ({
              label: vendor.name || t(lang(), 'insightsNoName'),
              value: vendor.valueToman,
            })),
            (v) => money(v),
          ),
        );
      }
      if (agg.brands.length > 0) {
        charts.append(
          chartBlock(
            'insightsTopBrands',
            agg.brands.slice(0, 5).map((brand) => ({
              label: brand.name || t(lang(), 'insightsNoName'),
              value: brand.valueToman,
            })),
            (v) => money(v),
          ),
        );
      }
      if (agg.categories.length > 0) {
        charts.append(
          chartBlock(
            'insightsCategorySpend',
            agg.categories.slice(0, 6).map((category) => ({
              label: category.name || t(lang(), 'insightsNoName'),
              value: category.valueToman,
            })),
            (v) => money(v),
          ),
        );
      }
      if (charts.childElementCount > 0) section.append(charts);
    }

    if (state.busy === 'deep') {
      const progress = el('p', 'bk-progress');
      progress.id = 'insights-deep-progress';
      progress.setAttribute('role', 'status');
      progress.textContent = formatMessage(lang(), 'insightsDeepProgress', {
        done: 0,
        total: state.deep.total,
      });
      section.append(
        progress,
        button(t(lang(), 'insightsDeepCancel'), 'bk-btn bk-btn-quiet', stop),
      );
    } else {
      if (state.deep.fetched > 0 || state.deep.failed > 0) {
        const notes: string[] = [];
        if (state.deep.fetched > 0) {
          notes.push(formatMessage(lang(), 'insightsDeepDone', { n: count(state.deep.fetched) }));
        }
        if (state.deep.failed > 0) {
          notes.push(formatMessage(lang(), 'insightsDeepFailed', { n: count(state.deep.failed) }));
        }
        if (state.deep.aborted) notes.push(t(lang(), 'insightsDeepAborted'));
        section.append(note(notes.join(' — ')));
      }
      if (state.deepError) {
        section.append(
          note(
            formatMessage(lang(), 'insightsDeepError', {
              message: state.deepError,
            }),
          ),
        );
      }
      const targets = detailTargets();
      if (targets.length > 0) {
        section.append(
          button(t(lang(), 'insightsDeepCta'), 'bk-btn bk-btn-small', () => void runDeep()),
        );
      }
    }
    return section;
  }

  function cardRange(): string {
    const from = state.range.startDay;
    const to = state.range.endDay;
    if (from !== null && to !== null) {
      return formatMessage(lang(), 'insightsCardRangeFromTo', {
        from: jalaliText(from),
        to: jalaliText(to),
      });
    }
    if (from !== null)
      return formatMessage(lang(), 'insightsCardRangeFrom', { from: jalaliText(from) });
    if (to !== null) return formatMessage(lang(), 'insightsCardRangeTo', { to: jalaliText(to) });
    return t(lang(), 'insightsCardRangeAll');
  }

  function buildShareModel(agg: Aggregate, persona: PersonaId): ShareCardModel {
    const personaLabel = t(lang(), PERSONA_KEY[persona]);
    const size = SHARE_SIZES[state.share.size];
    const stats = [
      { label: t(lang(), 'insightsNetPaid'), value: money(agg.netPaidToman) },
      { label: t(lang(), 'insightsOrders'), value: count(agg.paidOrders) },
      { label: t(lang(), 'insightsAverageOrder'), value: money(agg.averageOrderToman) },
      { label: t(lang(), 'insightsLargestOrder'), value: money(agg.largestOrderToman) },
    ];
    if (agg.refundsToman > 0) {
      stats.push({ label: t(lang(), 'insightsRefunds'), value: money(agg.refundsToman) });
    }
    if (agg.hasDeep) {
      stats.push({ label: t(lang(), 'insightsItems'), value: count(agg.itemCount) });
    }

    const highlights: string[] = [];
    if (agg.hasDeep) {
      highlights.push(
        formatMessage(lang(), 'insightsCardItems', {
          n: count(agg.itemCount),
          m: count(agg.deepOrders),
        }),
      );
      if (agg.repeatProducts > 0) {
        highlights.push(
          formatMessage(lang(), 'insightsCardRepeat', { n: count(agg.repeatProducts) }),
        );
      }
      if (state.share.showVendors && agg.topVendor) {
        highlights.push(
          formatMessage(lang(), 'insightsCardTopVendor', {
            share: count(Math.round(agg.topVendorShare * 100)),
            vendor: agg.topVendor,
          }),
        );
      }
    } else {
      highlights.push(formatMessage(lang(), 'insightsCardOrders', { n: count(agg.paidOrders) }));
    }

    const caption =
      agg.paidOrders > 0
        ? formatMessage(lang(), 'insightsCaption', {
            persona: personaLabel,
            orders: count(agg.paidOrders),
            amount: money(agg.netPaidToman),
          })
        : t(lang(), 'insightsCaptionAll');

    return {
      theme: state.share.theme,
      style: state.share.style,
      width: size.width,
      height: size.height,
      brand: t(lang(), 'wordmark'),
      title: personaLabel,
      subtitle: formatMessage(lang(), 'insightsCardSubtitle', { n: count(agg.paidOrders) }),
      range: cardRange(),
      stats,
      highlights,
      footer: t(lang(), 'insightsCardFooter'),
      caption,
      showVendors: state.share.showVendors,
    };
  }

  function renderShare(agg: Aggregate, persona: PersonaId): HTMLElement {
    const section = el('section', 'bk-section bk-share');
    section.append(
      el('h2', 'bk-section-title', t(lang(), 'insightsShareTitle')),
      el('p', 'bk-muted', t(lang(), 'insightsShareBody')),
    );

    const themeRow = el('div', 'bk-chip-row');
    const themeKeys: Record<ShareTheme, MessageKey> = {
      ledger: 'insightsThemeLedger',
      night: 'insightsThemeNight',
      market: 'insightsThemeMarket',
      mint: 'insightsThemeMint',
      rose: 'insightsThemeRose',
      ocean: 'insightsThemeOcean',
      sunset: 'insightsThemeSunset',
      mono: 'insightsThemeMono',
    };
    for (const theme of SHARE_THEMES) {
      const chip = button(t(lang(), themeKeys[theme]), 'bk-chip', () => {
        state.share.theme = theme;
        state.share.themeTouched = true;
        state.share.built = true;
        render();
      });
      chip.classList.toggle('is-active', state.share.theme === theme);
      themeRow.append(chip);
    }
    section.append(themeRow);

    const styleKeys: Record<ShareStyle, MessageKey> = {
      cards: 'insightsStyleCards',
      strip: 'insightsStyleStrip',
      editorial: 'insightsStyleEditorial',
    };
    const styleRow = el('div', 'bk-chip-row');
    styleRow.setAttribute('role', 'group');
    styleRow.setAttribute('aria-label', t(lang(), 'insightsStyleLabel'));
    styleRow.append(el('span', 'bk-chip-label', t(lang(), 'insightsStyleLabel')));
    for (const style of SHARE_STYLES) {
      const chip = button(t(lang(), styleKeys[style]), 'bk-chip', () => {
        state.share.style = style;
        state.share.built = true;
        render();
      });
      chip.classList.toggle('is-active', state.share.style === style);
      chip.setAttribute('aria-pressed', String(state.share.style === style));
      styleRow.append(chip);
    }
    section.append(styleRow);

    const sizeRow = el('div', 'bk-chip-row');
    const sizes: Array<{ value: ShareSize; key: MessageKey }> = [
      { value: 'portrait', key: 'insightsSizePortrait' },
      { value: 'landscape', key: 'insightsSizeLandscape' },
    ];
    for (const size of sizes) {
      const chip = button(t(lang(), size.key), 'bk-chip', () => {
        state.share.size = size.value;
        state.share.built = true;
        render();
      });
      chip.classList.toggle('is-active', state.share.size === size.value);
      sizeRow.append(chip);
    }
    section.append(sizeRow);

    const vendorsRow = el('label', 'bk-check');
    const vendors = el('input');
    vendors.type = 'checkbox';
    vendors.checked = state.share.showVendors;
    vendors.addEventListener('change', () => {
      state.share.showVendors = vendors.checked;
      state.share.built = true;
      render();
    });
    vendorsRow.append(vendors, el('span', '', t(lang(), 'insightsShowVendors')));
    section.append(vendorsRow);

    section.append(
      button(t(lang(), 'insightsBuildCard'), 'bk-btn bk-btn-primary', () => {
        state.share.built = true;
        render();
      }),
    );

    if (!state.share.built) return section;

    const model = buildShareModel(agg, persona);
    const canvas = el('canvas', 'bk-share-canvas');
    canvas.width = model.width;
    canvas.height = model.height;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${model.title} — ${model.subtitle}`);
    section.append(canvas);

    const draw = (): void => {
      void renderShareCard(canvas, model).catch(() => undefined);
    };
    draw();

    const actions = el('div', 'bk-share-actions');
    actions.append(
      button(t(lang(), 'insightsCopyImage'), 'bk-btn bk-btn-small', () => {
        void (async () => {
          try {
            const blob = await canvasToBlob(canvas);
            if (await copyImage(blob)) {
              toast(t(lang(), 'insightsCopied'));
            } else {
              downloadBlob(blob, 'bozkhar-insights.png');
              toast(t(lang(), 'insightsCopyFailed'));
            }
          } catch {
            toast(t(lang(), 'insightsCopyFailed'));
          }
        })();
      }),
      button(t(lang(), 'insightsDownloadPng'), 'bk-btn bk-btn-small', () => {
        void canvasToBlob(canvas)
          .then((blob) => downloadBlob(blob, 'bozkhar-insights.png'))
          .catch(() => toast(t(lang(), 'insightsCopyFailed')));
      }),
      button(t(lang(), 'insightsCopyCaption'), 'bk-btn bk-btn-small', () => {
        const clipboard = navigator.clipboard;
        if (!clipboard?.writeText) {
          toast(t(lang(), 'insightsCopyFailed'));
          return;
        }
        void clipboard
          .writeText(model.caption)
          .then(() => toast(t(lang(), 'insightsCopied')))
          .catch(() => toast(t(lang(), 'insightsCopyFailed')));
      }),
      button(t(lang(), 'insightsShareX'), 'bk-btn bk-btn-small', () => {
        openXIntent(model.caption);
      }),
    );
    section.append(actions, note(t(lang(), 'insightsShareHint')));
    return section;
  }

  function renderFooter(agg: Aggregate): HTMLElement {
    const footer = el('footer', 'bk-footer');
    footer.append(
      button(
        t(lang(), 'insightsClearCache'),
        'bk-btn bk-btn-quiet',
        () => void clearCachedOrders(),
      ),
    );
    if (agg.orders.length === 0 && state.snapshot.orders.length > 0) {
      footer.append(note(t(lang(), 'insightsNoRangeData')));
    }
    return footer;
  }

  function render(): void {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'fa' ? 'rtl' : 'ltr';
    const agg = aggregateNow();
    const persona = pickPersona(agg);
    if (!state.share.themeTouched) state.share.theme = themeForPersona(persona);

    content.replaceChildren();
    content.append(renderHeader(), renderToolbar());

    if (state.error) content.append(renderError());
    if (state.aborted) content.append(notice('insightsAborted', 'bk-notice'));
    if (state.partial) content.append(notice('insightsPartial', 'bk-notice'));

    if (state.snapshot.orders.length === 0) {
      content.append(renderEmpty());
    } else {
      if (agg.orders.length === 0) {
        content.append(notice('insightsNoRangeData'));
      } else {
        content.append(renderSummary(agg));
        const currentDeliveries = renderCurrentDeliveries();
        if (currentDeliveries) content.append(currentDeliveries);
        const cancelledOrders = renderCancelledOrders();
        if (cancelledOrders) content.append(cancelledOrders);
        content.append(
          renderInsights(agg),
          renderCharts(agg),
          renderPersona(persona),
          renderDeep(agg),
          renderShare(agg, persona),
        );
      }
    }
    content.append(renderFooter(agg));
  }

  async function run(): Promise<void> {
    try {
      state.settings = await deps.loadSettings();
    } catch {
      state.settings = { ...DEFAULT_SETTINGS };
    }
    state.lang = state.settings.uiLanguage;
    try {
      state.snapshot = await deps.getSnapshot();
    } catch {
      state.snapshot = emptySnapshot();
    }
    render();
  }

  const boot = (): void => {
    if (!document.body.contains(root)) {
      (document.getElementById('app') ?? document.body).append(root);
    }
    void run();
  };
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

  return { run };
}
