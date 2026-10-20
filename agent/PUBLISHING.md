# Publishing BozKhar

Where this extension can ship, what each store costs, and exactly what to put
in front of a reviewer. Written 2026-10-16 against the 0.4.0 package, updated
the same day for 0.5.0 (the stable download alias, D-37), and again on
2026-10-20 for 0.6.0 (Order Insights and the Torob host permission, D-42) and
0.6.1 (the popup release check that adds `api.github.com`, D-44).

## The answer in one table

| Store | Cost | Package | Notes |
|---|---|---|---|
| **Chrome Web Store** | **US$5, once, per developer account** | `bozkhar-<version>.zip` | The default target. Brave, Vivaldi, Arc, Opera and every other Chromium browser can install from here. |
| **Microsoft Edge Add-ons** | **free** (no registration fee) | the same zip | Partner Center + a Microsoft account. |
| **Opera Add-ons** | **free** | the same zip | Its own review, its own acceptance criteria. Opera also installs Chrome Web Store extensions, so this is optional reach. |
| **Firefox Add-ons (AMO)** | **free** | **needs a port** | Firefox MV3 has no `background.service_worker`; it runs event pages. Not a re-upload. |
| **Safari** | US$99/year Apple Developer + Xcode, different project | — | Not worth it at this stage. |
| **No store at all** | free | the release zip | Works, but users must enable Developer mode and "Load unpacked", and there is no auto-update. Fine for you and a few friends, not for strangers. |

**So: yes, publishing for free is possible — everywhere except Chrome, and
Chrome is US$5 once for an account that then covers every extension you ever
publish.** A realistic free path today is Edge Add-ons (+ Opera) now, Chrome
when you feel like spending the $5, Firefox if and when someone asks.

