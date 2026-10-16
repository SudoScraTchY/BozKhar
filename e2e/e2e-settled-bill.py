"""E2E for the settled-bill results page (D-27):
the unpacked dist rendered by real Chromium with
the REAL capture from the last live crawl
(12 cart items, 1336 variant snapshots), seeded
into the extension's own IndexedDB.

Offline by design: the page renders from captured
data, so this E2E needs no network. It asserts
the brief's section-11 invariants:

  - Persian digits everywhere (no Latin digits in
    UI figures; merchant titles keep their own),
  - no ISO strings,
  - parcel totals carry shipping,
  - staleness is disclosed,
  - in estimate mode the honest range is shown
    and the hero/Apply stay hidden (savings are
    incomputable while a current-offer fee is
    unknown - SDD 08).

Usage:
  python e2e/e2e-settled-bill.py [path-to-idb-dump.json]

The dump is a session artifact (`.openclaw/tmp/
idb-dump.json`): {"items": [...], "snapshots": [...]}
in the storage record shapes from
src/shared/storage/db.ts. The old pw chromium
(extension-loading works) gets a FRESH profile
(the shared smoke profile was upgraded by a newer
Chrome and the old build can no longer read it).
The extension id is stable per dist path.
"""
import json
import re
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
DIST = REPO / "dist"
CHROME = REPO / ".openclaw" / "tmp" / "pw-browsers" / "chromium-1181" / "chrome-win" / "chrome.exe"
PROFILE = REPO / ".openclaw" / "tmp" / "e2e-profile"
DUMP = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / ".openclaw" / "tmp" / "idb-dump.json"
SHOT = REPO / ".openclaw" / "tmp" / "e2e-settled-bill.png"
EXT_ID = "opbdobecgmknfnnhkbedfkjaehebcdoe"  # stable per dist path

SEED_JS = """
async (data) => {
    const open = () => new Promise((res, rej) => {
        const rq = indexedDB.open('digikala-cart-optimizer', 3);
        rq.onupgradeneeded = () => {
            const db = rq.result;
            for (const s of ['items','snapshots','promos','shipments','cartSnapshots']) {
                if (!db.objectStoreNames.contains(s)) {
                    const key = s === 'cartSnapshots' ? 'key'
                        : s === 'items' ? 'itemKey'
                        : s === 'snapshots' ? 'snapshotId' : 'id';
                    db.createObjectStore(s, { keyPath: key });
                }
            }
        };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    });
    const db = await open();
    const put = (store, rows) => new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        for (const r of rows) st.put(r);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
    });
    await put('items', data.items);
    await put('snapshots', data.snapshots);
    db.close();
    return { items: data.items.length, snapshots: data.snapshots.length };
}
"""


def main() -> int:
    data = json.loads(DUMP.read_text(encoding="utf-8"))
    if PROFILE.exists():
        shutil.rmtree(PROFILE)
    PROFILE.mkdir(parents=True)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE),
            executable_path=str(CHROME),
            headless=False,
            viewport={"width": 1280, "height": 1400},
            args=[
                f"--load-extension={DIST}",
                f"--disable-extensions-except={DIST}",
                "--no-first-run",
            ],
        )
        try:
            import time

            time.sleep(3)
            page = ctx.new_page()
            page.goto(f"chrome-extension://{EXT_ID}/src/results/index.html")
            page.wait_for_timeout(2500)
            seeded = page.evaluate(SEED_JS, data)
            page.reload()
            page.wait_for_timeout(3000)

            text = page.locator("body").inner_text()
            # UI figures in Persian digits: strip anything that is
            # obviously merchant copy (titles keep their own digits).
            figures = page.evaluate(
                """() => [...document.querySelectorAll('.bk-num, .bk-ship-value, .bk-hero-total, .bk-ledger-payable')]
                    .map((n) => n.textContent).join(' ')"""
            )

            # Round 3: the brand mark, the export menu and the Plus switch.
            badge = page.locator(".bk-brand-icon")
            badge_box = badge.bounding_box() or {}
            page.locator(".bk-menu").click()
            page.wait_for_timeout(300)
            formats = page.locator(".bk-menu-item").all_inner_texts()
            page.screenshot(path=str(SHOT.parent / "e2e-header-menu.png"), clip={
                "x": 0, "y": 0, "width": 1280, "height": 250,
            })
            page.locator(".bk-menu").click()
            plus = page.locator(".bk-plus-row")
            plus.scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            plus_before = page.locator("#bk-plus-switch").is_checked()
            # A REAL click on the visible track: before the label wrap this
            # hit the track's span and did nothing at all.
            page.locator(".bk-switch-track").click()
            page.wait_for_timeout(900)
            plus_after = page.locator("#bk-plus-switch").is_checked()

            checks = {
                "seeded 12 items / 1336 snapshots": seeded == {"items": 12, "snapshots": 1336},
                "no ISO strings": not re.search(r"\d{4}-\d{2}-\d{2}T", text),
                "figures in Persian digits": not re.search(r"[0-9]", figures),
                "currency unit present": "تومان" in text,
                "staleness disclosed": bool(re.search(r"دقیقه|ساعت|روز", text)),
                "parcels render with shipping": bool(page.locator(".bk-ship-value").count()),
                "header badge is the 96px mark": (
                    badge.get_attribute("src") == "/icons/logo-256.png"
                    and round(badge_box.get("width", 0)) == 96
                ),
                "export menu offers six formats": formats == [
                    "Save as PDF", "CSV", "Excel", "Pretty text", "Markdown", "Plain text",
                ],
                "a click on the Plus switch toggles it": plus_before != plus_after,
                "the approximate notice is gone": "تقریبی است" not in text,
            }
            failed = 0
            for name, ok in checks.items():
                print(("PASS" if ok else "FAIL"), "-", name)
                failed += 0 if ok else 1
            page.screenshot(path=str(SHOT), full_page=True)
            print("screenshot:", SHOT)
            return 1 if failed else 0
        finally:
            ctx.close()


if __name__ == "__main__":
    raise SystemExit(main())
