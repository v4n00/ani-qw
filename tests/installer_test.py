"""Test installer filesystem behavior with a fake helper; never touch real registrations."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
import tarfile
import hashlib

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
            env = dict(os.environ, XDG_DATA_HOME=str(base / 'data'), ANI_QW_TEST_CALL=str(base / 'call'))
            result = subprocess.run(['bash', str(ROOT / 'install.sh'), '--from', str(package), '--browser', 'chromium'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((base / 'call').read_text().strip(), 'install chromium')
            self.assertTrue((base / 'data/ani-qw/extension/manifest.json').is_file())
            result = subprocess.run(['bash', str(ROOT / 'install.sh'), '--browser', 'not-a-browser'], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)

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
            env = dict(os.environ, PATH=str(fakebin)+os.pathsep+os.environ['PATH'], XDG_DATA_HOME=str(base/'data'), ANI_QW_ASSETS=str(base), ANI_QW_TEST_CALL=str(base/'call'))
            command = ['bash', str(ROOT/'install.sh')]
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((base/'call').exists())
            (base/'call').unlink()
            checksum.write_text('0'*64+'  '+asset.name+'\n')
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((base/'call').exists(), 'corrupt downloads must never run the helper')

if __name__ == '__main__':
    unittest.main()
