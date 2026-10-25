// Independent stage-background and popup tools in fresh browsers. Native workers
// run normally; every model reply is a fixture and all other external traffic is blocked.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {resolve, extname, sep, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium} = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".svg":"image/svg+xml", ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png", ".webp":"image/webp"};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!path.startsWith(resolve(root) + sep)) return res.writeHead(403).end();
    res.writeHead(200, {"content-type":mime[extname(path)] || "application/octet-stream"}).end(await readFile(path));
  } catch {res.writeHead(404).end();}
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE});
const output = process.env.JIUZHOU_BACKGROUND_SCREENSHOTS;
if (output) await mkdir(output, {recursive:true});
const config = {source:"custom", enabled:true, endpoint:"https://background.fixture/v1", apiKey:"fixture-only-background-key",
  model:"custom", customModel:"background-fixture", adapter:"openai", tokenParameter:"max_tokens", maxTokens:32768};
const backgroundA = "qing_holding_cell", backgroundB = "qing_secret_letter", popupA = "qing_night_raid", popupB = "qing_lamplit_questioning";
const story = label => ({beats:[{speaker:"旁白", text:label + "：场景中的灯火未曾熄灭。"},
  {speaker:"随行者", text:"继续核对旧案，不因展示画卷而改变现场。"}], choices:[{text:"继续"},{text:"查阅"},{text:"等候"}]});
