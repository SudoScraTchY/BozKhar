/**
 * PDP Torob surface (D-42): a trigger next to the buy box that opens a
 * compact comparison panel with Torob's cheapest sellers.
 *
 * The content script never calls Torob itself: the click sends the public
 * product title to the worker, which owns the host permission and returns
 * normalized seller rows. If the comparison fails, the panel still offers
 * the plain Torob search link, and the trigger itself is a real <a> so
 * modified clicks (Ctrl/Cmd) keep working without JavaScript.
 */
import { findMountPoint, isProductPage, PDP_SELLER_PANEL_CANDIDATES } from '../dom/selectors';
import { ensureStyles } from './ui';
import { torobSearchUrl, type TorobComparison, type TorobResponse } from '../../torob/api';

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
}

export interface TorobSurfaceDeps {
  doc: Document;
  location?: { href: string; pathname: string };
  lang: 'fa' | 'en';
  labels: TorobLabels;
  sendMessage(req: unknown): Promise<TorobResponse>;
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
const FLOATING_AFTER_MS = 8000;

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

  let panel: HTMLElement | null = null;
  let cached: TorobResponse | null = null;
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

  function renderHeader(subtitle: string): void {
    if (!panel) return;
    const head = doc.createElement('div');
    head.className = 'dkopt-torob-head';

    const copy = doc.createElement('div');
    const title = doc.createElement('h2');
    title.className = 'dkopt-torob-title';
    title.textContent = labels.offersTitle;
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

  function renderLoading(): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(query ?? '');
    const status = doc.createElement('p');
    status.className = 'dkopt-torob-status';
    status.textContent = labels.loading;
    status.setAttribute('role', 'status');
    panel.append(status);
  }

  function renderComparison(comparison: TorobComparison): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(comparison.productName ?? comparison.query);

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

  function renderFailure(searchUrl: string): void {
    if (!panel) return;
    panel.replaceChildren();
    renderHeader(query ?? '');
    const status = doc.createElement('p');
    status.className = 'dkopt-torob-status';
    status.textContent = labels.error;
    status.setAttribute('role', 'status');
    panel.append(status);
    renderFooter(searchUrl);
  }

  function renderResponse(response: TorobResponse | null): void {
    if (response === null) {
      renderLoading();
      return;
    }
    if (response.ok) renderComparison(response.comparison);
    else renderFailure(torobSearchUrl(query ?? ''));
  }

  async function load(): Promise<void> {
    const activeQuery = query;
    if (!activeQuery) return;
    const token = ++requestToken;
    renderLoading();
    let response: TorobResponse;
    try {
      response = await deps.sendMessage({ kind: 'torob/compare', query: activeQuery });
    } catch {
      response = { ok: false, errorCode: 'RUNTIME', message: 'comparison failed' };
    }
    if (token !== requestToken || panel === null) return;
    cached = response;
    renderResponse(response);
  }

  function openPanel(): void {
    if (panel || !query) return;
    panel = doc.createElement('section');
    panel.className = 'dkopt-torob-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', labels.offersTitle);
    doc.body.appendChild(panel);
    link.setAttribute('aria-expanded', 'true');
    if (cached) renderResponse(cached);
    else void load();
  }

  function closePanel(): void {
    if (!panel) return;
    requestToken += 1;
    panel.remove();
    panel = null;
    link.setAttribute('aria-expanded', 'false');
  }

  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // keep open-in-new-tab behavior (progressive enhancement)
    }
    event.preventDefault();
    if (panel) closePanel();
    else openPanel();
  });

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && panel) closePanel();
  };
  doc.addEventListener('keydown', onKeydown);

  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackScheduled = false;
  let destroyed = false;
  const startedAt = Date.now();
  const deadline = 300_000;

  const place = (anchor: Element): void => {
    link.classList.remove('dkopt-torob-floating');
    // The PDP surface owns a stacked action block below the buy row; join
    // it so both BozKhar actions read as one unit.
    const actions = doc.querySelector('.dkopt-pdp-actions');
    if (actions) {
      actions.append(link);
    } else {
      const row = anchor.parentElement;
      const comparison = row?.querySelector('.dkopt-btn');
      if (comparison && row) row.insertAdjacentElement('afterend', link);
      else anchor.insertAdjacentElement('afterend', link);
    }
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
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

  // The current PDP hydrates late; if neither the heading nor the buy-box
  // anchor is present after a short wait, keep the trigger reachable as a
  // floating pill so the feature is never silently missing.
  const scheduleFallback = (): void => {
    if (fallbackScheduled || !query || link.isConnected || !doc.body) return;
    fallbackScheduled = true;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (destroyed || link.isConnected || !doc.body) return;
      link.classList.add('dkopt-torob-floating');
      doc.body.appendChild(link);
    }, FLOATING_AFTER_MS);
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

    const anchor = findMountPoint(doc, PDP_SELLER_PANEL_CANDIDATES);
    if (anchor) {
      observer?.disconnect();
      observer = null;
      place(anchor);
      return;
    }
    if (link.isConnected) return;
    if (Date.now() - startedAt >= deadline) return;
    scheduleFallback();
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
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      fallbackTimer = null;
      closePanel();
      link.remove();
      doc.removeEventListener('keydown', onKeydown);
    },
  };
}
