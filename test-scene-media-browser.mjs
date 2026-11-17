// Real browser network assertions. Not a VM/fetch mock; run in a browser-capable host.
// node test-scene-media-browser.mjs (requires playwright + Chromium)
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {createStaticServer} from './server.js';
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const animations = require('./harness/scene-animation.js');
const registry = require('./illustration-system.js');
const world = require('./skills-data.js');
const server = createStaticServer({root: process.cwd()});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = process.env.JIUZHOU_SCENE_SCREENSHOTS || '/tmp/jiuzhou-media-network';
let browser;
try {
  browser = await chromium.launch({headless: true, executablePath: process.env.JIUZHOU_BROWSER_EXECUTABLE || '/usr/bin/chromium'});
  await mkdir(output, {recursive: true});
  for (const width of [390, 1440]) {
    const context = await browser.newContext({viewport: {width, height: 900}, serviceWorkers: 'block'});
    const page = await context.newPage(), requests = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {if (r.resourceType() === 'image') requests.push(new URL(r.url()).pathname.slice(1));});
    try {
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => window.__vnEngine);
    assert.equal(requests.some(p => p.startsWith('data/illustrations/')), false, 'no title-screen story images');
    if (width > 768) assert.equal(requests.includes('data/mobile/palace-night.webp'), false, 'hidden mobile image not downloaded');
    // This is a scene-projection/rendering audit, not a claim that every
    // narrative choice path was played. Normal click-flow tests run separately.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(() => window.__vnEngine.startNewGame('qing'));
    const visited = new Set(), nodes = Object.keys(animations.scenes);
    assert.ok(nodes.length > 0);
    const sequence = [...nodes, nodes[0]]; // Every mapping, then a return.
    let stepIndex = 0;
    async function visible(path) {
      await page.waitForFunction(path => performance.getEntriesByName(new URL(path,document.baseURI).href).some(e=>e.responseEnd>0),path);
      await page.waitForFunction(path=>window.__vnEngine.currentSceneMediaPath===path,path);
      if(width<769) await page.waitForFunction(path=>{
        const img=document.querySelector('#mobile-scene-art');
        return img.getAttribute('src')===path && img.complete && img.naturalWidth>0;
      },path);
      assert.equal(await page.locator('#bg-active').evaluate(el=>el.style.backgroundImage),`url("${path}")`);
      if(width>768) assert.equal(await page.locator('#mobile-scene-art').getAttribute('src'),null);
      await page.locator('#bg-active').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
    }
    for(const nodeId of sequence) {
      const asset=registry.sceneFor({faction:'qing',nodeId}),input={faction:'qing',nodeId,asset};
      const gif=animations.pathFor(input),poster=animations.posterFor(input);
      const alreadyVisited=visited.has(gif);visited.add(gif);visited.add(poster);
      assert.ok(world.canonicalTrees.qing.nodes[nodeId],nodeId);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(node=>{
        const e=window.__vnEngine;e.currentStoryNodeId=node.id;e.currentCoords=node.coords;e.stageBackground=null;e.refreshStageBackground();
      },world.canonicalTrees.qing.nodes[nodeId]);
      await visible(poster);
      assert.equal(await page.locator('#stage-characters .char-guard').evaluate(el=>getComputedStyle(el).visibility),'hidden','NPC poster must not be covered by generic guard');
      if(!alreadyVisited) assert.equal(requests.includes(gif),false,'reduced motion must not request new GIF');
      await page.screenshot({path:`${output}/${width}-${stepIndex}-${nodeId}-first-frame.png`});
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(()=>window.__vnEngine.refreshStageBackground());
      await visible(gif);
      assert.equal(await page.locator('#stage-characters .char-guard').evaluate(el=>getComputedStyle(el).visibility),'hidden','NPC GIF must not be covered by generic guard');
      const storyRequests=requests.filter(p=>p.startsWith('data/illustrations/'));
      assert.ok(storyRequests.every(p=>visited.has(p)),`unexpected old art/prefetch: ${storyRequests}`);
      await page.screenshot({path:`${output}/${width}-${stepIndex++}-${nodeId}-gif.png`});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>window.__vnEngine.refreshStageBackground());
    const last=sequence.at(-1),staticPath=animations.posterFor({faction:'qing',nodeId:last,asset:registry.sceneFor({faction:'qing',nodeId:last})});
    await visible(staticPath);
    // Resize reuses the current source, with no hidden desktop image left loading.
    await page.setViewportSize({width: 390, height: 900});
    await page.waitForFunction(path => document.querySelector('#mobile-scene-art').getAttribute('src') === path, staticPath);
    await page.setViewportSize({width: 1440, height: 900});
    await page.waitForFunction(() => !document.querySelector('#mobile-scene-art').hasAttribute('src'));
    // An explicit static override restores placeholders; clearing it returns to
    // the NPC poster. Slot activation state is not destructively changed.
    await page.evaluate(()=>window.__vnEngine.setSceneBackground({id:window.__vnEngine.currentSceneIllustration.id}));
    assert.equal(await page.locator('#stage-characters .char-guard').evaluate(el=>getComputedStyle(el).visibility),'visible');
    await page.evaluate(()=>window.__vnEngine.setSceneBackground({clear:true}));
    assert.equal(await page.locator('#stage-characters .char-guard').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    await page.evaluate(()=>window.__vnEngine.startNewGame('ming'));
    assert.equal(await page.locator('#stage-characters .char-guard').evaluate(el=>getComputedStyle(el).visibility),'visible','other faction keeps character placeholders');
    assert.deepEqual(errors, []);
    } finally {
      await writeFile(`${output}/${width}-requests.json`, JSON.stringify({requests, errors}, null, 2));
      // The desktop background has a 1.2s CSS transition. Request completion
      // alone is not a visual-completion signal; finish finite transitions first.
      await page.locator('#bg-active').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      await page.screenshot({path: `${output}/${width}-final.png`}).catch(() => {});
      await context.close();
    }
  }
  // Hold the GIF response: its real first frame must already be visible.
  const context = await browser.newContext({viewport: {width:390,height:900}}), page = await context.newPage();
  const opening = registry.sceneFor({faction:'qing',nodeId:'qing_act1'});
  const poster = animations.posterFor({faction:'qing',nodeId:'qing_act1',asset:opening});
  let held, sawPoster = false, sawOldArt = false;
  page.on('request', r => {
    if (r.url().endsWith(poster)) sawPoster = true;
    if (r.url().endsWith(opening.relativePath)) sawOldArt = true;
  });
  await page.route('**/*',route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.gif')) {held=route;return;}
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.goto(origin);await page.waitForFunction(()=>window.__vnEngine);
  await page.evaluate(()=>window.__vnEngine.startNewGame('qing'));
  await page.waitForFunction(path => {
    const img=document.querySelector('#mobile-scene-art');
    return img.getAttribute('src')===path && img.complete && img.naturalWidth>0;
  },poster);
  assert.ok(sawPoster);assert.ok(held);assert.equal(sawOldArt,false);
  await page.screenshot({path:`${output}/390-first-frame-loading.png`});
  await held.abort();
  await page.waitForFunction(()=>window.__vnEngine.currentSceneMediaStatus.phase==='fallback');
  assert.equal(await page.locator('#bg-active').evaluate(el=>el.style.backgroundImage),`url("${poster}")`);
  assert.equal(sawOldArt,false);
  assert.equal(await page.locator('#stage-characters .char-guard').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await page.screenshot({path:`${output}/390-failed-gif-first-frame.png`});
  await context.close();
  console.log('PASS: current-scene-only network requests, first-frame preview and failure retention, branches, return, mobile/desktop and reduced motion.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
