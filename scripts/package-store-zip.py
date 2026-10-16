#!/usr/bin/env python3
"""Package dist/ into the zip a store upload expects (T06.5).

The Chrome Web Store and the Edge Add-ons store both take a zip whose ROOT
holds manifest.json, so packaging is an invariant here rather than a shell
habit: this writes the archive, fixes the entry timestamps, re-reads what it
wrote to prove the layout, and prints the SHA-256 the release publishes.
Re-running it over the same dist/ produces the same bytes.

Stdlib Python rather than the `zip` command, because `zip` does not exist on
Windows or on this project's dev box - and a packaging step that only runs on
the CI image cannot be checked before a release.

Usage:
  python scripts/package-store-zip.py             # -> bozkhar-<version>.zip
  python scripts/package-store-zip.py out.zip
"""

import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
# The DOS epoch, 1980-01-01: a fixed stamp keeps the archive byte-stable
# instead of carrying the checkout's file times.
STAMP = (1980, 1, 1, 0, 0, 0)

# Never inside a published archive: a local Chromium private key or CRX pack
# (Chrome writes dist.pem when you "Pack extension"), and a sourcemap (the
# build sets sourcemap:false). Any of them means the build config or the
# folder changed under us, so refuse loudly rather than packaging it.
FORBIDDEN_SUFFIXES = (".pem", ".crx", ".map")


def main(argv):
    manifest_path = DIST / "manifest.json"
    if not manifest_path.is_file():
        print(f"no built manifest at {manifest_path} - build first", file=sys.stderr)
        return 1

    version = json.loads(manifest_path.read_text(encoding="utf-8"))["version"]
    out = Path(argv[1]) if len(argv) > 1 else ROOT / f"bozkhar-{version}.zip"

    files = sorted(path for path in DIST.rglob("*") if path.is_file())
    forbidden = [path for path in files if path.suffix.lower() in FORBIDDEN_SUFFIXES]
    if forbidden:
        names = ", ".join(str(path.relative_to(ROOT)) for path in forbidden)
        print(f"refusing to package private keys, CRX packs or sourcemaps: {names}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(DIST).as_posix(), STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16  # a plain, readable file
            archive.writestr(info, path.read_bytes())

    with zipfile.ZipFile(out) as archive:
        names = archive.namelist()
    if "manifest.json" not in names:
        print(f"{out.name} has no manifest.json at its root", file=sys.stderr)
        return 1
    if any(name.startswith("/") or ".." in Path(name).parts for name in names):
        print(f"{out.name} has an absolute or escaping entry", file=sys.stderr)
        return 1

    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    (out.with_name(out.name + ".sha256")).write_text(
        f"{digest}  {out.name}\n", encoding="utf-8"
    )
    print(f"{out.name}: {len(names)} entries, {out.stat().st_size} bytes")
    print(f"sha256 {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
