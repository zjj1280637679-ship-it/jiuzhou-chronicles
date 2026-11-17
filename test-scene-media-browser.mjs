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
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => window.__vnEngine);
    assert.equal(requests.some(p => p.startsWith('data/illustrations/')), false, 'no title-screen story images');
    if (width > 768) assert.equal(requests.includes('data/mobile/palace-night.webp'), false, 'hidden mobile image not downloaded');
    await page.evaluate(() => window.__vnEngine.startNewGame('qing'));
    const visited = new Set();
    for (const nodeId of ['qing_act1', 'qing_act2_iron', 'qing_act1', 'qing_act2_steppe']) {
      const asset = registry.sceneFor({faction: 'qing', nodeId});
      const gif = animations.pathFor({faction: 'qing', nodeId, asset});
      visited.add(gif);
      await page.evaluate(node => {
        const e = window.__vnEngine;
        e.currentStoryNodeId = node.id; e.currentCoords = node.coords; e.stageBackground = null;
        e.refreshStageBackground();
      }, world.canonicalTrees.qing.nodes[nodeId]);
      await page.waitForLoadState('networkidle');
      assert.ok(requests.includes(gif), 'selected GIF downloaded');
      const storyRequests = requests.filter(p => p.startsWith('data/illustrations/'));
      assert.ok(storyRequests.every(p => visited.has(p)), `unexpected prefetch/fallback: ${storyRequests}`);
      const bg = await page.locator('#bg-active').evaluate(el => el.style.backgroundImage);
      assert.equal(bg, `url("${gif}")`);
      if (width < 769) assert.equal(await page.locator('#mobile-scene-art').getAttribute('src'), gif);
      else assert.equal(await page.locator('#mobile-scene-art').getAttribute('src'), null);
      await page.screenshot({path: `${output}/${width}-${nodeId}.png`});
    }
    // Reduced motion requests the current static image, not another scene.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.evaluate(() => window.__vnEngine.refreshStageBackground());
    await page.waitForLoadState('networkidle');
    const staticPath = registry.sceneFor({faction: 'qing', nodeId: 'qing_act2_steppe'}).relativePath;
    assert.ok(requests.includes(staticPath));
    assert.deepEqual(errors, []);
    await writeFile(`${output}/${width}-requests.json`, JSON.stringify(requests, null, 2));
    await context.close();
  }
  // Cold failure: original still image is downloaded only after GIF failure.
  const context = await browser.newContext({viewport: {width: 390, height: 900}});
  const page = await context.newPage();
  let failed = false;
  const fallback = registry.sceneFor({faction: 'qing', nodeId: 'qing_act1'}).relativePath;
  page.on('request', r => {if (r.url().endsWith(fallback)) assert.ok(failed, 'fallback must not race ahead of GIF failure');});
  await page.route('**/*', route => {
    if (route.request().url().endsWith('.gif')) {failed = true; return route.abort();}
    return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
  });
  await page.goto(origin); await page.waitForFunction(() => window.__vnEngine);
  await page.evaluate(() => window.__vnEngine.startNewGame('qing'));
  await page.waitForFunction(path => window.__vnEngine.currentSceneMediaPath === path, fallback);
  assert.equal(await page.locator('#bg-active').evaluate(el => el.style.backgroundImage), `url("${fallback}")`);
  await context.close();
  console.log('PASS: current-scene-only network requests, cold GIF fallback, branches, return, mobile/desktop and reduced motion.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
