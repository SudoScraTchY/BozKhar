# Publishing BozKhar

Where this extension can ship, what each store costs, and exactly what to put
in front of a reviewer. Written 2026-10-16 against the 0.4.0 package.

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
`sourcemap: false`, and no local `dist.pem`/`dist.crx` (the packager reads
only `dist/`).

To verify a download before you upload it:

```bash
sha256sum -c bozkhar-0.4.0.zip.sha256                       # or shasum -a 256 -c
gh attestation verify bozkhar-0.4.0.zip --repo SudoScraTchY/BozKhar
```

Locally, the same two commands CI runs:

```bash
npm run build && npm run audit:dist        # NFR-06 audit of the built manifest
python scripts/package-store-zip.py        # -> bozkhar-<version>.zip (+ .sha256)
```

## Cutting a release

CI only reacts to a tag; creating it is yours.

```bash
# 1. bump the version in package.json (the manifest and the tag both read it)
# 2. commit that bump
git tag -a v0.4.0 -m "BozKhar 0.4.0"
git push origin v0.4.0
```

The Release workflow refuses the tag if it does not equal
`v$(package.json version)`, so the tag and the store version cannot drift.
Stores require the version to increase on every upload — that is what this
bump is.

## Before the first upload: the listing assets

| Asset | Size | Where it comes from |
|---|---|---|
| Package icon | 128×128 | already in the zip (`public/icons/icon-128.png`) — the stores take the icon from the package, not a separate upload |
| Screenshots | 1280×800 (640×400 also accepted), 1–5 on Chrome | take fresh ones of the cart button, the results page with a real saving, the hint card, the Export menu and the options page |
| Small promo tile | 440×280 (Chrome, optional but recommended) | crop the badge + wordmark onto a flat background |
| Marquee | 1400×560 (Chrome, only needed for featuring) | optional |
| Homepage / support URL | — | `https://sudoscratchy.github.io/BozKhar/` (already set as the repo homepage) |
| Privacy policy URL | — | optional, because the extension collects nothing; the landing page doubles as one if a form insists |

Screenshot hygiene: the panel shows **your** cart. Use a demo cart you do not
mind publishing, and check that no order number, address or phone number is
on screen before you upload.

## The answers a reviewer will ask for

Have these ready; they are the difference between "in review for a week" and
a rejection. They are all true of this codebase as of 0.4.0 — keep them true
if that changes.

**Single purpose.** "BozKhar does one thing: it compares the sellers offering
the items already in the user's digikala.com cart and shows the cheapest way
to buy that same cart, including what each used seller charges for delivery.
It reads the offers the user's own browser already sees, computes the plan
locally, and writes to the cart only when the user presses Apply."

**Permission justifications.**

- `storage` — "Keeps the captured offers and the user's own settings (Plus
  status, tolerance, crawl delay, language) in the browser's local
  IndexedDB. There is no server; nothing is transmitted anywhere."
- `tabs` — "Two uses: open the extension's own results page in a tab, and
  find the user's already-open digikala.com tab so the cart's own API calls
  can run inside the page that is allowed to make them. It never touches any
  other site's tabs."
- `scripting` — "Runs the cart read/write request in the page's main world,
  because the site's own request headers cannot be reproduced from an
  extension context. The code executed ships inside the extension; nothing
  is fetched or evaluated at runtime."
- `https://*.digikala.com/*` — "The extension only ever reads and acts on
  digikala.com, including the `api.` subdomain the site's own pages use. No
  other host is requested anywhere in the code."

**Data usage.** Declare that the extension does **not** collect or transmit
user data. That is accurate: no analytics, no account, no server, no
telemetry, and the options page can wipe all stored data (NFR-01, D-04). The
extension does read page/API content (prices, cart items) to do its job, but
that content stays in the browser.

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

Firefox is free to publish on, but the 0.4.0 package will not run there
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
  `test (node 22)`, `test (node 24)`, `build + package`) and
  `Dependency review` before merge.
- **Code security**: enable Dependabot alerts and security updates. Version
  updates are already configured in `.github/dependabot.yml` (weekly,
  grouped, with a 7-day cooldown).
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
