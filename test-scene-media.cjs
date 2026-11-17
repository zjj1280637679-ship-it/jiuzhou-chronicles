'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('./harness/scene-media.js');
function fixture() {
  const requests = [], displays = [], images = [], states = [], timers = new Map(); let timerId = 0;
  const loader = create({createImage() {
    const image = {removeAttribute() {}, set src(value) {this.url=value; requests.push(value);}};
    images.push(image); return image;
  }, onChange(path) {displays.push(path);}, onStatus(state) {states.push(state);},
  setTimer(fn) {timers.set(++timerId,fn);return timerId;}, clearTimer(id) {timers.delete(id);}});
  return {loader,requests,displays,images,states,timers};
}
test('only current poster and GIF start, poster displays first without loading old art or branches',()=>{
 const f=fixture();f.loader.select('current.gif','current-first-frame.png');
 assert.deepEqual(f.requests,['current-first-frame.png','current.gif']);
 assert.deepEqual(f.displays,['current-first-frame.png']);
 assert.equal(f.loader.getStatus().phase,'loading-poster');
 f.loader.select('current.gif','current-first-frame.png');assert.equal(f.images.length,2);
});
test('successful GIF swaps only after load and late poster errors cannot overwrite it',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[1].onload();
 assert.equal(f.displays.at(-1),'current.gif');assert.equal(f.loader.getStatus().phase,'ready');
 f.images[0].onerror();assert.equal(f.displays.at(-1),'current.gif');assert.equal(f.loader.getStatus().phase,'ready');
});
test('GIF failure keeps actual first frame, and cannot claim it is ready before load',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[1].onerror();
 assert.equal(f.loader.getStatus().phase,'fallback-loading');
 assert.deepEqual(f.displays,['poster.png']);
 f.images[0].onload();assert.equal(f.loader.getStatus().phase,'fallback');assert.equal(f.loader.getStatus().canRetry,true);
 assert.deepEqual(f.requests,['poster.png','current.gif']);
});
test('poster failure is reported but does not block a successful GIF',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[0].onerror();
 assert.equal(f.loader.getStatus().phase,'loading-no-poster');
 f.images[1].onload();assert.equal(f.loader.getStatus().phase,'ready');assert.equal(f.displays.at(-1),'current.gif');
});
test('both failed reports error, without ever reverting to unrelated artwork',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[0].onerror();f.images[1].onerror();
 assert.equal(f.loader.getStatus().phase,'error');assert.equal(f.loader.getStatus().canRetry,true);
 assert.deepEqual(f.displays,['poster.png']);
});
test('slow countdown is informational only and never retries or aborts',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');[...f.timers.values()][0]();
 assert.equal(f.loader.getStatus().phase,'slow-poster');f.images[0].onload();
 assert.equal(f.loader.getStatus().phase,'slow');assert.equal(f.requests.length,2);
 f.images[1].onerror();assert.equal(f.loader.getStatus().phase,'fallback');
 assert.equal(f.timers.size,0);assert.ok(f.states.every(s=>!('percent' in s)));
});
test('manual retry keeps loaded poster and only requests a unique GIF once',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');assert.equal(f.loader.retry(),false);
 f.images[0].onload();f.images[1].onerror();assert.equal(f.loader.retry(),true);
 assert.equal(f.displays.at(-1),'poster.png');assert.equal(f.images.length,3);
 assert.match(f.requests.at(-1),/^current\.gif\?scene_retry=/);assert.equal(f.loader.retry(),false);
 f.images[2].onload();assert.equal(f.loader.getStatus().phase,'ready');assert.equal(f.loader.getStatus().retrying,true);
});
test('retry of failed poster can refetch both current assets, not a different scene',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[0].onerror();f.images[1].onerror();f.loader.retry();
 assert.match(f.requests[2],/^poster\.png\?scene_retry=/);assert.match(f.requests[3],/^current\.gif\?scene_retry=/);
});
test('stale poster/GIF errors and timers cannot alter another scene or a retry',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');const latePoster=f.images[0].onload,lateGIF=f.images[1].onerror,lateTimer=[...f.timers.values()][0];
 f.loader.select('other.gif','other.png');latePoster();lateGIF();lateTimer();
 assert.equal(f.displays.at(-1),'other.png');assert.equal(f.loader.getStatus().phase,'loading-poster');
});
test('return to failed scene shows and checks its first frame without auto retrying GIF',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[0].onload();f.images[1].onerror();
 f.loader.select('other.webp');f.loader.select('current.gif','poster.png');
 assert.deepEqual(f.requests,['poster.png','current.gif','poster.png']);
 f.images[2].onload();assert.equal(f.loader.getStatus().phase,'fallback');
});
test('same resource restores display after external gradient overwrite without another probe',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[0].onload();f.images[1].onload();
 f.displays.push('gradient');f.loader.select('current.gif','poster.png');
 assert.equal(f.displays.at(-1),'current.gif');assert.equal(f.images.length,2);
});
test('static selection, reduced motion and empty state do not request GIF probes',()=>{
 const f=fixture();f.loader.select('poster.png');f.loader.select(null);
 assert.deepEqual(f.requests,[]);assert.deepEqual(f.displays,['poster.png',null]);
});
test('retry identifiers are not reused after changing scenes',()=>{
 const f=fixture();f.loader.select('current.gif','poster.png');f.images[0].onload();f.images[1].onerror();f.loader.retry();
 const first=f.requests.at(-1);f.images[2].onerror();f.loader.select('other.webp');f.loader.select('current.gif','poster.png');f.images[3].onload();f.loader.retry();
 assert.notEqual(f.requests.at(-1),first);
});
test('engine connects both surfaces to poster then GIF; reduced motion selects poster not old art',()=>{
 const {WebVisualNovelEngine}=require('./app.js'),registry=require('./illustration-system.js');
 const layer={style:{},dataset:{}},probes=[];let reduced=false;
 const saved={document:global.document,window:global.window,Image:global.Image};
 global.document={getElementById(){return layer;}};
 global.window={matchMedia(){return {matches:reduced};},dispatchEvent(){}};
 global.Image=class {constructor(){probes.push(this);}removeAttribute(){}};
 try {
  const e=Object.create(WebVisualNovelEngine.prototype);e.currentFaction='qing';e.currentStoryNodeId='qing_act1';
  e.getSceneIllustration=()=>registry.sceneFor({faction:'qing',nodeId:'qing_act1'});
  e.refreshStageBackground();assert.match(e.currentSceneMediaPath,/-first-frame\.png$/);
  assert.equal(layer.style.backgroundImage,`url("${e.currentScenePosterPath}")`);
  probes[0].onload();probes[1].onload();assert.equal(e.currentSceneMediaPath,e.currentSceneAnimationPath);
  layer.style.backgroundImage='gradient';e.refreshStageBackground();assert.equal(layer.style.backgroundImage,`url("${e.currentSceneAnimationPath}")`);
  reduced=true;e.refreshStageBackground();assert.equal(e.currentSceneAnimationPath,null);assert.equal(e.currentSceneMediaPath,e.currentScenePosterPath);
  assert.notEqual(e.currentSceneMediaPath,e.currentSceneIllustration.relativePath);
 } finally {for(const key of Object.keys(saved)) if(saved[key]===undefined)delete global[key];else global[key]=saved[key];}
});
