import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createStaticServer} from './server.js';import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),{scenes}=require('./harness/scene-animation.js'),world=require('./skills-data.js');
const server=createStaticServer({root:process.cwd()});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try {browser=await chromium.launch({headless:true,executablePath:"/usr/bin/chromium"});await mkdir('/tmp/jiuzhou-gif-qa',{recursive:true});
for(const width of [390,1440]) {const page=await browser.newPage({viewport:{width,height:900}});await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);await page.waitForFunction(()=>window.__vnEngine);await page.evaluate(()=>window.__vnEngine.startNewGame('qing'));
for(const [nodeId,id] of Object.entries(scenes)){const node=world.canonicalTrees.qing.nodes[nodeId];await page.evaluate(node=>{const e=window.__vnEngine;e.currentStoryNodeId=node.id;e.currentCoords=node.coords;e.stageBackground=null;e.refreshStageBackground()},node);
const bg=await page.locator('#bg-active').evaluate(e=>e.style.backgroundImage);assert.ok(bg.includes(`${id}.gif`));assert.ok(bg.includes(`${id}.webp`));
const dim=await page.evaluate(async id=>{const i=new Image();i.src=`data/illustrations/qing/animated/${id}.gif`;await i.decode();return [i.naturalWidth,i.naturalHeight]},id);assert.deepEqual(dim,[836,470]);await page.screenshot({path:`/tmp/jiuzhou-gif-qa/${width}-${nodeId}.png`});}
await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.__vnEngine.refreshStageBackground());assert.ok(!(await page.locator('#bg-active').evaluate(e=>e.style.backgroundImage)).includes('.gif'));
await page.close();}console.log('PASS: opening scene GIF decode and switch on mobile+desktop, reduced-motion static fallback.');}
finally{await browser?.close();await new Promise(r=>server.close(r));}
