import { trustedStorage } from './storage.js';
const chrome = globalThis.browser || globalThis.chrome;
import { availability, nextEpisode, progressUpdate, helperMedia, playbackLabel } from './core.js';
import { scoreOptions, validateScore, reviewHistory } from './review.js';
import { CLIENT_ID, pastedToken } from './auth.js';

const HOST = 'co.aniqw.player';
const ports = new Map();
const reviewOwners = new Map();
const requests = new Map();
let native = null;
let state = { phase: 'idle' };
let syncChain = Promise.resolve();
let pending = new Map();
let lastNativeAttempt = 0;
let retryAt = 0;
let authGeneration = 0;
const readCache = new Map();
const readInFlight = new Map();
const {ready,storage} = trustedStorage(chrome);
const mediaFields = `id title { romaji english native } synonyms format status episodes
  nextAiringEpisode { episode airingAt }
  mediaListEntry { id progress status repeat notes }`;

async function api(query, variables = {}, candidateToken, fresh = false) {
  const cacheable = !candidateToken && !query.trimStart().startsWith('mutation');
  const key = JSON.stringify([authGeneration, query, variables]);
  if (cacheable) {
    if (readInFlight.has(key)) return readInFlight.get(key);
    const cached = readCache.get(key);
    if (!fresh && cached && cached.until > Date.now()) return cached.data;
  }
  const request = apiRequest(query, variables, candidateToken);
  if (cacheable) readInFlight.set(key, request);
  try {
    const data = await request;
    if (cacheable) {
      if (readCache.size > 100) readCache.clear();
      readCache.set(key, { data, until: Date.now() + (query === 'query { Viewer { id name } }' ? 300000 : 15000) });
    } else if (!candidateToken) readCache.clear();
    return data;
  } finally { if (readInFlight.get(key) === request) readInFlight.delete(key); }
}

async function apiRequest(query, variables, candidateToken) {
  const requestGeneration = authGeneration;
  await ready;
  const token = candidateToken ?? (await storage.get('token')).token;
  if (requestGeneration !== authGeneration) throw new Error('AniList account changed. Retry with the connected account.');
  if (!token) throw new Error('Connect AniList in Ani-QW settings first.');
  if (Date.now() < retryAt) throw rateLimitError();
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000)
  });
  if (res.status === 401) throw new Error('AniList authorization expired. Reconnect in Ani-QW settings.');
  if (res.status === 429) { retryAt = Date.now() + Math.max(60, Number(res.headers.get('Retry-After')) || 60) * 1000; throw rateLimitError(); }
  let body;
  try { body = await res.json(); } catch { throw new Error(`AniList returned an unreadable response (HTTP ${res.status}). Retry shortly.`); }
  if (!res.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message || `AniList returned HTTP ${res.status}`);
  return body.data;
}
function rateLimitError() { return new Error(`AniList is limiting requests. Try again in ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))} seconds. Saved watch progress will retry automatically.`); }

async function getMedia(id, fresh = false) {
  const data = await api(`query($id:Int!){Media(id:$id,type:ANIME){${mediaFields}} Page(perPage:1){airingSchedules(mediaId:$id,notYetAired:false,sort:EPISODE_DESC){episode airingAt}}}`, { id }, undefined, fresh);
  if (data.Media) data.Media.airingSchedule = { nodes: data.Page?.airingSchedules || [] };
  return data.Media;
}
function broadcast(event, data) { for (const port of ports.keys()) { try { port.postMessage({ event, data }); } catch {} } }
function syncError(error) { broadcast('sync', { error: error.message || String(error) }); }

function connectNative() {
  if (native) return native;
  lastNativeAttempt = Date.now();
  const port = chrome.runtime.connectNative(HOST); native = port;
  port.onMessage.addListener(msg => {
    if (msg.v !== 1) { syncError(new Error('Helper protocol mismatch. Reinstall Ani-QW.')); return; }
    if (msg.id && requests.has(msg.id)) {
      const request = requests.get(msg.id); requests.delete(msg.id); clearTimeout(request.timer);
      if (msg.event === 'error') request.reject(Object.assign(new Error(msg.error), { code: msg.code })); else request.resolve(msg.data);
    }
    if (msg.event === 'state') { state = msg.data; broadcast('state', state); }
    if (msg.event === 'failure') broadcast('failure', msg.data);
    if (msg.event === 'completion') { pending.set(msg.data.id, msg.data); queueSync(); }
  });
  port.onDisconnect.addListener(() => {
    const error = new Error(chrome.runtime.lastError?.message || 'Helper disconnected. Press Play to reconnect.');
    if (native === port) native = null;
    for (const r of requests.values()) { clearTimeout(r.timer); r.reject(error); } requests.clear();
    if (state.phase !== 'idle') broadcast('connection', { error: 'Helper disconnected. Playback may still be running; reconnect to recover status.' });
  });
  return port;
}

