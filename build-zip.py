#!/usr/bin/env python3
"""Build release .zip (Chromium) and .xpi (Firefox) with forward-slash paths."""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RELEASES = ROOT / "releases"

FILES = [
    "manifest.json",
    "content.js",
    "settings.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "icons/icon-16.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "icons/icon-300.png",
]


def write_archive(out: Path) -> None:
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for arc in FILES:
            zf.write(ROOT / arc.replace("/", "\\"), arcname=arc)


def verify_archive(out: Path) -> bool:
    with zipfile.ZipFile(out) as zf:
        for name in zf.namelist():
            if "\\" in name:
                print(f"WARNING: backslash in path: {name}")
                return False
    return True


def main() -> int:
    version = None
    if len(sys.argv) > 1:
        version = sys.argv[1].lstrip("v")
    if not version:
        version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]

    missing = [f for f in FILES if not (ROOT / f.replace("/", "\\")).exists()]
    if missing:
        print("Missing files:", ", ".join(missing))
        return 1

    RELEASES.mkdir(parents=True, exist_ok=True)
    base = f"CS-Restored-Inventory-Helper-v{version}"
    zip_path = RELEASES / f"{base}.zip"
    xpi_path = RELEASES / f"{base}.xpi"

    for out in (zip_path, xpi_path):
        write_archive(out)
        if not verify_archive(out):
            return 1
        print(f"Created: {out}")

    print("Paths OK (forward slashes only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
