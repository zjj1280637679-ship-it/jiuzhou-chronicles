// Browser integration checks in new, disposable contexts. All model responses
// are fixtures; this never reads a user profile or sends an actual API request.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {resolve, extname, sep, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium} = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png", ".webp":"image/webp"};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!path.startsWith(resolve(root) + sep)) {res.writeHead(403).end(); return;}
    res.writeHead(200, {"content-type":mime[extname(path)] || "application/octet-stream"}).end(await readFile(path));
  } catch {res.writeHead(404).end();}
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE});
const screenshots = process.env.JIUZHOU_ILLUSTRATION_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, {recursive:true});
const evidence = {testedAt:new Date().toISOString(), fixtureAPI:true, viewports:[], decodedImages:[]};
const fixtureKey = "fixture-illustrations-only-key";
const config = {source:"custom", enabled:false, endpoint:"https://illustrations.fixture/v1", apiKey:fixtureKey,
  model:"custom", customModel:"illustrations-fixture", adapter:"openai", tokenParameter:"max_tokens", maxTokens:32768};
const chosen = ["qing_night_raid", "qing_lamplit_questioning"];
const story = {beats:[{speaker:"旁白", text:"文书核对完毕，营火照亮了卷宗。"}, {speaker:"随行者", text:"言辞尚有出入，明日再访证人。"}],
  choices:[{text:"核对卷宗"}, {text:"访查营地"}, {text:"照看伤者"}]};
