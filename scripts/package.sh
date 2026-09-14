#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
arch=${1:-amd64}
case "$arch" in amd64|arm64) ;; *) echo 'Expected amd64 or arm64' >&2; exit 1 ;; esac
export GOOS=linux GOARCH="$arch" CGO_ENABLED=0
export GOMODCACHE="$PWD/.cache/go/mod" GOCACHE="$PWD/.cache/go/build"
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/bin" dist
go build -tags nosqlite -trimpath -o "$stage/bin/ani-qw" ./cmd/ani-qw
python3 scripts/collect_notices.py
cp -R extension "$stage/"
cp install.sh LICENSE THIRD_PARTY.md README.md "$stage/"
cp bin/THIRD_PARTY_LICENSES.txt "$stage/"
tar -czf "dist/ani-qw-linux-$arch.tar.gz" -C "$stage" .
# Explicit allowlist excludes caches, local progress notes, credentials and git metadata.
tar -czf dist/ani-qw-source.tar.gz cmd extension scripts tests docs .github go.mod go.sum Makefile install.sh README.md LICENSE THIRD_PARTY.md .gitignore package.json icon.png
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile('dist/ani-qw-extension.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted(Path('extension').rglob('*')):
        if path.is_file(): archive.write(path)
PY
(cd dist; sha256sum ./*.tar.gz ./*.zip | sed 's|  ./|  |' > SHA256SUMS)
printf 'Built dist/ani-qw-linux-%s.tar.gz and source/extension archives.\n' "$arch"
