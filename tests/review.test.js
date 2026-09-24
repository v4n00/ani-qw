import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreOptions,validateScore,reviewHistory} from '../extension/review.js';

test('scores respect all AniList scales and reject malformed input',()=>{
  for(const [format,value] of [['POINT_100',87],['POINT_10_DECIMAL',8.7],['POINT_10',8],['POINT_5',4],['POINT_3',3]]){
    assert.equal(validateScore(value,format),value);
    assert.equal(validateScore(0,format),0);
    assert.throws(()=>validateScore(scoreOptions(format).max+1,format));
    for(const bad of ['8',null,NaN,Infinity,-1])assert.throws(()=>validateScore(bad,format));
  }
  assert.throws(()=>validateScore(8.5,'POINT_10'));
  assert.throws(()=>validateScore(8.55,'POINT_10_DECIMAL'));
  assert.throws(()=>scoreOptions('UNKNOWN'));
});
test('prequels follow all anime branches recursively without cycles or duplicate reads',async()=>{
  const edge=(id,relationType='PREQUEL',type='ANIME')=>({relationType,node:{id,type}});
  const graph={1:[edge(2),edge(3),edge(9,'SEQUEL'),edge(10,'PREQUEL','MANGA')],2:[edge(4)],3:[edge(4)],4:[edge(1)]};
  const reads=[];
  const result=await reviewHistory(1,async id=>{reads.push(id);return {id,relations:{edges:graph[id]}};});
  assert.equal(result.current.id,1);
  assert.deepEqual(result.prequels.map(x=>x.id),[2,3,4]);
  assert.deepEqual(reads,[1,2,3,4]);
  await assert.rejects(reviewHistory(1,async()=>null),/Unable to load/);
  await assert.rejects(reviewHistory(1,async()=>{throw new Error('rate limited');}),/rate limited/);
});
