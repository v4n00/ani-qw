# Publishing a new version

Run these commands from the repository directory. Replace **0.1.14** with your next unused version. Use a new version only when you have new code to release.

One-time prerequisites on Arch Linux:

```bash
sudo pacman -S --needed git go nodejs python make gcc mpv ffmpeg
```

## 1. Start from master

```bash
git switch master
git pull --ff-only origin master
git status --short
```

If pull fails or Git reports a conflict, resolve that before continuing. Keep your intended changes; do not reset them.

## 2. Set the version in both places

```bash
RELEASE_VERSION=0.1.14
python3 scripts/set_version.py "$RELEASE_VERSION"
python3 scripts/check_version.py
```

The script updates both the extension manifest and the Go helper. It does not publish anything. Add that version's changes to CHANGELOG.md. Optionally create `docs/releases/0.1.14.md` for custom GitHub release notes; otherwise GitHub generates notes.

## 3. Test

```bash
make test integration
python3 tests/installer_test.py
bash -n install.sh scripts/package.sh
git diff --check
```

All commands must succeed. Node, Go, Python, mpv and ffmpeg must be installed. Run the browser fixture when changing the interface. You do not have to build/upload release archives locally; GitHub does that.

## 4. Review and commit

```bash
git diff --stat
git add -A
git diff --cached --stat
git commit -m "feat: describe the changes in this release"
git push origin master
```

Use `fix:` for a bug-fix release or `feat:` for new functionality. Before committing, check that the staged files are intended; local backups, credentials and build artifacts must remain ignored.

Open https://github.com/v4n00/ani-qw/actions and wait for the **master** run to pass. Its **release job being skipped is normal**: pushing master tests/builds the code but does not publish a release.

## 5. Tag the tested commit

In the same terminal (or set RELEASE_VERSION again):

```bash
git tag -a "v$RELEASE_VERSION" -m "Ani-QW v$RELEASE_VERSION"
git push origin "v$RELEASE_VERSION"
```

This triggers a second workflow for the tag. That run publishes the release after tests and both builds pass. You do not need to click “Draft a new release” or upload files yourself.

## 6. Verify publication

Open https://github.com/v4n00/ani-qw/releases and check the new version has all five assets:

- ani-qw-linux-amd64.tar.gz
- ani-qw-linux-arm64.tar.gz
- ani-qw-extension.zip
- ani-qw-source.tar.gz
- SHA256SUMS

A Git tag alone does not mean publication succeeded. Check the tagged workflow if assets are missing.

## If a workflow fails

- Open the failed job and its first failed step; inspect its actual error.
- For a temporary network/download error, use **Re-run failed jobs** on that same run. No new version/tag is needed.
- If a code/workflow fix is needed, commit the fix. If no tag was pushed yet, keep the intended version and test master again.
- If that version was already tagged, use the next unused patch version for the fix and repeat this guide. Do not delete/move old tags or force-push master.
- A version mismatch means the helper, manifest, and pushed tag disagree. `set_version.py` updates both files; include them in the commit **before** tagging.

The installer selects GitHub's latest published release, not the newest Git tag or the current master version.

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