async function closePopup(page) {
  if (await page.locator("#modal-illustration").evaluate(node => node.classList.contains("open"))) {
    await page.click("#btn-close-illustration");
    await page.waitForFunction(() => !document.querySelector("#dialogue-content").closest("[inert]"));
  }
}
async function background(page, expectedId) {
  await page.waitForFunction(id => window.__vnEngine.currentSceneIllustration?.id === id &&
    document.querySelector("#mobile-scene-art").getAttribute("src")?.includes(id), expectedId);
  return page.evaluate(() => ({id:window.__vnEngine.currentSceneIllustration?.id,
    stage:window.__vnEngine.stageBackground ?? null, desktop:document.querySelector("#bg-active").style.backgroundImage,
    mobile:document.querySelector("#mobile-scene-art").getAttribute("src")}));
}
async function expectPopup(page, id) {
  await page.waitForFunction(id => document.querySelector("#modal-illustration").getAttribute("aria-modal") === "true" &&
    document.querySelector("#illustration-graphic img")?.getAttribute("src")?.includes(id), id);
  assert.equal(await page.locator("#dialogue-content img, #dialogue-content .dialogue-illustration-card").count(), 0);
}
const evidence = {fixtureAPI:true, testedAt:new Date().toISOString(), viewports:[]};
try {
  for (const size of [{name:"phone", width:390, height:844, mobile:true}, {name:"desktop", width:1440, height:900, mobile:false}]) {
    const context = await browser.newContext({viewport:{width:size.width,height:size.height}, isMobile:size.mobile,
      hasTouch:size.mobile, reducedMotion:"reduce", serviceWorkers:"block"});
    await context.addInitScript(config => {if (!localStorage.getItem("vn_api_config")) localStorage.setItem("vn_api_config", JSON.stringify(config));}, config);
    const page = await context.newPage(), errors = [], unexpected = [];
    let active, requests = 0, waitStarted, releaseWait;
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(url.origin)) return route.abort("blockedbyclient");
      if (url.origin !== "https://background.fixture" || url.pathname !== "/v1/chat/completions") {
        unexpected.push(url.origin + url.pathname); return route.abort("blockedbyclient");
      }
      const cors = {"access-control-allow-origin":origin, "access-control-allow-methods":"POST, OPTIONS", "access-control-allow-headers":"content-type, authorization"};
      if (request.method() === "OPTIONS") return route.fulfill({status:204, headers:cors});
      assert.ok(active); requests++; active.step++;
      const body = request.postDataJSON();
      assert.ok(body.tools.some(tool => tool.function.name === "set_scene_background"));
      assert.ok(body.tools.some(tool => tool.function.name === "show_illustration"));
      if (active.step > 1) {
        assert.ok(["failure", "cancel"].includes(active.mode));
        if (active.mode === "cancel") {waitStarted(); await new Promise(done => {releaseWait = done;});}
        return route.fulfill({status:401, headers:cors, contentType:"application/json", body:'{"error":"fixture_auth_failure"}'}).catch(() => {});
      }
      const tools = active.tools.concat(active.mode === "success" ? [
        {name:"write_draft", args:{story:story(active.label)}}, {name:"deliver_story", args:{}}
      ] : []);
      await route.fulfill({headers:cors, contentType:"application/json", body:JSON.stringify({model:"background-fixture",
        choices:[{finish_reason:"tool_calls", message:{role:"assistant", content:null, tool_calls:tools.map((tool, index) => ({
          id:"background_" + requests + "_" + index, type:"function", function:{name:tool.name, arguments:JSON.stringify(tool.args)}
        }))}}], usage:{prompt_tokens:100, completion_tokens:20}})});
    });
    async function turn(label, tools, mode = "success") {
      await closePopup(page);
      active = {label, tools, mode, step:0};
      let started;
      if (mode === "cancel") started = new Promise(done => {waitStarted = done;});
      const pending = page.evaluate(label => window.__vnEngine.resolveFactionAction({text:label, customInput:label,
        diceBase:7, isExtrapolation:true, bias:{authority:0, pragmatism:0, progress:0, cognition:0}}), label);
      if (mode === "cancel") {await started; await page.evaluate(() => window.__vnEngine.cancelAIRequest()); releaseWait();}
      await pending;
      assert.equal(await page.evaluate(() => window.__vnEngine.isAIGenerating), false);
      if (mode === "success") assert.equal(await page.evaluate(() => window.__vnEngine.pendingTurnAttempt), null);
      else assert.equal(await page.evaluate(() => window.__vnEngine.pendingTurnAttempt?.errorCode), mode === "cancel" ? "request_cancelled" : "upstream_auth_failed");
    }
    try {
      await page.goto(origin, {waitUntil:"domcontentloaded"});
      await page.waitForFunction(() => Boolean(window.__vnEngine && window.JiuzhouIllustrations));
      await page.evaluate(() => window.__vnEngine.startNewGame("qing"));
      const staticId = await page.evaluate(() => window.JiuzhouIllustrations.sceneFor({faction:"qing", nodeId:window.__vnEngine.currentStoryNodeId, coords:window.__vnEngine.currentCoords}).id);
      const initial = await background(page, staticId);
      assert.equal(initial.stage, null); assert.ok(initial.desktop.includes(staticId));
      assert.equal(await page.locator("#modal-illustration").evaluate(node => node.classList.contains("open")), false);
      await turn("只显示互动图片", [{name:"select_illustration", args:{id:popupA, afterBeat:0}}]);
      await expectPopup(page, popupA); assert.deepEqual(await background(page, staticId), initial, "A popup alone cannot change either background surface");
      await turn("只切换舞台背景", [{name:"set_scene_background", args:{id:backgroundA}}]);
      const stageA = await background(page, backgroundA);
      assert.deepEqual(stageA.stage, {id:backgroundA}); assert.ok(stageA.desktop.includes(backgroundA));
      assert.equal(await page.locator("#modal-illustration").evaluate(node => node.classList.contains("open")), false);
      assert.equal(await page.evaluate(() => window.__vnEngine.storyQueue.filter(beat => beat.type === "illustration").length), 0,
        "A background tool must never insert popup beats into prose");
      await page.evaluate(() => {const e = window.__vnEngine; e.fastForwardTypewriter(); e.playNextInQueue(); e.fastForwardTypewriter();});
      assert.deepEqual(await background(page, backgroundA), stageA, "The chosen background survives later prose beats");
      await turn("背景持续时只显示互动图片", [{name:"select_illustration", args:{id:popupB, afterBeat:0}}]);
      await expectPopup(page, popupB); assert.deepEqual(await background(page, backgroundA), stageA);
      await turn("同一批次分别设置两张图", [{name:"set_scene_background", args:{id:backgroundB}}, {name:"select_illustration", args:{id:popupA, afterBeat:0}}]);
      await expectPopup(page, popupA);
      const stageB = await background(page, backgroundB);
      assert.deepEqual(stageB.stage, {id:backgroundB}); assert.ok(stageB.desktop.includes(backgroundB));
      if (output) await page.screenshot({path:join(output, size.name + "-separate-popup-and-background.png")});
      await closePopup(page);
      if (output) await page.screenshot({path:join(output, size.name + "-separate-background-reading.png")});
      await page.evaluate(() => window.__vnEngine.saveGameState());
      await page.reload({waitUntil:"domcontentloaded"}); await page.click("#title-btn-continue");
      await expectPopup(page, popupA); assert.deepEqual(await background(page, backgroundB), stageB,
        "Saving a popup page preserves its separate stage background");
      for (const mode of ["failure", "cancel"]) {
        await turn("未提交的新画面" + mode, [{name:"set_scene_background", args:{id:backgroundA}}, {name:"select_illustration", args:{id:popupB}}], mode);
        assert.deepEqual(await background(page, backgroundB), stageB, "Failed or cancelled drafts cannot replace the committed background");
        assert.equal(await page.evaluate(id => window.__vnEngine.storyQueue.filter(beat => beat.illustrationData?.id === id).length, popupB), 0,
          "A pending failed popup cannot enter the committed story");
        await closePopup(page); await page.evaluate(() => window.__vnEngine.discardPendingTurn());
      }
      await turn("恢复静态背景", [{name:"set_scene_background", args:{clear:true}}]);
      const cleared = await background(page, staticId);
      assert.equal(cleared.stage, null); assert.equal(cleared.desktop, initial.desktop); assert.equal(cleared.mobile, initial.mobile);
      assert.equal(await page.locator("#modal-illustration").evaluate(node => node.classList.contains("open")), false);
      assert.equal(await page.evaluate(() => window.__vnEngine.storyQueue.some(beat => beat.type === "illustration")), false);
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      evidence.viewports.push({name:size.name, requests, staticBackgroundOnly:true, independentPopup:true, independentBackground:true,
        combinedDifferentImages:true, backgroundPersistsThroughProse:true, saveAndResume:true, failureRollback:true, cancellationRollback:true, clearRestoresStatic:true});
      console.log(`PASS ${size.name}: separate native background/popup tools; popup-only, background-only, combined batch, prose persistence, save/resume, failure/cancel rollback and clear to static`);
    } finally {releaseWait?.(); await context.close();}
  }
  if (output) await writeFile(join(output, "browser-verification.json"), JSON.stringify(evidence, null, 2) + "\n");
} finally {await browser.close(); await new Promise(done => server.close(done));}
