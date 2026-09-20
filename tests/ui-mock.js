// Render original UI at 2x for sharp documentation captures, without upscaling pixels.
if (new URLSearchParams(location.search).get('capture') === '2') document.documentElement.style.zoom = '2';
history.replaceState({}, '', '/anime/1/Example-Show/');
const listeners = [];
let fixtureAuto = true, fixtureInvalidated = false;
let savedComment=null;
let freshRequests = 0;
let fixtureProgress = null;
let fixtureState = { phase: 'idle' };
let fixturePanelPosition = null;
const media = id => ({ id, title: { romaji: id === 1 ? 'Example Show' : 'Another Show' }, format: 'TV', status: 'RELEASING', episodes: id === 1 ? 12 : 60, mediaListEntry: { progress: id === 1 ? 4 : 28 } });
window.chrome = { runtime: { connect() { return {
  onMessage: { addListener(fn) { listeners.push(fn); } }, onDisconnect: { addListener() {} },
  postMessage(message) { if(fixtureInvalidated)throw new Error('Extension context invalidated.'); setTimeout(() => {
    let data = {};
    if(message.type==='reviews') data=[];
    if(message.type==='claimReview') data={claimed:true};
    if(message.type==='saveReview') {savedComment=message.comment;emit('reviewDismissed',{id:message.reviewId});}
    if(message.type==='dismissReview') emit('reviewDismissed',{id:message.reviewId});
    if (message.type === 'hello') data.panelPosition = fixturePanelPosition;
    if (message.type === 'panelPosition') fixturePanelPosition = message.position;
    if (message.type === 'media' && message.fresh) freshRequests++;
    if (message.type === 'media') data = { media: media(message.mediaId), next: message.mediaId === 3 ? null : fixtureProgress !== null ? fixtureProgress + 1 : message.mediaId === 1 ? 5 : 29, available: message.mediaId === 1 ? 7 : 45, autoSelect: fixtureAuto };
    if (message.type === 'autoSelect') fixtureAuto = message.value;
    if (message.type === 'search') data = [{ name: '[Group] Example Show - 05 [1080p]', hash: '1'.repeat(40), size: '1.2 GiB', resolution: '1080p', seeders: 42, leechers: 3 }];
    if (message.type === 'files') data = [{ index: 0, name: 'Example Show - 05.mkv', size: 1288490188, suggested: true }];
    if (message.type === 'play') { fixtureState = { sessionId: crypto.randomUUID(), media: { id: message.mediaId, title: 'Example Show' }, episode: message.episode, phase: 'playing', filename: 'Example Show - 05.mkv', percent: 32.4, downloaded: 414720000, size: 1288490188, downloadSpeed: 2097152, uploadSpeed: 524288, seeds: 14, peers: 23, position: 345, duration: 1440 }; emit('state', fixtureState); }
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
    for (let i=0;i<20 && document.getElementById('ani-qw-controls')?.shadowRoot.querySelector('.play')?.disabled;i++) await pause();
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
    assert(!root.querySelector('.play').disabled && root.querySelector('.play').textContent === 'Streaming', 'Streaming is available as panel toggle');
    root.querySelector('.play').click(); assert(overlay.querySelector('.panel').hidden,'Streaming hides panel');
    root.querySelector('.play').click(); assert(!overlay.querySelector('.panel').hidden,'Streaming reopens panel');
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
    assert(overlay.querySelector('.panel').hidden, 'anime navigation minimizes playback');
    const editor = document.createElement('div'); editor.className = 'list-editor'; editor.textContent = 'Fixture list editor'; document.body.append(editor);
    await pause(); const beforeRefresh = freshRequests; fixtureProgress = 30; editor.remove();
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert(freshRequests === beforeRefresh + 1, 'closing list editor makes one fresh progress request');
    assert(document.querySelector('#ani-qw-controls').shadowRoot.querySelector('.play').textContent.includes('31'), 'manual progress edit updates Play target');
    fixtureState = { ...fixtureState, sessionId:'next-fixture', phase:'buffering', media:{id:2,title:'Another Show'}, episode:31, seeding:false };
    emit('state',fixtureState);
    const liveRoot = document.querySelector('#ani-qw-controls').shadowRoot;
    assert(liveRoot.querySelector('.play').disabled && liveRoot.querySelector('.play').textContent==='Starting…', 'buffering remains Starting until mpv advances');
    assert(!overlay.querySelector('.stats').textContent.includes('↑'), 'disabled sharing hides upload rate');
    fixtureState = {...fixtureState,phase:'playing'};emit('state',fixtureState);
    emit('synced',{sessionId:'next-fixture',mediaId:2,episode:31,nextEpisode:32});await pause();
    assert(overlay.querySelector('.notice').textContent.includes('Episode 31 marked watched'), 'watched confirmation appears inside main status card');
    fixtureState = {...fixtureState,phase:'idle',endReason:'closed'};emit('state',fixtureState);
    assert(overlay.querySelector('.notice').textContent.includes('mpv was closed'), 'closed state remains alongside watched confirmation');
    assert(overlay.textContent.includes('Minimizing in 10s'), 'watched episode with successor gets ten seconds');
    const playNext = [...overlay.querySelectorAll('button')].find(b=>b.textContent==='Play next episode');
    assert(!playNext.hidden, 'watched episode offers next episode');
    fixtureAuto = true; playNext.click(); await pause();
    assert(fixtureState.episode===32, 'Play next starts exactly the following episode');
    history.pushState({},'', '/home'); document.querySelector('h1').textContent='Home'; await pause();
    assert(overlay.querySelector('.panel').hidden, 'non-anime navigation minimizes playback');
    assert(!document.querySelector('#ani-qw-controls'), 'non-anime navigation removes episode controls');
    history.pushState({},'', '/anime/3/Unaired/'); document.querySelector('h1').textContent='Unaired'; await pause();await pause();
    const unairedRoot=document.querySelector('#ani-qw-controls').shadowRoot;
    assert(unairedRoot.querySelector('.arrow').hidden && unairedRoot.querySelector('.arrow').disabled, 'unreleased anime hides and disables dropdown');
    // Reproduce AniList's absolute cover with a sidebar calculated before controls load.
    const coverInner=document.querySelector('.cover-wrap-inner');
    const side=document.createElement('div');side.className='sidebar';side.style.cssText='position:absolute;top:450px;left:0;width:215px';
    const sidebarContent=document.createElement('div');sidebarContent.textContent='Format TV';side.append(sidebarContent);document.querySelector('.cover-wrap').append(side);
    document.querySelector('.cover-wrap').style.position='relative';coverInner.style.cssText='position:absolute;top:0;left:0;width:215px';
    await pause();
    assert(sidebarContent.getBoundingClientRect().top>=coverInner.getBoundingClientRect().bottom+19,'absolute cover controls clear sidebar content');
    coverInner.querySelector('.poster').style.height='400px';await pause();
    assert(sidebarContent.getBoundingClientRect().top>=coverInner.getBoundingClientRect().bottom+19,'late cover resize preserves sidebar clearance');
    side.remove();coverInner.style.cssText='';coverInner.querySelector('.poster').style.height='';
    assert(!overlay.querySelector('progress'),'download bar removed');
    assert(overlay.querySelector('.filename').nextElementSibling.classList.contains('stats'),'filename sits immediately above widgets');
    assert(overlay.querySelector('.filename').tagName==='BUTTON','filename is torrent chooser button');
    const footer=overlay.querySelector('.playback-actions');
    assert(footer.children.length===2 && footer.firstElementChild.textContent==='Replay','footer has Replay then Next only');
    assert(footer.firstElementChild.disabled,'Replay disabled while streaming');
    assert(Math.abs(footer.children[0].getBoundingClientRect().width-footer.children[1].getBoundingClientRect().width)<1,'footer buttons have equal widths');
    fixtureState={...fixtureState,phase:'idle',endReason:'closed'};emit('state',fixtureState);
    emit('review',{id:'review-test',mediaId:2,userId:1,title:'Another Show',sessionId:fixtureState.sessionId});
    await pause();
    const noteDialog=overlay.querySelector('dialog[aria-label="Add completion note"]');
    assert(noteDialog?.open,'completed show offers optional Notes prompt');
    noteDialog.querySelector('textarea').value='Memorable finale';
    [...noteDialog.querySelectorAll('button')].find(b=>b.textContent==='Save to AniList Notes').click();await pause();
    assert(savedComment==='Memorable finale','only explicit Save submits completion comment');
    history.pushState({},'', '/notifications');
    const rows=document.createElement('div');
    rows.innerHTML='<div class="notification hasMedia"><div class="details"><div>Episode 17 of <a href="/anime/189046/ReZERO/">Re:ZERO</a> aired.</div><div class="time">4 days ago</div></div></div><div class="notification hasMedia"><div class="details"><div><a href="/anime/2/Another/">Another</a> was recently added to the site.</div></div></div>';
    document.body.append(rows);await pause();await pause();
    assert(rows.querySelectorAll('.aniqw-notification').length===1,'only aired-episode notifications receive Play buttons');
    const notificationButton=rows.querySelector('.aniqw-notification').shadowRoot.querySelector('button');
    assert(notificationButton.textContent==='Play episode 17','notification identifies its exact episode');
    assert(rows.querySelector('.aniqw-notification').previousElementSibling.classList.contains('time'),'notification action follows timestamp');
    assert(notificationButton.getBoundingClientRect().top>rows.querySelector('.time').getBoundingClientRect().bottom,'notification button stays below timestamp');
    notificationButton.click();assert(notificationButton.disabled && notificationButton.classList.contains('starting'),'notification shows Starting immediately');await pause();await pause();
    assert(fixtureState.media.id===189046 && fixtureState.episode===17,'notification plays its anime and episode without navigation');
    assert(notificationButton.textContent==='Streaming' && notificationButton.classList.contains('streaming'),'notification shows purple Streaming');
    notificationButton.click();assert(overlay.querySelector('.panel').hidden,'notification Streaming toggles playback panel');
    notificationButton.click();assert(!overlay.querySelector('.panel').hidden,'notification Streaming reopens playback panel');
    fixtureState={...fixtureState,sessionId:'final-episode',episode:45};emit('state',fixtureState);await pause();
    assert(footer.lastElementChild.disabled,'Next disabled at last available episode');
    fixtureState={...fixtureState,phase:'idle'};emit('state',fixtureState);
    assert(!footer.firstElementChild.disabled,'Replay enabled after playback closes');
    fixtureInvalidated=true;
    history.pushState({},'', '/anime/4/Reload-Test/');document.querySelector('h1').textContent='Reload Test';await pause();await pause();
    const refreshRoot=document.querySelector('#ani-qw-controls').shadowRoot;
    assert(refreshRoot.querySelector('.play').textContent==='Refresh AniList','invalidated extension offers page refresh action');
    assert(!refreshRoot.querySelector('.note').textContent.includes('context invalidated'),'internal invalidated error is replaced by actionable text');



  } catch (e) { output.textContent += `FAIL ${e.message}\n`; }
};
