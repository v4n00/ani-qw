import test from 'node:test';
import assert from 'node:assert/strict';
import { availability, nextEpisode, progressUpdate } from '../extension/core.js';
const media = overrides => ({ id: 1, status: 'RELEASING', episodes: 12, format: 'TV', nextAiringEpisode: { episode: 8 }, mediaListEntry: { progress: 0, status: 'CURRENT' }, ...overrides });
test('first, next, and caught-up episodes', () => {
  assert.equal(nextEpisode(media()), 1);
  assert.equal(nextEpisode(media({ mediaListEntry: { progress: 3 } })), 4);
  assert.equal(nextEpisode(media({ mediaListEntry: { progress: 7 } })), 7);
});
test('finished shows only restart after all episodes are watched', () => {
  assert.equal(nextEpisode(media({ status: 'FINISHED', mediaListEntry: { progress: 3 } })), 4);
  assert.equal(nextEpisode(media({ status: 'FINISHED', mediaListEntry: { progress: 12 } })), 1);
});
test('unreleased, movie, and unknown episode counts', () => {
  assert.equal(nextEpisode(media({ status: 'NOT_YET_RELEASED' })), null);
  assert.equal(nextEpisode(media({ nextAiringEpisode: { episode: 1 } })), null);
  assert.equal(nextEpisode(media({ format: 'MOVIE', status: 'FINISHED', episodes: 1 })), 1);
  const unknown = media({ episodes: null, nextAiringEpisode: null, mediaListEntry: { progress: 100 } });
  assert.equal(availability(unknown), null); assert.equal(nextEpisode(unknown), 101);
  assert.equal(availability({ ...unknown, airingSchedule: { nodes: [{ episode: 105, airingAt: 100 }] } }, 200), 105);
});
test('completion updates are monotonic and retain completed status', () => {
  assert.equal(progressUpdate(media({ mediaListEntry: { progress: 9 } }), 8), null);
  assert.deepEqual(progressUpdate(media(), 3), { mediaId: 1, progress: 3, status: 'CURRENT' });
  assert.deepEqual(progressUpdate(media(), 12), { mediaId: 1, progress: 12, status: 'COMPLETED' });
  assert.equal(progressUpdate(media({ mediaListEntry: { progress: 2, status: 'COMPLETED' } }), 3).status, 'COMPLETED');
});

test('rewatching continues until final episode and increments repeat count once', () => {
  const m=media({status:'FINISHED',mediaListEntry:{status:'REPEATING',progress:3,repeat:2}});
  assert.equal(nextEpisode(m),4);
  assert.deepEqual(progressUpdate(m,4),{mediaId:1,progress:4,status:'REPEATING'});
  assert.deepEqual(progressUpdate(m,12),{mediaId:1,progress:12,status:'COMPLETED',repeat:3});
  assert.equal(progressUpdate({...m,mediaListEntry:{status:'COMPLETED',progress:12,repeat:3}},12),null);
  assert.equal(nextEpisode(media({mediaListEntry:{status:'COMPLETED',progress:4}})),1);
});

test('deferred full rewatch and one-off replay have distinct progress rules', () => {
 const m=media({episodes:24,mediaListEntry:{status:'CURRENT',progress:20}});
 assert.equal(progressUpdate(m,10),null);
 const completed={...m,mediaListEntry:{status:'COMPLETED',progress:24,repeat:2}};
 assert.equal(progressUpdate(completed,10),null);
 assert.deepEqual(progressUpdate(completed,1,{rewatch:true,repeatBase:2}),{mediaId:1,progress:1,status:'REPEATING'});
 assert.equal(progressUpdate({...completed,mediaListEntry:{...completed.mediaListEntry,repeat:3}},1,{rewatch:true,repeatBase:2}),null);
});
