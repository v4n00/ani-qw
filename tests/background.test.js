import test from 'node:test';
import assert from 'node:assert/strict';

test('background account checks, retry, completion replay, and expired authorization', async () => {
  const listeners = {};
  const saved = { token: 'test-token', user: { id: 7, name: 'fixture' } };
  const completions = [];
  const acknowledgements = [];
  const mutations = [];
  const nativeRequests=[];
  let notes = 'Existing note', score=0; const noteWrites=[];
  let progress = 2; let entryStatus = 'CURRENT';
  let failMutation = false;
  let expired = false;
  let limited = false;
  let reads = 0, viewerReads = 0;
  let nativeMessage;
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  globalThis.chrome = {
    storage: { local: {
      async setAccessLevel(value) { assert.equal(value.accessLevel, 'TRUSTED_CONTEXTS'); },
      async get(keys) { return Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(k => [k, saved[k]])); },
      async set(values) { Object.assign(saved, values); },
      async remove(keys) { keys.forEach(k => delete saved[k]); }
    } },
    runtime: {
      id: 'extension', onConnect: event('connect'), onMessage: event('settings'),
      getURL: path => `chrome-extension://extension/${path}`, openOptionsPage: async () => {},
      connectNative() { return {
        onMessage: { addListener(fn) { nativeMessage = fn; } }, onDisconnect: event('nativeDisconnect'),
        postMessage(msg) {
          nativeRequests.push(msg);
          if (msg.command === 'ack') { acknowledgements.push(msg.completionId); const i = completions.findIndex(c => c.id === msg.completionId); if (i >= 0) completions.splice(i, 1); }
          queueMicrotask(() => nativeMessage({ v: 1, id: msg.id, event: 'result', data: msg.command === 'state' ? { state: { phase: 'idle' }, completions: [...completions] } : msg.command === 'play' ? {sessionId:'session'} : {} }));
        }
      }; }
    },
    action: { onClicked: event('action') },
    alarms: { create() {}, onAlarm: event('alarm') }
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://graphql.anilist.co');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const { query, variables } = JSON.parse(init.body);
    reads++;
    if (expired) return { status: 401 };
    if (limited) return { status: 429, headers: { get: () => '60' } };
    if (query.includes('SaveMediaListEntry')) {
      if (failMutation) throw new Error('Offline');
      if (Object.hasOwn(variables,'notes') || Object.hasOwn(variables,'score')) { if(Object.hasOwn(variables,'notes'))notes=variables.notes;if(Object.hasOwn(variables,'score'))score=variables.score; noteWrites.push(variables); return {ok:true,status:200,json:async()=>({data:{SaveMediaListEntry:{id:1}}})}; }
      mutations.push(variables); progress = query.includes('status:REPEATING') ? 0 : variables.progress; entryStatus = query.includes('status:REPEATING') ? 'REPEATING' : variables.status;
      return { ok: true, status: 200, json: async () => ({ data: { SaveMediaListEntry: { progress } } }) };
    }
    if (query.includes('Viewer')) { viewerReads++; return { ok: true, status: 200, json: async () => ({ data: { Viewer: { id: 7, name: 'fixture', mediaListOptions:{scoreFormat:'POINT_10_DECIMAL'} } } }) }; }
    assert.ok(!query.includes('airingSchedule('), 'schedule must use Page.airingSchedules');
    return { ok: true, status: 200, json: async () => ({ data: { Media: { id: variables.id, title: { romaji: 'Example' }, synonyms: [], format: 'TV', status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 9 }, mediaListEntry: { progress, status: entryStatus, notes, score }, relations:{edges:[]} }, Page: { airingSchedules: [] } } }) };
  };
  await import('../extension/background.js');
  const inbox = [];
  let pageListener;
  const port = { name: 'ani-qw', sender: { tab: { id: 1 }, url: 'https://anilist.co/anime/1/' }, onDisconnect: { addListener() {} }, onMessage: { addListener(fn) { pageListener = fn; } }, postMessage(m) { inbox.push(m); } };
  listeners.connect(port);
  const until = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('Expected background event was not delivered'); };
  let id = 0;
  const call = async (type, data = {}) => { const requestId = String(++id); await pageListener({ id: requestId, type, ...data }); return inbox.find(m => m.id === requestId); };
  const unsupported=await call('future-request');
  assert.equal(unsupported.code,'unsupported_request');
  assert.match(unsupported.error,/future-request.*Reload Ani-QW/);
  await call('hello', { account: 'different' });
  assert.match((await call('media', { mediaId: 1 })).error, /mismatch/);
  assert.match((await call('resume',{mediaId:1,episode:3})).error,/mismatch/);
  await call('hello', { account: 'fixture' });
  assert.match((await call('panelPosition', { position: { left: 'bad', top: 5 } })).error, /Invalid/);
  await call('panelPosition', { position: { left: 25, top: 90 } });
  assert.deepEqual((await call('hello', { account: 'fixture' })).data.panelPosition, { left: 25, top: 90 });
  assert.equal((await call('media', { mediaId: 1 })).data.next, 3);
  await call('resume',{mediaId:1,episode:3});
  assert.equal(nativeRequests.find(r=>r.command==='resume').userId,7,'resume is bound to authenticated user');
  await call('play',{mediaId:1,episode:3,startOver:true});
  assert.equal(nativeRequests.find(r=>r.command==='play').startOver,true,'explicit restart reaches helper');
  const before = reads;
  await Promise.all(Array.from({length: 8}, () => call('media', { mediaId: 1 })));
  assert.equal(reads, before, 'focus changes and concurrent tabs reuse recent metadata');
  assert.equal(viewerReads, 1, 'Viewer is shared across requests');
  progress = 3;
  assert.equal((await call('media', { mediaId: 1, fresh: true })).data.next, 4, 'Play must fetch fresh external list progress');
  progress = 2;
  assert.match((await call('play', { mediaId: 1, episode: 10 })).error, /not aired/);
  const completion = { id: 'completion-1', sessionId: 'session', userId: 7, mediaId: 1, episode: 3 };
  await call('play',{mediaId:1,episode:3,notification:true});
  completions.push(completion); failMutation = true;
  nativeMessage({ v: 1, event: 'completion', data: completion });
  await until(() => inbox.some(m => m.event === 'sync' && m.data.error === 'Offline'));
  assert.equal(acknowledgements.length, 0, 'failed sync must remain unacknowledged');
  assert.equal(saved.notificationReads,undefined,'failed progress sync leaves notification unread');
  failMutation = false; listeners.alarm({ name: 'sync' });
  await until(() => acknowledgements.length === 1);
  assert.deepEqual(mutations, [{ mediaId: 1, progress: 3, status: 'CURRENT' }]);
  assert.deepEqual(saved.notificationReads[7],['1:3'],'successful notification playback persists read marker');
  assert.deepEqual((await call('hello',{account:'fixture'})).data.notificationReads,['1:3'],'read marker survives reconnect');
  assert.deepEqual((await call('hello',{account:'different'})).data.notificationReads,[],'read markers are account isolated');
  await call('hello',{account:'fixture'});
  await until(() => inbox.some(m => m.event === 'synced'));
  assert.deepEqual(inbox.find(m => m.event === 'synced').data, {mediaId:1,episode:3,sessionId:'session',nextEpisode:4}, 'sync success carries session identity and aired successor');
  nativeMessage({ v: 1, event: 'completion', data: completion });
  await until(() => acknowledgements.length === 2);
  assert.equal(mutations.length, 1, 'duplicate delivery must not repeat mutation');
  const other = { ...completion, id: 'other-account', userId: 9 }; completions.push(other); nativeMessage({ v: 1, event: 'completion', data: other });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(acknowledgements.length, 2, 'other-account event must remain queued');
  progress = 12; entryStatus = 'COMPLETED';
  await call('media', {mediaId:1,fresh:true});
  const count = mutations.length;
  const rewatches = await Promise.all([call('play',{mediaId:1,episode:1,rewatch:true}),call('play',{mediaId:1,episode:1,rewatch:true})]);
  assert.ok(rewatches.every(r=>!r.error));
  assert.equal(mutations.length,count,'rewatch click must not mutate AniList');
  assert.equal(entryStatus,'COMPLETED'); assert.equal(progress,12);
  const rewatchDone={...completion,id:'rewatch-done',sessionId:'rewatch-session',episode:1,rewatch:true,repeatBase:0};
  nativeMessage({v:1,event:'completion',data:rewatchDone});
  await until(()=>mutations.length===count+1);
  assert.equal(entryStatus,'REPEATING');assert.equal(progress,1);
  nativeMessage({v:1,event:'completion',data:rewatchDone});
  await new Promise(r=>setTimeout(r,20));
  assert.equal(mutations.length,count+1,'replayed rewatch event is idempotent');

  const finalEpisode={...completion,id:'series-completed',episode:12,sessionId:'final-session'};
  nativeMessage({v:1,event:'completion',data:finalEpisode});
  await until(()=>saved.reviews?.some(r=>r.id==='series-completed'));
  assert.equal(noteWrites.length,0,'completion only prompts, never writes a note automatically');
  const reviewId='series-completed';
  await call('hello',{account:'different'});
  assert.deepEqual((await call('reviews')).data,[],'other account cannot see prompt');
  assert.match((await call('saveReview',{reviewId,comment:'wrong account'})).error,/mismatch/);
  await call('hello',{account:'fixture'});
  assert.equal((await call('claimReview',{reviewId})).data.claimed,true);
  const context=(await call('reviewContext',{reviewId})).data;
  assert.equal(context.scoring.format,'POINT_10_DECIMAL');
  assert.deepEqual(context.prequels,[]);
  assert.match((await call('saveReview',{reviewId,score:11,scoreFormat:'POINT_10_DECIMAL'})).error,/score from/);
  assert.match((await call('saveReview',{reviewId,score:8,scoreFormat:'POINT_100'})).error,/scoring settings changed/);
  assert.ok(!(await call('saveReview',{reviewId,comment:'Great ending',score:8.5,scoreFormat:'POINT_10_DECIMAL'})).error);
  assert.equal(notes,'Existing note\n\nGreat ending','notes append preserves existing text');
  assert.equal(progress,12,'review cannot alter progress');assert.equal(score,8.5);
  await call('saveReview',{reviewId,comment:'Great ending'});
  assert.equal(noteWrites.length,1,'duplicate save cannot append twice');
  assert.equal(saved.reviews.length,0,'saved prompt removed');
  saved.reviews=[{id:'score-only',userId:7,mediaId:1}];
  await call('claimReview',{reviewId:'score-only'});
  assert.ok(!(await call('saveReview',{reviewId:'score-only',score:0,scoreFormat:'POINT_10_DECIMAL'})).error);
  assert.equal(score,0);assert.equal(notes,'Existing note\n\nGreat ending');
  assert.deepEqual(noteWrites.at(-1),{mediaId:1,score:0},'score-only save must omit notes and progress');
  assert.match((await call('reviewContext',{reviewId:'score-only'})).error,/closed|pending/);
  saved.reviews=[{id:'edit-notes',userId:7,mediaId:1}];
  await call('claimReview',{reviewId:'edit-notes'});
  const oldNotes=notes;
  assert.match((await call('saveReview',{reviewId:'edit-notes',comment:'Edited note',originalNotes:'stale'})).error,/Notes changed/);
  assert.equal(notes,oldNotes);
  assert.ok(!(await call('saveReview',{reviewId:'edit-notes',comment:'Edited note',originalNotes:oldNotes})).error);
  assert.equal(notes,'Edited note','prefilled notes replace rather than append');
  saved.reviews=[{id:'clear-notes',userId:7,mediaId:1}];
  await call('claimReview',{reviewId:'clear-notes'});
  assert.ok(!(await call('saveReview',{reviewId:'clear-notes',comment:'',originalNotes:'Edited note'})).error);
  assert.equal(notes,'','explicitly clearing existing notes is supported');
  const settingsRequest=data=>new Promise(resolve=>listeners.settings(data,{id:'extension',url:'chrome-extension://extension/options.html'},resolve));
  const prefs=await settingsRequest({type:'saveCache',cacheGiB:20,watchedPercent:80,seeding:true,keepVideo:true,resolution:'720p',preferredGroup:'Group'});
  assert.ok(!prefs.error);
  assert.equal(nativeRequests.at(-1).resolution,'720p');assert.equal(nativeRequests.at(-1).preferredGroup,'Group');
  assert.match((await settingsRequest({type:'saveCache',cacheGiB:20,watchedPercent:80,resolution:'invalid'})).error,/Choose Auto/);
  expired = true;
  assert.match((await call('media', { mediaId: 1, fresh: true })).error, /expired/);
  expired = false; limited = true;
  assert.match((await call('media', { mediaId: 1, fresh: true })).error, /60 seconds/);
  const afterLimit = reads;
  assert.match((await call('media', { mediaId: 1, fresh: true })).error, /seconds/);
  assert.equal(reads, afterLimit, 'backoff prevents further network requests');
});
