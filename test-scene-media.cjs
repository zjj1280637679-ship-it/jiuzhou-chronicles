'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('./harness/scene-media.js');
function fixture() {
  const requests = [], displays = [], images = [], states = [], timers = new Map();
  let timerId = 0;
  const loader = create({createImage() {
    const image = {removeAttribute() {}, set src(value) {requests.push(value);}};
    images.push(image); return image;
  }, onChange(path) {displays.push(path);}, onStatus(state) {states.push(state);},
    setTimer(fn) {timers.set(++timerId, fn); return timerId;}, clearTimer(id) {timers.delete(id);}});
  return {loader, requests, displays, images, states, timers};
}
test('one current GIF, not its static fallback or other branches', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp');
  assert.deepEqual(f.requests, ['current.gif']); assert.deepEqual(f.displays, ['current.gif']);
  f.loader.select('current.gif', 'current.webp');
  assert.equal(f.images.length, 1); assert.equal(f.displays.length, 2);
});
test('static selection has no extra image probe or prefetch', () => {
  const f = fixture(); f.loader.select('current.webp');
  assert.deepEqual(f.requests, []); assert.deepEqual(f.displays, ['current.webp']);
});
test('failed GIF falls back once and stays static on repeated display and return', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp'); f.images[0].onerror();
  f.loader.select('current.gif', 'current.webp');
  f.loader.select('next.webp'); f.loader.select('current.gif', 'current.webp');
  assert.deepEqual(f.displays, ['current.gif', 'current.webp', 'current.webp', 'next.webp', 'current.webp']);
  assert.deepEqual(f.requests, ['current.gif', 'current.webp', 'current.webp']);
});
test('late failure cannot overwrite a different scene, override or reduced motion selection', () => {
  for (const next of ['branch.gif', 'manual.webp', 'current.webp', null]) {
    const f = fixture(); f.loader.select('current.gif', 'current.webp'); const stale = f.images[0].onerror;
    f.loader.select(next); stale();
    assert.deepEqual(f.displays, ['current.gif', next]);
  }
});
test('successful GIF, next branch and return keep no queued speculative work', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp'); f.images[0].onload();
  f.loader.select('branch.gif', 'branch.webp'); f.images[1].onload();
  f.loader.select('current.gif', 'current.webp');
  assert.deepEqual(f.requests, ['current.gif', 'branch.gif', 'current.gif']);
  assert.deepEqual(f.displays, f.requests);
});

test('same resource restores the display after navigation overwrote the background', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp');
  f.displays.push('map-gradient'); f.loader.select('current.gif', 'current.webp');
  assert.equal(f.displays.at(-1), 'current.gif'); assert.equal(f.images.length, 1);
  f.images[0].onerror(); f.displays.push('map-gradient'); f.loader.select('current.gif', 'current.webp');
  assert.equal(f.displays.at(-1), 'current.webp'); assert.equal(f.images.length, 2);
});
test('engine wiring restores one resource after gradient overwrite and exposes updated event metadata', () => {
  const {WebVisualNovelEngine} = require('./app.js');
  const registry = require('./illustration-system.js');
  const layer = {style: {}, dataset: {}}, eventIDs = [];
  const saved = {document: global.document, window: global.window, Image: global.Image};
  const probes = [];
  global.document = {getElementById() {return layer;}};
  global.window = {matchMedia() {return {matches: false};}, dispatchEvent() {eventIDs.push(layer.dataset.backgroundId);}};
  global.Image = class {constructor() {probes.push(this);} removeAttribute() {}};
  try {
    const e = Object.create(WebVisualNovelEngine.prototype);
    e.currentFaction = 'qing'; e.currentStoryNodeId = 'qing_act1';
    e.getSceneIllustration = () => registry.sceneFor({faction:'qing', nodeId:'qing_act1'});
    const asset = e.getSceneIllustration();
    e.refreshStageBackground();
    assert.equal(layer.style.backgroundImage, `url("${e.currentSceneAnimationPath}")`);
    assert.ok(!layer.style.backgroundImage.includes('.webp'));
    layer.style.backgroundImage = 'linear-gradient(red,blue)'; e.refreshStageBackground();
    assert.equal(layer.style.backgroundImage, `url("${e.currentSceneAnimationPath}")`);
    assert.equal(probes.length, 1);
    probes[0].onerror();
    assert.equal(e.currentSceneMediaPath, asset.relativePath);
    layer.style.backgroundImage = 'linear-gradient(red,blue)'; e.refreshStageBackground();
    assert.equal(layer.style.backgroundImage, `url("${asset.relativePath}")`);
    assert.ok(eventIDs.every(id => id === asset.id));
  } finally {
    for (const key of Object.keys(saved)) if (saved[key] === undefined) delete global[key]; else global[key] = saved[key];
  }
});

test('states distinguish loading, slow, actual static fallback and total failure without fake percentages', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp');
  assert.equal(f.loader.getStatus().phase, 'loading');
  [...f.timers.values()][0]();
  assert.deepEqual(f.loader.getStatus(), {phase:'slow', retrying:false, canRetry:true});
  assert.equal(f.requests.length, 1, 'slow notice never retries automatically');
  f.images[0].onerror();
  assert.equal(f.loader.getStatus().phase, 'fallback-loading');
  f.images[1].onload();
  assert.equal(f.loader.getStatus().phase, 'fallback');
  assert.ok(f.loader.retry());
  f.images[2].onerror(); f.images[3].onerror();
  assert.equal(f.loader.getStatus().phase, 'error');
  assert.ok(f.states.every(s => !('percent' in s)));
});
test('manual retry bypasses failure cache once, prevents double clicks and reports recovery', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp');
  assert.equal(f.loader.retry(), false);
  f.images[0].onerror(); f.images[1].onload();
  assert.equal(f.loader.retry(), true);
  assert.match(f.requests.at(-1), /^current\.gif\?scene_retry=[a-z0-9]+-1$/);
  assert.equal(f.loader.getStatus().retrying, true);
  assert.equal(f.loader.retry(), false);
  f.images[2].onload();
  assert.equal(f.loader.getStatus().phase, 'ready');
  f.loader.select('current.gif', 'current.webp');
  assert.equal(f.requests.length, 3, 'text refresh does not retrigger retry');
});
test('stale timer and fallback errors cannot overwrite a user retry or new scene', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp');
  const slow = [...f.timers.values()][0]; f.images[0].onerror();
  const stale = f.images[1].onerror; [...f.timers.values()][0]();
  f.loader.retry(); stale(); slow();
  assert.equal(f.loader.getStatus().phase, 'loading');
  assert.match(f.displays.at(-1), /^current\.gif\?scene_retry=/);
  const late = f.images[2].onerror;
  f.loader.select('manual.webp'); late();
  assert.equal(f.loader.getStatus().phase, 'idle');
  assert.equal(f.displays.at(-1), 'manual.webp');
  assert.equal(f.timers.size, 0);
});

test('manual retries remain unique after navigating away and back', () => {
  const f = fixture(); f.loader.select('current.gif', 'current.webp');
  f.images[0].onerror(); f.images[1].onload(); f.loader.retry();
  const first = f.requests.at(-1); f.images[2].onerror(); f.images[3].onload();
  f.loader.select('other.webp'); f.loader.select('current.gif', 'current.webp'); f.images[4].onload();
  f.loader.retry(); assert.notEqual(f.requests.at(-1), first);
});
