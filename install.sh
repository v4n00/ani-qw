#!/usr/bin/env bash
set -euo pipefail

repo=v4n00/ani-qw
browser=chromium
source_dir=
uninstall=false
while (($#)); do
  case "$1" in
    --browser) browser=${2:?Missing browser}; shift 2 ;;
    --from) source_dir=${2:?Missing extracted release directory}; shift 2 ;;
    --uninstall) uninstall=true; shift ;;
    --help|-h) printf 'Usage: bash install.sh [--browser chromium|google-chrome|google-chrome-beta|google-chrome-unstable|brave|brave-origin|vivaldi|vivaldi-snapshot] [--from DIRECTORY] [--uninstall]\n'; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
done
case "$browser" in chromium|google-chrome|google-chrome-beta|google-chrome-unstable|brave|brave-origin|vivaldi|vivaldi-snapshot) ;; *) echo 'Unsupported browser.' >&2; exit 1 ;; esac
[[ $(uname -s) == Linux ]] || { echo 'Ani-QW requires Linux.' >&2; exit 1; }
[[ $EUID != 0 ]] || { echo 'Run this as your own user, without sudo.' >&2; exit 1; }
binary="$HOME/.local/bin/ani-qw"
destination="${XDG_DATA_HOME:-$HOME/.local/share}/ani-qw"
if $uninstall; then
  [[ -x $binary ]] && "$binary" uninstall "$browser"
  printf 'Remove Ani-QW from the browser extensions page. Extension files at %s are retained for other browser installations.\n' "$destination/extension"
  exit 0
fi
command -v mpv >/dev/null || { echo 'Install mpv first (Arch: sudo pacman -S mpv).' >&2; exit 1; }
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
if [[ -z $source_dir ]]; then
  command -v curl >/dev/null || { echo 'Install curl first.' >&2; exit 1; }
  case $(uname -m) in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) echo 'Unsupported CPU; build from source.' >&2; exit 1 ;; esac
  asset="ani-qw-linux-$arch.tar.gz"
  # Resolve once: downloading two /latest/ URLs could cross a new release.
  release_url=$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --output /dev/null --write-out '%{url_effective}' "https://github.com/$repo/releases/latest")
  tag=${release_url##*/}
  [[ $release_url == "https://github.com/$repo/releases/tag/"* && $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'No published release found.' >&2; exit 1; }
  base="https://github.com/$repo/releases/download/$tag"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$base/$asset" -o "$temporary/$asset"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$base/SHA256SUMS" -o "$temporary/SHA256SUMS"
  (cd "$temporary"; awk -v name="$asset" '$2 == name {print}' SHA256SUMS > selected.sha256; test -s selected.sha256; sha256sum --check selected.sha256)
  mkdir "$temporary/package"
  tar --extract --gzip --file "$temporary/$asset" --directory "$temporary/package" --no-same-owner
  source_dir="$temporary/package"
fi
[[ -x $source_dir/bin/ani-qw && -f $source_dir/extension/manifest.json ]] || { echo 'Package is incomplete. Build first with make build, or use an extracted release.' >&2; exit 1; }
printf 'Stop playback and close the browser before updating an existing installation.\n'
mkdir -p "$destination/extension"
cp -R -- "$source_dir/extension/." "$destination/extension/"
"$source_dir/bin/ani-qw" install "$browser"
printf '\nHelper installed. Finish once in your browser:\n  1. Open chrome://extensions and enable Developer mode.\n  2. Load unpacked: %s\n  3. Open Ani-QW options and click Get AniList token.\n\nFor updates, rerun this script, then reload Ani-QW and your AniList tabs.\n' "$destination/extension"
