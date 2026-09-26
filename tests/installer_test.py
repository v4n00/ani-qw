"""Test installer filesystem behavior with a fake helper; never touch real registrations."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
import tarfile
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]

class InstallerTest(unittest.TestCase):
    def test_local_package_and_invalid_browser(self):
        with tempfile.TemporaryDirectory(prefix='ani-qw installer ') as tmp:
            base = Path(tmp)
            package = base / 'package with spaces'
            (package / 'bin').mkdir(parents=True)
            (package / 'extension').mkdir()
            (package / 'extension/manifest.json').write_text('{"name":"fixture"}')
            helper = package / 'bin/ani-qw'
            helper.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$ANI_QW_TEST_CALL"\n')
            helper.chmod(0o755)
            env = dict(os.environ, HOME=str(base/'home'), XDG_CONFIG_HOME=str(base/'config'), PATH='/usr/bin:/bin', XDG_DATA_HOME=str(base / 'data'), ANI_QW_TEST_CALL=str(base / 'call'))
            result = subprocess.run(['bash', str(ROOT / 'install.sh'), '--from', str(package), '--browser', 'chromium'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('is not in PATH', result.stdout)
            self.assertFalse((base/'call').exists(), 'installation must not execute the helper')
            self.assertEqual((base/'home/.local/bin/ani-qw').read_bytes(), helper.read_bytes())
            manifest=json.loads((base/'config/chromium/NativeMessagingHosts/co.aniqw.player.json').read_text())
            self.assertEqual(manifest['path'], str(base/'home/.local/bin/ani-qw'))
            self.assertEqual(manifest['allowed_origins'], ['chrome-extension://ibgjkjpggobbbdhphjohjahfliapkjdc/'])
            self.assertTrue((base / 'data/ani-qw/extension/manifest.json').is_file())
            result = subprocess.run(['bash', str(ROOT / 'install.sh'), '--browser', 'not-a-browser'], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)

    def test_interactive_browser_selection(self):
        import pty
        import select
        import time
        with tempfile.TemporaryDirectory(prefix='ani-qw interactive ') as tmp:
            base = Path(tmp)
            package = base / 'package'
            (package / 'bin').mkdir(parents=True)
            (package / 'extension').mkdir()
            (package / 'extension/manifest.json').write_text('{}')
            helper = package / 'bin/ani-qw'
            helper.write_text('#!/bin/sh\nprintf "%s" "$*" > "$ANI_QW_TEST_CALL"\n')
            helper.chmod(0o755)
            fakebin = base / 'fakebin'
            fakebin.mkdir()
            browser = fakebin / 'chromium'
            browser.write_text('#!/bin/sh\nexit 0\n')
            browser.chmod(0o755)
            env = dict(os.environ, HOME=str(base/'home'), XDG_CONFIG_HOME=str(base/'config'), PATH=str(fakebin)+':/usr/bin:/bin', XDG_DATA_HOME=str(base/'data'), ANI_QW_TEST_CALL=str(base/'call'), NO_COLOR='1')
            pid, fd = pty.fork()
            if pid == 0:
                os.execve('/bin/bash', ['bash', str(ROOT/'install.sh'), '--from', str(package)], env)
            output = b''
            answered = False
            finished = False
            try:
                deadline = time.monotonic()+10
                while time.monotonic() < deadline:
                    if select.select([fd], [], [], .1)[0]:
                        try:
                            data = os.read(fd, 65536)
                        except OSError:
                            break
                        if not data:
                            break
                        output += data
                    if b'Browser [1]:' in output and not answered:
                        import re
                        choice=re.search(rb'(\d+)\) chromium\r?\n',output)
                        self.assertIsNotNone(choice)
                        os.write(fd, choice[1]+b'\n')
                        answered = True
                done, status = os.waitpid(pid, os.WNOHANG)
                if done:
                    finished = True
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0, output.decode())
                self.assertTrue(answered, output.decode())
                self.assertTrue((base/'config/chromium/NativeMessagingHosts/co.aniqw.player.json').exists())
                self.assertFalse((base/'call').exists())
            finally:
                if not finished:
                    import signal
                    try: os.kill(pid, signal.SIGTERM)
                    except ProcessLookupError: pass
                    os.waitpid(pid, 0)
                os.close(fd)

    def test_browser_registration_uninstall_and_quoted_home(self):
        with tempfile.TemporaryDirectory(prefix='ani-qw registrations ') as tmp:
            base=Path(tmp)
            home=base/'home "quoted" \\ path\nnew'
            package=base/'package'
            (package/'bin').mkdir(parents=True)
            (package/'extension').mkdir()
            (package/'extension/manifest.json').write_text('{}')
            helper=package/'bin/ani-qw'
            helper.write_text('#!/bin/sh\nexit 99\n')
            helper.chmod(0o755)
            env=dict(os.environ, HOME=str(home), XDG_CONFIG_HOME=str(base/'config'), XDG_DATA_HOME=str(base/'data'))
            profiles={'chromium':'chromium','google-chrome':'google-chrome','google-chrome-beta':'google-chrome-beta','google-chrome-unstable':'google-chrome-unstable','brave':'BraveSoftware/Brave-Browser','brave-origin':'BraveSoftware/Brave-Origin','vivaldi':'vivaldi','vivaldi-snapshot':'vivaldi-snapshot'}
            def run(*args):
                result=subprocess.run(['bash',str(ROOT/'install.sh'),*args],env=env,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            for browser,profile in profiles.items():
                run('--from',str(package),'--browser',browser)
                manifest=base/'config'/profile/'NativeMessagingHosts/co.aniqw.player.json'
                self.assertEqual(json.loads(manifest.read_text())['path'],str(home/'.local/bin/ani-qw'))
            firefox_manifest=json.loads((ROOT/'extension/manifest.firefox.json').read_text())
            (package/'extension/manifest.firefox.json').write_text(json.dumps(firefox_manifest))
            run('--from',str(package),'--browser','firefox')
            host=home/'.mozilla/native-messaging-hosts/co.aniqw.player.json'
            self.assertEqual(json.loads(host.read_text())['allowed_extensions'],['ani-qw@v4n00.github.io'])
            self.assertEqual(json.loads((base/'data/ani-qw/extension-firefox/manifest.json').read_text())['background'],firefox_manifest['background'])
            self.assertEqual((base/'data/ani-qw/extension/manifest.json').read_text(),'{}','Firefox must not replace Chromium manifest')
            retained=base/'data/ani-qw/keep'
            retained.write_text('user data')
            for index,(browser,profile) in enumerate(profiles.items()):
                run('--uninstall','--browser',browser)
                self.assertFalse((base/'config'/profile/'NativeMessagingHosts/co.aniqw.player.json').exists())
                self.assertTrue((home/'.local/bin/ani-qw').exists(),'Firefox still needs the helper')
            run('--uninstall','--browser','firefox')
            self.assertFalse(host.exists())
            self.assertFalse((home/'.local/bin/ani-qw').exists())
            self.assertTrue(retained.exists())
            run('--uninstall','--browser','chromium')

    def test_download_checksum_and_install(self):
        with tempfile.TemporaryDirectory(prefix='ani-qw download ') as tmp:
            base = Path(tmp)
            package = base / 'package'
            (package / 'bin').mkdir(parents=True)
            (package / 'extension').mkdir()
            (package / 'extension/manifest.json').write_text('{}')
            helper = package / 'bin/ani-qw'
            helper.write_text('#!/bin/sh\nprintf installed > "$ANI_QW_TEST_CALL"\n')
            helper.chmod(0o755)
            import platform
            arch = 'amd64' if platform.machine() == 'x86_64' else 'arm64'
            asset = base / f'ani-qw-linux-{arch}.tar.gz'
            with tarfile.open(asset, 'w:gz') as archive:
                archive.add(package, arcname='.')
            checksum = base / 'SHA256SUMS'
            checksum.write_text(hashlib.sha256(asset.read_bytes()).hexdigest() + '  ' + asset.name + '\n')
            fakebin = base / 'fakebin'
            fakebin.mkdir()
            curl = fakebin / 'curl'
            curl.write_text('''#!/usr/bin/env python3
import os,sys,shutil
from pathlib import Path
args=sys.argv[1:]
if '--write-out' in args:
    print('https://github.com/v4n00/ani-qw/releases/tag/v0.1.5',end='')
else:
    url=next(a for a in args if a.startswith('https://'))
    shutil.copyfile(Path(os.environ['ANI_QW_ASSETS'])/url.rsplit('/',1)[1],args[args.index('-o')+1])
''')
            curl.chmod(0o755)
            env = dict(os.environ, HOME=str(base/'home'), XDG_CONFIG_HOME=str(base/'config'), PATH=str(fakebin)+os.pathsep+os.environ['PATH'], XDG_DATA_HOME=str(base/'data'), ANI_QW_ASSETS=str(base), ANI_QW_TEST_CALL=str(base/'call'))
            command = ['bash', str(ROOT/'install.sh')]
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((base/'call').exists())
            installed=base/'home/.local/bin/ani-qw'
            self.assertEqual(installed.read_bytes(), helper.read_bytes())
            installed.unlink()
            checksum.write_text('0'*64+'  '+asset.name+'\n')
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(installed.exists(), 'corrupt downloads must never install the helper')

if __name__ == '__main__':
    unittest.main()