const steps = [
  {name:"search_illustrations", arguments:{query:"后金 夜袭"}},
  {name:"show_illustration", arguments:{token:"未登记的测试画面", afterBeat:0}},
  {name:"show_illustration", arguments:{token:"后金·夜袭营垒", afterBeat:0, caption:"夜色中尚未分晓的行动。"}},
  {name:"write_draft", arguments:{story, mode:"replace"}},
  {name:"show_illustration", arguments:{token:"后金·灯下问讯", afterBeat:2, caption:"案头的纸页仍待核查。"}},
  {name:"read_draft", arguments:{}},
  {name:"deliver_story", arguments:{}}
];
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => [document.documentElement, document.body, document.querySelector("#dialogue-content")]
    .filter(Boolean).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({id:el.id || el.tagName, width:el.clientWidth, scroll:el.scrollWidth})));
  assert.deepEqual(overflow, [], `${label}: horizontal overflow`);
}
async function modalClosed(page) {
  assert.equal(await page.locator("#modal-illustration").evaluate(el => el.classList.contains("open")), false,
    "A closed illustration must return control to reading");
}
async function toChoices(page, size) {
  for (let i = 0; i < 180; i++) {
    if (await page.locator("#modal-illustration").evaluate(el => el.classList.contains("open"))) await closeCard(page);
    if (await page.locator("#choice-overlay").evaluate(el => el.classList.contains("visible"))) return;
    await page.click(size.mobile ? "#mobile-next" : "#continue-prompt");
  }
  assert.fail(`${size.name}: choices never appeared through normal navigation`);
}
async function next(page, size) {
  await page.click(size.mobile ? "#mobile-next" : "#continue-prompt");
}
async function showQueueIndex(page, index) {
  // Use the engine's ordinary navigation, rather than replacing a beat's DOM.
  await page.evaluate(index => {
    const engine = window.__vnEngine;
    if (engine.isTyping) engine.fastForwardTypewriter();
    engine.currentStep = index;
    engine.playNextInQueue();
    if (engine.isTyping) engine.fastForwardTypewriter();
  }, index);
}
async function illustrationVisible(page, expectedId = null) {
  await page.waitForFunction(() => document.querySelector("#modal-illustration").getAttribute("aria-modal") === "true");
  assert.equal(await page.locator("#dialogue-content img, #dialogue-content .dialogue-illustration-card").count(), 0,
    "An illustration is a separate modal, never a large card or image inside prose");
  if (expectedId) assert.match(await page.locator("#illustration-graphic img").getAttribute("src"), new RegExp(expectedId));
  await page.waitForFunction(() => {
    const image = document.querySelector("#illustration-graphic img");
    return image?.complete && image.naturalWidth > 0;
  });
  const geometry = await page.locator("#modal-illustration").evaluate(node => {
    const r = node.getBoundingClientRect(), box = node.querySelector(".illustration-box").getBoundingClientRect();
    const close = document.querySelector("#btn-close-illustration"), c = close.getBoundingClientRect();
    const hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
    return {position:getComputedStyle(node).position, independent:!node.closest("#dialogue-box"),
      viewport:Math.abs(r.x) < 1 && Math.abs(r.y) < 1 && r.width >= innerWidth - 1 && r.height >= innerHeight - 1,
      boxInside:box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
      centered:Math.abs(box.x + box.width / 2 - innerWidth / 2) < 2,
      closeInside:c.x >= -1 && c.y >= -1 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1,
      closeReachable:hit === close || close.contains(hit)};
  });
  assert.deepEqual(geometry, {position:"fixed", independent:true, viewport:true, boxInside:true, centered:true,
    closeInside:true, closeReachable:true}, "The full-viewport modal and close button must escape the prose clipping box");
}
async function reopenCard(page, key = null) {
  const step = await page.evaluate(() => window.__vnEngine.currentStep);
  const trigger = page.locator("#btn-view-illustration");
  await trigger.waitFor({state:"visible"});
  if (key) {await trigger.focus(); await trigger.press(key);} else await trigger.click();
  await illustrationVisible(page);
  assert.equal(await page.locator("#illustration-graphic").evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return node === hit || node.contains(hit);
  }), true, "The expanded illustration must be above the dialogue and receive pointer hits");
  assert.equal(await page.evaluate(() => window.__vnEngine.currentStep), step,
    "Reopening an illustration by pointer or keyboard must not advance the story behind its modal");
  assert.equal(await page.locator("#choice-overlay").evaluate(el => el.classList.contains("visible")), false,
    "Opening the final illustration must not also open the decision overlay");
}
async function closeCard(page, method = "button") {
  const before = await page.evaluate(() => ({step:window.__vnEngine.currentStep,text:document.querySelector("#dialogue-content").textContent}));
  if (method === "escape") await page.keyboard.press("Escape");
  else if (method === "backdrop") await page.locator("#modal-illustration").click({position:{x:2,y:2}});
  else await page.click("#btn-close-illustration");
  await page.waitForFunction(() => !document.querySelector("#modal-illustration").classList.contains("open") &&
    !document.querySelector("#dialogue-content").closest("[inert]"));
  assert.deepEqual(await page.evaluate(() => ({step:window.__vnEngine.currentStep,text:document.querySelector("#dialogue-content").textContent})), before,
    `Closing an illustration by ${method} must preserve the reading position and all visible prose`);
}
try {
  for (const size of [{name:"phone-320", width:320, height:740, mobile:true}, {name:"phone-390", width:390, height:844, mobile:true}, {name:"desktop", width:1440, height:900, mobile:false}]) {
    const context = await browser.newContext({viewport:{width:size.width,height:size.height}, isMobile:size.mobile,
      hasTouch:size.mobile, serviceWorkers:"block", reducedMotion:"reduce"});
    await context.addInitScript(config => localStorage.setItem("vn_api_config", JSON.stringify(config)), config);
    const page = await context.newPage(), unexpected = [], requests = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(url.origin)) return route.abort("blockedbyclient");
      if (url.origin !== "https://illustrations.fixture" || url.pathname !== "/v1/chat/completions") {
        unexpected.push(url.origin + url.pathname); return route.abort("blockedbyclient");
      }
      const cors = {"access-control-allow-origin":origin, "access-control-allow-methods":"POST, OPTIONS", "access-control-allow-headers":"content-type, authorization"};
      if (request.method() === "OPTIONS") return route.fulfill({status:204, headers:cors});
      assert.equal(request.headers().authorization, "Bearer " + fixtureKey);
      const body = request.postDataJSON(); requests.push(body);
      assert.equal(body.model, "illustrations-fixture");
      assert.ok(body.tools.some(tool => tool.function.name === "search_illustrations"));
      assert.ok(body.tools.some(tool => tool.function.name === "show_illustration"));
      assert.equal(body.tools.some(tool => ["list_illustrations", "select_illustration", "inspect_draft"].includes(tool.function.name)), false);
      if (requests.length === 1) assert.match(body.messages.at(-1).content, /1000/,
        "The selected 500 tier sends its 500-character drafting allowance in the first prompt");
      if (requests.length > 1) assert.deepEqual(body.messages.slice(0, requests[0].messages.length), requests[0].messages,
        "Native tool turns must preserve the original request prefix");
      const resultOf = id => {const entry = body.messages.find(message => message.role === "tool" && message.tool_call_id === id); return entry && JSON.parse(entry.content);};
      if (requests.length === 2) {
        const result = resultOf("illustration_1");
        assert.equal(result.ok, true);
        assert.ok(result.images.length > 0 && result.images.length <= 8);
        assert.ok(result.images.some(asset => asset.token === "后金·夜袭营垒"));
        assert.equal(result.selectionRule, undefined);
      }
      if (requests.length === 3) {
        const result = resultOf("illustration_2");
        assert.equal(result.ok, false); assert.equal(result.error.code, "unknown_illustration");
      }
      if (requests.length === 7) {
        const result = resultOf("illustration_6");
        assert.equal(result.ok, true); assert.equal(result.hasDraft, true);
        assert.equal(result.beatCount, 2); assert.equal(result.choiceCount, 3);
        assert.deepEqual(Object.keys(result).filter(key => /characters|remaining|target/i.test(key)), [],
          "Draft reading reports structure without a character target or deficit");
      }
      assert.ok(requests.length <= steps.length, "Unexpected additional model request");
      const step = steps[requests.length - 1];
      await route.fulfill({headers:cors, contentType:"application/json", body:JSON.stringify({model:"illustrations-fixture",
        choices:[{finish_reason:"tool_calls", message:{role:"assistant", content:null,
          tool_calls:[{id:"illustration_" + requests.length, type:"function", function:{name:step.name, arguments:JSON.stringify(step.arguments)}}]}}],
        usage:{prompt_tokens:100, completion_tokens:40, prompt_cache_hit_tokens:80, prompt_cache_miss_tokens:20}})});
    });
    await page.goto(origin, {waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => Boolean(window.__vnEngine && window.JiuzhouIllustrations));
    const assets = await page.evaluate(() => window.JiuzhouIllustrations.list({faction:"qing"}));
    assert.equal(assets.length, 32); assert.equal(new Set(assets.map(asset => asset.id)).size, 32);
    assert.ok(await page.evaluate(() => window.JiuzhouIllustrations.resolve("qing_captive")), "Old stored handles still resolve");
    if (!size.mobile) {
      const decoded = await page.evaluate(async assets => {
        const results = [];
        for (const asset of assets) {
          const response = await fetch(asset.relativePath);
          if (!response.ok) {results.push({id:asset.id, status:response.status}); continue;}
          const image = new Image(); image.src = asset.relativePath;
          try {await image.decode(); results.push({id:asset.id, status:response.status, width:image.naturalWidth, height:image.naturalHeight});}
          catch {results.push({id:asset.id, status:response.status, decode:false});}
        }
        return results;
      }, assets);
      assert.equal(decoded.length, 32);
      assert.deepEqual(decoded.filter(asset => asset.status !== 200 || !asset.width || !asset.height), [],
        "Every new registered image must return HTTP 200 and decode in Chrome");
      evidence.decodedImages = decoded;
    }
    await page.evaluate(() => window.__vnEngine.startNewGame("qing"));
    const scene = await page.evaluate(() => {
      const engine = window.__vnEngine, registry = window.JiuzhouIllustrations;
      const expected = registry.sceneFor({faction:engine.currentFaction, nodeId:engine.currentStoryNodeId, coords:engine.currentCoords});
      return {expected:expected?.id, expectedPath:expected?.relativePath, current:engine.currentSceneIllustration?.id,
        queue:engine.storyQueue.filter(beat => beat.illustrationData).map(beat => beat.illustrationData.id)};
    });
    assert.ok(scene.expected, "The authored initial Later Jin scene needs an explicit illustration binding");
    assert.equal(scene.current, scene.expected);
    assert.equal(scene.queue.includes(scene.expected), false, "Canonical scene art is a background, never an inserted popup beat");
    await modalClosed(page);
    assert.equal(await page.locator("#btn-view-illustration").isVisible(), false,
      "A background alone must not create a popup opener");
    if (size.mobile) {
      // A prose page does not erase the scene image selected for this chapter.
      await page.waitForFunction(path => document.querySelector("#mobile-scene-art").getAttribute("src") === path, scene.expectedPath);
      await next(page, size);
      assert.equal(await page.locator("#mobile-scene-art").getAttribute("src"), scene.expectedPath);
    }
    await noOverflow(page, size.name + " canonical scene");
    await toChoices(page, size);
    await page.evaluate(() => {window.__vnEngine.apiConfig.enabled = true; window.__vnEngine.expectedLength = 500;});
    await page.click("#choice-container .choice-card:last-child");
    await page.waitForFunction(() => document.querySelector("#drawer-open-input").getAttribute("aria-modal") === "true");
    await page.fill("#open-input-text", "夜访营地，核查口供与卷宗。");
    await page.click("#btn-submit-open-input");
    await page.waitForFunction(() => !window.__vnEngine.isAIGenerating &&
      (window.__vnEngine.aiGenerationMetrics || window.__vnEngine.pendingTurnAttempt), undefined, {timeout:30000});
    const state = await page.evaluate(() => {
      const engine = window.__vnEngine;
      return {error:engine.pendingTurnAttempt?.errorCode, message:engine.pendingTurnAttempt?.errorMessage,
        prose:engine.storyQueue.filter(beat => beat.type !== "illustration").map(beat => beat.text),
        beats:engine.aiGenerationMetrics?.beatCount, tokens:engine.aiGenerationMetrics?.completionTokens,
        elapsedValid:Number.isFinite(engine.aiGenerationMetrics?.elapsedMs) && engine.aiGenerationMetrics.elapsedMs >= 0,
        removedMetricFields:[...Object.keys(engine.aiGenerationMetrics || {}), ...Object.keys(engine.aiGenerationMetrics?.harness || {})]
          .filter(key => /characters|expectedLength|targetLength/i.test(key)),
        diagnosticNodes:document.querySelectorAll("#ai-generation-metrics, #ai-harness-progress, #cache-telemetry-box, #settings-diagnostics").length,
        illustrations:engine.storyQueue.map((beat, index) => beat.illustrationData ? {id:beat.illustrationData.id, index} : null).filter(Boolean)};
    });
    assert.equal(state.error, undefined, JSON.stringify(state));
    assert.deepEqual(state.prose, story.beats.map(beat => beat.text), "Short prose succeeds unchanged alongside native illustration tools");
    assert.equal(state.beats, 2); assert.equal(state.tokens, steps.length * 40); assert.equal(state.elapsedValid, true);
    assert.deepEqual(state.removedMetricFields, []); assert.equal(state.diagnosticNodes, 0,
      "Internal metrics may exist in memory, but runtime logs and diagnostics must have no UI nodes");
    assert.equal(requests.length, steps.length);
    assert.deepEqual(state.illustrations.map(asset => asset.id), chosen,
      "A rejected unknown ID must neither guess wealth nor displace valid choices");
    assert.equal(state.illustrations[0].index, 0);
    const queueLength = await page.evaluate(() => window.__vnEngine.storyQueue.length);
    assert.equal(state.illustrations[1].index, queueLength - 1,
      "afterBeat indexes original paragraphs before prose pagination");
    await illustrationVisible(page, chosen[0]);
    await noOverflow(page, size.name + " image modal");
    if (screenshots) await page.screenshot({path:join(screenshots, size.name + "-illustration-modal.png")});
    await closeCard(page);
    await reopenCard(page, "Enter");
    await closeCard(page, "escape");
    await reopenCard(page, "Space");
    await closeCard(page, "backdrop");
    const firstImageStep = await page.evaluate(() => window.__vnEngine.currentStep);
    await next(page, size);
    await page.evaluate(() => window.__vnEngine.fastForwardTypewriter());
    assert.equal(await page.evaluate(() => window.__vnEngine.currentStep), firstImageStep + 1,
      "Only the explicit next-page control advances out of an illustration beat");
    assert.equal(await page.locator("#typewriter-text").textContent(), story.beats[0].text);
    await page.click("#btn-dialogue-prev");
    await illustrationVisible(page, chosen[0]);
    await closeCard(page);
    await showQueueIndex(page, state.illustrations[1].index);
    await illustrationVisible(page, chosen[1]);
    await closeCard(page);
    // Persist a real selected beat, reload and resume it through the title UI.
    await page.evaluate(() => window.__vnEngine.saveGameState());
    await page.reload({waitUntil:"domcontentloaded"});
    await page.click("#title-btn-continue");
    await illustrationVisible(page, chosen[1]);
    await closeCard(page);
    await reopenCard(page);
    await closeCard(page);
    await noOverflow(page, size.name + " saved illustration");
    if (screenshots) await page.screenshot({path:join(screenshots, size.name + "-illustration-reading.png")});
    // Simulate the browser failing one registered asset. The image error must
    // leave a readable placeholder and preserve ordinary next-page navigation.
    const missingPath = assets.find(asset => asset.id === chosen[0]).relativePath;
    await page.route("**/" + missingPath, route => route.fulfill({status:404, body:"fixture missing image"}));
    await showQueueIndex(page, 0);
    await page.waitForFunction(() => {
      const modal = document.querySelector("#modal-illustration");
      const fallback = modal.querySelector(".illustration-load-error"), image = modal.querySelector("#illustration-graphic img");
      return modal.classList.contains("open") && image?.hidden && fallback && getComputedStyle(fallback).display !== "none" &&
        /(?:缺失|未能|加载失败|不可用|无法)/.test(fallback.textContent);
    });
    const missingStep = await page.evaluate(() => window.__vnEngine.currentStep);
    await closeCard(page);
    await next(page, size);
    await page.waitForFunction(step => window.__vnEngine.currentStep > step, missingStep);
    await page.evaluate(() => window.__vnEngine.fastForwardTypewriter());
    assert.ok((await page.locator("#dialogue-content").textContent()).includes("文"), "A missing image must not block the next prose page");
    await noOverflow(page, size.name + " missing image");
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    evidence.viewports.push({name:size.name, width:size.width, height:size.height, passed:true,
      assets:assets.length, modelCalls:requests.length, proseBeats:state.beats, shortProseDelivered:true,
      insertedIllustrationIds:state.illustrations.map(asset => asset.id), initialSceneId:scene.expected,
      automaticIllustrationModal:true, noInlineIllustration:true, independentViewportModal:true, keyboardActivation:true,
      escapeAndBackdropClose:true, previousPageRestoresModal:true, saveAndResume:true, missingImageContinuation:true, diagnosticUINodes:0});
    await context.close();
    console.log(`PASS ${size.name}: 32 assets, canonical and native tool images open independent viewport modals; no prose cards or diagnostic UI; afterBeat placement, exact prose, close/reopen/previous/save/resume and missing-image continuation`);
  }
  if (screenshots) await writeFile(join(screenshots, "browser-verification.json"), JSON.stringify(evidence, null, 2) + "\n");
} finally {await browser.close(); await new Promise(done => server.close(done));}