function rpc(command, data = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('Helper timed out. Retry or choose another release.')); }, 95000);
    requests.set(id, { resolve, reject, timer });
    try { connectNative().postMessage({ v: 1, id, command, ...data }); }
    catch (e) { clearTimeout(timer); requests.delete(id); reject(e); }
  });
}

async function recover() {
  const data = await rpc('state'); state = data.state; broadcast('state', state);
  for (const c of data.completions) pending.set(c.id, c);
  queueSync();
}

async function accountMatches(user) {
  const identities = [...ports.values()].map(p => p.account).filter(Boolean);
  if (!identities.length) return false;
  return identities.every(name => name.toLowerCase() === user.name.toLowerCase());
}

function queueSync() {
  syncChain = syncChain.then(async () => {
    if (!pending.size) return;
    const { user } = await storage.get('user');
    if (!user || ![...pending.values()].some(c => c.userId === user.id)) return;
    if (Date.now() < retryAt) return;
    const generation = authGeneration;
    const { Viewer: viewer } = await api('query { Viewer { id name } }');
    if (!(await accountMatches(viewer))) throw new Error('Watch progress is saved. Open AniList with the connected account to sync it.');
    for (const c of pending.values()) {
      if (c.userId !== viewer.id) continue;
      const media = await getMedia(c.mediaId, true);
      if (!media) throw new Error('Anime no longer exists on AniList.');
      if (generation !== authGeneration || !(await accountMatches(viewer))) throw new Error('Account changed. Watch progress is saved for later synchronization.');
      const update = progressUpdate(media, c.episode, c);
      if (update) await api('mutation($mediaId:Int!,$progress:Int!,$status:MediaListStatus,$repeat:Int){SaveMediaListEntry(mediaId:$mediaId,progress:$progress,status:$status,repeat:$repeat){id progress}}', update);
      if (update?.status === 'COMPLETED') {
        const { reviews = [] } = await storage.get('reviews');
        if (!reviews.some(r => r.id === c.id)) {
          reviews.push({ id:c.id, userId:viewer.id, mediaId:c.mediaId, title:media.title.english || media.title.romaji, sessionId:c.sessionId });
          await storage.set({reviews:reviews.slice(-20)});
        }
        broadcast('review', reviews.find(r=>r.id===c.id));
      }
      const {notificationLaunches={},notificationReads={}}=await storage.get(['notificationLaunches','notificationReads']);
      const launch=notificationLaunches[c.sessionId];
      if(launch?.userId===viewer.id && launch.mediaId===c.mediaId && launch.episode===c.episode){
        const key=`${c.mediaId}:${c.episode}`,reads=notificationReads[viewer.id]||[];
        notificationReads[viewer.id]=[...new Set([...reads,key])].slice(-1000);
        // Persist before acknowledging completion so retries can finish notification handling.
        await storage.set({notificationReads});
        broadcast('notificationRead',{account:viewer.name,key});
      }
      await rpc('ack', { completionId: c.id, userId: viewer.id });
      pending.delete(c.id);
      const aired = availability(media);
      broadcast('synced', { mediaId: c.mediaId, episode: c.episode, sessionId: c.sessionId, nextEpisode: aired !== null && c.episode < aired ? c.episode + 1 : null });
    }
  }).catch(syncError);
}

