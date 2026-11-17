// Real browser pagination, not node injection. Initial game selection is programmatic;
// every within-act transition uses the real reading/back controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createStaticServer} from './server.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const {firstActPages}=require('./harness/scene-animation.js');
const server=createStaticServer({root:process.cwd()});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,out='/tmp/jiuzhou-first-act-pages-qa';
let browser;
try {
 await mkdir(out,{recursive:true});
 browser=await chromium.launch({headless:true,executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE || '/usr/bin/chromium'});
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  const requests=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.resourceType()==='image')requests.push(new URL(r.url()).pathname.slice(1))});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin);await page.waitForFunction(()=>window.__vnEngine);
  await page.evaluate(()=>window.__vnEngine.startNewGame('qing'));
  async function visible(index) {
   const expected=firstActPages[index].path;
   await page.waitForFunction(p=>window.__vnEngine.currentSceneMediaPath===p,expected);
   assert.equal(await page.evaluate(()=>window.__vnEngine.currentFullText),firstActPages[index].text);
   assert.equal(await page.evaluate(()=>window.__vnEngine.currentStep),index+1);
   assert.equal(await page.locator('#bg-active').evaluate(e=>e.style.backgroundImage),`url("${expected}")`);
   if(width<769)await page.waitForFunction(p=>{const i=document.querySelector('#mobile-scene-art');return i.src.endsWith(p)&&i.complete&&i.naturalWidth>0},expected);
   assert.equal(await page.locator('#stage-characters .char-guard').evaluate(e=>getComputedStyle(e).visibility),'hidden');
   await page.waitForFunction(()=>!window.__vnEngine.isTyping);
   // style.backgroundImage changes before the 1.2-second CSS crossfade ends.
   // Inspect settled pixels, not the temporary blend between two story pages.
   await page.locator('#bg-active').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
  }
  async function next(){await page.locator(width<769?'#mobile-next':'#continue-prompt').click()}
  for(let i=0;i<4;i++) {
   if(i)await next();await visible(i);
   const allowed=new Set(firstActPages.slice(0,i+1).flatMap(p=>[p.path,p.path.replace(/\.gif$/,'-first-frame.png')]));
   assert.ok(requests.filter(p=>p.startsWith('data/illustrations/')).every(p=>allowed.has(p)),'only current and already visited pages requested');
   await page.screenshot({path:`${out}/${width}-page-${i+1}.png`});
  }
  await next();await page.waitForFunction(()=>window.__vnEngine.choiceOverlay.classList.contains('visible') && document.querySelector('#choice-overlay').getAttribute('aria-modal')==='true');
  if(width<769)await page.locator('#mobile-choice-return').click();else await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!window.__vnEngine.choiceOverlay.classList.contains('visible') && !document.querySelector('#btn-dialogue-prev').closest('[inert]'));
  await visible(3);
  for(let i=2;i>=0;i--){await page.locator('#btn-dialogue-prev').click();await visible(i)}
  await next();await visible(1);
  await page.evaluate(()=>window.__vnEngine.saveGameState());
  await page.reload();await page.waitForFunction(()=>window.__vnEngine);
  // Use the same persisted reading state via the product's continue control.
  await page.locator('#title-btn-continue').click();await visible(1);
  await page.screenshot({path:`${out}/${width}-restored-page-2.png`});
  await page.locator('#btn-dialogue-prev').click();await visible(0);
  for(let i=0;i<3;i++) {await next();if(await page.evaluate(()=>window.__vnEngine.isTyping))await next()}
  await visible(3);
  await page.screenshot({path:`${out}/${width}-rapid-page-4-settled.png`});
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/${width}-requests.json`,JSON.stringify({requests,errors},null,2));
  await context.close();
 }
 // Delayed page 1 response must not overwrite page 2, then page 3 HTTP 404
 // must retain its OWN first frame and expose a working explicit retry.
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
 let held=null; const errors=[];
 let settleOld; const oldSettled=new Promise(r=>settleOld=r);
 for(const event of ['requestfinished','requestfailed'])page.on(event,r=>{if(new URL(r.url()).pathname.endsWith(firstActPages[0].path))settleOld(event)});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(u.origin!==origin)return r.abort();
  if(u.pathname.endsWith(firstActPages[0].path)&&!u.search){held=r;return;}
  if(u.pathname.endsWith(firstActPages[2].path)&&!u.search)return r.fulfill({status:404,body:'fixture missing GIF'});
  return r.continue();
 });
 await page.goto(origin);await page.waitForFunction(()=>window.__vnEngine);
 await page.evaluate(()=>window.__vnEngine.startNewGame('qing'));
 await page.waitForFunction(()=>window.__vnEngine.currentSceneMediaStatus?.phase==='loading');
 await page.waitForFunction(()=>!window.__vnEngine.isTyping);await page.keyboard.press('ArrowRight');
 await page.waitForFunction(p=>window.__vnEngine.currentSceneMediaPath===p,firstActPages[1].path);
 await held.continue().catch(()=>{});
 await Promise.race([oldSettled,new Promise((_,reject)=>setTimeout(()=>reject(new Error("old image request did not settle")),15000))]); // Observe termination before checking.
 assert.equal(await page.evaluate(()=>window.__vnEngine.currentSceneMediaPath),firstActPages[1].path);
 await page.waitForFunction(()=>!window.__vnEngine.isTyping);await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>window.__vnEngine.currentSceneMediaStatus?.phase==='fallback');
 assert.equal(await page.evaluate(()=>window.__vnEngine.currentSceneMediaPath),firstActPages[2].path.replace(/\.gif$/,'-first-frame.png'));
 await page.screenshot({path:`${out}/390-page-3-failed.png`});
 await page.locator('#scene-media-retry').click();
 await page.waitForFunction(()=>window.__vnEngine.currentSceneMediaStatus?.phase==='ready');
 assert.ok((await page.evaluate(()=>window.__vnEngine.currentSceneMediaPath)).startsWith(firstActPages[2].path));
 assert.equal(await page.evaluate(()=>window.__vnEngine.currentStep),3);
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS real page 1-4, choice return, backward navigation, reload restore on desktop/mobile; current-only media; delayed response race; HTTP404 own-poster fallback and retry.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
