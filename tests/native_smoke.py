"""Exercise the actual compiled native bridge and detached worker, without a browser."""
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
base = root / '.cache/native-smoke'
env = dict(os.environ, XDG_RUNTIME_DIR=str(base / 'runtime'), XDG_STATE_HOME=str(base / 'state'), XDG_CACHE_HOME=str(base / 'cache'))

def receive(process, timeout=15):
    if not select.select([process.stdout], [], [], timeout)[0]:
        raise TimeoutError('Native host did not answer')
    header = process.stdout.read(4)
    if len(header) != 4:
        raise RuntimeError('Native host closed before answering')
    length = int.from_bytes(header, sys.byteorder)
    return json.loads(process.stdout.read(length))

def request(process, command, **fields):
    message = json.dumps(dict(v=1, id=command, command=command, **fields)).encode()
    process.stdin.write(len(message).to_bytes(4, sys.byteorder) + message)
    process.stdin.flush()
    return receive(process, timeout=100 if command == 'search' else 15)

for attempt in range(3):
    arguments = [str(base / 'co.aniqw.player.json'), 'ani-qw@v4n00.github.io'] if attempt == 2 else ['native']
    process = subprocess.Popen([str(root / 'bin/ani-qw'), *arguments], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        result = request(process, 'state')
        assert result['v'] == 1 and result['event'] == 'result', result
        assert result['data']['state']['phase'] == 'idle', result
        print(f'PASS native bridge connection {attempt + 1}: protocol and state')
        if attempt == 0 and '--live-search' in sys.argv:
            result = request(process, 'search', media=dict(id=1, title='Cowboy Bebop', titles=['Cowboy Bebop'], format='TV', status='FINISHED', episodes=26), episode=1, query='Cowboy Bebop 01')
            if result['event'] != 'result':
                raise RuntimeError(result.get('error', 'Search failed'))
            print(f"PASS live Nyaa RSS search: {len(result['data'])} releases parsed")
    finally:
        process.stdin.close()
        process.wait(timeout=5)
        process.stdout.close()
    time.sleep(0.1)
print('PASS Firefox manifest-path/add-on-ID invocation')
print('PASS native EOF exits bridge; next bridge reconnects to worker')
