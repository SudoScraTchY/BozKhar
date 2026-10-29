/**
 * PDP Torob surface (D-42, placement D-47): a trigger under the product
 * title that opens a compact comparison panel with Torob's cheapest sellers.
 *
 * The content script never calls Torob itself: the click sends the public
 * product title to the worker, which owns the host permission and returns
 * normalized seller rows. If the comparison fails, the panel still offers
 * the plain Torob search link, and the trigger itself is a real <a> so
 * modified clicks (Ctrl/Cmd) keep working without JavaScript.
 */
import { findMountPoint, isProductPage, PDP_TITLE_CANDIDATES } from '../dom/selectors';
import { ensureStyles, ensureTitleActions } from './ui';
import {
  torobSearchUrl,
  type TorobCategoryRange,
  type TorobComparison,
  type TorobRangeReport,
  type TorobRangeResponse,
  type TorobResponse,
} from '../../torob/api';

export interface TorobLabels {
  cta: string;
  hint: string;
  loading: string;
  offersTitle: string;
  noMatch: string;
  error: string;
  noOffers: string;
  searchOnTorob: string;
  viewOffer: string;
  close: string;
  cheapest: string;
  shopCount: (count: number) => string;
  note: string;
  rangeCta: string;
  rangeHint: string;
  rangeTitle: string;
  rangeLoading: string;
  rangeInstallment: string;
  rangeInstallmentSub: string;
  rangeAny: string;
  rangeAnySub: string;
  rangeNoListings: string;
  rangeListingCount: (count: number) => string;
  rangeMethod: string;
  rangeDeliveryNote: string;
}

export interface TorobSurfaceDeps {
  doc: Document;
  location?: { href: string; pathname: string };
  lang: 'fa' | 'en';
  labels: TorobLabels;
  sendMessage(req: unknown): Promise<TorobResponse | TorobRangeResponse>;
}

export interface TorobSurface {
  destroy(): void;
}

export { torobSearchUrl };

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Best-effort product query: heading, then og:title, then the URL slug.
 * `document.title` is deliberately not used: at document_idle the SPA can
 * still report the previous page's title, which matched a wrong Torob
 * product in the 2026-10-20 live check. No query means the trigger waits
 * for the hydrated heading instead of guessing.
 */
export function torobQueryFromPage(doc: Document, href: string): string | null {
  const heading = doc.querySelector('h1')?.textContent?.trim();
  if (heading) return collapse(heading);

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
  if (ogTitle) return collapse(ogTitle);

  try {
    const parts = new URL(href).pathname.split('/').filter(Boolean);
    const slug = parts[parts.length - 1];
    if (slug && !/^dkp-\d+$/i.test(slug)) {
      return decodeURIComponent(slug).replaceAll('-', ' ');
    }
  } catch {
    // A malformed URL simply means "no query".
  }
  return null;
}

const TOROB_ID = 'dkopt-torob';

