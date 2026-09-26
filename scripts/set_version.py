"""Set both embedded versions before committing a release."""
import json
import re
import sys
from pathlib import Path

if len(sys.argv) != 2 or not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", sys.argv[1]):
    raise SystemExit("Usage: python3 scripts/set_version.py 0.1.14 (without v)")
version = sys.argv[1]
root = Path(__file__).resolve().parents[1]
manifest = root / "extension/manifest.json"
helper = root / "cmd/ani-qw/main.go"
data = json.loads(manifest.read_text())
source, count = re.subn(r'const appVersion = "[^"]+"', f'const appVersion = "{version}"', helper.read_text())
if count != 1:
    raise SystemExit("Could not find the helper version; no files changed.")
data["version"] = version
manifest.write_text(json.dumps(data, indent=2) + "\n")
firefox = root / "extension/manifest.firefox.json"
fdata = json.loads(firefox.read_text()); fdata["version"] = version
firefox.write_text(json.dumps(fdata, indent=2) + "\n")
helper.write_text(source)
print(f"Extension and helper set to {version}. No commit, tag, or push performed.")
