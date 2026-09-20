"""Reject mismatched helper/extension versions and release tags before packaging."""
import json
import os
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "extension/manifest.json").read_text())["version"]
helper = re.search(r'const appVersion = "([^"]+)"', (root / "cmd/ani-qw/main.go").read_text())[1]
if helper != version:
    raise SystemExit(f"Helper {helper} differs from extension {version}")
if os.environ.get("GITHUB_REF", "").startswith("refs/tags/") and os.environ["GITHUB_REF"].removeprefix("refs/tags/") != f"v{version}":
    raise SystemExit(f"Release tag must match v{version}")
print(f"Versions match: {version}")
