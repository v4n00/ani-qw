# Native protocol v1

Native host name: `co.aniqw.player`. The allowlisted extension ID is `ibgjkjpggobbbdhphjohjahfliapkjdc`.

Both native stdio and the internal Unix socket carry UTF-8 JSON preceded by a four-byte unsigned length in host-native byte order. Messages are limited to 900 KiB, below Chromium's 1 MiB host-response limit. Stdout is reserved for frames; logs go to stderr/the worker log.

## Requests

Every request includes `v: 1`, a nonempty string `id`, and `command`. Request IDs correlate responses; session IDs identify a particular playback and filter stale events.

| Command | Fields | Result |
| --- | --- | --- |
| `state` | — | `{state, completions}` snapshot |
| `search` | `media`, `episode`, optional `query` | Array of release records |
| `files` | `media`, `episode`, `torrent` | Playable file records with original torrent indices |
| `play` | `media`, `episode`, `userId`, optional `torrent`, `fileIndex` | New or existing session state |
| `cancel` | — | Cancels current metadata/search job for this connection |
| `stop` | optional `sessionId` | Cancels matching active playback |
| `ack` | `completionId`, `userId` | Durably removes a matching completion |

`media` contains `id`, `title`, `titles`, `format`, `status`, and `episodes`. `torrent` contains `name`, forty-character hex `hash`, `downloadUrl`, `link`, `resolution`, `size` (display string), `seeders`, and `leechers`. Only Nyaa HTTPS torrent downloads are resolved; otherwise the hash is used as a magnet. A manual file index is range-checked and must identify a supported video file.

The helper does not receive an AniList access token. `userId` binds completion to the authenticated account chosen by the extension. Repeated automatic playback requests for the same media/episode/user are idempotent. An explicit different torrent or file replaces playback. Replacing a session cancels its context and waits for cleanup before opening another torrent client.

## Responses and events

Responses use `{v:1,id,event:"result",data}` or `{v:1,id,event:"error",error,code?}`. `code:"manual"` requests manual selection.

Unsolicited events omit `id`:

- `state`: session ID, user/media/episode identity, selected hash/file index, filename, phase, download bytes/size/percentage, transfer speeds in bytes/second, peers/seeds, playback position/duration in seconds, and optional warning.
- `failure`: `{sessionId,code,message}`; `manual` invokes the chooser and other codes display errors.
- `completion`: `{id,sessionId,userId,mediaId,episode}`; emitted only after atomic persistence.

Phases are `idle`, `searching`, `metadata`, `verifying`, `buffering`, `playing`, and `paused`. Statistics are emitted approximately once a second during playback.

## Recovery

Closing the native connection cancels its outstanding searches, not playback. A later connection retrieves the current session and pending completions using `state`. The extension processes completion records serially, verifies account identity and current progress, sends a monotonic AniList update when needed, then acknowledges. API failures and token expiration leave records pending. A duplicate completion is harmless because progress is read before mutation.

The worker uses an exclusive lock in its private runtime directory. Multiple native bridge processes can reconnect to the same worker. Only one playback session exists per Linux user. The worker exits after 45 seconds without active playback/jobs or requests; Chromium can start it again on demand.

## 0.16.0 settings and resume additions

`settings` reads preferences; optional `cacheGiB` (1–1024) and `watchedPercent` (1–99) persist preferences. Defaults are 20 GiB and 80%. Playback snapshots the watched threshold at launch. Cache eviction never runs concurrently with active playback.

`play` accepts `rewatch` and `repeatBase`; completion records preserve these values so full-show Rewatch changes AniList only after threshold completion, including after reconnect. Ordinary older-episode playback remains monotonic. State includes `rewatch` to preserve replay intent.

Resume points are stored separately by account/media/episode, include rewatch-pass identity, save every five seconds and on exit, and clear after completion. mpv receives both window and media titles plus the saved start position.
