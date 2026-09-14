history.replaceState({}, '', '/anime/1/Example-Show/');
const listeners = [];
let fixtureAuto = true;
let fixtureState = { phase: 'idle' };
let fixturePanelPosition = null;
const media = id => ({ id, title: { romaji: id === 1 ? 'Example Show' : 'Another Show' }, format: 'TV', status: 'RELEASING', episodes: id === 1 ? 12 : 60, mediaListEntry: { progress: id === 1 ? 4 : 28 } });
window.chrome = { runtime: { connect() { return {
  onMessage: { addListener(fn) { listeners.push(fn); } }, onDisconnect: { addListener() {} },
  postMessage(message) { setTimeout(() => {
    let data = {};
    if (message.type === 'hello') data.panelPosition = fixturePanelPosition;
    if (message.type === 'panelPosition') fixturePanelPosition = message.position;
    if (message.type === 'media') data = { media: media(message.mediaId), next: message.mediaId === 1 ? 5 : 29, available: message.mediaId === 1 ? 7 : 45, autoSelect: fixtureAuto };
    if (message.type === 'autoSelect') fixtureAuto = message.value;
    if (message.type === 'search') data = [{ name: '[Group] Example Show - 05 [1080p]', hash: '1'.repeat(40), size: '1.2 GiB', resolution: '1080p', seeders: 42, leechers: 3 }];
    if (message.type === 'files') data = [{ index: 0, name: 'Example Show - 05.mkv', size: 1288490188, suggested: true }];
    if (message.type === 'play') { fixtureState = { sessionId: 'fixture', media: { id: message.mediaId, title: 'Example Show' }, episode: message.episode, phase: 'playing', filename: 'Example Show - 05.mkv', percent: 32.4, downloaded: 414720000, size: 1288490188, downloadSpeed: 2097152, uploadSpeed: 524288, seeds: 14, peers: 23, position: 345, duration: 1440 }; emit('state', fixtureState); }
    if (message.type === 'stop') { fixtureState = { ...fixtureState, phase: 'idle', endReason: 'stopped', downloadSpeed: 0, uploadSpeed: 0 }; emit('state', fixtureState); }
    for (const listener of listeners) listener({ id: message.id, data });
  }, 50); }
}; } } };
function emit(event, data) { for (const listener of listeners) listener({ event, data }); }
document.getElementById('theme').onclick = () => { const light = document.body.dataset.light !== 'true'; document.body.dataset.light = String(light); for (const [k, v] of Object.entries(light ? { background: '237,241,245', foreground: '250,250,250', text: '92,114,138' } : { background: '11,22,34', foreground: '21,31,46', text: '159,173,189' })) document.documentElement.style.setProperty(`--color-${k}`, v); };
document.getElementById('navigate').onclick = () => { history.pushState({}, '', '/anime/2/Another-Show/'); document.querySelector('h1').textContent = 'Another Show'; };
document.getElementById('stats').onclick = () => { chrome.runtime.connect().postMessage({ type: 'play', mediaId: 1, episode: 5 }); };
document.getElementById('checks-button').onclick = async () => {
  const output = document.getElementById('checks'); output.textContent = '';
  const assert = (condition, message) => { if (!condition) throw new Error(message); output.textContent += `PASS ${message}\n`; };
  const pause = () => new Promise(resolve => setTimeout(resolve, 300));
  try {
    const host = document.getElementById('ani-qw-controls'), root = host.shadowRoot;
    assert(host.previousElementSibling.classList.contains('actions'), 'controls follow action row');
    assert(root.querySelector('.play').textContent.includes('Episode 5'), 'main play targets episode 5');
    root.querySelector('.arrow').click(); assert(!root.querySelector('.menu').hidden, 'dropdown opens');
    assert(root.querySelectorAll('.episode:disabled').length === 5, 'unreleased episodes disabled');
    const toggle = root.querySelector('input[type=checkbox]'); toggle.click(); await pause();
    root.querySelector('.play').click(); assert(root.querySelector('.play').disabled && root.querySelector('.play').textContent.includes('Starting'), 'Starting blocks duplicate launch'); assert(root.querySelector('.arrow').hidden && root.querySelector('.arrow').disabled, 'Starting hides and disables dropdown'); await pause();
    const overlay = document.getElementById('ani-qw-overlay').shadowRoot;
    assert(overlay.querySelector('dialog')?.open, 'manual chooser opens');
    assert(overlay.querySelector('.release-name').textContent.includes('1080p'), 'search result renders');
    overlay.querySelector('.release').click(); await pause();
    assert(overlay.querySelector('.badge').textContent.includes('Suggested'), 'file suggestion renders');
    overlay.querySelector('.release').click(); await pause();
    for (let i = 0; i < 10 && overlay.querySelector('dialog'); i++) await pause();
    assert(!overlay.querySelector('dialog'), 'chooser closes after playback');
    assert(!overlay.querySelector('.panel').hidden, 'stream panel visible');
    assert(overlay.querySelector('.stats').textContent.includes('14 seeds'), 'live peer statistics rendered');
    assert(root.querySelector('.play').disabled && root.querySelector('.play').textContent === 'Streaming', 'Streaming blocks duplicate play');
    assert(root.querySelector('.arrow').hidden && root.querySelector('.menu').hidden, 'Streaming closes and hides dropdown');
    assert(overlay.querySelector('.notice strong').textContent === 'Streaming in mpv', 'playback state has a separate prominent card');
    overlay.querySelector('.dismiss').click();
    emit('state', fixtureState);
    assert(overlay.querySelector('.panel').hidden && !overlay.querySelector('.restore').hidden, 'dismiss survives statistics refresh');
    overlay.querySelector('.restore').click();
    assert(!overlay.querySelector('.panel').hidden, 'dismissed playback can reopen');
    overlay.querySelector('.move').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true})); await pause();
    assert(Number.isFinite(fixturePanelPosition?.left), 'keyboard movement persists panel position');
    assert(overlay.querySelector('.panel').getBoundingClientRect().left >= 12, 'panel stays within viewport');
    [...overlay.querySelectorAll('button')].find(b=>b.textContent === 'Stop').click();
    emit('state', fixtureState);
    assert(root.querySelector('.play').textContent === 'Stopping…', 'late playback statistics cannot overwrite Stopping');
    await pause();
    assert(![...overlay.querySelectorAll('button')].find(b=>b.textContent === 'Replay').hidden, 'Stop offers Replay');
    assert(root.querySelector('.play').textContent.includes('Play Episode'), 'Stop restores Play button');
    assert(!root.querySelector('.arrow').hidden && !root.querySelector('.arrow').disabled, 'Stop restores dropdown');
    document.getElementById('navigate').click(); await pause();
    assert(document.querySelectorAll('#ani-qw-controls').length === 1, 'navigation retains one control instance');
    const longRoot = document.querySelector('#ani-qw-controls').shadowRoot;
    assert(longRoot.querySelectorAll('.episode').length === 20, 'long series creates only 20 episode buttons');
    assert([...longRoot.querySelectorAll('.episode')].some(b=>b.textContent === '28'), 'page opens around watched episode');
    longRoot.querySelector('[aria-label="Next episodes"]').click();
    assert(longRoot.querySelectorAll('.episode:disabled').length > 0, 'later page marks unaired episodes unavailable');
    assert(!longRoot.textContent.includes('Ani-QW settings'), 'settings removed from dropdown');
  } catch (e) { output.textContent += `FAIL ${e.message}\n`; }
};
