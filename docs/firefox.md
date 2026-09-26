# Firefox on Linux

Ani-QW supports native Firefox 142 or newer, with the same AniList interface and mpv helper. Flatpak/Snap browser sandboxing is not supported. Chromium installations can coexist with Firefox.

## Development installation

Build the current source, then run:

```bash
make build
bash install.sh --from . --browser firefox
```

In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `~/.local/share/ani-qw/extension-firefox/manifest.json` (or the path printed by the installer). Open Ani-QW's preferences from `about:addons`, connect your AniList token, and allow the extension on AniList when Firefox asks. Reload AniList after loading the add-on. Temporary add-ons are removed when Firefox closes.

The native host is registered at `~/.mozilla/native-messaging-hosts/co.aniqw.player.json`, with `allowed_extensions` restricted to `ani-qw@v4n00.github.io`. Firefox registration deliberately does not use `XDG_CONFIG_HOME`, matching Firefox's host lookup. Diagnostics: `~/.local/bin/ani-qw doctor firefox`. Remove the registration with `bash install.sh --uninstall --browser firefox`; other browser registrations and user data are retained.

## Permanent installation and release prerequisite

Release Firefox requires a Mozilla-signed XPI, even for distribution on GitHub. No public Mozilla listing is necessary: select **On your own** (unlisted/self-distributed) when submitting the unsigned Firefox archive for signing. This is separate from publishing this repository.

`bash scripts/package.sh amd64` produces `dist/ani-qw-firefox-unsigned.zip` as the signing input. The ZIP has Firefox's manifest at its root. It is **not** a permanently installable release artifact. After Mozilla signs the add-on, the owner can distribute the signed XPI and install it via `about:addons` → gear → **Install Add-on From File**. Do not disable signature enforcement. No signing credentials or signed XPI are included in this project yet.

See Mozilla's [self-distribution instructions](https://extensionworkshop.com/documentation/publish/install-self-distributed/) and [signing requirements](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## Storage and data

Firefox uses an extension-origin IndexedDB database for the token, account, completion prompts and UI preferences. Content scripts cannot access that database through the AniList origin. Chromium retains its existing trusted-context-only storage. The token goes only to AniList; it is never sent to the native helper. Preferences and downloaded-video data owned by the helper are shared between browsers. AniList authorization and review queues remain browser-local.

AniList receives the token, requested anime data, watch progress and any notes/scores explicitly saved. Search titles go through the local helper to Nyaa. The Firefox manifest declares these data categories for Mozilla's data-consent UI; Ani-QW has no analytics endpoint.

## Before 1.0 release

- Load the temporary add-on in Firefox and connect an account.
- Confirm home/anime/notification controls, quality settings, native playback, and Stop.
- Close/reopen Firefox, reload a temporary add-on if necessary, and reconnect to a still-running player.
- Verify saved authorization and review notes, then Disconnect and confirm authorization is removed.
- Obtain a signed XPI and repeat installation/restart checks on release Firefox.

Automated native invocation, registration, preferences, and shared UI tests complement these checks; they do not replace a Firefox end-to-end run.
