'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('./harness/scene-media.js');
function fixture() {
  const requests = [], displays = [], images = [];
  const loader = create({createImage() {
    const image = {removeAttribute() {}, set src(value) {requests.push(value);}};
    images.push(image); return image;
  }, onChange(path) {displays.push(path);}});
  return {loader, requests, displays, images};
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
  assert.deepEqual(f.requests, ['current.gif']);
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
  assert.equal(f.displays.at(-1), 'current.webp'); assert.equal(f.images.length, 1);
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
