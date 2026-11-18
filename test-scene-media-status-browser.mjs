// Real Chrome GUI/network failure fixture. No model/API calls and no fake percentages.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {createStaticServer} from './server.js';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const registry = require('./illustration-system.js'), animations = require('./harness/scene-animation.js');
const opening = registry.sceneFor({faction:'qing',nodeId:'qing_act1'});
const openingGIF = animations.pathFor({faction:'qing',nodeId:'qing_act1',asset:opening,pageText:animations.firstActPages[0].text});
const openingPoster = animations.posterFor({faction:'qing',nodeId:'qing_act1',asset:opening,pageText:animations.firstActPages[0].text});
const server = createStaticServer({root:process.cwd()});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const origin = `http://127.0.0.1:${server.address().port}`;
const out = '/tmp/jiuzhou-media-network';
let browser;
try {
  browser = await chromium.launch({headless:true, executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE || '/usr/bin/chromium'});
  await mkdir(out,{recursive:true});
  for (const width of [390,1440]) {
    const context = await browser.newContext({viewport:{width,height:900}});
    const page = await context.newPage(); let held;
    const requests = [], errors = [];
    page.on('request',r => {if(r.resourceType()==='image') requests.push(r.url());});
    page.on('pageerror',e => errors.push(e.message));
    try {
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.endsWith(openingGIF) && !url.searchParams.has('scene_retry')) {held = route; return;}
        return route.continue();
      });
      await page.goto(origin); await page.waitForFunction(() => window.__vnEngine);
      await page.evaluate(() => window.__vnEngine.startNewGame('qing'));
      await page.waitForFunction(() => document.querySelector('#scene-media-status').dataset.phase==='loading');
      assert.ok((await page.locator('#scene-media-status-text').innerText()).includes('加载中'));
      assert.equal(await page.locator('#scene-media-retry').isVisible(),false);
      assert.equal(await page.locator('#scene-media-status-text').getAttribute('role'),'status');
      await page.locator('#bg-active').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      await page.screenshot({path:`${out}/${width}-status-loading.png`});
      assert.ok(held);
      assert.equal(await page.locator('#bg-active').evaluate(el=>el.style.backgroundImage),`url("${openingPoster}")`);
      if(width<769) assert.equal(await page.locator('#mobile-scene-art').getAttribute('src'),openingPoster);
      assert.equal(requests.some(p=>p.endsWith(opening.relativePath)),false,'never request old static art');
      await held.abort();
      await page.waitForFunction(() => document.querySelector('#scene-media-status').dataset.phase==='fallback');
      assert.ok((await page.locator('#scene-media-status-text').innerText()).includes('保留预览图'));
      assert.equal(await page.locator('#bg-active').evaluate(el=>el.style.backgroundImage),`url("${openingPoster}")`);
      const box = await page.locator('#scene-media-status').boundingBox();
      const prose = await page.locator('#dialogue-box').boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width && box.y+box.height<=prose.y, 'status must stay in scene corner, above prose');
      await page.locator('#bg-active').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      await page.screenshot({path:`${out}/${width}-status-fallback.png`});
      const step = await page.evaluate(() => window.__vnEngine.currentStep);
      await page.locator('#scene-media-retry').focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#scene-media-status').dataset.phase==='ready');
      assert.ok((await page.locator('#scene-media-status-text').innerText()).includes('已恢复'));
      const retryBox = await page.locator('#scene-media-retry').boundingBox();
      await page.mouse.dblclick(retryBox.x + retryBox.width / 2, retryBox.y + retryBox.height / 2);
      assert.equal(await page.evaluate(() => window.__vnEngine.currentStep),step,'retry key must not advance story');
      assert.equal(requests.filter(p=>p.includes('scene_retry=')).length,1,'only one explicit retry');
      assert.ok(!(await page.locator('#scene-media-status').innerText()).includes('%'));
      await page.locator('#bg-active').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      await page.screenshot({path:`${out}/${width}-status-recovered.png`});
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => document.querySelector('#scene-media-status').hidden);
      assert.deepEqual(errors,[]);
    } finally {
      await writeFile(`${out}/${width}-status-requests.json`,JSON.stringify({requests,errors},null,2));
      await page.locator('#bg-active').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      await page.screenshot({path:`${out}/${width}-status-final.png`}).catch(()=>{});
      await context.close();
    }
  }
  const context = await browser.newContext({viewport:{width:390,height:900}}), page = await context.newPage();
  await page.route('**/*',r => {
    const url = new URL(r.request().url());
    return url.origin !== origin || [openingGIF, openingPoster].some(path => url.pathname.endsWith('/'+path)) ? r.abort() : r.continue();
  });
  await page.goto(origin); await page.waitForFunction(()=>window.__vnEngine);
  await page.evaluate(()=>window.__vnEngine.startNewGame('qing'));
  await page.waitForFunction(()=>document.querySelector('#scene-media-status').dataset.phase==='error');
  assert.ok((await page.locator('#scene-media-status-text').innerText()).includes('可继续阅读'));
  assert.equal(await page.locator('#scene-media-retry').isVisible(),true);
  await page.screenshot({path:`${out}/390-status-both-failed.png`});
  await context.close();
  console.log('PASS: mobile+desktop visible loading/fallback/retry/recovery; total failure notice; keyboard retry cannot advance story; corner does not cover prose.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(r=>server.close(r));
}
