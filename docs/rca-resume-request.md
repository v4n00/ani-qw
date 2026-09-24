# Playback blocked by “Unknown request”

## Cause and evidence

The new playback flow sends `resume` before `play` to offer Resume/Start over. Previous extension background workers did not recognize `resume` and returned `Unknown request`; previous native workers return `unknown command`. The rejected lookup aborted playback before `play` was sent.

On 2026-09-23, installed content.js and background.js matched the source SHA-256 hashes, and both source and installed background supported `resume`. The reported error is emitted by the extension dispatcher, not Nyaa or mpv. An older loaded background worker is therefore the likely runtime cause, rather than missing code on disk. Its running source was not directly inspected. Copying extension files does not reload an already-running worker. This feature was also introduced without changing the 0.1.15 version, making mixed installations harder to identify.

## Fix

Treat only an explicitly unsupported resume lookup as a compatibility case. Continue with the existing `play` request and `startOver:false`; legacy helpers already resume automatically. Do not offer a Start over choice that the older component cannot honor. Authentication, network, and other errors still stop the launch. New background dispatch errors include the request name, a structured code, and reload instructions.

Reload Ani-QW in chrome://extensions and refresh AniList tabs to load matching extension components and get the full resume-choice UI. Update the helper too if it predates resume choices; an existing worker must exit before its replacement starts.

## Prevention and verification

Browser regression cases simulate both legacy error strings and check that playback proceeds. A separate case verifies that authorization failures never trigger the compatibility fallback. Future feature releases should change both version strings and test mixed-version update behavior as well as a fresh installation.
