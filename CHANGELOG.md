# Changelog

Changes are listed newest first. Historical CI-only tags are included so they are not mistaken for feature releases.

## Unreleased

## 0.1.16

- Completion prompts accept an optional score using your AniList scoring scale, and show scores and notes from all anime prequels recursively.
- Home preview Play buttons fill the popup width and stay aligned below progress text.
- Torrent filenames have a visible link treatment for changing releases without an extra button.
- Watched minutes sit in the bottom-left playback widget; all four widgets have hover descriptions.

- Home playback uses the same episode, movie, replay, and rewatch labels as anime pages.
- Removed anime-list playback buttons.
- Fixed left-opening home popups losing hover access when AniList replaces card classes.
- Unread notification buttons use a muted tint; successfully synced notification playback marks that notification read locally in Ani-QW. AniList offers no per-notification server-side read operation.

### Fixed
- Resume preflight no longer blocks playback when an older loaded extension/helper does not support it; legacy automatic resume remains available.

### Added
- Play next directly from home anime previews.
- Choose Resume at the saved timestamp or Start over before launching an unfinished episode.

### Changed
- Wider notifications with a separate playback column further to the right.
- Home hover popups remain open while hovered or focused; hide quick-progress controls and retain the airing countdown.

## 0.1.15

### Changed
- Click the torrent filename to choose another torrent; removed the separate chooser link and download progress bar.
- Replay and Play next episode share the popup footer equally. Replay is disabled during playback; Next is disabled when no following aired episode is known.
- Stop is now in the playback panel heading.

### Fixed
- Notification playback buttons sit below the timestamp and show Starting/Streaming states for the exact episode. Streaming toggles the playback panel.
- Cover controls reserve sidebar clearance on absolute-positioned anime layouts, including late cover resizing.

## 0.1.14

### Added
- Play the exact aired episode directly from AniList notifications.
- Optional completion comments appended to the anime's AniList Notes.
- Keep downloaded video toggle; disabling retention removes video after playback while preserving watch/resume records.
- Repeatable release guide and a single command to update both embedded version numbers.
- Terminal update command in settings when a newer release is available.

### Changed
- Caught-up airing shows say Replay Episode N; movies say Play Movie.
- Torrent filename appears above the download bar and statistics.
- Choose another torrent is separated from Replay and Play next episode.
- Simplified settings text and hidden cache-size input when retention is off.
- Unavailable playback uses a muted appearance and tighter spacing.

### Fixed
- Re:ZERO torrent file selection: ordinal names such as “4th Season - 17” no longer get mistaken for Season 17.
- Empty status subtext no longer adds uneven padding.
- Invalidated extension contexts tell users to refresh AniList.

## 0.1.13

- Aligned helper and extension versions to 0.1.13 for publication.
- Includes the feature batch and packaging correction described in 0.1.11–0.1.12.

## 0.1.12

- Corrected tag validation in packaging jobs to read GitHub's built-in ref.
- Preserved the earlier failed tag rather than moving it.

## 0.1.11

- Added playback-only sharing preference, smaller transfer-rate units, and a latest-release update check.
- Added next-episode action and ten-second post-completion countdown.
- Minimized playback on navigation; refreshed episode progress after closing AniList's list editor.
- Kept Starting visible until mpv playback advances; hid dropdowns for unaired shows.
- Moved watched confirmation into the main playback status card.
- Redesigned preferences and added interactive browser selection/PATH guidance to the installer.
- Allowed repeated identical season annotations in torrent names.
- Restricted CI retries to dependency downloads and restored version validation.
- This tag's publication was blocked by the packaging issue fixed in 0.1.12.

## 0.1.10

- Updated release configuration and extension version metadata during CI troubleshooting.

## 0.1.9 / 0.1.8

- CI troubleshooting tags pointing to the same commit; no separate feature changes.

## 0.1.7

- Configurable cache size and watched percentage.
- Unfinished episode resume and meaningful mpv titles.
- Deferred full-series Rewatch updates and monotonic ordinary replay progress.
- Additional native Chromium browser registrations.
- Simplified settings, AQ icon, and sharper README screenshot.
- Playback status/countdown improvements and episode hover hints.

## 0.1.6

- Published the consolidated extension/helper source and Linux release packaging.
- User-local Bash installer, stable extension identity, documentation and diagnostics.

## 0.1.5

- Initial streaming implementation: AniList episode controls, automatic/manual Nyaa selection, mpv playback, progress synchronization and playback panel.
