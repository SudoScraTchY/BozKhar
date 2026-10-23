# Firefox smoke checklist (D-46)

Run this on **Firefox 140+ desktop** before the first AMO submission and after
any change to the background, the content loader, the manifest transform or the
delegated fetch path. Use a dedicated profile, a logged-in Digikala account and
a demo cart with no private data. Do not complete a purchase.

Build and load:

```bash
npm run build:firefox
npm run audit:dist:firefox
npm run lint:firefox
```

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
`dist-firefox/manifest.json`. Temporary add-ons disappear on restart; that is
expected.

## Install and identity

- [ ] `about:addons` → BozKhar → Permissions shows `storage`, `tabs`,
      `scripting` and the three hosts (digikala.com, api.torob.com,
      api.github.com); nothing else.
- [ ] `about:debugging` → Inspect the event page; the console is clean on idle.
- [ ] The toolbar icon opens the popup; the badge is empty or shows the stored
      comparison count.

## Popup and options

- [ ] Popup: version, order summary (empty or cached), language, GitHub link,
      Results / Insights / Settings / Orders buttons open the right tabs.
- [ ] GitHub release check: exactly one `api.github.com/.../releases/latest`
      GET while the popup is open; no request when it is closed.
- [ ] Options: fa/en switches the UI and direction; Plus, tolerance, crawl
      delay, staleness persist; JSON export downloads; clear-all asks, then
      empties storage and resets settings.

## Product page and Torob

- [ ] The "Add to comparison" button appears after hydration (including a slow
      CDN); click → capturing → toast with the variant and offer count; the
      badge increments; a second capture appends a snapshot.
- [ ] With a Plus account, the captured price/fees match the page. Watch the
      event-page console for `[dkopt] fetch delegation failed`; record whether
      the direct fallback still produced correct data.
- [ ] Torob trigger opens the panel with seller rows and links; the request
      carries only the public product title and no credentials; failure still
      offers the plain Torob search link.

## Cart crawl (the critical test)

- [ ] Set the crawl delay to 10 s in options (or use a 20+ item cart) so the
      crawl runs **longer than 90 seconds**.
- [ ] Click Optimize. The overlay shows opening lines, then real "i of N"
      progress (this is the `tabs.sendMessage` fix; it also applies to Chrome).
- [ ] Leave the tab alone for the full >90 s. The crawl completes, the results
      page opens, and the counts match.
- [ ] Repeat with the cart tab in the background. The keepalive still fires and
      the crawl completes.
- [ ] Abort mid-crawl. It stops at the next item, the overlay closes, and the
      "aborted" toast appears.
- [ ] Mid-crawl, reload the temporary add-on from `about:debugging` (or
      otherwise terminate the event page). The 35 s resend should start a fresh
      crawl from the persisted state, not item 1.
- [ ] Mid-crawl, close the cart tab. Reopen the cart and click Optimize; confirm
      it resumes from the persisted state.
- [ ] Check the event-page console for `executeScript` timeouts, unhandled
      rejections or `lastError`.

## SPA navigation

- [ ] PDP → another PDP via a client-side link: the button remounts, no
      duplicates.
- [ ] PDP → cart via the header: the cart button appears and the PDP surface is
      gone.
- [ ] Cart → orders: the floating Insights button appears; clicking it opens
      Insights.
- [ ] Back/forward navigation remounts the correct surface.

## Results, apply and refresh

- [ ] The plan renders in RTL and LTR; the hero, ledger, action bar and parcels
      agree; a hand check on one multi-vendor cart matches.
- [ ] Lock, quantity, Plus and tolerance re-solve; the why-panel and hints work.
- [ ] Apply with a Digikala tab open: preflight, confirmation, per-line
      add/verify/remove, and the final summary.
- [ ] Undo restores the snapshot and leaves rows added after it untouched.
- [ ] With no Digikala tab, Apply says what to open; signed out, it says to sign
      in.
- [ ] Refresh prices from the results page: the crawl completes (the results
      page has its own keepalive) and the final render updates.

## Exports

- [ ] CSV downloads and opens with Persian text intact.
- [ ] XLSX opens in Excel/LibreOffice with the expected columns.
- [ ] Markdown, pretty text, plain text and copy-to-clipboard work.
- [ ] Export → PDF opens the Firefox print preview; Save to PDF keeps RTL,
      Persian shaping and page breaks without clipped tables.

## Order Insights

- [ ] Open Insights: the cached view renders with no network on open.
- [ ] Read order history (up to 300 orders). It can exceed 60 s; each request is
      a separate short message, so progress continues without a keepalive.
- [ ] Deep analyze runs sequentially, can be cancelled, stops on auth failure,
      and keeps partial results.
- [ ] SVG charts render; the share card canvas renders Persian text; theme,
      style and size change; copy image works (or the PNG-download fallback);
      copy caption and the X intent work.
- [ ] Clear cache asks, then empties it; the language toggle re-renders.

## Build and privacy checks

- [ ] Restart Firefox; stored data persists. The temporary add-on is gone.
- [ ] An AMO-signed build shows the data-collection consent naming website
      content; the listing matches the manifest.
- [ ] With DevTools open, the only origins contacted are `digikala.com`,
      `api.torob.com` (click only) and `api.github.com` (popup only).
- [ ] No `chrome-extension://` or `moz-extension://` error noise in the event
      page or content-script consoles.

## Chrome regression smoke

The shared bundle gained the keepalive, the progress fix, Digikala-tab
resolution and the pathname poll, so re-check Chrome before releasing:

- [ ] Load `dist/` unpacked in Chrome.
- [ ] PDP capture, cart crawl with real progress, results, apply/undo, Insights.

## Cannot be automated in jsdom

These belong only to this manual pass: event-page suspension and the 30 s idle
timer; Xray and the history patch; dynamic `moz-extension:` import and WAR
enforcement; main-world `executeScript` serialization and `args`; SameSite
cookies/CORS; clipboard image write; the print dialog; canvas font shaping; AMO
consent and review.