export function mountTorobSurface(deps: TorobSurfaceDeps): TorobSurface | null {
  const { doc, labels } = deps;
  const loc = deps.location ?? doc.location;
  if (!isProductPage(loc.pathname)) return null;
  if (doc.getElementById(TOROB_ID)) return null;

  let query = torobQueryFromPage(doc, loc.href);

  ensureStyles(doc);

  const numberFormat = new Intl.NumberFormat(deps.lang === 'fa' ? 'fa-IR' : 'en-US');
  const currency = deps.lang === 'fa' ? 'تومان' : 'Toman';
  const formatPrice = (toman: number): string => `${numberFormat.format(toman)} ${currency}`;

  const link = doc.createElement('a');
  link.id = TOROB_ID;
  link.className = 'dkopt-torob';
  link.href = query ? torobSearchUrl(query) : '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = labels.cta;
  link.title = labels.hint;
  link.setAttribute('aria-label', labels.hint);
  link.setAttribute('aria-haspopup', 'dialog');
  link.setAttribute('aria-expanded', 'false');

  // D-48: the range trigger shares the panel and the resolved query with the
  // comparison, so one surface owns both Torob actions on the PDP.
  const rangeButton = doc.createElement('button');
  rangeButton.type = 'button';
  rangeButton.id = 'dkopt-torob-range';
  rangeButton.className = 'dkopt-torob dkopt-torob-range';
  rangeButton.textContent = labels.rangeCta;
  rangeButton.title = labels.rangeHint;
  rangeButton.setAttribute('aria-label', labels.rangeCta);
  rangeButton.setAttribute('aria-haspopup', 'dialog');
  rangeButton.setAttribute('aria-expanded', 'false');

  type PanelMode = 'offers' | 'range';
  let panel: HTMLElement | null = null;
  let panelMode: PanelMode | null = null;
  let cached: TorobResponse | null = null;
  let cachedRange: TorobRangeResponse | null = null;
  let requestToken = 0;

  function externalLink(text: string, href: string, className: string): HTMLAnchorElement {
    const anchor = doc.createElement('a');
    anchor.className = className;
    anchor.textContent = text;
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function renderHeader(titleText: string, subtitle: string): void {
    if (!panel) return;
    const head = doc.createElement('div');
    head.className = 'dkopt-torob-head';

    const copy = doc.createElement('div');
    const title = doc.createElement('h2');
    title.className = 'dkopt-torob-title';
    title.textContent = titleText;
    const sub = doc.createElement('p');
    sub.className = 'dkopt-torob-sub';
    sub.textContent = subtitle;
    copy.append(title, sub);

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'dkopt-torob-close';
    close.textContent = '×';
    close.setAttribute('aria-label', labels.close);
    close.title = labels.close;
    close.addEventListener('click', () => closePanel());

    head.append(copy, close);
    panel.append(head);
  }

  function renderFooter(searchUrl: string): void {
    if (!panel) return;
    const foot = doc.createElement('div');
    foot.className = 'dkopt-torob-foot';
    const note = doc.createElement('span');
    note.className = 'dkopt-torob-note';
    note.textContent = labels.note;
    foot.append(note, externalLink(labels.searchOnTorob, searchUrl, 'dkopt-torob-search'));
    panel.append(foot);
  }

  function renderLoading(mode: PanelMode): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(mode === 'range' ? labels.rangeTitle : labels.offersTitle, query ?? '');
    const status = doc.createElement('p');
    status.className = 'dkopt-torob-status';
    status.textContent = mode === 'range' ? labels.rangeLoading : labels.loading;
    status.setAttribute('role', 'status');
    panel.append(status);
  }

  function renderComparison(comparison: TorobComparison): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(labels.offersTitle, comparison.productName ?? comparison.query);

    if (comparison.offers.length === 0) {
      const status = doc.createElement('p');
      status.className = 'dkopt-torob-status';
      status.textContent = comparison.productName ? labels.noOffers : labels.noMatch;
      panel.append(status);
      renderFooter(comparison.searchUrl);
      return;
    }

    const count = doc.createElement('p');
    count.className = 'dkopt-torob-count';
    count.textContent = labels.shopCount(comparison.shopCount);
    panel.append(count);

    const list = doc.createElement('ol');
    list.className = 'dkopt-torob-offers';
    comparison.offers.forEach((offer, index) => {
      const row = doc.createElement('li');
      row.className = 'dkopt-torob-offer';

      const main = doc.createElement('div');
      main.className = 'dkopt-torob-offer-main';
      const shop = doc.createElement('span');
      shop.className = 'dkopt-torob-shop';
      shop.textContent = offer.shopName;
      main.append(shop);

      if (index === 0) {
        const badge = doc.createElement('span');
        badge.className = 'dkopt-torob-badge';
        badge.textContent = labels.cheapest;
        main.append(badge);
      }

      const metaParts = [offer.city, offer.scoreText].filter((part): part is string =>
        Boolean(part),
      );
      if (metaParts.length > 0) {
        const meta = doc.createElement('span');
        meta.className = 'dkopt-torob-meta';
        meta.textContent = metaParts.join(' · ');
        main.append(meta);
      }

      if (offer.postage) {
        const postage = doc.createElement('span');
        postage.className = 'dkopt-torob-postage';
        postage.textContent = offer.postage;
        main.append(postage);
      }

      const side = doc.createElement('div');
      side.className = 'dkopt-torob-side';
      const price = doc.createElement('span');
      price.className = 'dkopt-torob-price';
      price.textContent = formatPrice(offer.priceToman);
      side.append(price);
      if (offer.url) {
        side.append(externalLink(labels.viewOffer, offer.url, 'dkopt-torob-offer-link'));
      }

      row.append(main, side);
      list.append(row);
    });

    panel.append(list);
    renderFooter(comparison.searchUrl);
  }

  function formatRange(category: TorobCategoryRange): string | null {
    if (category.minToman === null || category.upperToman === null) return null;
    if (category.upperBasis === 1 || category.upperToman === category.minToman) {
      return formatPrice(category.minToman);
    }
    return `${formatPrice(category.minToman)} – ${formatPrice(category.upperToman)}`;
  }

  function renderRange(range: TorobRangeReport): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(labels.rangeTitle, query ?? range.query);

    const grid = doc.createElement('div');
    grid.className = 'dkopt-range-cats';

    for (const category of range.categories) {
      const block = doc.createElement('div');
      block.className = 'dkopt-range-cat';
      block.dataset.category = category.category;

      const main = doc.createElement('div');
      main.className = 'dkopt-range-cat-main';
      const title = doc.createElement('span');
      title.className = 'dkopt-range-cat-title';
      title.textContent =
        category.category === 'installment' ? labels.rangeInstallment : labels.rangeAny;
      const sub = doc.createElement('span');
      sub.className = 'dkopt-range-cat-sub';
      sub.textContent =
        category.category === 'installment' ? labels.rangeInstallmentSub : labels.rangeAnySub;
      main.append(title, sub);

      const side = doc.createElement('div');
      side.className = 'dkopt-range-cat-side';
      const value = doc.createElement('span');
      value.className = 'dkopt-range-value';
      const formatted = formatRange(category);
      if (formatted === null) {
        value.classList.add('is-empty');
        value.textContent = labels.rangeNoListings;
      } else {
        value.textContent = formatted;
      }
      const count = doc.createElement('span');
      count.className = 'dkopt-range-count';
      count.textContent = labels.rangeListingCount(category.listingCount);
      side.append(value, count);

      block.append(main, side);
      grid.append(block);
    }
    panel.append(grid);

    const method = doc.createElement('p');
    method.className = 'dkopt-range-method';
    method.textContent = labels.rangeMethod;
    const delivery = doc.createElement('p');
    delivery.className = 'dkopt-range-delivery';
    delivery.textContent = labels.rangeDeliveryNote;
    panel.append(method, delivery);

    renderFooter(range.searchUrl);
  }

  function renderFailure(mode: PanelMode): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(mode === 'range' ? labels.rangeTitle : labels.offersTitle, query ?? '');
    const status = doc.createElement('p');
    status.className = 'dkopt-torob-status';
    status.textContent = labels.error;
    status.setAttribute('role', 'status');
    panel.append(status);
    renderFooter(torobSearchUrl(query ?? ''));
  }

  function renderResponse(
    mode: PanelMode,
    response: TorobResponse | TorobRangeResponse | null,
  ): void {
    if (response === null) {
      renderLoading(mode);
      return;
    }
    if (!response.ok) {
      renderFailure(mode);
      return;
    }
    if (response.kind === 'torob/range') renderRange(response.range);
    else renderComparison(response.comparison);
  }

  async function load(mode: PanelMode): Promise<void> {
    const activeQuery = query;
    if (!activeQuery) return;
    const token = ++requestToken;
    renderLoading(mode);
    let response: TorobResponse | TorobRangeResponse;
    try {
      response = await deps.sendMessage(
        mode === 'range'
          ? { kind: 'torob/range', query: activeQuery }
          : { kind: 'torob/compare', query: activeQuery },
      );
    } catch {
      response = { ok: false, errorCode: 'RUNTIME', message: 'Torob request failed' };
    }
    if (token !== requestToken || panel === null || panelMode !== mode) return;
    if (mode === 'range') cachedRange = response as TorobRangeResponse;
    else cached = response as TorobResponse;
    renderResponse(mode, response);
  }

  function openPanel(mode: PanelMode): void {
    if (!query) return;
    if (!panel) {
      panel = doc.createElement('section');
      panel.className = 'dkopt-torob-panel';
      panel.setAttribute('role', 'dialog');
      doc.body.appendChild(panel);
    } else if (panelMode === mode) {
      return;
    }
    panelMode = mode;
    requestToken += 1;
    panel.setAttribute('aria-label', mode === 'range' ? labels.rangeTitle : labels.offersTitle);
    link.setAttribute('aria-expanded', mode === 'offers' ? 'true' : 'false');
    rangeButton.setAttribute('aria-expanded', mode === 'range' ? 'true' : 'false');
    const cachedResponse = mode === 'range' ? cachedRange : cached;
    if (cachedResponse) renderResponse(mode, cachedResponse);
    else void load(mode);
  }

  function closePanel(): void {
    if (!panel) return;
    requestToken += 1;
    panel.remove();
    panel = null;
    panelMode = null;
    link.setAttribute('aria-expanded', 'false');
    rangeButton.setAttribute('aria-expanded', 'false');
  }

  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // keep open-in-new-tab behavior (progressive enhancement)
    }
    event.preventDefault();
    if (panel && panelMode === 'offers') closePanel();
    else openPanel('offers');
  });

  rangeButton.addEventListener('click', () => {
    if (panel && panelMode === 'range') closePanel();
    else openPanel('range');
  });

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && panel) closePanel();
  };
  doc.addEventListener('keydown', onKeydown);

  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  const startedAt = Date.now();
  const deadline = 300_000;

  // Normal flow under the product title, in the shared action row with the
  // compare button. The buy box is excluded on purpose: it is sticky on
  // desktop and fixed on mobile (D-47), so anything placed there is covered
  // by Digikala's own controls while scrolling.
  const place = (title: Element): void => {
    ensureTitleActions(doc, title).append(link, rangeButton);
  };

  const observe = (): void => {
    if (doc.body) {
      if (!observer) {
        observer = new MutationObserver(() => tryAttach());
        observer.observe(doc.body, { childList: true, subtree: true });
      }
      return;
    }
    if (timer === null) timer = setTimeout(tryAttach, 500);
  };

  const tryAttach = (): void => {
    if (destroyed) return;

    // The SPA can mount before the product heading exists. In that window
    // any document title is unreliable, so wait for the real heading
    // instead of guessing (the wrong-product live bug, 2026-10-20).
    if (!query) {
      const found = torobQueryFromPage(doc, loc.href);
      if (found) {
        query = found;
        link.href = torobSearchUrl(found);
      } else {
        if (Date.now() - startedAt >= deadline) return;
        observe();
        return;
      }
    }

    const title = findMountPoint(doc, PDP_TITLE_CANDIDATES);
    if (title) {
      observer?.disconnect();
      observer = null;
      place(title);
      return;
    }
    if (link.isConnected) return;
    if (Date.now() - startedAt >= deadline) return;
    observe();
  };
  tryAttach();

  return {
    destroy() {
      destroyed = true;
      observer?.disconnect();
      observer = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      closePanel();
      link.remove();
      rangeButton.remove();
      doc.removeEventListener('keydown', onKeydown);
    },
  };
}
