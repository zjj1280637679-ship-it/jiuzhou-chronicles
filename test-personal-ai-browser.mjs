// New empty browser contexts only; every model response is a fixture.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile, mkdir} from "node:fs/promises";
import {resolve, extname, sep, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium} = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png", ".webp":"image/webp"};
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, "." + (new URL(req.url, "http://localhost").pathname === "/" ? "/index.html" : decodeURIComponent(new URL(req.url, "http://localhost").pathname)));
    if (!path.startsWith(resolve(root) + sep)) {res.writeHead(403).end(); return;}
    res.writeHead(200, {"content-type":mime[extname(path)] || "application/octet-stream"}).end(await readFile(path));
  } catch (_) {res.writeHead(404).end();}
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE});
const shots = process.env.JIUZHOU_PERSONAL_SCREENSHOTS;
if (shots) await mkdir(shots, {recursive:true});
const fixtureKey = "fixture-personal-only-key";
const config = {source:"shared", enabled:true, endpoint:"https://personal.fixture/v1", apiKey:fixtureKey,
  model:"custom", customModel:"personal-fixture", adapter:"openai", tokenParameter:"max_tokens", maxTokens:32768};
const story = {beats:[{speaker:"旁白", text:"粮册核对完毕，军民的疑虑逐渐平息。"}], choices:[{text:"查账"},{text:"运粮"},{text:"巡城"}]};
async function readyModal(page, id) {
  await page.waitForFunction(id => {
    const node = document.getElementById(id);
    return node?.getAttribute("aria-modal") === "true" && !node.closest("[inert]");
  }, id);
}
try {
  for (const size of [{name:"phone", width:390, height:844, mobile:true},{name:"desktop", width:1440, height:900, mobile:false}]) {
    const context = await browser.newContext({viewport:{width:size.width,height:size.height}, isMobile:size.mobile, hasTouch:size.mobile, serviceWorkers:"block", reducedMotion:"reduce"});
    await context.addInitScript(config => {if (!localStorage.getItem("vn_api_config")) localStorage.setItem("vn_api_config", JSON.stringify(config));}, config);
    const page = await context.newPage(), unexpected = [], requests = [], errors = [];
    let probes = 0;
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (["https://fonts.googleapis.com","https://fonts.gstatic.com"].includes(url.origin)) return route.abort("blockedbyclient");
      if (url.origin !== "https://personal.fixture" || url.pathname !== "/v1/chat/completions") {unexpected.push(url.origin + url.pathname); return route.abort("blockedbyclient");}
      const cors = {"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type, authorization"};
      if (request.method() === "OPTIONS") return route.fulfill({status:204, headers:cors});
      assert.equal(request.method(), "POST"); assert.equal(request.headers().authorization, "Bearer " + fixtureKey);
      const body = request.postDataJSON(); assert.equal(body.model, "personal-fixture");
      assert.doesNotMatch(JSON.stringify(body), new RegExp(fixtureKey));
      if (body.messages.at(-1).content.includes("连接测试成功")) {
        probes++; return route.fulfill({headers:cors, contentType:"application/json", body:JSON.stringify({model:"personal-fixture",choices:[{message:{content:JSON.stringify({reconciledBeats:[{text:"连接测试成功。"}]})}}]})});
      }
      requests.push(body);
      assert.equal(body.mode, undefined); assert.equal(body.enabledTools, undefined);
      assert.ok(body.tools.some(tool => tool.function.name === "deliver_story"));
      if (requests.length === 1) assert.match(body.messages.at(-1).content, /5500/,
        "The selected 5000 tier sends its 500-character drafting allowance in the first prompt");
      if (requests.length > 1) assert.deepEqual(body.messages.slice(0, requests[0].messages.length), requests[0].messages);
      const tool = requests.length === 1 ? {name:"read_world",arguments:"{}"} : requests.length === 2 ?
        {name:"write_draft",arguments:JSON.stringify({story,mode:"replace"})} : {name:"deliver_story",arguments:"{}"};
      await route.fulfill({headers:cors, contentType:"application/json", body:JSON.stringify({model:"personal-fixture",choices:[{finish_reason:"tool_calls",message:{role:"assistant",content:null,
        tool_calls:[{id:"personal_"+requests.length,type:"function",function:tool}]}}],usage:{prompt_tokens:100,completion_tokens:50}})});
    });
    await page.goto(origin, {waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => Boolean(window.__vnEngine));
    assert.equal(await page.evaluate(() => window.__vnEngine.apiConfig.enabled), false);
    assert.equal(await page.evaluate(() => window.__vnEngine.apiConfig.source), "custom");
    assert.equal(probes + requests.length, 0);
    assert.deepEqual(unexpected, [], "Legacy startup must not contact a shared gateway or its health endpoint");
    await page.click("#title-btn-start");
    await page.click(size.mobile ? "#mobile-next" : "#dialogue-box");
    const before = await page.evaluate(() => ({step:window.__vnEngine.currentStep,turn:window.__vnEngine.currentTurn,queue:window.__vnEngine.storyQueue.map(b=>b.text)}));
    await page.reload({waitUntil:"domcontentloaded"});
    await page.click("#title-btn-continue");
    assert.deepEqual(await page.evaluate(() => ({step:window.__vnEngine.currentStep,turn:window.__vnEngine.currentTurn,queue:window.__vnEngine.storyQueue.map(b=>b.text)})), before);
    if (size.mobile) await page.click("#mobile-menu-toggle");
    await page.click("#qm-settings");
    await readyModal(page,"drawer-settings");
    assert.equal(await page.locator('#setting-api-source option[value="shared"]').count(), 0);
    assert.equal(await page.locator("#btn-retry-shared-ai").count(), 0);
    assert.equal(await page.locator("#setting-endpoint").inputValue(), config.endpoint);
    assert.equal(await page.locator("#setting-api-key").inputValue(), fixtureKey);
    assert.equal(await page.locator("#setting-custom-model").inputValue(), config.customModel);
    assert.equal(await page.locator("#setting-enable-api").isChecked(), false);
    assert.match(await page.locator("#ai-provider-description").textContent(), /原共享通道已移除/);
    assert.equal(probes + requests.length, 0);
    // Hide this fixture-only password before producing a screenshot.
    if (shots) {await page.fill("#setting-api-key", ""); await page.screenshot({path:join(shots,size.name+"-personal-settings.png")}); await page.fill("#setting-api-key",fixtureKey);}
    await page.click("#btn-test-ai-connection");
    await page.waitForFunction(() => document.querySelector("#ai-connection-test-status").textContent.includes("测试成功"));
    assert.equal(probes, 1); assert.equal(requests.length, 0);
    await page.check("#setting-enable-api"); await page.click("#btn-save-settings");
    if (size.mobile) await page.click("#mobile-menu-toggle");
    await page.click('.btn-length[data-length="5000"]');
    if (size.mobile) await page.click("#mobile-menu-close");
    for (let i=0;i<180;i++) {
      if (await page.locator("#choice-overlay").evaluate(el=>el.classList.contains("visible"))) break;
      await page.click(size.mobile ? "#mobile-next" : "#dialogue-box");
    }
    await readyModal(page,"choice-overlay");
    await page.click("#choice-container .choice-card:last-child");
    await readyModal(page,"drawer-open-input");
    await page.fill("#open-input-text","核对粮册，再听取军民的意见。");
    assert.equal(await page.locator("#open-input-text").inputValue(),"核对粮册，再听取军民的意见。");
    await page.click("#btn-submit-open-input");
    try {
      await page.waitForFunction(() => !window.__vnEngine.isAIGenerating && (window.__vnEngine.aiGenerationMetrics || window.__vnEngine.pendingTurnAttempt), undefined, {timeout:30000});
    } catch (error) {
      const state = await page.evaluate(() => ({generating:window.__vnEngine.isAIGenerating, enabled:window.__vnEngine.apiConfig.enabled,
        progress:document.querySelector("#ai-harness-progress").textContent, pending:window.__vnEngine.pendingTurnAttempt?.errorCode,
        status:window.__vnEngine.aiRequestStatus?.message}));
      throw new Error(`${size.name}: fixture turn did not settle; model calls=${requests.length}; state=${JSON.stringify(state)}; browser errors=${JSON.stringify(errors)}`, {cause:error});
    }
    assert.equal(await page.evaluate(() => window.__vnEngine.pendingTurnAttempt?.errorCode), undefined,
      JSON.stringify(await page.evaluate(() => ({error:window.__vnEngine.pendingTurnAttempt?.errorCode,message:window.__vnEngine.pendingTurnAttempt?.errorMessage}))));
    const delivered = await page.evaluate(() => {
      const engine = window.__vnEngine, metrics = engine.aiGenerationMetrics;
      return {prose:engine.storyQueue.filter(beat => beat.type !== "illustration").map(beat => beat.text),
        pending:Boolean(engine.pendingTurnAttempt), calls:metrics.harness.modelCalls, tools:metrics.harness.toolCalls,
        beats:metrics.beatCount, options:metrics.choiceCount, tokens:metrics.completionTokens,
        elapsedValid:Number.isFinite(metrics.elapsedMs) && metrics.elapsedMs >= 0,
        removedMetricFields:[...Object.keys(metrics), ...Object.keys(metrics.harness)].filter(key => /characters|expectedLength|targetLength/i.test(key)),
        progress:document.querySelector("#ai-harness-progress").textContent,
        metricsText:document.querySelector("#ai-generation-metrics").textContent,
        choicesVisible:document.querySelector("#choice-overlay").classList.contains("visible")};
    });
    assert.deepEqual(delivered.prose, story.beats.map(beat => beat.text), "Short valid prose is delivered without padding or a repair request");
    assert.equal(delivered.pending, false); assert.equal(delivered.calls, 3); assert.equal(delivered.tools, 3);
    assert.equal(delivered.beats, 1); assert.equal(delivered.options, 3); assert.equal(delivered.tokens, 150);
    assert.equal(delivered.elapsedValid, true); assert.deepEqual(delivered.removedMetricFields, []);
    assert.doesNotMatch(delivered.progress + delivered.metricsText, /草稿正文|正文(?:未|已)达目标|剩余字数|其中中文/);
    assert.equal(delivered.choicesVisible, false);
    assert.equal(requests.length, 3); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.__vnEngine.apiConfig.sharedApiRemoved), undefined);
    await context.close();
    console.log(`PASS ${size.name}: shared settings → offline personal migration, exact progress resume, explicit direct probe, 5500 prompt and short native-tool delivery without a length gate; token/time/paragraph metrics; zero shared gateway requests`);
  }
} finally {await browser.close(); await new Promise(done => server.close(done));}