async function handle(message, port) {
  const record = ports.get(port);
  switch (message.type) {
    case 'hello': {
      record.account = message.account || null;
      if (!native && Date.now() - lastNativeAttempt > 5000) recover().catch(e => broadcast('connection', { error: `${e.message} Run ani-qw doctor if this persists.` }));
      const stored=await storage.get(['panelPosition','user','notificationReads']);
      const reads=stored.user?.name.toLowerCase()===record.account?.toLowerCase()?stored.notificationReads?.[stored.user.id]||[]:[];
      queueSync(); return { state, panelPosition: stored.panelPosition || null, notificationReads:reads };
    }
    case 'reviews': {
      const { user, reviews = [] } = await storage.get(['user','reviews']);
      return user && record.account?.toLowerCase() === user.name.toLowerCase() ? reviews.filter(r=>r.userId===user.id) : [];
    }
    case 'reviewContext': {
      const generation = authGeneration;
      const {Viewer:user} = await api('query { Viewer { id name mediaListOptions { scoreFormat } } }');
      const {reviews=[]} = await storage.get('reviews');
      const review = reviews.find(r=>r.id===message.reviewId && r.userId===user.id);
      const check = () => {
        if (generation !== authGeneration || record.account?.toLowerCase() !== user.name.toLowerCase() || reviewOwners.get(message.reviewId) !== port)
          throw new Error('Review closed or AniList account changed. Reopen the review to retry.');
      };
      check();
      if (!review) throw new Error('This review is no longer pending.');
      const scoring = scoreOptions(user.mediaListOptions?.scoreFormat);
      const history = await reviewHistory(review.mediaId,async id=>{
        check();
        const {Media} = await api('query($id:Int!){Media(id:$id,type:ANIME){id title{romaji english} mediaListEntry{score notes} relations{edges{relationType node{id type}}}}}',{id});
        check();return Media;
      });
      return {scoring,...history};
    }
    case 'claimReview': case 'saveReview': case 'dismissReview': {
      const task = syncChain.then(async () => {
        const generation = authGeneration;
        const { Viewer: user } = await api('query { Viewer { id name } }');
        if (record.account?.toLowerCase() !== user.name.toLowerCase()) throw new Error('AniList account mismatch. Reconnect the correct account.');
        const {reviews=[]} = await storage.get('reviews');
        const review = reviews.find(r=>r.id===message.reviewId && r.userId===user.id);
        if (!review) return {gone:true};
        const owner = reviewOwners.get(review.id);
        if (owner && ports.has(owner) && owner !== port) return {claimed:false};
        reviewOwners.set(review.id,port);
        if (message.type === 'claimReview') return {claimed:true,...review};
        if (message.type === 'saveReview') {
          const comment = typeof message.comment === 'string' ? message.comment.trim() : '';
          const editingNotes = typeof message.originalNotes === 'string';
          const hasScore = message.score !== undefined && message.score !== null;
          if ((!comment && !hasScore && !editingNotes) || comment.length > 10000) throw new Error('Enter a score or a comment of up to 10,000 characters.');
          let score;
          if (hasScore) {
            const {Viewer} = await api('query { Viewer { id name mediaListOptions { scoreFormat } } }',{},undefined,true);
            if (Viewer.id !== user.id || message.scoreFormat !== Viewer.mediaListOptions?.scoreFormat) throw new Error('AniList scoring settings changed. Reopen the review to reload them.');
            score = validateScore(message.score,Viewer.mediaListOptions.scoreFormat);
          }
          const media = await getMedia(review.mediaId,true);
          if (!media?.mediaListEntry) throw new Error('This anime is no longer in your AniList list.');
          if (generation !== authGeneration || !(await accountMatches(user))) throw new Error('AniList account changed. Reconnect the original account before saving notes.');
          const previous = media.mediaListEntry.notes || '';
          // Retry after a lost response must not append the same comment twice.
          if (editingNotes && previous !== message.originalNotes && previous !== comment) throw new Error('Notes changed on AniList. Reopen the review before saving to avoid overwriting them.');
          const notes = editingNotes ? comment : previous === comment || previous.endsWith('\n\n'+comment) ? previous : [previous,comment].filter(Boolean).join('\n\n');
          const variables = {mediaId:review.mediaId};
          if (notes !== previous) variables.notes = notes;
          if (hasScore) variables.score = score;
          if (Object.keys(variables).length > 1) {
            const args = [variables.notes !== undefined ? '$notes:String!, notes:$notes' : '', hasScore ? '$score:Float!, score:$score' : ''].filter(Boolean).map(s=>s.split(', '));
            await api(`mutation($mediaId:Int!,${args.map(a=>a[0]).join(',')}){SaveMediaListEntry(mediaId:$mediaId,${args.map(a=>a[1]).join(',')}){id}}`,variables);
          }
        }
        await storage.set({reviews:reviews.filter(r=>r.id!==review.id)});
        reviewOwners.delete(review.id); broadcast('reviewDismissed',{id:review.id}); return {};
      });
      syncChain = task.catch(()=>{}); return task;
    }
    case 'panelPosition': {
      const p = message.position;
      if (!p || !Number.isFinite(p.left) || !Number.isFinite(p.top) || Math.abs(p.left) > 100000 || Math.abs(p.top) > 100000) throw new Error('Invalid panel position');
      await storage.set({ panelPosition: { left: p.left, top: p.top } }); return {};
    }
    case 'media': {
      const [media, { autoSelect = true }, { Viewer: user }] = await Promise.all([getMedia(message.mediaId, !!message.fresh), storage.get('autoSelect'), api('query { Viewer { id name } }')]);
      if (!media) throw new Error('Anime not found.');
      if (!record.account || user.name.toLowerCase() !== record.account.toLowerCase()) throw new Error('AniList account mismatch. Sign into the account connected in Ani-QW settings.');
      return { media, available: availability(media), next: nextEpisode(media), label: playbackLabel(media), autoSelect };
    }
    case 'autoSelect': await storage.set({ autoSelect: !!message.value }); return {};
    case 'settings': await chrome.runtime.openOptionsPage(); return {};
    case 'resume': case 'search': case 'files': case 'play': {
      const media = await getMedia(message.mediaId);
      const { Viewer: user } = await api('query { Viewer { id name } }');
      if (!record.account || user.name.toLowerCase() !== record.account.toLowerCase()) throw new Error('AniList account mismatch. Reconnect the correct account.');
      const episode = message.episode ?? nextEpisode(media);
      const available = availability(media);
      if (!Number.isInteger(episode) || episode < 1 || episode > 100000 || (available !== null && episode > available)) throw new Error('This episode has not aired yet.');
      const result=await rpc(message.type, { media: helperMedia(media), episode, userId: user.id, rewatch: !!message.rewatch && media.mediaListEntry?.status === 'COMPLETED', repeatBase: media.mediaListEntry?.repeat || 0,
        startOver: message.startOver === true, query: message.query || '', torrent: message.torrent || null, fileIndex: message.fileIndex ?? null });
      if(message.type==='play' && message.notification===true && result?.sessionId){
        const task=syncChain.then(async()=>{
          const {notificationLaunches={}}=await storage.get('notificationLaunches');
          notificationLaunches[result.sessionId]={userId:user.id,mediaId:media.id,episode};
          await storage.set({notificationLaunches:Object.fromEntries(Object.entries(notificationLaunches).slice(-1000))});
        });syncChain=task.catch(()=>{});await task;
      }
      return result;
    }
    case 'stop': return rpc('stop', { sessionId: message.sessionId });
    case 'cancel': return rpc('cancel');
    case 'reconnect': await recover(); return {};
    default: throw Object.assign(new Error(`Unsupported extension request: ${String(message.type)}. Reload Ani-QW and refresh AniList.`), {code:'unsupported_request'});
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ani-qw' || !port.sender?.tab || new URL(port.sender.url).origin !== 'https://anilist.co') return;
  ports.set(port, { account: null });
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async message => {
    try { const data = await handle(message, port); port.postMessage({ id: message.id, data }); }
    catch (error) { try { port.postMessage({ id: message.id, error: error.message, code: error.code }); } catch {} }
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('options.html')) return;
  (async () => {
    await ready;
    if (message.type === 'settings') {
      const { user = null } = await storage.get(['clientId', 'user']);
      return { user };
    }
    if (message.type === 'updates') return rpc('updates');
    if (message.type === 'cacheSettings') return rpc('settings');
    if (message.type === 'saveCache') {
      if (message.keepVideo !== false && (!Number.isInteger(message.cacheGiB) || message.cacheGiB < 1 || message.cacheGiB > 1024)) throw new Error('Choose a cache size from 1 to 1024 GiB.');
      if (!Number.isInteger(message.watchedPercent) || message.watchedPercent < 1 || message.watchedPercent > 99) throw new Error('Choose a watched percentage from 1 to 99.');
      if (message.keepVideo !== undefined && typeof message.keepVideo !== 'boolean') throw new Error('Cache retention must be enabled or disabled.');
      if (message.seeding !== undefined && typeof message.seeding !== 'boolean') throw new Error('Sharing must be enabled or disabled.');
      if (message.resolution !== undefined && !['auto','1080p','720p'].includes(message.resolution)) throw new Error('Choose Auto, 1080p, or 720p.');
      if (message.preferredGroup !== undefined && (typeof message.preferredGroup !== 'string' || message.preferredGroup.length>80 || /[\r\n\0]/.test(message.preferredGroup))) throw new Error('Enter a release group of up to 80 characters.');
      return rpc('settings', { resolution:message.resolution,preferredGroup:message.preferredGroup,cacheGiB: message.keepVideo === false ? undefined : message.cacheGiB, watchedPercent: message.watchedPercent, seeding: message.seeding, keepVideo: message.keepVideo });
    }
    if (message.type === 'disconnect') { authGeneration++; await storage.remove(['token', 'user']); return {}; }
    if (message.type === 'token') {
      const generation = ++authGeneration;
      const token = pastedToken(message.token);
      const { Viewer: user } = await api('query { Viewer { id name } }', {}, token);
      if (!Number.isInteger(user?.id) || user.id < 1 || typeof user.name !== 'string' || !user.name) throw new Error('AniList did not return a valid account. Please retry.');
      if (generation !== authGeneration) throw new Error('Connection cancelled by a newer account action. Please retry.');
      await storage.set({ token, clientId: CLIENT_ID, user }); queueSync(); return { user };
    }
    throw new Error('Unknown settings request');
  })().then(data => respond({ data }), error => respond({ error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.alarms.create('sync', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'sync' && ports.size && (native || pending.size || state.phase !== 'idle')) recover().catch(syncError); });
