(() => {
  if (window.__aniqwLoaded) return;
  window.__aniqwLoaded = true;
  let port, mediaId = null, model = null, controlHost = null, control = null;
  let status = { phase: 'idle' }, activeRequest = null, modal = null, account = '', generation = 0;
  const waiting = new Map();
  let panelPosition = null, dismissed = false, drag = null, launchMediaId = null, closeTimer = null, stoppingSession = null;
  const css = `
    :host{--bg:rgb(var(--color-foreground,250,250,250));--text:rgb(var(--color-text,92,114,138));--blue:rgb(var(--color-blue,61,180,242));--soft:rgb(var(--color-background,237,241,245));font-family:inherit;font-size:14px;line-height:1.5;color:var(--text);text-align:left;color-scheme:normal}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:0;color:inherit;background:transparent;border-radius:4px}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}button:hover:not(:disabled){filter:brightness(1.08)}
    .split{display:flex;width:100%;height:35px;border-radius:3px;overflow:hidden;background:var(--blue);color:white}.split button{color:white}.play{flex:1}.arrow{width:34px;border-radius:0;background:rgba(255,255,255,.14)}.chevron{font-family:element-icons;font-size:14px;font-style:normal}.chevron.fallback{display:inline-block;font-size:0;width:7px;height:7px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:translateY(-2px) rotate(45deg)}.wrap{position:relative}.menu{animation:menu-in .16s ease-out;transform-origin:top left;position:absolute;top:43px;left:0;width:270px;background:var(--bg);padding:14px;z-index:200;box-shadow:0 6px 24px #0003;border-radius:6px}.menu[hidden]{display:none}label{display:flex;align-items:center;gap:10px}input[type=checkbox]{accent-color:var(--blue);width:16px;height:16px}.episodes{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:220px;overflow:auto;margin:12px 0}.episode{background:var(--soft);padding:7px}.episode.current{background:var(--blue);color:white}.episode.seen{background:rgba(75,180,140,.18);color:#59b99a;box-shadow:inset 0 0 0 1px #59b99a40}.episode:disabled{background:transparent;color:var(--text);opacity:.35;text-decoration:line-through;border:1px dashed #8884}.pager{display:block;width:100%;padding:8px;background:var(--soft);color:var(--blue)}.split.starting{background:#419d89}.split.streaming{background:#8465bb}.split.starting .play:disabled,.split.streaming .play:disabled{opacity:1}.muted{font-size:12px;opacity:.75}.note{font-size:12px;margin:8px 0;overflow-wrap:anywhere}.note:empty{display:none}.link{color:var(--blue);padding:0}.row{display:flex;gap:10px;align-items:center}.row input{min-width:0;flex:1}.primary{background:var(--blue);color:white;padding:9px 16px}.secondary{background:var(--soft);padding:9px 14px}input[type=text],input[type=number]{border:1px solid #8883;background:var(--soft);color:var(--text);border-radius:4px;padding:9px;width:100%}h2{font-size:20px;margin:0;font-weight:600}h3{font-size:14px;margin:12px 0}p{margin:8px 0}
    .arrow[hidden]{display:none}.notice{padding:12px;border-radius:7px;background:rgba(61,180,242,.12);border-left:3px solid var(--blue);margin:0 0 12px;overflow-wrap:anywhere}.notice strong{display:block;font-size:14px}.notice span{display:block;font-size:12px;margin-top:3px}.notice[data-tone=playing]{background:rgba(132,101,187,.16);border-color:#9875d2}.notice[data-tone=error]{background:rgba(228,105,121,.14);border-color:#e46979}.notice[data-tone=closed]{background:rgba(75,180,140,.14);border-color:#59b99a}.panel .error,.panel .sync{padding:11px 12px;border-radius:6px;border-left:3px solid currentColor;background:rgba(228,105,121,.12);font-size:12px}.panel .sync{color:var(--blue);background:rgba(61,180,242,.12)}.panel .sync[data-tone=success]{color:#59b99a;background:rgba(75,180,140,.14)}.panel .sync[data-tone=retry]{color:#c5994e;background:rgba(197,153,78,.12)}.panel .sync:empty{display:none}.stats span{padding:7px 8px;background:var(--soft);border-radius:5px}.panel .row{flex-wrap:wrap}
    @keyframes menu-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.menu{animation:none}}
    dialog{pointer-events:auto;border:0;border-radius:8px;background:var(--bg);color:var(--text);width:min(820px,calc(100vw - 32px));max-height:85vh;padding:26px;box-shadow:0 15px 80px #0006;font:inherit}dialog::backdrop{background:#07101bbb;backdrop-filter:blur(3px)}.heading{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px}.close{font-size:22px;line-height:1;padding:4px 8px}.results{max-height:50vh;overflow:auto;margin-top:16px}.release{display:block;text-align:left;width:100%;padding:14px 10px;border-top:1px solid #8882;border-radius:0}.release:hover{background:var(--soft)}.release-name{display:block;overflow-wrap:anywhere;font-weight:600}.release-meta{display:flex;flex-wrap:wrap;gap:16px;font-size:12px;margin-top:5px;opacity:.8}.badge{color:var(--blue)}.error{color:#e46979;overflow-wrap:anywhere}.error:empty{display:none}
    .panel{pointer-events:auto;position:fixed;right:max(18px,calc((100vw - 1320px)/2));top:var(--aniqw-top,75px);width:min(410px,calc(100vw - 36px));z-index:990;background:var(--bg);border-radius:10px;box-shadow:0 8px 32px #0004;border:1px solid #8882;border-top:3px solid var(--blue)}.panel[hidden]{display:none}summary{display:flex;align-items:center;gap:8px;padding:12px;cursor:pointer;font-weight:600;overflow-wrap:anywhere;list-style:none}summary::-webkit-details-marker{display:none}.panel-title{flex:1;min-width:0;font-size:13px}.move{cursor:grab;touch-action:none;padding:5px;opacity:.6;font-size:19px}.move:active{cursor:grabbing}.dismiss{font-size:20px;padding:2px 6px;opacity:.7}.restore{pointer-events:auto;position:fixed;right:18px;bottom:18px;background:var(--bg);color:var(--blue);border:1px solid #8883;box-shadow:0 4px 18px #0003;padding:10px 16px}.restore[hidden]{display:none}.body{max-height:calc(100vh - 160px);overflow:auto}.body{padding:0 16px 16px}.filename{font-size:12px;opacity:.7;overflow-wrap:anywhere;max-height:55px;overflow:auto}progress{width:100%;height:6px;accent-color:var(--blue);margin:12px 0}.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin:8px 0 14px}.sync{font-size:12px;overflow-wrap:anywhere}.panel .row{justify-content:space-between}
  `;
  const el = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    if (text !== undefined) e.textContent = text; return e;
  };
  function root(host) { const r = host.attachShadow({ mode: 'open' }); r.append(el('style', {}, css)); return r; }
  const overlayHost = el('div', { id: 'ani-qw-overlay', style: 'position:fixed;inset:0;z-index:1001;pointer-events:none' }); document.body.append(overlayHost);
  const overlay = root(overlayHost);
  const panel = el('details', { class: 'panel', hidden: '' });
  const summary = el('summary', { 'aria-label': 'Expand or collapse playback details' });
  const panelTitle = el('span', { class: 'panel-title' }, 'Ani-QW');
  const move = el('button', { class: 'move', 'aria-label': 'Move playback panel', title: 'Drag to move, or use arrow keys' }, '⠿');
  const dismiss = el('button', { class: 'dismiss', 'aria-label': 'Dismiss playback panel' }, '×');
  summary.append(move, panelTitle, dismiss);
  const restore = el('button', { class: 'restore', hidden: '' }, 'Show playback');
  overlay.append(restore);
  function setDismissed(value) { dismissed = value; panel.hidden = value; restore.hidden = !value; }
  dismiss.onclick = e => { e.preventDefault(); e.stopPropagation(); setDismissed(true); restore.focus(); };
  restore.onclick = () => { clearTimeout(closeTimer); setDismissed(false); summary.focus(); };
  function positionPanel() {
    if (!panelPosition) return;
    const width = Math.min(410, innerWidth - 36);
    panelPosition = { left: Math.max(12, Math.min(panelPosition.left, innerWidth - width - 12)), top: Math.max(12, Math.min(panelPosition.top, innerHeight - Math.min(panel.offsetHeight || 80, 360) - 12)) };
    panel.style.left = `${panelPosition.left}px`; panel.style.top = `${panelPosition.top}px`; panel.style.right = 'auto';
  }
  function savePosition() { send('panelPosition', { position: panelPosition }).catch(showError); }
  move.onclick = e => { e.preventDefault(); e.stopPropagation(); };
  move.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); const r = panel.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; move.setPointerCapture(e.pointerId); };
  move.onpointermove = e => { if (!drag) return; panelPosition = { left: drag.left + e.clientX - drag.x, top: drag.top + e.clientY - drag.y }; positionPanel(); };
  move.onpointerup = e => { if (!drag) return; drag = null; move.releasePointerCapture(e.pointerId); if (panelPosition) savePosition(); };
  move.onpointercancel = () => { drag = null; };
  move.onkeydown = e => { if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return; e.preventDefault(); const r = panel.getBoundingClientRect(); panelPosition = { left: r.left + (e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0), top: r.top + (e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0) }; positionPanel(); savePosition(); };
  window.addEventListener('resize', positionPanel);
  panel.addEventListener('toggle', positionPanel);
  const body = el('div', { class: 'body' });
  const phaseBox = el('div', { class: 'notice', role: 'status', 'aria-live': 'polite' });
  const phaseTitle = el('strong'), phaseDetail = el('span'); phaseBox.append(phaseTitle, phaseDetail);
  const filename = el('div', { class: 'filename' });
  const bar = el('progress', { max: '100', value: '0', 'aria-label': 'Torrent download progress' });
  const stats = el('div', { class: 'stats' });
  const warning = el('p', { class: 'error', role: 'status' });
  const sync = el('p', { class: 'sync', role: 'status' });
  const stop = el('button', { class: 'secondary', onclick: async () => {
    stop.disabled = true; stop.textContent = 'Stopping…';
    const before = status.phase, session = status.sessionId; stoppingSession = session; renderState({ ...status, phase: 'stopping' });
    try { await send('stop', { sessionId: status.sessionId }); }
    catch (e) { stoppingSession = null; warning.textContent = e.message; stop.disabled = false; stop.textContent = 'Stop'; if (status.sessionId === session && status.phase === 'stopping') { status = { ...status, phase: before }; updatePlayButton(); } }
  } }, 'Stop');
  const replay = el('button', { class: 'primary', hidden: '', onclick: async () => {
    if (!activeRequest || launchMediaId !== null) return;
    launchMediaId = activeRequest.mediaId; replay.disabled = true; clearTimeout(closeTimer); updatePlayButton();
    try { setDismissed(false); await send('play', activeRequest); } catch(e) { warning.textContent = e.message; }
    finally { launchMediaId = null; replay.disabled = false; updatePlayButton(); }
  } }, 'Replay');
  const choose = el('button', { class: 'link', onclick: () => activeRequest && chooser(activeRequest) }, 'Choose another torrent');
  const controls = el('div', { class: 'row' }); controls.append(choose, replay, stop);
  body.append(phaseBox, filename, bar, stats, warning, sync, controls); panel.append(summary, body); overlay.append(panel);

  function connect() {
    port = chrome.runtime.connect({ name: 'ani-qw' });
    port.onMessage.addListener(message => {
      if (message.id && waiting.has(message.id)) {
        const p = waiting.get(message.id); waiting.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(Object.assign(new Error(message.error), { code: message.code })); else p.resolve(message.data);
        return;
      }
      if (message.event === 'state') renderState(message.data);
      if (message.event === 'connection') { if (control) control.querySelector('.note').textContent = message.data.error; }
      if (message.event === 'sync') { sync.dataset.tone = 'retry'; sync.textContent = message.data.error; panel.open = true; if (!dismissed) panel.hidden = false; }
      if (message.event === 'synced') { sync.dataset.tone = 'success'; panel.open = true; sync.textContent = `Episode ${message.data.episode} marked watched on AniList.`; if (message.data.mediaId === mediaId) loadMedia(); }
      if (message.event === 'failure') {
        if (message.data.sessionId !== status.sessionId) return;
        warning.textContent = message.data.message; panel.open = true;
        if (message.data.code === 'manual' && activeRequest) chooser(activeRequest);
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
      for (const p of waiting.values()) { clearTimeout(p.timer); p.reject(new Error('Extension connection interrupted. Reload AniList if Ani-QW was updated.')); } waiting.clear();
    });
  }
  function send(type, data = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!port) connect();
        const id = crypto.randomUUID(); const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Request timed out. Try again.')); }, 120000);
        waiting.set(id, { resolve, reject, timer }); port.postMessage({ id, type, ...data });
      } catch (e) { reject(e); }
    });
  }
  const bytes = n => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GiB` : `${(n / 1048576).toFixed(1)} MiB`;
  function updatePlayButton() {
    const button = control?.querySelector('.play'), split = control?.querySelector('.split');
    if (!button || !model) return;
    const active = status.media?.id === mediaId && status.phase !== 'idle';
    const starting = launchMediaId === mediaId || (active && ['searching','metadata','verifying'].includes(status.phase));
    const streaming = active && ['buffering','playing','paused'].includes(status.phase);
    split.classList.toggle('starting', starting); split.classList.toggle('streaming', streaming);
    button.textContent = starting ? 'Starting…' : streaming ? 'Streaming' : active && status.phase === 'stopping' ? 'Stopping…' : model.next ? `Play Episode ${model.next}` : 'Not yet aired';
    button.disabled = starting || active || !model.next;
    const arrow = control.querySelector('.arrow');
    arrow.hidden = arrow.disabled = starting || active;
    if (arrow.disabled) { control.querySelector('.menu').hidden = true; arrow.setAttribute('aria-expanded', 'false'); }
  }
  function renderState(s) {
    if (stoppingSession && s.sessionId === stoppingSession && s.phase !== 'idle') s = { ...s, phase: 'stopping' };
    else stoppingSession = null;
    const previous = status;
    if (s.sessionId && s.sessionId !== status.sessionId) { dismissed = false; restore.hidden = true; sync.textContent = ''; }
    status = s; updatePlayButton();
    if (s.phase === 'idle' && !s.sessionId) return;
    panel.hidden = dismissed;
    panelTitle.textContent = `${s.media?.title || 'Ani-QW'}${s.episode ? ` · Episode ${s.episode}` : ''}`;
    const phases = {
      searching: ['Finding your episode', 'Searching for a matching release.'],
      metadata: ['Gathering torrent metadata', 'Connecting to peers to read the available files.'],
      verifying: ['Checking cached video', 'Verifying downloaded pieces before playback.'],
      buffering: ['Buffering video', 'mpv is open. Waiting for enough video data.'],
      playing: ['Streaming in mpv', 'Your episode is playing.'],
      paused: ['Playback paused', 'Resume from your mpv window.'],
      stopping: ['Stopping playback', 'Closing mpv and releasing the torrent.'],
      idle: s.endReason === 'closed' ? ['mpv was closed', 'Replay this episode, or choose another one.'] : s.endReason === 'error' ? ['Playback failed', 'Check the message below, then try again.'] : ['Playback stopped', 'Replay whenever you are ready.']
    };
    const [title, detail] = phases[s.phase] || ['Preparing playback', 'Getting your episode ready.'];
    phaseTitle.textContent = title; phaseDetail.textContent = detail;
    phaseBox.dataset.tone = ['playing','paused'].includes(s.phase) ? 'playing' : s.phase === 'idle' ? (s.endReason === 'error' ? 'error' : 'closed') : 'starting';
    if (previous.phase !== s.phase) panel.open = true;
    filename.textContent = s.filename || 'Finding your episode…'; bar.value = s.percent || 0;
    stats.replaceChildren(...[
      `${(s.percent || 0).toFixed(1)}% · ${bytes(s.downloaded || 0)} / ${bytes(s.size || 0)}`,
      `↓ ${bytes(s.downloadSpeed || 0)}/s  ↑ ${bytes(s.uploadSpeed || 0)}/s`,
      `${s.seeds || 0} seeds · ${s.peers || 0} peers`,
      s.duration ? `${Math.floor(s.position / 60)} / ${Math.floor(s.duration / 60)} min` : 'Waiting for video'
    ].map(text => el('span', {}, text)));
    warning.textContent = s.warning || '';
    stop.disabled = s.phase === 'idle' || s.phase === 'stopping'; stop.textContent = s.phase === 'stopping' ? 'Stopping…' : 'Stop';
    stop.hidden = s.phase === 'idle'; replay.hidden = s.phase !== 'idle' || !s.media?.id;
    if (s.media?.id) activeRequest = { mediaId: s.media.id, episode: s.episode };
    if (s.phase !== 'idle') clearTimeout(closeTimer);
    else if (previous.phase !== 'idle' && !s.warning) {
      clearTimeout(closeTimer); closeTimer = setTimeout(() => setDismissed(true), 7000);
    }
  }
  function showError(e) {
    if (control) control.querySelector('.note').textContent = e.message;
    else { panel.hidden = false; panel.open = true; warning.textContent = e.message; }
  }
  function accountName() {
    const a = document.querySelector('#nav a[href^="/user/"]');
    return a?.getAttribute('href')?.match(/^\/user\/([^/]+)/)?.[1] || '';
  }
  async function loadMedia() {
    if (!mediaId || !control) return;
    const id = mediaId, g = ++generation;
    try {
      const data = await send('media', { mediaId: id });
      if (g !== generation || id !== mediaId) return;
      model = data; renderControl();
    } catch (e) { if (g === generation && control) { showError(e); const b = control.querySelector('.play'); b.disabled = false; const authError = /connect|authoriz|account/i.test(e.message); b.textContent = authError ? 'Connect AniList' : 'Retry loading playback'; b.onclick = authError ? () => send('settings').catch(showError) : loadMedia; } }
  }
  async function begin(episode) {
    if (launchMediaId !== null || (status.media?.id === mediaId && status.phase !== 'idle' && (episode === undefined || episode === status.episode || ['searching','metadata','verifying','stopping'].includes(status.phase)))) return;
    launchMediaId = mediaId; updatePlayButton();
    try {
      const menu = control?.querySelector('.menu'); if (menu) menu.hidden = true;
      control?.querySelector('.arrow')?.setAttribute('aria-expanded', 'false');
      const requestedMedia = mediaId;
      const fresh = await send('media', { mediaId: requestedMedia, fresh: true });
      if (requestedMedia !== mediaId) return;
      model = fresh;
      const request = { mediaId: requestedMedia, episode: episode ?? fresh.next };
      if (!request.episode) return;
      activeRequest = request;
      if (fresh.autoSelect) { setDismissed(false); panel.open = true; warning.textContent = ''; await send('play', request); }
      else chooser(request);
    } catch (e) { showError(e); } finally { launchMediaId = null; updatePlayButton(); }
  }
  function renderControl() {
    const wrap = el('div', { class: 'wrap' });
    const split = el('div', { class: 'split' });
    const play = el('button', { class: 'play' }, model.next ? `Play Episode ${model.next}` : 'Not yet aired'); play.disabled = !model.next; play.onclick = () => begin();
    const arrow = el('button', { class: 'arrow', 'aria-label': 'Playback options', 'aria-expanded': 'false' }); arrow.append(el('span', { class: [...document.fonts].some(f => f.family.replaceAll('"', '') === 'element-icons') ? 'chevron' : 'chevron fallback', 'aria-hidden': 'true' }, '\ue603'));
    const menu = el('div', { class: 'menu', hidden: '' });
    arrow.onclick = () => { menu.hidden = !menu.hidden; arrow.setAttribute('aria-expanded', String(!menu.hidden)); };
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; arrow.setAttribute('aria-expanded', 'false'); arrow.focus(); } });
    const toggle = el('input', { type: 'checkbox' }); toggle.checked = model.autoSelect;
    toggle.onchange = () => send('autoSelect', { value: toggle.checked }).catch(showError);
    const label = el('label'); label.append(toggle, document.createTextNode('Automatically select torrent')); menu.append(label, el('h3', {}, 'Play an episode'));
    const list = el('div', { class: 'episodes' });
    const total = Math.min(model.media.episodes || model.available || Math.max(1, model.next || 1), 500);
    const watched = model.media.mediaListEntry?.progress || 0;
    let first = Math.max(1, Math.min(Math.floor(Math.max(0, watched - 9) / 4) * 4 + 1, Math.max(1, total - 19)));
    const previous = el('button', { class: 'pager', 'aria-label': 'Previous episodes' }, '↑ Previous episodes');
    const next = el('button', { class: 'pager', 'aria-label': 'Next episodes' }, 'Next episodes ↓');
    function renderEpisodes() {
      list.replaceChildren();
      for (let ep = first; ep <= Math.min(total, first + 19); ep++) {
        const unavailable = model.available !== null && ep > model.available;
        const b = el('button', { class: `episode${ep === model.next ? ' current' : ''}${ep <= watched ? ' seen' : ''}`, 'aria-label': `Play episode ${ep}${unavailable ? ' (unavailable)' : ep <= watched ? ' (watched)' : ''}` }, String(ep));
        b.disabled = unavailable;
        b.onclick = () => { menu.hidden = true; begin(ep); }; list.append(b);
      }
      previous.disabled = first <= 1; next.disabled = first + 19 >= total;
    }
    previous.onclick = () => { first = Math.max(1, first - 20); renderEpisodes(); };
    next.onclick = () => { first = Math.min(Math.max(1, total - 19), first + 20); renderEpisodes(); };
    if (total > 20) menu.append(previous);
    menu.append(list); if (total > 20) menu.append(next);
    renderEpisodes();
    if (model.available === null || (model.media.episodes || model.available) > 500) {
      const input = el('input', { type: 'number', min: '1', max: String(model.available || 100000), value: String(model.next || 1), 'aria-label': 'Episode number' });
      const form = el('form', { class: 'row' }); form.append(input, el('button', { class: 'primary', type: 'submit' }, 'Play'));
      form.onsubmit = e => { e.preventDefault(); menu.hidden = true; begin(Number(input.value)); }; menu.append(form);
      if (model.available === null) menu.append(el('p', { class: 'muted' }, 'Episode availability is unverified.'));
    }
    split.append(play, arrow); wrap.append(split, menu, el('p', { class: 'note', role: 'status' }));
    control.replaceChildren(el('style', {}, css), wrap); updatePlayButton();
  }

  function chooser(request) {
    if (modal) modal.close();
    const dialog = el('dialog', { 'aria-label': `Choose torrent for episode ${request.episode}` }); modal = dialog;
    const oldFocus = document.activeElement;
    const heading = el('div', { class: 'heading' }); heading.append(el('h2', {}, `Play episode ${request.episode}`), el('button', { class: 'close', 'aria-label': 'Close torrent chooser', onclick: () => dialog.close() }, '×'));
    const query = el('input', { type: 'text', 'aria-label': 'Search Nyaa', placeholder: 'Search title, release group, or batch…' });
    const form = el('form', { class: 'row' }); form.append(query, el('button', { class: 'primary', type: 'submit' }, 'Search'));
    const info = el('p', { class: 'muted', role: 'status' }, 'Searching English-translated releases…');
    const results = el('div', { class: 'results' });
    dialog.append(heading, el('p', { class: 'muted' }, 'NYAA · ENGLISH TRANSLATED'), form, info, results); overlay.append(dialog);
    let revision = 0;
    async function search() {
      const rev = ++revision; info.textContent = 'Searching Nyaa…'; info.className = 'muted'; results.replaceChildren();
      try {
        const items = await send('search', { ...request, query: query.value });
        if (!dialog.open || rev !== revision) return;
        info.textContent = items.length ? `${items.length} releases · sorted by seeders` : 'No results. Try a shorter title or search for a batch.';
        for (const item of items) {
          const row = el('button', { class: 'release' });
          const meta = el('span', { class: 'release-meta' });
          for (const value of [item.resolution || 'Unknown quality', item.size, `${item.seeders} seeds`, `${item.leechers} leechers`]) meta.append(el('span', {}, value));
          row.append(el('span', { class: 'release-name' }, item.name), meta);
          row.onclick = async () => {
            const rev = ++revision; info.textContent = 'Reading torrent files…'; results.replaceChildren();
            try {
              const files = await send('files', { ...request, torrent: item });
              if (!dialog.open || rev !== revision) return;
              info.textContent = 'Choose the file to play. The likely episode is highlighted.';
              for (const file of files) {
                const button = el('button', { class: 'release' }); button.append(el('span', { class: 'release-name' }, file.name), el('span', { class: file.suggested ? 'badge' : 'muted' }, `${file.suggested ? 'Suggested episode · ' : ''}${bytes(file.size)}`));
                button.onclick = async () => { button.disabled = true; try { activeRequest = request; setDismissed(false); panel.open = true; await send('play', { ...request, torrent: item, fileIndex: file.index }); dialog.close(); } catch (e) { info.textContent = e.message; info.className = 'error'; button.disabled = false; } }; results.append(button);
              }
            } catch (e) { if (dialog.open && rev === revision) { info.textContent = e.message; info.className = 'error'; } }
          }; results.append(row);
        }
      } catch (e) { if (dialog.open && rev === revision) { info.textContent = e.message; info.className = 'error'; } }
    }
    form.onsubmit = e => { e.preventDefault(); search(); };
    dialog.addEventListener('close', () => { revision++; dialog.remove(); if (modal === dialog) modal = null; oldFocus?.focus(); send('cancel').catch(() => {}); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    dialog.showModal(); search();
  }

  function reconcile() {
    const id = Number(location.pathname.match(/^\/anime\/(\d+)(?:\/|$)/)?.[1]) || null;
    const nextAccount = accountName();
    if (nextAccount !== account || !port) { account = nextAccount; send('hello', { account }).then(data => { panelPosition = data.panelPosition; positionPanel(); }).catch(() => {}); if (control) loadMedia(); }
    if (id !== mediaId) { mediaId = id; model = null; generation++; controlHost?.remove(); controlHost = control = null; modal?.close(); }
    if (id && !controlHost?.isConnected) {
      // Observed on AniList: the cover's action row contains both list and favourite controls.
      const actions = document.querySelector('.cover-wrap-inner > .actions');
      if (actions) {
        controlHost = el('div', { id: 'ani-qw-controls', style: 'display:block;padding-bottom:20px' }); controlHost.style.marginTop = `${10 - (parseFloat(getComputedStyle(actions).marginBottom) || 0)}px`; actions.after(controlHost); control = root(controlHost);
        const wrap = el('div', { class: 'wrap' }); const split = el('div', { class: 'split' });
        split.append(el('button', { class: 'play', disabled: '' }, 'Loading playback…')); wrap.append(split, el('p', { class: 'note', role: 'status' })); control.append(wrap);
        loadMedia();
      }
    }
    const nav = document.querySelector('#nav');
    overlayHost.style.setProperty('--aniqw-top', `${Math.max(12, (nav?.getBoundingClientRect().bottom || 63) + 12)}px`);
  }
  document.addEventListener('pointerdown', e => { if (control && !e.composedPath().includes(controlHost)) { const menu = control.querySelector('.menu'); if (menu) menu.hidden = true; control.querySelector('.arrow')?.setAttribute('aria-expanded', 'false'); } });
  window.addEventListener('focus', () => { reconcile(); if (mediaId) loadMedia(); });
  window.addEventListener('popstate', reconcile);
  let scheduled = false;
  new MutationObserver(() => { if (!scheduled) { scheduled = true; setTimeout(() => { scheduled = false; reconcile(); }, 100); } }).observe(document.body, { childList: true, subtree: true });
  // AniList uses client-side routes. The interval also recovers replaced page roots.
  setInterval(reconcile, 2000); reconcile();
})();
