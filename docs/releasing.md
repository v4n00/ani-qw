# Publishing a release

1. Run `make test integration` and `python3 tests/installer_test.py`. Check the UI fixture in Chromium.
2. Set `extension/manifest.json` to the release version. Review source changes, notices and README images for private information.
3. Build `bash scripts/package.sh amd64` and `bash scripts/package.sh arm64`; inspect the archives and `dist/SHA256SUMS`.
4. Commit the intended files, then push `master`. Push a matching tag, for example `v0.1.6` for extension version `0.1.6`.
5. The workflow tests, packages both architectures, and creates a GitHub Release with binary bundles, extension ZIP, source archive and checksums. A tag/version mismatch fails publication.
6. Test the documented installer against that published release from a fresh user account.

The repository is `v4n00/ani-qw`. The one-line installer becomes usable only once the repository's `master/install.sh` and a successful release are public. No credentials are needed to download public releases. The workflow uses GitHub's short-lived token; write permission is restricted to the release job.

## Public and private configuration

AniList client ID 51034, the extension public key and ID are public identifiers. No client secret belongs in this project. AniList access tokens live in Chromium's extension storage; the native helper never receives them. Keep `.env`, private keys, runtime data, caches and local progress notes out of Git. `PROGRESS.md` is a local handoff file.

## Extension distribution

Release bundles contain a plain unpacked extension. The installer copies it into a stable user directory and prints the manual loading instructions. Signed CRX distribution would require the private signing key matching the existing public manifest key; it is not available here. Replacing the key would change the extension ID and break existing native-host authorization. No Chrome Web Store publication is planned.

## Validation limits

Local tests cover controlled torrent streaming/seeking and UI fixtures. GitHub Actions and the public download installer can only be confirmed after a release is pushed; preparing workflow files does not run them remotely. Real Nyaa availability and AniList limits vary. Buffering performance relative to Seanime remains unbenchmarked.
