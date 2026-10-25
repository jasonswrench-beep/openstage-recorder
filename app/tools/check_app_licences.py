# SPDX-License-Identifier: Apache-2.0
"""Checks the licences of the libraries the app window (app/) is built from, which `capture/tools/check_rules.py` does not see.

  python -I app/tools/check_app_licences.py

It reads the Rust libraries the window would carry on Windows (through `cargo metadata`, offline, so the libraries must already be on this
computer) and the JavaScript packages bundled into the page (from app/node_modules). Each licence must be on the allowed list, the same one
check_rules.py uses, except the few named in KNOWN_EXCEPTIONS below, which are listed with why. A library that is new, or whose licence has
changed, fails the check until someone has looked at it. Exit code: 0 if all is as expected, 1 if not.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent

# The same list as capture/tools/check_rules.py.
ALLOWED = {
    "Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib", "Unlicense", "CC0-1.0",
    "0BSD", "BSL-1.0", "Unicode-3.0", "Unicode-DFS-2016",
}

# Libraries under a licence that is not on the list, which have been looked at. MPL-2.0 is a licence that applies to the files of the
# library itself, so using one unmodified does not change the licence of this program, but the notice and the way to get its source
# have to travel with the program. They come in through Tauri (the window), and OpenStage Author carries the same ones. The owner accepted
# these five on 2026-10-24, on the condition that they are used unmodified (if one is ever changed here, the changed files have to be
# published under the MPL-2.0). They are listed by name, so nothing else slips in beside them.
KNOWN_EXCEPTIONS = {
    "cssparser": "MPL-2.0, through Tauri, accepted by the owner 2026-10-24",
    "cssparser-macros": "MPL-2.0, through Tauri, accepted by the owner 2026-10-24",
    "dtoa-short": "MPL-2.0, through Tauri, accepted by the owner 2026-10-24",
    "option-ext": "MPL-2.0, through Tauri, accepted by the owner 2026-10-24",
    "selectors": "MPL-2.0, through Tauri, accepted by the owner 2026-10-24",
}

# What is bundled into web/main.js, from package.json's dependencies (not the tools used to build it).
BUNDLED_PACKAGES = ["@tauri-apps/api", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-opener"]


def allowed(expression):
    """Whether a licence expression is on the list: an OR needs one allowed alternative, an AND needs every part allowed."""
    if not expression:
        return False
    expression = expression.replace("(", "").replace(")", "").replace("/", " OR ")
    for alternative in re.split(r"\s+OR\s+", expression):
        parts = re.split(r"\s+AND\s+", alternative)
        if all(re.sub(r"\s+WITH\s+.*", "", part).strip() in ALLOWED for part in parts):
            return True
    return False


def rust_libraries():
    result = subprocess.run(
        ["cargo", "metadata", "--format-version", "1", "--offline", "--filter-platform", "x86_64-pc-windows-msvc", "--manifest-path", str(APP / "src-tauri" / "Cargo.toml")],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print("Could not read the Rust libraries (cargo metadata failed). They must already be on this computer.")
        print(result.stderr.strip()[-600:])
        return None
    meta = json.loads(result.stdout)
    in_use = {node["id"] for node in meta["resolve"]["nodes"]}
    packages = [p for p in meta["packages"] if p["id"] in in_use and p.get("source") is not None]
    return sorted((p["name"], p["version"], p.get("license") or "unknown") for p in packages)


def javascript_packages():
    found = []
    for name in BUNDLED_PACKAGES:
        manifest = APP / "node_modules" / name / "package.json"
        if not manifest.is_file():
            found.append((name, "not installed", "unknown"))
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        found.append((name, data.get("version", "?"), data.get("license") or "unknown"))
    return found


def main():
    failures = []
    rust = rust_libraries()
    if rust is None:
        failures.append("the Rust libraries could not be read")
        rust = []
    js = javascript_packages()
    for kind, rows in (("Rust", rust), ("JavaScript", js)):
        for name, version, licence in rows:
            if allowed(licence):
                continue
            if name in KNOWN_EXCEPTIONS and "MPL-2.0" in licence:
                continue
            failures.append(f"{kind} library {name} {version} is under {licence}, which is not on the allowed list")
    known = [f"{n} {v} ({lic})" for n, v, lic in rust if n in KNOWN_EXCEPTIONS]
    print(f"{len(rust)} Rust libraries for Windows, {len(js)} JavaScript packages bundled into the page.")
    if known:
        print("Accepted by the owner on 2026-10-24, used unmodified: " + "; ".join(known))
    if failures:
        for f in failures:
            print("FAIL  " + f)
        return 1
    print("PASS  every library is on the allowed list, or is one of the listed exceptions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
