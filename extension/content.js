(() => {
  const chrome = globalThis.browser || globalThis.chrome;
  if (window.__aniqwLoaded) return;
  window.__aniqwLoaded = true;
  let port, mediaId = null, model = null, controlHost = null, control = null;
  let status = { phase: 'idle' }, activeRequest = null, modal = null, account = '', generation = 0;
  let invalidated = false;
  const waiting = new Map();
  const notificationReads=new Set();
  const shortcutModels=new Map();
  const reviews = new Map(); let reviewDialog = null, claimingReview = false;
  let panelPosition = null, dismissed = false, drag = null, launchMediaId = null, closeTimer = null, stoppingSession = null;
  let route = location.href, watchedSession = null, nextPlayable = null, listEditorOpen = false, refreshTimer = null;
  let navigationSession = null, launchingNotification = null;
  try { navigationSession = sessionStorage.getItem('aniqw-navigation-session'); sessionStorage.removeItem('aniqw-navigation-session'); } catch {}
  window.addEventListener('pagehide', () => {
    if (status.sessionId) try { sessionStorage.setItem('aniqw-navigation-session', status.sessionId); } catch {}
  });
  const css = `
    :host{--bg:rgb(var(--color-foreground,250,250,250));--text:rgb(var(--color-text,92,114,138));--blue:rgb(var(--color-blue,61,180,242));--soft:rgb(var(--color-background,237,241,245));font-family:inherit;font-size:14px;line-height:1.5;color:var(--text);text-align:left;scrollbar-color:var(--text) var(--bg)}
    *{box-sizing:border-box;scrollbar-width:thin}::-webkit-scrollbar{width:9px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:#7b8ba055;border-radius:9px}button,input,select{font:inherit}button{cursor:pointer;border:0;color:inherit;background:transparent;border-radius:4px}button:disabled{cursor:default;opacity:.45}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}button:hover:not(:disabled){filter:brightness(1.08)}
    .split{display:flex;width:100%;height:35px;border-radius:3px;overflow:hidden;background:var(--blue);color:white}.split button{color:white}.play{flex:1}.arrow{width:34px;border-radius:0;background:rgba(255,255,255,.14)}.chevron{font-family:element-icons;font-size:14px;font-style:normal}.chevron.fallback{display:inline-block;font-size:0;width:7px;height:7px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:translateY(-2px) rotate(45deg)}.wrap{position:relative}.menu{animation:menu-in .16s ease-out;transform-origin:top left;position:absolute;top:43px;left:0;width:270px;background:var(--bg);padding:14px;z-index:200;box-shadow:0 6px 24px #0003;border-radius:6px}.menu[hidden]{display:none}label{display:flex;align-items:center;gap:10px}input[type=checkbox]{accent-color:var(--blue);width:16px;height:16px}.episodes{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:220px;overflow:auto;margin:12px 0}.episode{background:var(--soft);padding:7px}.episode.current{background:var(--blue);color:white}.episode.seen{background:rgba(75,180,140,.18);color:#59b99a;box-shadow:inset 0 0 0 1px #59b99a40}.episode:disabled{cursor:not-allowed;background:transparent;color:var(--text);opacity:.35;text-decoration:line-through;border:1px dashed #8884}.pager{display:block;width:100%;padding:8px;background:var(--soft);color:var(--blue)}.split.starting{background:#419d89}.split.streaming{background:#8465bb}.split.starting .play:disabled,.split.streaming .play:disabled{opacity:1}.muted{font-size:12px;opacity:.75}.note{font-size:12px;margin:8px 0;overflow-wrap:anywhere}.note:empty{display:none}.link{color:var(--blue);padding:0}.row{display:flex;gap:10px;align-items:center}.row input{min-width:0;flex:1}.primary{background:var(--blue);color:white;padding:9px 16px}.secondary{background:var(--soft);padding:9px 14px}input[type=text],input[type=number]{border:1px solid #8883;background:var(--soft);color:var(--text);border-radius:4px;padding:9px;width:100%}h2{font-size:20px;margin:0;font-weight:600}h3{font-size:14px;margin:12px 0}p{margin:8px 0}
    .arrow[hidden]{display:none}.notice{padding:12px;border-radius:7px;background:rgba(61,180,242,.12);border-left:3px solid var(--blue);margin:0 0 12px;overflow-wrap:anywhere}.notice strong{display:block;font-size:14px}.notice span:empty{display:none}.split.unavailable{background:var(--soft);color:var(--text);border:1px solid #8883}.split.failed{height:auto;min-height:35px}.split.failed .play{padding:8px;overflow-wrap:anywhere;font-size:12px;line-height:1.4}.split.unavailable .play{color:var(--text);opacity:1}.note-input{display:block;width:100%;min-height:120px;margin:14px 0;padding:12px;background:var(--soft);color:var(--text);border:1px solid #8883;border-radius:5px;font:inherit}.review-score{margin:16px 0}.review-score input,.review-score select{width:145px;padding:9px;background:var(--soft);color:var(--text);border:1px solid #8883;border-radius:4px}.review-history{max-height:240px;overflow:auto;margin:12px 0}.review-prequel{padding:12px;background:var(--soft);border-radius:6px;margin:8px 0}.review-prequel a{color:var(--blue);text-decoration:none}.prequel-note{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.playback-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.playback-actions button:disabled{background:var(--soft);color:var(--text)}:host(.aniqw-notification) .notification-play:not(.unread):not(.starting):not(.streaming){background:rgba(61,180,242,.16);color:var(--blue)}.notification-play.starting{background:#419d89}.notification-play.streaming{background:#8465bb}.notification-play{white-space:nowrap}.notice span{display:block;font-size:12px;margin-top:3px}.notice[data-tone=playing]{background:rgba(132,101,187,.16);border-color:#9875d2}.notice[data-tone=error]{background:rgba(228,105,121,.14);border-color:#e46979}.notice[data-tone=closed]{background:rgba(75,180,140,.14);border-color:#59b99a}.panel .error,.panel .sync{padding:11px 12px;border-radius:6px;border-left:3px solid currentColor;background:rgba(228,105,121,.12);font-size:12px}.panel .sync{color:var(--blue);background:rgba(61,180,242,.12)}.panel .sync[data-tone=success]{color:#59b99a;background:rgba(75,180,140,.14)}.panel .sync[data-tone=retry]{color:#c5994e;background:rgba(197,153,78,.12)}.panel .sync:empty{display:none}.stats span{padding:7px 8px;background:var(--soft);border-radius:5px}.panel .row{flex-wrap:wrap}
    @keyframes menu-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.menu{animation:none}}
    dialog{pointer-events:auto;border:0;border-radius:8px;background:var(--bg);color:var(--text);width:min(820px,calc(100vw - 32px));max-height:85vh;padding:26px;box-shadow:0 15px 80px #0006;font:inherit}dialog::backdrop{background:#07101bbb;backdrop-filter:blur(3px)}.heading{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px}.close{font-size:22px;line-height:1;padding:4px 8px}.results{max-height:50vh;overflow:auto;margin-top:16px}.release{display:block;text-align:left;width:100%;padding:14px 10px;border-top:1px solid #8882;border-radius:0}.release:hover{background:var(--soft)}.release-name{display:block;overflow-wrap:anywhere;font-weight:600}.release-meta{display:flex;flex-wrap:wrap;gap:16px;font-size:12px;margin-top:5px;opacity:.8}.badge{color:var(--blue)}.error{color:#e46979;overflow-wrap:anywhere}.error:empty{display:none}
    .panel{pointer-events:auto;position:fixed;right:max(18px,calc((100vw - 1320px)/2));top:var(--aniqw-top,75px);width:min(410px,calc(100vw - 36px));z-index:990;background:var(--bg);border-radius:10px;box-shadow:0 8px 32px #0004;border:1px solid #8882;border-top:3px solid var(--blue)}.panel[hidden]{display:none}summary{display:flex;align-items:center;gap:8px;padding:12px;cursor:grab;touch-action:none;user-select:none;font-weight:600;overflow-wrap:anywhere;list-style:none}summary::-webkit-details-marker{display:none}.panel-title{flex:1;min-width:0;font-size:13px}summary:active{cursor:grabbing}.dismiss{font-size:20px;padding:2px 6px;opacity:.7}.restore{pointer-events:auto;position:fixed;right:18px;bottom:18px;background:var(--bg);color:var(--blue);border:1px solid #8883;box-shadow:0 4px 18px #0003;padding:10px 16px}.restore[hidden]{display:none}.body{max-height:calc(100vh - 160px);overflow:auto}.body{padding:0 16px 16px}.filename{display:block;width:100%;text-align:left;padding:8px;background:var(--soft);border-radius:5px;font-size:12px;color:var(--blue);text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;border:1px solid #3db4f240;overflow-wrap:anywhere;max-height:55px;overflow:auto}.filename:disabled{color:var(--text);text-decoration:none;border-color:transparent;cursor:default;opacity:.7}.filename:hover:not(:disabled),.filename:focus-visible{border-color:var(--blue);text-decoration-style:solid;background:rgba(61,180,242,.1)}.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin:8px 0 14px}.sync{font-size:12px;overflow-wrap:anywhere}.panel .row{justify-content:space-between}
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
  const summary = el('summary', { 'aria-label': 'Expand or collapse playback details', title: 'Drag to move, click to collapse, or use arrow keys to reposition' });
  const panelTitle = el('span', { class: 'panel-title' }, 'Ani-QW');
  const dismiss = el('button', { class: 'dismiss', 'aria-label': 'Dismiss playback panel' }, '×');
  summary.append(panelTitle, dismiss);
  const restore = el('button', { class: 'restore', hidden: '' }, 'Show playback');
  overlay.append(restore);
  function setDismissed(value) { dismissed = value; panel.hidden = value; restore.hidden = !value; }
  dismiss.onclick = e => { e.preventDefault(); e.stopPropagation(); setDismissed(true); restore.focus(); };
  restore.onclick = () => { cancelCountdown(); setDismissed(false); summary.focus(); };
  function positionPanel() {
    if (!panelPosition) return;
    const width = Math.min(410, innerWidth - 36);
    panelPosition = { left: Math.max(12, Math.min(panelPosition.left, innerWidth - width - 12)), top: Math.max(12, Math.min(panelPosition.top, innerHeight - Math.min(panel.offsetHeight || 80, 360) - 12)) };
    panel.style.left = `${panelPosition.left}px`; panel.style.top = `${panelPosition.top}px`; panel.style.right = 'auto';
  }
  function savePosition() { send('panelPosition', { position: panelPosition }).catch(showError); }
  let suppressTitleClick = false;
  summary.onclick = e => {
    if (!suppressTitleClick || e.target.closest('button')) return;
    suppressTitleClick = false; e.preventDefault();
  };
  summary.onpointerdown = e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    suppressTitleClick = false;
    const r = panel.getBoundingClientRect();
    drag = { id:e.pointerId, x:e.clientX, y:e.clientY, left:r.left, top:r.top, moved:false };
    summary.setPointerCapture(e.pointerId);
  };
  summary.onpointermove = e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX-drag.x,e.clientY-drag.y) < 4) return;
    drag.moved = true;
    panelPosition = { left:drag.left+e.clientX-drag.x, top:drag.top+e.clientY-drag.y };
    positionPanel();
  };
  const finishDrag = e => {
    if (!drag || drag.id !== e.pointerId) return;
    suppressTitleClick = drag.moved;
    if (drag.moved) savePosition();
    drag = null;
    if (summary.hasPointerCapture(e.pointerId)) summary.releasePointerCapture(e.pointerId);
  };
  summary.onpointerup = finishDrag;
  summary.onpointercancel = finishDrag;
  summary.onlostpointercapture = finishDrag;
  summary.onkeydown = e => {
    if (e.target.closest('button')) return;
    suppressTitleClick = false;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    panelPosition = { left:r.left+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0), top:r.top+(e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0) };
    positionPanel(); savePosition();
  };
  window.addEventListener('resize', positionPanel);
  panel.addEventListener('toggle', positionPanel);
  const body = el('div', { class: 'body' });
  const phaseBox = el('div', { class: 'notice', role: 'status', 'aria-live': 'polite' });
  const phaseTitle = el('strong'); const watchedNotice = el('span'); phaseBox.append(phaseTitle, watchedNotice);
  const countdown = el('p', {class:'muted'});
  function cancelCountdown(){clearInterval(closeTimer);countdown.textContent='';}
  function startCountdown(duration=5){cancelCountdown();let seconds=duration; countdown.textContent=`Minimizing in ${seconds}s`; closeTimer=setInterval(()=>{seconds--;countdown.textContent=`Minimizing in ${seconds}s`;if(seconds<=0){cancelCountdown();setDismissed(true);}},1000);}
  const filename = el('button', { class: 'filename', disabled:'', title: '', onclick: () => activeRequest && chooser(activeRequest) });
  const stats = el('div', { class: 'stats' });
  const warning = el('p', { class: 'error', role: 'status' });
  const sync = el('p', { class: 'sync', role: 'status' });
  const stop = el('button', { class: 'secondary', onclick: async () => {
    stop.disabled = true; stop.textContent = 'Stopping…';
    const before = status.phase, session = status.sessionId; stoppingSession = session; renderState({ ...status, phase: 'stopping' });
    try { await send('stop', { sessionId: status.sessionId }); }
    catch (e) { stoppingSession = null; warning.textContent = e.message; stop.disabled = false; stop.textContent = 'Stop'; if (status.sessionId === session && status.phase === 'stopping') { status = { ...status, phase: before }; updatePlayButton(); } }
  } }, 'Stop');
  const replay = el('button', { class: 'primary', disabled: '', onclick: async () => {
    if (!activeRequest || status.phase !== 'idle' || launchMediaId !== null) return;
    launchMediaId = activeRequest.mediaId; replay.disabled = true; cancelCountdown(); updatePlayButton();
    try { setDismissed(false); await playRequest(activeRequest); } catch(e) { warning.textContent = e.message; }
    finally { launchMediaId = null; updatePlaybackActions(); updatePlayButton(); }
  } }, 'Replay');
  const nextEpisodeButton = el('button', { class: 'primary', disabled: '', onclick: async () => {
    if (!nextPlayable || launchMediaId !== null) return;
    const request = { ...nextPlayable };
    launchMediaId = request.mediaId; nextEpisodeButton.disabled = true; cancelCountdown(); updatePlayButton();
    try {
      const fresh = await send('media', { mediaId: request.mediaId, fresh: true });
      if (!Number.isFinite(fresh.available) || request.episode > fresh.available) { nextPlayable=null; return; }
      activeRequest = request;
      if (fresh.autoSelect) { setDismissed(false); await playRequest(request); }
      else chooser(request);
    } catch (e) { warning.textContent = e.message; }
    finally { launchMediaId = null; updatePlaybackActions(); updatePlayButton(); }
  } }, 'Play next episode');
  const controls = el('div', { class: 'playback-actions' }); controls.append(replay, nextEpisodeButton);
  stop.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  summary.insertBefore(stop, dismiss);
  body.append(phaseBox, filename, stats, warning, sync, countdown, controls); panel.append(summary, body); overlay.append(panel);
  function updatePlaybackActions() {
    replay.disabled = status.phase !== 'idle' || !activeRequest || launchMediaId !== null;
    nextEpisodeButton.disabled = !nextPlayable || launchMediaId !== null || status.phase === 'stopping';
    nextEpisodeButton.title = nextPlayable ? `Play episode ${nextPlayable.episode}` : 'No next aired episode available';
    filename.disabled = !activeRequest || !status.filename || launchMediaId !== null;
  }
  async function findNext(s) {
    try {
      const fresh = await send('media', {mediaId:s.media.id});
      if (status.sessionId !== s.sessionId) return;
      nextPlayable = Number.isFinite(fresh.available) && s.episode < fresh.available
        ? {mediaId:s.media.id, episode:s.episode + 1} : null;
      updatePlaybackActions();
    } catch { /* Leave Next disabled until availability can be verified. */ }
  }

  function connect() {
    port = chrome.runtime.connect({ name: 'ani-qw' });
    port.onMessage.addListener(message => {
      if (message.id && waiting.has(message.id)) {
        const p = waiting.get(message.id); waiting.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(Object.assign(new Error(message.error), { code: message.code })); else p.resolve(message.data);
        return;
      }
      if (message.event === 'review' && message.data) { reviews.set(message.data.id,message.data); maybeReview(); }
      if (message.event === 'reviewDismissed') { reviews.delete(message.data.id); if(reviewDialog?.dataset.reviewId===message.data.id) reviewDialog.close(); }
      if(message.event==='notificationRead' && message.data.account?.toLowerCase()===account.toLowerCase()){notificationReads.add(message.data.key);notificationButtons();}
      if (message.event === 'state') renderState(message.data);
      if (message.event === 'connection' && message.data.error) showError(new Error(message.data.error));
      if (message.event === 'sync') { sync.dataset.tone = 'retry'; sync.textContent = message.data.error; panel.open = true; if (!dismissed) panel.hidden = false; }
      if (message.event === 'synced') {
        if (message.data.sessionId === status.sessionId) {
          watchedSession = status.sessionId;
          watchedNotice.textContent = `Episode ${message.data.episode} marked watched`;
          sync.textContent = '';
          nextPlayable = message.data.nextEpisode ? { mediaId: message.data.mediaId, episode: message.data.nextEpisode } : null;
          updatePlaybackActions();
          if (status.phase === 'idle' && !dismissed) startCountdown(nextPlayable ? 10 : 5);
        }
        shortcutModels.set(message.data.mediaId,{...shortcutModels.get(message.data.mediaId),at:0});for(const item of shortcuts.values())if(item.id===message.data.mediaId)loadShortcut(item);
        if (message.data.mediaId === mediaId) loadMedia(true);
      }
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
      let id, timer;
      try {
        if (invalidated) throw new Error('Ani-QW was updated. Refresh this AniList page to reconnect.');
        if (!port) connect();
        id = crypto.randomUUID(); timer = setTimeout(() => { waiting.delete(id); reject(new Error('Request timed out. Try again.')); }, 120000);
        waiting.set(id, { resolve, reject, timer }); port.postMessage({ id, type, ...data });
      } catch (e) {
        clearTimeout(timer); if (id) waiting.delete(id);
        if (/extension context invalidated/i.test(e.message)) {
          invalidated = true;
          e = new Error('Ani-QW was updated. Refresh this AniList page to reconnect.');
        }
        reject(e);
      }
    });
  }
  const bytes = n => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GiB` : `${(n / 1048576).toFixed(1)} MiB`;
  const rate = n => n < 1048576 ? `${(n / 1024).toFixed(1)} KiB/s` : `${bytes(n)}/s`;
  function updatePlayButton() {
    const button = control?.querySelector('.play'), split = control?.querySelector('.split');
    if (!button || !model || split.dataset.error) return;
    const active = status.media?.id === mediaId && status.phase !== 'idle';
    const starting = launchMediaId === mediaId || (active && ['searching','metadata','verifying','buffering'].includes(status.phase));
    const streaming = active && ['playing','paused'].includes(status.phase);
    split.classList.toggle('unavailable', !model.next); split.classList.toggle('starting', starting); split.classList.toggle('streaming', streaming);
    button.textContent = starting ? 'Starting…' : streaming ? 'Streaming' : active && status.phase === 'stopping' ? 'Stopping…' : model.next ? (model.label || (model.media.mediaListEntry?.status === 'COMPLETED' ? 'Rewatch' : `Play Episode ${model.next}`)) : 'Not yet aired';
    button.disabled = starting || (active && !streaming) || !model.next;
    button.title = streaming ? 'Show or hide playback details' : '';
    const arrow = control.querySelector('.arrow');
    arrow.hidden = arrow.disabled = starting || active || !model.next;
    if (arrow.disabled) { control.querySelector('.menu').hidden = true; arrow.setAttribute('aria-expanded', 'false'); }
  }
  function renderState(s) {
    if (stoppingSession && s.sessionId === stoppingSession && s.phase !== 'idle') s = { ...s, phase: 'stopping' };
    else stoppingSession = null;
    const previous = status;
    if (s.sessionId && s.sessionId !== status.sessionId) {
      dismissed = navigationSession === s.sessionId; navigationSession = null;
      restore.hidden = !dismissed; sync.textContent = '';
      watchedSession = null; nextPlayable = null;
      if (s.media?.id) findNext(s);
    }
    status = s; updatePlayButton(); notificationButtons(); updateShortcuts();
    if (s.phase === 'idle' && !s.sessionId) return;
    panel.hidden = dismissed;
    panelTitle.textContent = `${s.media?.title || 'Ani-QW'}${s.episode ? ` · Episode ${s.episode}` : ''}`;
    const phases = {
      searching: 'Finding your episode', metadata: 'Gathering torrent metadata',
      verifying: 'Checking cached video', buffering: 'Buffering video',
      playing: 'Streaming in mpv', paused: 'Playback paused', stopping: 'Stopping playback',
      idle: s.endReason === 'closed' ? 'mpv was closed' : s.endReason === 'error' ? 'Playback failed' : 'Playback stopped'
    };
    const title = phases[s.phase] || 'Preparing playback';
    watchedNotice.textContent = watchedSession === s.sessionId ? `Episode ${s.episode} marked watched` : '';
    phaseTitle.textContent = title;
    phaseBox.dataset.tone = ['playing','paused'].includes(s.phase) ? 'playing' : s.phase === 'idle' ? (s.endReason === 'error' ? 'error' : 'closed') : 'starting';
    if (previous.phase !== s.phase) panel.open = true;
    filename.textContent = s.filename || 'Finding your episode…';
    filename.title = s.filename ? 'Choose another torrent' : '';
    stats.replaceChildren(...[
      [`${(s.percent || 0).toFixed(1)}% · ${bytes(s.downloaded || 0)} / ${bytes(s.size || 0)}`, 'Downloaded portion of the selected video and its total size'],
      [`↓ ${rate(s.downloadSpeed || 0)}${s.seeding === false ? "" : `  ↑ ${rate(s.uploadSpeed || 0)}`}`, s.seeding === false ? 'Current download speed. Seeding is disabled.' : 'Current download and upload speeds'],
      [s.duration ? `${Math.floor((s.position || 0) / 60)} / ${Math.floor(s.duration / 60)} min watched` : 'Waiting for video', 'Playback position and total duration, including seeking'],
      [`${s.seeds || 0} seeds · ${s.peers || 0} peers`, 'Connected seeds with the full torrent and connected peers']
    ].map(([text,title]) => el('span', {title}, text)));
    warning.textContent = s.warning || '';
    stop.disabled = s.phase === 'idle' || s.phase === 'stopping'; stop.textContent = s.phase === 'stopping' ? 'Stopping…' : 'Stop';
    stop.hidden = s.phase === 'idle';
    if (s.media?.id) activeRequest = { mediaId: s.media.id, episode: s.episode, rewatch:!!s.rewatch };
    updatePlaybackActions();
    if (s.phase === 'idle') maybeReview();
    if (s.phase !== 'idle') cancelCountdown();
    else if (previous.phase !== 'idle' && !s.warning && !dismissed) {
      startCountdown(watchedSession === s.sessionId && nextPlayable ? 10 : 5);
    }
  }
  async function maybeReview() {
    if (claimingReview || reviewDialog || modal || status.phase !== 'idle' || document.visibilityState !== 'visible') return;
    const review = reviews.values().next().value;
    if (!review) return;
    claimingReview = true;
    try {
      const result = await send('claimReview',{reviewId:review.id});
      if (result.gone) { reviews.delete(review.id); return; }
      if (!result.claimed) return;
      const dialog = el('dialog',{'aria-label':'Add completion note'});
      dialog.dataset.reviewId=review.id; reviewDialog=dialog;
      const heading=el('h2',{},'Finished '+review.title);
      const description=el('p',{},'Your AniList score and notes. Save to update them.');
      const comment=el('textarea',{class:'note-input',maxlength:'10000','aria-label':'Completion comment',disabled:''});
      let originalNotes;
      const error=el('p',{class:'error',role:'status'});
      const actions=el('div',{class:'row'});
      const skip=el('button',{class:'secondary'},'Skip');
      const save=el('button',{class:'primary',disabled:''},'Save to AniList');
      const scoreLabel=el('label',{class:'review-score'},'Score');
      let score=el('input',{type:'number','aria-label':'Completion score',disabled:''}), scoring;
      scoreLabel.append(score);
      const history=el('section',{class:'review-history','aria-label':'Prequel scores and notes'});
      const contextStatus=el('p',{class:'muted',role:'status'});
      const retry=el('button',{class:'secondary',hidden:''},'Retry loading scores and prequels');
      actions.append(skip,save);dialog.append(heading,description,scoreLabel,comment,history,contextStatus,retry,error,actions);overlay.append(dialog);
      async function loadContext() {
        retry.hidden=true;contextStatus.textContent='Loading your score and prequels…';
        try {
          const context=await send('reviewContext',{reviewId:review.id});
          if (!dialog.isConnected) return;
          scoring=context.scoring;
          originalNotes=context.current?.mediaListEntry?.notes || '';
          comment.value=originalNotes;comment.disabled=false;save.disabled=false;
          const input=scoring.choices?el('select',{'aria-label':'Completion score'}):el('input',{type:'number',min:'0',max:scoring.max,step:scoring.step,placeholder:'Optional','aria-label':'Completion score'});
          if(scoring.choices){input.append(el('option',{value:''},'Unchanged'));scoring.choices.forEach((label,value)=>input.append(el('option',{value},label)));}
          input.value=context.current?.mediaListEntry?.score || '';
          scoreLabel.firstChild.textContent=scoring.label;score.replaceWith(input);score=input;
          history.replaceChildren();
          if(context.prequels.length)history.append(el('h3',{},'Your prequel scores and notes'));
          for(const media of context.prequels){
            const card=el('article',{class:'review-prequel'});
            const title=el('a',{href:`https://anilist.co/anime/${media.id}/`,target:'_blank',rel:'noopener'},media.title.english || media.title.romaji);
            const value=media.mediaListEntry?.score;
            card.append(title,el('p',{class:'muted'},value ? `Score: ${scoring.choices?scoring.choices[value]:`${value} / ${scoring.max}`}`:'No score'),el('p',{class:'prequel-note'},media.mediaListEntry?.notes || 'No notes'));
            history.append(card);
          }
          contextStatus.textContent='';
        }catch(e){if(dialog.isConnected){contextStatus.textContent=e.message;retry.hidden=false;}}
      }
      retry.onclick=loadContext;
      async function finish(type) {
        save.disabled=skip.disabled=true;
        try {
          if(type==='saveReview' && score.value!=='' && !score.checkValidity()) throw new Error('Enter a valid score for your AniList scale.');
          await send(type,{reviewId:review.id,comment:comment.value,originalNotes,...(scoring && score.value!==''?{score:Number(score.value),scoreFormat:scoring.format}:{})}); reviews.delete(review.id); dialog.close(); }
        catch(e) {error.textContent=e.message;}
        finally {save.disabled=originalNotes===undefined;skip.disabled=false;}
      }
      skip.onclick=()=>finish('dismissReview');save.onclick=()=>finish('saveReview');
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish('dismissReview');});
      dialog.addEventListener('close',()=>{dialog.remove();reviewDialog=null;maybeReview();});
      dialog.showModal();comment.focus();loadContext();
    } catch(e) { warning.textContent=e.message; }
    finally {claimingReview=false;}
  }
  document.addEventListener('visibilitychange',()=>maybeReview());

  function showError(e) {
    if (/extension context invalidated/i.test(e.message)) e = new Error('Ani-QW was updated. Refresh the page.');

    if (control) {
      const split = control.querySelector('.split'), button = control.querySelector('.play');
      split.dataset.error = 'true'; split.classList.remove('starting', 'streaming'); split.classList.add('unavailable', 'failed');
      button.textContent = e.message; button.title = e.message; button.disabled = true;
      const arrow = control.querySelector('.arrow'); if (arrow) { arrow.hidden = arrow.disabled = true; arrow.setAttribute('aria-expanded', 'false'); }
      const menu = control.querySelector('.menu'); if (menu) menu.hidden = true;
      control.querySelector('.note').textContent = '';
    }
    else { panel.hidden = false; panel.open = true; warning.textContent = e.message; }
  }
  function accountName() {
    const a = document.querySelector('#nav a[href^="/user/"]');
    return a?.getAttribute('href')?.match(/^\/user\/([^/]+)/)?.[1] || '';
  }
  async function loadMedia(fresh = false) {
    if (!mediaId || !control) return;
    const id = mediaId, g = ++generation;
    try {
      const data = await send('media', { mediaId: id, fresh });
      if (g !== generation || id !== mediaId) return;
      model = data; renderControl();
    } catch (e) { if (g === generation && control) showError(e); }
  }
  async function playRequest(request) {
    phaseTitle.textContent = 'Preparing playback';
    watchedNotice.textContent = '';
    phaseBox.dataset.tone = 'starting';
    // The helper resumes the saved account/episode position automatically.
    await send('play', {...request, startOver:false});
    return true;
  }
  async function begin(episode) {
    if (launchMediaId !== null || (status.media?.id === mediaId && status.phase !== 'idle' && (episode === undefined || episode === status.episode || ['searching','metadata','verifying','buffering','stopping'].includes(status.phase)))) return;
    launchMediaId = mediaId; updatePlayButton();
    try {
      const menu = control?.querySelector('.menu'); if (menu) menu.hidden = true;
      control?.querySelector('.arrow')?.setAttribute('aria-expanded', 'false');
      const requestedMedia = mediaId;
      const fresh = await send('media', { mediaId: requestedMedia, fresh: true });
      if (requestedMedia !== mediaId) return;
      model = fresh;
      const request = { mediaId: requestedMedia, episode: episode ?? fresh.next, rewatch: episode === undefined && fresh.media.mediaListEntry?.status === 'COMPLETED' };
      if (!request.episode) return;
      activeRequest = request;
      if (fresh.autoSelect) { setDismissed(false); panel.open = true; warning.textContent = ''; await playRequest(request); }
      else chooser(request);
    } catch (e) { showError(e); } finally { launchMediaId = null; updatePlayButton(); }
  }
  function renderControl() {
    const wrap = el('div', { class: 'wrap' });
    const split = el('div', { class: 'split' });
    const play = el('button', { class: 'play' }, model.next ? (model.label || (model.media.mediaListEntry?.status === 'COMPLETED' ? 'Rewatch' : `Play Episode ${model.next}`)) : 'Not yet aired'); play.disabled = !model.next; play.onclick = () => {if(status.media?.id === mediaId && ['playing','paused'].includes(status.phase)){cancelCountdown();setDismissed(!panel.hidden);if(!panel.hidden)panel.open=true;}else begin();};
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
        b.title = unavailable ? 'Unreleased' : ep <= watched ? 'Completed' : ep === model.next ? 'Last unwatched' : 'Unwatched';
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
                button.onclick = async () => { button.disabled = true; try { activeRequest = request; setDismissed(false); panel.open = true; if (await playRequest({ ...request, torrent: item, fileIndex: file.index })) dialog.close(); else button.disabled = false; } catch (e) { info.textContent = e.message; info.className = 'error'; button.disabled = false; } }; results.append(button);
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

  async function playNotification(id, episode, button) {
    if (launchMediaId !== null) return;
    launchMediaId=id; launchingNotification=`${id}:${episode}`; notificationButtons();
    try {
      const fresh=await send('media',{mediaId:id,fresh:true});
      const request={mediaId:id,episode,notification:true};
      activeRequest=request;
      if(fresh.autoSelect){setDismissed(false);panel.open=true;await playRequest(request);}
      else chooser(request);
    } catch(e) {showError(e);}
    finally {launchMediaId=null;launchingNotification=null;notificationButtons();}
  }
  function updateNotification(button,id,episode,row) {
    if(notificationReads.has(`${id}:${episode}`))row?.classList.remove('unread');
    button.classList.toggle('unread',!!row?.classList.contains('unread'));
    const active=status.media?.id===id && status.episode===episode && status.phase!=='idle';
    const streaming=active && ['playing','paused'].includes(status.phase);
    const starting=launchingNotification===`${id}:${episode}` || (active && !streaming);
    button.textContent=streaming?'Streaming':starting?(status.phase==='stopping'?'Stopping…':'Starting…'):`Play episode ${episode}`;
    button.disabled=starting;
    button.classList.toggle('starting',starting);button.classList.toggle('streaming',streaming);
    button.title=streaming?'Show or hide playback details':'';
  }
  const notificationLayout = el('style', {}, `
    .notifications-feed.aniqw-with-play{grid-template-columns:var(--aniqw-filter-width,180px) minmax(0,1fr) 145px;width:calc(100% - 48px);max-width:1480px;padding-left:24px;padding-right:24px;column-gap:24px;margin-left:auto;margin-right:auto}
    .aniqw-with-play > .filters{grid-column:1;grid-row:1}
    .aniqw-with-play > .notifications{grid-column:2;grid-row:1;min-width:0}
    .aniqw-play-column{grid-column:3;grid-row:1;position:relative;align-self:stretch;min-width:0}
    .aniqw-play-column > .aniqw-notification{position:absolute;left:0;transform:translateY(-50%)}
    @media(max-width:760px){
      .notifications-feed.aniqw-with-play{grid-template-columns:minmax(0,1fr) 130px;column-gap:12px}
      .aniqw-with-play > .filters{grid-column:1 / -1;grid-row:1}
      .aniqw-with-play > .notifications{grid-column:1;grid-row:2}
      .aniqw-play-column{grid-column:2;grid-row:2}
    }
  `);
  document.head.append(notificationLayout);
  let notificationFeed=null, notificationColumn=null;
  const notificationActions=new Map();
  function alignNotificationButtons() {
    if(!notificationColumn?.isConnected)return;
    const top=notificationColumn.getBoundingClientRect().top;
    for(const [row,host] of notificationActions){
      if(!row.isConnected)continue;
      const rect=row.getBoundingClientRect();
      host.style.top=`${rect.top+rect.height/2-top}px`;
    }
  }
  const notificationObserver=new ResizeObserver(alignNotificationButtons);
  window.addEventListener('resize',alignNotificationButtons);
  function resetNotificationColumn() {
    notificationObserver.disconnect();notificationActions.clear();notificationColumn?.remove();
    notificationFeed?.classList.remove('aniqw-with-play');
    notificationFeed?.style.removeProperty('--aniqw-filter-width');
    notificationFeed=notificationColumn=null;
  }
  function notificationButtons() {
    const feed=/^\/notifications\/?$/.test(location.pathname)?document.querySelector('.notifications-feed'):null;
    if(feed!==notificationFeed)resetNotificationColumn();
    if(!feed)return;
    const list=feed.querySelector(':scope > .notifications');
    if(!list)return;
    if(!notificationColumn){
      notificationFeed=feed;
      const width=feed.querySelector(':scope > .filters')?.getBoundingClientRect().width;
      if(width && innerWidth>760)feed.style.setProperty('--aniqw-filter-width',`${width}px`);
      notificationColumn=el('div',{class:'aniqw-play-column','aria-label':'Episode playback'});
      feed.append(notificationColumn);feed.classList.add('aniqw-with-play');
      notificationObserver.observe(list);
    }
    const rows=new Set(list.querySelectorAll('.notification.hasMedia'));
    for(const [row,host] of notificationActions){
      if(!rows.has(row)){host.remove();notificationActions.delete(row);notificationObserver.unobserve(row);}
    }
    for (const row of rows) {
      const details=row.querySelector('.details > div');
      const link=details?.querySelector('a[href^="/anime/"]');
      const text=details?.textContent.replace(/\s+/g,' ').trim() || '';
      const match=text.match(/^Episode (\d+) of .+ aired\.$/);
      const id=Number(link?.getAttribute('href')?.match(/^\/anime\/(\d+)/)?.[1]);
      let host=notificationActions.get(row);
      const key=id && match ? id+':'+match[1] : '';
      if (host?.dataset.key===key) { updateNotification(host.shadowRoot.querySelector('button'),id,Number(match[1]),row); continue; }
      host?.remove();notificationActions.delete(row);notificationObserver.unobserve(row);
      if (!key) continue;
      host=el('div',{class:'aniqw-notification'});host.dataset.key=key;
      const r=root(host);
      const button=el('button',{class:'primary notification-play'},`Play episode ${match[1]}`);
      button.onclick=e=>{e.preventDefault();e.stopPropagation();if (status.media?.id===id && status.episode===Number(match[1]) && ['playing','paused'].includes(status.phase)) {cancelCountdown();setDismissed(!dismissed);panel.open=true;} else playNotification(id,Number(match[1]),button);};
      r.append(button);notificationColumn.append(host);notificationActions.set(row,host);
      notificationObserver.observe(row);updateNotification(button,id,Number(match[1]),row);
    }
    alignNotificationButtons();
  }
  const shortcutStyle=el('style',{},`
    .list-preview [data-aniqw-home]:is(:hover,:focus-within){z-index:40}
    .list-preview [data-aniqw-home] > .content{pointer-events:auto;visibility:hidden;height:auto !important;min-height:100%;padding:12px;box-shadow:0 6px 20px #0003}
    .list-preview [data-aniqw-home]:is(:hover,:focus-within) > .content{visibility:visible;display:block;opacity:1;z-index:30}
    .list-preview [data-aniqw-home] > .content .info{position:static !important;inset:auto !important;margin-top:8px}
    .list-preview [data-aniqw-home] .plus-progress,.list-preview [data-aniqw-home] .image-overlay{display:none !important}
    .list-preview [data-aniqw-home] .cover .image-text{opacity:1 !important}
    .aniqw-cover-progress{position:absolute;bottom:0;left:0;right:0;padding:6px;background:rgba(var(--color-overlay),.7);color:rgba(var(--color-text-bright),.91);font-size:12px;text-align:center;pointer-events:none}.aniqw-home-play{display:block;width:100%;margin-top:10px;clear:both}
  `);document.head.append(shortcutStyle);
  const shortcuts=new Map();
  function updateShortcuts(){
    for(const {id,button} of shortcuts.values()){
      const data=shortcutModels.get(id)?.data;
      const active=status.media?.id===id && status.phase!=='idle';
      const streaming=active && ['playing','paused'].includes(status.phase);
      const starting=launchMediaId===id || (active && !streaming);
      button.textContent=streaming?'Streaming':starting?'Starting…':data?(data.label || (data.next?`Play Episode ${data.next}`:'Not yet aired')):'Loading playback…';
      button.disabled=!streaming && (starting || !data || !data.next);
      button.classList.toggle('starting',starting && !streaming);button.classList.toggle('streaming',streaming);
      button.title=streaming?'Show or hide playback details':'';
    }
  }
  async function loadShortcut(item){
    const cached=shortcutModels.get(item.id);
    if(cached && Date.now()-cached.at<15000)return;
    if(cached?.loading)return;
    shortcutModels.set(item.id,{...cached,loading:true,at:Date.now()});
    try{
      const data=await send('media',{mediaId:item.id});
      shortcutModels.set(item.id,{data,at:Date.now()});updateShortcuts();
    }catch(e){shortcutModels.delete(item.id);item.button.textContent='Retry playback';item.button.disabled=false;item.button.title=e.message;}
  }
  async function playShortcut(id){
    if(status.media?.id===id && ['playing','paused'].includes(status.phase)){cancelCountdown();setDismissed(!dismissed);panel.open=true;return;}
    if(launchMediaId!==null)return;
    launchMediaId=id;updateShortcuts();updatePlayButton();
    try{
      const fresh=await send('media',{mediaId:id,fresh:true});
      if(!fresh.next)throw new Error('This anime has not aired yet.');
      shortcutModels.set(id,{data:fresh,at:Date.now()});
      const request={mediaId:id,episode:fresh.next,rewatch:fresh.media.mediaListEntry?.status==='COMPLETED'};
      activeRequest=request;
      if(fresh.autoSelect){setDismissed(false);panel.open=true;await playRequest(request);}else chooser(request);
    }catch(e){showError(e);}finally{launchMediaId=null;updateShortcuts();updatePlayButton();}
  }
  function reconcileShortcuts(){
    const targets=new Map();
    if(/^\/home\/?$/.test(location.pathname)){
      for(const card of document.querySelectorAll('.list-preview .media-preview-card')){
        const a=card.querySelector('a.cover[href^="/anime/"]'),content=card.querySelector(':scope > .content');
        const id=Number(a?.getAttribute('href').match(/^\/anime\/(\d+)/)?.[1]);
        if(id && content)targets.set(card,{id,parent:content,home:true});
      }
    }
    for(const [node,item] of shortcuts){
      if(!targets.has(node)||targets.get(node).id!==item.id||!item.host.isConnected){item.host.remove();node.querySelector('.aniqw-cover-progress')?.remove();node.removeAttribute('data-aniqw-home');shortcuts.delete(node);}
    }
    for(const [node,target] of targets){
      if(shortcuts.has(node))continue;
      const host=el('span',{class:'aniqw-home-play'}),r=root(host);
      const button=el('button',{class:'primary notification-play',style:'width:100%;white-space:normal'},'Play next episode');
      button.onclick=e=>{e.preventDefault();e.stopPropagation();playShortcut(target.id);};
      r.append(button);target.parent.append(host);if(target.home)node.setAttribute('data-aniqw-home','');
      const item={id:target.id,host,button};shortcuts.set(node,item);
      node.addEventListener('mouseenter',()=>loadShortcut(item));node.addEventListener('focusin',()=>loadShortcut(item));
      if(node.matches(':hover,:focus-within'))loadShortcut(item);
    }
    for(const [node,item] of shortcuts){
      const cover=node.querySelector('a.cover'), data=shortcutModels.get(item.id)?.data;
      const text=node.querySelector('.info')?.textContent.match(/Progress:\s*(\d+)\s*\/\s*(\d+)/i);
      const progress=data?.media.mediaListEntry?.progress ?? (text?Number(text[1]):null);
      const total=data?.media.episodes ?? (text?Number(text[2]):null);
      const hasCountdown=!!cover?.querySelector('.countdown');
      const show=progress!==null && total>0 && progress<total && (data?data.media.status==='FINISHED':!hasCountdown);
      let strip=cover?.querySelector('.aniqw-cover-progress');
      if(show && cover){if(!strip){strip=el('span',{class:'aniqw-cover-progress'});cover.append(strip);}const label=`${progress} / ${total}`;if(strip.textContent!==label)strip.textContent=label;}
      else strip?.remove();
    }
    updateShortcuts();
  }
  let spacedSidebar = null, sidebarPadding = '', appliedPadding = null;
  function clearCoverSpacing() {
    if (spacedSidebar && spacedSidebar.style.paddingTop === appliedPadding) spacedSidebar.style.paddingTop=sidebarPadding;
    spacedSidebar=null;appliedPadding=null;
  }
  function spaceCoverControls() {
    const sidebar=document.querySelector('.sidebar'), inner=controlHost?.parentElement;
    if (!sidebar || !inner || getComputedStyle(inner).position!=='absolute') {clearCoverSpacing();return;}
    if(spacedSidebar!==sidebar){clearCoverSpacing();spacedSidebar=sidebar;sidebarPadding=sidebar.style.paddingTop;}
    const current=parseFloat(getComputedStyle(sidebar).paddingTop)||0;
    const base=parseFloat(sidebarPadding)||0;
    const cover=inner.getBoundingClientRect(), side=sidebar.getBoundingClientRect();
    const sameColumn=cover.left<side.right && cover.right>side.left;
    const needed=sameColumn?Math.max(base,Math.ceil(cover.bottom+20-side.top)):base;
    if(Math.abs(current-needed)>.5){appliedPadding=`${needed}px`;sidebar.style.paddingTop=appliedPadding;}
  }
  const coverObserver=new ResizeObserver(spaceCoverControls);
  window.addEventListener('resize',spaceCoverControls);
  function reconcile() {
    notificationButtons();reconcileShortcuts();
    if (route !== location.href) {route = location.href;cancelCountdown(); if(status.sessionId)setDismissed(true);}
    const editor = document.querySelector('.list-editor');
    const editorOpen = !!editor && editor.getBoundingClientRect().width > 0;
    if (listEditorOpen && !editorOpen && mediaId) {
      clearTimeout(refreshTimer);
      const editedMediaId = mediaId;
      refreshTimer = setTimeout(() => { if (mediaId === editedMediaId) loadMedia(true); }, 800);
    }
    listEditorOpen = editorOpen;
    const id = Number(location.pathname.match(/^\/anime\/(\d+)(?:\/|$)/)?.[1]) || null;
    const nextAccount = accountName();
    if (!invalidated && (nextAccount !== account || !port)) { account = nextAccount; send('hello', { account }).then(data => { panelPosition = data.panelPosition;notificationReads.clear();for(const key of data.notificationReads||[])notificationReads.add(key);notificationButtons(); positionPanel(); send('reviews').then(items=>{for(const item of items)reviews.set(item.id,item);maybeReview();}).catch(()=>{}); }).catch(() => {}); if (control) loadMedia(); }
    if (id !== mediaId) { clearCoverSpacing();coverObserver.disconnect();mediaId = id; model = null; generation++; controlHost?.remove(); controlHost = control = null; modal?.close(); }
    if (id && !controlHost?.isConnected) {
      // Observed on AniList: the cover's action row contains both list and favourite controls.
      const actions = document.querySelector('.cover-wrap-inner > .actions');
      if (actions) {
        controlHost = el('div', { id: 'ani-qw-controls', style: 'display:block;padding-bottom:10px' }); controlHost.style.marginTop = `${10 - (parseFloat(getComputedStyle(actions).marginBottom) || 0)}px`; actions.after(controlHost); control = root(controlHost);
        const wrap = el('div', { class: 'wrap' }); const split = el('div', { class: 'split' });
        split.append(el('button', { class: 'play', disabled: '' }, 'Loading playback…')); wrap.append(split, el('p', { class: 'note', role: 'status' })); control.append(wrap);
        coverObserver.observe(actions.parentElement);
        const sidebar=document.querySelector('.sidebar');if(sidebar)coverObserver.observe(sidebar);
        loadMedia();
      }
    }
    spaceCoverControls();
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