Sources: [Chrome developer registration](https://developer.chrome.com/docs/webstore/register)
(one-time fee) · [Register as an Edge extension developer](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)
("There is no registration fee") · [Opera publishing guidelines](https://help.opera.com/en/extensions/publishing-guidelines/)
· [MDN: manifest `background`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
(`background.service_worker` is not supported in Firefox).

## What CI hands you

Nothing here needs a local build — the pipeline produces the artifact:

- **Every push to `main`** → the `CI` workflow's *build + package* job uploads
  an artifact named `bozkhar-<version>` containing `bozkhar-<version>.zip` and
  `bozkhar-<version>.zip.sha256`. Download it from the run page, or
  `gh run download`.
- **A `v<version>` tag** → the `Release` workflow re-verifies the tagged
  commit, rebuilds, and publishes a GitHub Release with the same zip, its
  SHA-256, auto-generated notes, and a **provenance attestation**.

The zip is what every store wants: `manifest.json` at the archive root,
`sourcemap: false`, and no local `dist.pem`/`dist.crx` — the packager reads only
`dist/` and now **refuses** to package a `.pem`, `.crx` or `.map` if one is
there, so a leftover key from a local "Pack extension" run cannot ride along.

**The stable download link (D-37).** Every release also carries
`bozkhar-latest.zip`, byte-identical to the versioned zip, so the landing page
links

```
https://github.com/SudoScraTchY/BozKhar/releases/latest/download/bozkhar-latest.zip
```

and never needs editing when a version is cut — `releases/latest` resolves to
the newest non-prerelease release, so publishing *is* the update. Both names
are attested, so either download verifies. Before publishing, the workflow also
asserts that the zip's own `manifest.json` version equals `package.json` and
the tag, and writes the SHA-256 into the run's step summary.

To verify a download before you upload it:

```bash
sha256sum -c bozkhar-0.6.1.zip.sha256                       # or shasum -a 256 -c
gh attestation verify bozkhar-0.6.1.zip --repo SudoScraTchY/BozKhar
gh attestation verify bozkhar-latest.zip --repo SudoScraTchY/BozKhar
```

(The sidecar is named for the versioned file, so `sha256sum -c` only matches
that name; for the alias compare `sha256sum bozkhar-latest.zip` against the
digest in it.)

Locally, the same two commands CI runs:

```bash
npm run build && npm run audit:dist        # NFR-06 audit of the built manifest
python scripts/package-store-zip.py        # -> bozkhar-<version>.zip (+ .sha256)
```

## Cutting a release

Two ways, and both refuse a version that does not match `package.json`:

**From the Actions tab** (nothing to install): *Actions → Release → Run
workflow*, and type the version — `0.6.1` or `v0.6.1`. The tag is created at
the commit the run verified, so the zip, the tag and the commit always agree.

**From your machine**, if you prefer the tag to come first:

```bash
# 1. bump the version in package.json (the manifest and the tag both read it)
# 2. commit that bump and push it to main
git tag -a v0.6.1 -m "BozKhar 0.6.1"
git push origin v0.6.1
```

v0.4.0 through v0.6.1 were published this way. Re-running a release for a
tag that already exists is allowed only when that tag points at the commit
the run just built — otherwise the run stops and says so, because a release
built from one tree must never be filed under a tag that names another.

Stores require the version to increase on every upload — that is what the
bump is.

## Before the first upload: the listing assets

| Asset | Size | Where it comes from |
|---|---|---|
| Package icon | 128×128 | already in the zip (`public/icons/icon-128.png`) — the stores take the icon from the package, not a separate upload |
| Screenshots | 1280×800 (640×400 also accepted), 1–5 on Chrome | take fresh ones of the cart button, the results page with a real saving, the hint card, the Export menu, the order-insights summary, the cancelled-orders table and the options page |
| Small promo tile | 440×280 (Chrome, optional but recommended) | crop the badge + wordmark onto a flat background |
| Marquee | 1400×560 (Chrome, only needed for featuring) | optional |
| Homepage / support URL | — | `https://sudoscratchy.github.io/BozKhar/` (already set as the repo homepage) |
| Privacy policy URL | — | **now recommended**: the explicit Torob lookup sends the public product title to a third party, and the popup asks GitHub for the latest tag. The landing page can serve as the policy if it names both recipients and when each request happens. |

Screenshot hygiene: the panel shows **your** cart. Use a demo cart you do not
mind publishing, and check that no order number, address or phone number is
on screen before you upload.

## The answers a reviewer will ask for

Have these ready; they are the difference between "in review for a week" and
a rejection. They are all true of this codebase as of 0.6.1 — keep them true
if that changes.

**Single purpose.** "BozKhar helps a shopper pay less on digikala.com. It
compares the sellers offering the items already in the user's cart and shows
the cheapest way to buy that same cart, including delivery fees; on request it
also shows the cheapest Torob sellers for the product being viewed, and keeps
a private, on-device summary of the user's own order history. It reads pages
the user already has open, computes everything locally, and writes to the cart
only when the user presses Apply."

**Permission justifications.**

- `storage` — "Keeps the captured offers, the user's own order summaries and
  the extension's settings (Plus status, tolerance, crawl delay, language) in
  the browser's local IndexedDB. There is no server of ours; nothing is sent
  to the developer."
- `tabs` — "Two uses: open the extension's own results and insights pages in a
  tab, and find the user's already-open digikala.com tab so the site's own API
  calls can run inside the page that is allowed to make them. It never touches
  any other site's tabs."
- `scripting` — "Runs the cart read/write request and the order-history read
  in the page's main world, because the site's own request headers cannot be
  reproduced from an extension context. The code executed ships inside the
  extension; nothing is fetched or evaluated at runtime."
- `https://*.digikala.com/*` — "The extension reads and acts on digikala.com,
  including the `api.` subdomain the site's own pages use."
- `https://api.torob.com/*` — "Used only when the user presses the
  'Compare on Torob' button on a product page. The extension then asks
  Torob's public product API for that product's public title and lists the
  five cheapest sellers. The request carries no cookies, no referrer, no
  account and no cart data, and is made with credentials omitted
  (D-42)."
- `https://api.github.com/*` — "Used only while the extension popup is
  open, to compare the running version with the latest release tag on the
  project's public GitHub repository, so the user learns a newer build
  exists. It is one unauthenticated GET; no user data, account or browsing
  information is sent, and there is no polling or background timer
  (D-44)."

**Data usage.** Declare that the extension does **not** collect user data for
the developer and does not transmit user data to any server of ours. That is
accurate: no analytics, no account, no developer server, no telemetry, and the
options page can wipe all stored data (NFR-01, D-04). Two nuances to state
honestly if a form asks:

1. The extension reads page/API content (prices, cart items, the user's own
   order history) to do its job, but that content stays in the browser.
   Order records are reduced on read — address, payment and invoice fields are
   discarded and never stored.
2. The **only** outbound request outside digikala.com is the user-initiated
   Torob lookup, which sends the public product title and nothing else. No
   user identity or browsing history is included, and no lookup happens
   without a click.
3. Opening the toolbar popup asks GitHub's public releases API for the latest
   tag. That request contains no user data at all — no identifier, no order
   or cart content — and GitHub necessarily sees the request's IP address, as
   it would for any visit to the repository. It runs only while the popup is
   open; there is no polling, alarm or scheduled task.

Because of points 2 and 3, attach a privacy policy rather than declaring "no
third-party requests". The landing page doubles as one; it should name Torob
and GitHub as recipients, describe what each receives, and state that the
Torob lookup is click-only while the release check runs only while the popup
is open.

**Remote code.** None. Every line is bundled into the package; there is no
`eval`, no `new Function`, and no remotely loaded script (verified by grep
and by the manifest audit).

**Trademark.** Do not put "Digikala" in the item *name* and do not use
Digikala's logo or the wordmark in the listing or the icon — that is the
usual impersonation rejection. The name BozKhar and its own badge are what
ship. Mentioning compatibility factually in the description ("works with
digikala.com") is normal and fine.

**Tone worth stating in the description.** Advise-only by default: the
extension shows a plan and only writes to the cart when the user presses
Apply, one item at a time, and never touches checkout or payment. Sequential
fetches at a human pace with a configurable delay. That posture is also the
answer to any "is this a scraper?" question.

## Chrome Web Store, step by step

1. Register at the [developer dashboard](https://chrome.google.com/webstore/devconsole/)
   with the Google account you want to own the item. Pay the one-time US$5 and
   pass Google's account verification (phone/2-step).
2. **Add new item** → upload `bozkhar-<version>.zip`. Chrome assigns the
   extension an ID at this moment; from then on, you upload new versions to
   *this* item — never create a second one for an update.
3. **Store listing**: name, short description (132 chars), full description,
   category, language (Persian first; the console can hold localized
   listings), screenshots, and the promo tile.
4. **Privacy practices**: single purpose, one justification per permission,
   the data-usage declaration, and the remote-code declaration from the
   section above.
5. **Submit for review.** New items with host permissions are the slow case —
   plan for a few business days and do not schedule a demo for the same
   afternoon. Updates to an approved item are usually much faster.
6. Optional before going public: **Trusted testers** (up to 100 emails) or a
   private/unlisted publish, which is the sane way to let the user smoke-test
   against the real checkout panel.
7. Later, when trust is established: pin the listing to **Verified** by
   linking the publisher domain (`sudoscratchy.github.io`).

## Microsoft Edge Add-ons, step by step

1. Register the **Microsoft Edge program** in
   [Partner Center](https://partner.microsoft.com/) with a Microsoft account.
   No fee.
2. **New extension** → upload the same zip. Edge asks for the same listing
   fields and at least one screenshot.
3. Review is typically a few business days (Microsoft documents up to 7 for a
   first submission). Updates go through the same form.
4. Note: Edge users can also install the Chrome Web Store listing, so this
   store is extra reach rather than the only route.

## Opera Add-ons

1. Sign in at [addons.opera.com](https://addons.opera.com/developer/) and
   submit the same zip.
2. Opera publishes its own [acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/)
   — read them once; they are short and mostly about not being a duplicate or
   a scam.
3. Free, and Opera also installs Chrome Web Store items, so this is optional.

## Firefox: a port, not an upload (T06.6)

Firefox is free to publish on, but the 0.6.1 package will not run there
unmodified:

- **No `background.service_worker` in Firefox MV3.** Firefox runs an *event
  page*. MDN's recommended shape is to declare both keys —
  `background: { scripts: ['…'], service_worker: '…' }` — so Chrome takes the
  worker and Firefox takes the script.
- Firefox requires `browser_specific_settings.gecko.id` for MV3 submissions.
- The main-world fetch delegation (D-16) and the cart transport (D-30) lean
  on `chrome.scripting.executeScript` semantics; those need verifying against
  Firefox's implementation rather than assuming parity.
- AMO will accept a signed self-distributed build, but listed publishing is
  the only way users find it.

That work is **T06.6** in `SDD/tasks/T06-hardening-release.md` and is still
`todo`; this section is the brief, not a claim that it works.

## One-time GitHub setup worth doing

- **Settings → Actions → General**: keep the workflow token read-only (the
  workflows assume it; `permissions:` narrows it further per job).
- **Branch protection on `main`**: require the `CI` checks (`quality`,
  `test (node 22)`, `test (node 24)`, `build + package`) before merge. Not
  just politeness: a red Dependabot batch was merged on 2026-10-16 and took
  `main` down until it was reverted (`90afe14`).
- **Code security**: enable the **dependency graph**, then Dependabot alerts
  and security updates. The graph is currently off, which is why this repo
  has no dependency-review workflow — the action answers `403` without it, so
  the check would be red on every pull request regardless of content. Version
  updates are configured in `.github/dependabot.yml` (weekly; minor+patch in
  one group, majors one at a time, 7-day cooldown).
- **Private vulnerability reporting**: enable it so a reporter has somewhere
  to go that is not a public issue.

## Later: uploading to the stores from CI

Both major Chromium stores have upload APIs, and both want a long-lived
credential:

- **Chrome Web Store**: an OAuth2 refresh token for the account, plus the
  item ID. Usable from `chrome-webstore-upload-cli` or the API directly.
- **Edge**: Partner Center's API, which needs an Azure AD app registration and
  an API key — noticeably more setup.
- **Opera**: no public upload API; the submission form has an
  "auto-publish" checkbox for updates.

The current pipelines deliberately hold **no secrets**, so any of this is a
conscious change: add the credential as an Actions secret, add a
`workflow_dispatch`-gated publish job that downloads the attested artifact
rather than rebuilding, and keep it out of the pull-request path.
