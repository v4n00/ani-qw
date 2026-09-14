# Third-party notices

Ani-QW is distributed under GNU GPL version 3; see `LICENSE`.

## References

- **Seanime**, by 5rahim and contributors, https://github.com/5rahim/seanime — GPL-3.0. The initial 8/32/4 MiB piece-priority windows in `cmd/ani-qw/stream.go` adapt Seanime’s GPL-3.0 `internal/util/torrentutil/torrentutil.go` strategy. The local reference also informed torrent reader prioritization, batch selection, mpv IPC monitoring, and the 80% completion convention. Ani-QW does not embed Seanime's application server or frontend.
- **Nyaa provider 2.1.0**, by Island, supplied as `reference/nyaa.json` — used to understand Nyaa's RSS query parameters and result fields. Its remotely executable TypeScript payload is not shipped or evaluated. Ani-QW implements its own Go RSS parser and conservative matching logic.

## Direct libraries

- **anacrolix/torrent v1.61.0**, by its contributors, https://github.com/anacrolix/torrent — Mozilla Public License 2.0. Used unmodified for BitTorrent, piece verification, peer statistics, and seekable file readers.
- **5rahim/habari v0.1.12**, by its contributors, https://github.com/5rahim/habari — GNU GPL version 3. Used unmodified for anime release-name parsing.

Exact direct and transitive dependency versions and checksums are recorded in `go.mod` and `go.sum`. `make notices` collects the license and notice files for modules actually linked into the helper into `bin/THIRD_PARTY_LICENSES.txt`. Include that file, this notice, and `LICENSE` when distributing a binary. Distribute the corresponding Ani-QW source and its pinned dependency sources under their respective licenses.

The extension uses browser APIs and system fonts; it bundles no third-party JavaScript runtime, UI framework, artwork, or AniList assets. AniList, Nyaa, and mpv are external services/programs, not bundled components.
