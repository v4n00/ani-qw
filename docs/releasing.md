# Publishing a release

1. Run `make test integration` and `python3 tests/installer_test.py`. Check the UI fixture in Chromium.
2. Set `extension/manifest.json` and `appVersion` in `cmd/ani-qw/main.go` to the same release version. Run `python3 scripts/check_version.py`. Review source changes, notices and README images for private information.
3. Build `bash scripts/package.sh amd64` and `bash scripts/package.sh arm64`; inspect the archives and `dist/SHA256SUMS`.
4. Commit the intended files, then push `master`. Push a matching tag, for example `v0.1.12` for version `0.1.12`.
5. The workflow tests, packages both architectures, and creates a GitHub Release with binary bundles, extension ZIP, source archive and checksums. A tag/version mismatch fails publication.
6. Test the documented installer against that published release from a fresh user account.

The repository is `v4n00/ani-qw`. The one-line installer becomes usable only once the repository's `master/install.sh` and a successful release are public. No credentials are needed to download public releases. The workflow uses GitHub's short-lived token; write permission is restricted to the release job.

## Public and private configuration

AniList client ID 51034, the extension public key and ID are public identifiers. No client secret belongs in this project. AniList access tokens live in Chromium's extension storage; the native helper never receives them. Keep `.env`, private keys, runtime data, caches and local progress notes out of Git. `PROGRESS.md` is a local handoff file.

## Extension distribution

Release bundles contain a plain unpacked extension. The installer copies it into a stable user directory and prints the manual loading instructions. Signed CRX distribution would require the private signing key matching the existing public manifest key; it is not available here. Replacing the key would change the extension ID and break existing native-host authorization. No Chrome Web Store publication is planned.

## Validation limits

Local tests cover controlled torrent streaming/seeking and UI fixtures. GitHub Actions and the public download installer can only be confirmed after a release is pushed; preparing workflow files does not run them remotely. Real Nyaa availability and AniList limits vary. Buffering performance relative to Seanime remains unbenchmarked.


## History and tag hygiene

Use descriptive Conventional Commit messages for new work, such as `fix: match repeated Re:ZERO season annotations` or `feat: add playback sharing preferences`. Use a new version for each published release; don't move existing tags to different code.

Changing an existing commit message changes its hash and all descendant hashes. There is no in-place, nondestructive rename of published commits. Preserve history; explain older CI-only releases in release notes if needed. GitHub release titles and descriptions can be edited without rewriting Git commits or tags.

Audit of the existing local refs: `v0.1.8` and `v0.1.9` both point to `0edbfd2`; `v0.1.10` points to `4d93a4b`, whose extension still reported 0.1.9. These historical tags are retained. Tag0.1.11 passed tests but hit a CI-only packaging version-check error; 0.1.12 fixes that check without changing the earlier tag. The workflow now validates both embedded versions against the pushed tag before packaging.

Before any future history rewrite, make a fresh source archive and `git bundle create history.bundle --all`, and coordinate with anyone using existing clones. Local backup directories are ignored and excluded from release archives.
