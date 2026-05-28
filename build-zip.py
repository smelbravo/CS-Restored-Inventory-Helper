#!/usr/bin/env python3
"""Build AMO/Firefox-compatible .zip (forward slashes in archive paths)."""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RELEASES = ROOT.parent / "releases"

FILES = [
    "manifest.json",
    "content.js",
    "icons/icon-16.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "icons/icon-300.png",
]


def main() -> int:
    version = None
    if len(sys.argv) > 1:
        version = sys.argv[1].lstrip("v")
    if not version:
        import json
        version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]

    out = RELEASES / f"CS-Restored-Inventory-Helper-v{version}.zip"
    RELEASES.mkdir(parents=True, exist_ok=True)

    missing = [f for f in FILES if not (ROOT / f.replace("/", "\\")).exists()]
    if missing:
        print("Missing files:", ", ".join(missing))
        return 1

    if out.exists():
        out.unlink()

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for arc in FILES:
            zf.write(ROOT / arc.replace("/", "\\"), arcname=arc)

    print(f"Created: {out}")
    with zipfile.ZipFile(out) as zf:
        for name in zf.namelist():
            if "\\" in name:
                print(f"WARNING: backslash in path: {name}")
                return 1
    print("Paths OK (forward slashes only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
