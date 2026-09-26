#!/usr/bin/env bash
set -euo pipefail

repo=v4n00/ani-qw
browser=
source_dir=
uninstall=false
while (($#)); do
  case "$1" in
    --browser) browser=${2:?Missing browser}; shift 2 ;;
    --from) source_dir=${2:?Missing extracted release directory}; shift 2 ;;
    --uninstall) uninstall=true; shift ;;
    --help|-h) printf 'Usage: bash install.sh [--browser firefox|chromium|google-chrome|google-chrome-beta|google-chrome-unstable|brave|brave-origin|vivaldi|vivaldi-snapshot] [--from DIRECTORY] [--uninstall]\n'; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
done
# Read from the controlling terminal so the curl | bash form can prompt too.
if [[ -z $browser && -t 1 ]] && { exec 3<>/dev/tty; } 2>/dev/null; then
  browsers=()
  for candidate in firefox chromium google-chrome google-chrome-beta google-chrome-unstable brave brave-origin vivaldi vivaldi-snapshot; do
    command -v "$candidate" >/dev/null 2>&1 && browsers+=("$candidate")
  done
  # Some distributions use alternate executable names.
  if ! command -v chromium >/dev/null 2>&1 && command -v chromium-browser >/dev/null 2>&1; then browsers+=(chromium); fi
  if ! command -v brave >/dev/null 2>&1 && command -v brave-browser >/dev/null 2>&1; then browsers+=(brave); fi
  if (("${#browsers[@]}" == 0)); then
    browsers=(firefox chromium google-chrome google-chrome-beta google-chrome-unstable brave brave-origin vivaldi vivaldi-snapshot)
    printf 'No supported browser detected in PATH. Choose your installed browser:
' >&3
  else
    printf 'Choose which browser to register Ani-QW with:
' >&3
  fi
  if [[ -z ${NO_COLOR:-} && ${TERM:-dumb} != dumb ]]; then printf '\033[1;36mAniList Quick Watch\033[0m
' >&3; fi
  for i in "${!browsers[@]}"; do printf '  %d) %s
' "$((i+1))" "${browsers[$i]}" >&3; done
  while :; do
    printf 'Browser [1]: ' >&3
    read -r selection <&3 || { echo 'Installation cancelled.' >&2; exit 1; }
    selection=${selection:-1}
    if [[ $selection =~ ^[1-9]$ ]] && ((selection <= ${#browsers[@]})); then browser=${browsers[$((selection-1))]}; break; fi
    printf 'Enter a number from the list.
' >&3
  done
  exec 3>&-
fi
browser=${browser:-chromium}
case "$browser" in firefox|chromium|google-chrome|google-chrome-beta|google-chrome-unstable|brave|brave-origin|vivaldi|vivaldi-snapshot) ;; *) echo 'Unsupported browser.' >&2; exit 1 ;; esac
[[ $(uname -s) == Linux ]] || { echo 'Ani-QW requires Linux.' >&2; exit 1; }
[[ $EUID != 0 ]] || { echo 'Run this as your own user, without sudo.' >&2; exit 1; }
binary="$HOME/.local/bin/ani-qw"
destination="${XDG_DATA_HOME:-$HOME/.local/share}/ani-qw"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
profile=$browser
case "$browser" in
  brave) profile=BraveSoftware/Brave-Browser ;;
  brave-origin) profile=BraveSoftware/Brave-Origin ;;
esac
manifest="$config/$profile/NativeMessagingHosts/co.aniqw.player.json"
if [[ $browser == firefox ]]; then manifest="$HOME/.mozilla/native-messaging-hosts/co.aniqw.player.json"; fi
extension_dir="$destination/extension"
if [[ $browser == firefox ]]; then extension_dir="$destination/extension-firefox"; fi
if $uninstall; then
  rm -f -- "$manifest"
  registered=false
  for profile in chromium google-chrome google-chrome-beta google-chrome-unstable BraveSoftware/Brave-Browser BraveSoftware/Brave-Origin vivaldi vivaldi-snapshot; do
    [[ ! -e "$config/$profile/NativeMessagingHosts/co.aniqw.player.json" ]] || registered=true
  done
  [[ ! -e "$HOME/.mozilla/native-messaging-hosts/co.aniqw.player.json" ]] || registered=true
  if ! $registered; then rm -f -- "$binary"; fi
  printf 'Removed native host registration. Cache and saved completion records were retained.\n'
  printf 'Remove Ani-QW from the browser extensions page. Extension files at %s are retained for other browser installations.\n' "$extension_dir"
  exit 0
fi
command -v mpv >/dev/null || { echo 'Install mpv first (Arch: sudo pacman -S mpv).' >&2; exit 1; }
temporary=$(mktemp -d)
binary_stage=
manifest_stage=
trap 'rm -rf -- "$temporary"; [[ -z $binary_stage ]] || rm -f -- "$binary_stage"; [[ -z $manifest_stage ]] || rm -f -- "$manifest_stage"' EXIT
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
mkdir -p "$extension_dir"
cp -R -- "$source_dir/extension/." "$extension_dir/"
if [[ $browser == firefox ]]; then
  [[ -f "$source_dir/extension/manifest.firefox.json" ]] || { echo 'This package predates Firefox support. Build the current source first.' >&2; exit 1; }
  cp -- "$source_dir/extension/manifest.firefox.json" "$extension_dir/manifest.json"
fi
# Replace atomically so an existing worker can finish using its executable.
mkdir -p -- "${binary%/*}"
binary_stage=$(mktemp "${binary%/*}/.ani-qw-XXXXXX")
cp -- "$source_dir/bin/ani-qw" "$binary_stage"
chmod 755 "$binary_stage"
mv -f -- "$binary_stage" "$binary"
binary_stage=
# Quote paths for JSON without requiring Python or jq on the user's machine.
json_string() {
  local value=$1 char i code
  printf '"'
  for ((i=0; i<${#value}; i++)); do
    char=${value:i:1}
    case "$char" in
      '"'|'\') printf '\\%s' "$char" ;;
      [[:cntrl:]]) printf -v code '%d' "'$char"; printf '\\u%04x' "$code" ;;
      *) printf '%s' "$char" ;;
    esac
  done
  printf '"'
}
mkdir -p -- "${manifest%/*}"
manifest_stage=$(mktemp "${manifest%/*}/.ani-qw-XXXXXX")
{
  printf '{"name":"co.aniqw.player","description":"Ani-QW mpv streaming helper","path":'
  json_string "$binary"
  if [[ $browser == firefox ]]; then
    printf ',"type":"stdio","allowed_extensions":["ani-qw@v4n00.github.io"]}\n'
  else
  printf ',"type":"stdio","allowed_origins":["chrome-extension://ibgjkjpggobbbdhphjohjahfliapkjdc/"]}\n'
  fi
} > "$manifest_stage"
mv -f -- "$manifest_stage" "$manifest"
manifest_stage=
printf 'Installed %s\nNative host: %s\n' "$binary" "$manifest"
if [[ $browser == firefox ]]; then
  printf '\nFirefox helper installed. For development: open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on, and select %s/manifest.json. Temporary add-ons are removed when Firefox closes.\nPermanent installation requires a Mozilla-signed XPI; see docs/firefox.md.\n' "$extension_dir"
else
printf '\nHelper installed. Finish once in your browser:\n  1. Open chrome://extensions and enable Developer mode.\n  2. Load unpacked: %s\n  3. Open Ani-QW options and click Get AniList token.\n\nFor updates, rerun this script, then reload Ani-QW and your AniList tabs.\n' "$extension_dir"
fi
