"""Collect upstream notices for modules linked by the Go helper."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
env = dict(os.environ, GOMODCACHE=str(root / '.cache/go/mod'), GOCACHE=str(root / '.cache/go/build'))
raw = subprocess.check_output(['go', 'list', '-tags', 'nosqlite', '-deps', '-json', './cmd/ani-qw'], cwd=root, env=env, text=True)
decoder = json.JSONDecoder()
modules = {}
while raw.strip():
    raw = raw.lstrip()
    package, length = decoder.raw_decode(raw)
    raw = raw[length:]
    module = package.get('Module')
    if module and not module.get('Main'):
        modules[module['Path']] = module

sections = ['Third-party licenses for Ani-QW\nSee THIRD_PARTY.md for references and source availability.\n']
missing = []
for name, module in sorted(modules.items()):
    directory = Path(module['Dir'])
    files = [p for p in directory.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'AUTHORS', 'COPYRIGHT'))]
    if not any(p.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING')) for p in files):
        missing.append(name)
    sections.append(f"\n{'=' * 72}\n{name} {module['Version']}\n")
    for path in sorted(files):
        sections.append(f'\n--- {path.name} ---\n' + path.read_text(errors='replace'))

destination = root / 'bin/THIRD_PARTY_LICENSES.txt'
destination.parent.mkdir(exist_ok=True)
destination.write_text('\n'.join(sections))
print(f'Collected notices for {len(modules)} linked modules into {destination}')
if missing:
    raise SystemExit('Check missing root license files: ' + ', '.join(missing))
