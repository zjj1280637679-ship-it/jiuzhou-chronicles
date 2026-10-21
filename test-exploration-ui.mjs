// Full client flow against this checkout in fresh browser contexts. Every
// external request is mocked or blocked; no user profile or AI credit is used.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile, mkdir} from "node:fs/promises";
import {resolve, extname, sep, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium} = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".jpg":"image/jpeg", ".png":"image/png"};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!path.startsWith(resolve(root) + sep)) {res.writeHead(403).end(); return;}
    const bytes = await readFile(path);
    res.writeHead(200, {"content-type":mime[extname(path)] || "application/octet-stream"}).end(bytes);
  } catch (_) {res.writeHead(404).end();}
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE});
const shots = process.env.JIUZHOU_EXPLORATION_SCREENSHOTS;
if (shots) await mkdir(shots, {recursive:true});
const sizes = [
  {name:"phone-320", width:320, height:740, mobile:true},
  {name:"phone-390", width:390, height:844, mobile:true},
  {name:"desktop", width:1440, height:900, mobile:false}
];
const actionText = "核对城中粮册，再与乡民商议补给。";
const replyText = "灯火照着新抄的粮册，众人逐一核对入库数目。".repeat(40);

async function reachable(page, selector) {
  const el = typeof selector === "string" ? page.locator(selector) : selector;
  await el.scrollIntoViewIfNeeded();
  const result = await el.evaluate(node => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {x:r.x, y:r.y, width:r.width, height:r.height, viewportWidth:innerWidth, viewportHeight:innerHeight,
      hit:hit === node || node.contains(hit), inert:Boolean(node.closest("[inert]"))};
  });
  assert.ok(result.width > 0 && result.height > 0 && result.x >= -1 && result.y >= -1 &&
    result.x + result.width <= result.viewportWidth + 1 && result.y + result.height <= result.viewportHeight + 1 &&
    result.hit && !result.inert, `Unreachable ${typeof selector === "string" ? selector : "button"}: ${JSON.stringify(result)}`);
}
async function state(page) {
  return page.evaluate(() => {
    const e = window.__vnEngine;
    return {turn:e.currentTurn, step:e.currentStep, node:e.currentStoryNodeId, branchDepth:e.branchDepth,
      ideology:e.ideologyVector, danger:e.dangerTicks, queue:e.storyQueue.map(b => b.text),
      history:e.extrapolationHistory, apiHistory:e.apiHistory, fateKnots:e.fateKnots};
  });
}
async function modalReady(page, id) {
  await page.waitForFunction(id => {
    const node = document.getElementById(id);
    return node?.classList.contains("open") && node.getAttribute("aria-modal") === "true" && !node.closest("[inert]");
  }, id);
}
async function menuAction(page, size, selector) {
  if (size.mobile) {
    await page.click("#mobile-menu-toggle");
    await page.waitForFunction(() => document.querySelector("#quick-menu").getAttribute("aria-modal") === "true");
  }
  await reachable(page, selector);
  await page.click(selector);
}
async function openSettings(page, size, title = false) {
  if (title) await page.click("#title-btn-settings");
  else await menuAction(page, size, "#qm-settings");
  await modalReady(page, "drawer-settings");
}
async function closeSettings(page) {
  await page.click("#btn-close-settings");
  await page.waitForFunction(() => !document.querySelector("#drawer-settings").classList.contains("open"));
}
async function toChoices(page, size) {
  for (let i = 0; i < 180; i++) {
    if (await page.locator("#choice-overlay").evaluate(el => el.classList.contains("visible"))) return;
    await page.click(size.mobile ? "#mobile-next" : "#dialogue-box");
  }
  assert.fail(`${size.name}: normal navigation did not reach choices`);
}
async function choiceLabels(page) {
  return (await page.locator("#choice-container .choice-card-text").allTextContents()).slice(0, 3).map(text => text.trim());
}
async function returnToReading(page) {
  // class=visible is set by the engine before the next paint establishes the
  // accessible modal/focus. A keyboard user acts after that paint.
  await page.waitForFunction(() => {
    const choices = document.querySelector("#choice-overlay");
    return choices.getAttribute("aria-modal") === "true" && !choices.closest("[inert]");
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#choice-overlay").classList.contains("visible"));
}
async function submitAction(page, size, text) {
  await toChoices(page, size);
  await page.click("#choice-container .choice-card:last-child");
  await modalReady(page, "drawer-open-input");
  await page.fill("#open-input-text", text);
  await page.click("#btn-submit-open-input");
}
async function waitFailed(page) {
  await page.waitForFunction(() => window.__vnEngine.pendingTurnAttempt?.status === "failed" && !window.__vnEngine.isAIGenerating);
  await page.locator("#turn-recovery-panel").waitFor({state:"visible"});
}
const recoveryButton = (page, name) => page.locator("#turn-recovery-panel").getByRole("button", {name, exact:true});
async function pending(page) {
  return page.evaluate(() => {
    const p = window.__vnEngine.pendingTurnAttempt;
    return p ? {id:p.id, dice:p.dice, action:p.choice.customInput, status:p.status} : null;
  });
}
function diceIn(body) {
  const text = body.messages.filter(m => m.role === "user").map(m => m.content).join("\n");
  const match = text.match(/2d6 掷骰检定：\((\d) \+ (\d)\)/);
  assert.ok(match, "Fixture request must include public dice check");
  return [Number(match[1]), Number(match[2])];
}
async function reloadContinue(page) {
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => Boolean(window.__vnEngine?.apiConfig));
  await page.click("#title-btn-continue");
  await page.waitForFunction(() => window.__vnEngine.gameState === "PLAYING");
}
async function shot(page, size, phase) {
  if (shots) await page.screenshot({path:join(shots, `${size.name}-${phase}.png`)});
}

try {
  for (const size of sizes) {
    const context = await browser.newContext({viewport:{width:size.width, height:size.height}, isMobile:size.mobile,
      hasTouch:size.mobile, deviceScaleFactor:1, serviceWorkers:"block", reducedMotion:"reduce", acceptDownloads:true});
    // This hook affects only the fresh test context and only game progress saves.
    await context.addInitScript(() => {
      window.__testProgressQuota = false;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "vn_save_state" && window.__testProgressQuota) throw new DOMException("fixture storage full", "QuotaExceededError");
        return set.call(this, key, value);
      };
    });
    const page = await context.newPage();
    const errors = [], bodies = [], unexpected = [];
    let responseMode = "fail", probeCalls = 0, customCalls = 0;
    page.on("pageerror", e => errors.push(e.message));
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin) {await route.continue(); return;}
      const cors = {"access-control-allow-origin":origin, "access-control-allow-methods":"POST, OPTIONS", "access-control-allow-headers":"content-type, authorization"};
      if (url.pathname === "/health") {
        await route.fulfill({status:200, headers:cors, contentType:"application/json", body:JSON.stringify({ok:true, configured:true, enabled:true,
          jiuzhouEnabled:true, jiuzhouReady:true, model:"exploration-fixture"})}); return;
      }
      const shared = url.pathname === "/api/jiuzhou/turn";
      const custom = url.origin === "https://exploration.fixture" && url.pathname === "/v1/chat/completions";
      if (shared || custom) {
        if (req.method() === "OPTIONS") {await route.fulfill({status:204, headers:cors}); return;}
        assert.equal(req.method(), "POST");
        const body = JSON.parse(req.postData() || "{}");
        if (custom) {customCalls++; assert.equal(req.headers().authorization, undefined, "An empty Key must not send Authorization");}
        const probe = body.messages.at(-1).content.includes("连接测试成功");
        if (probe) {
          probeCalls++;
          await route.fulfill({status:200, headers:cors, contentType:"application/json", body:JSON.stringify({model:"exploration-fixture", choices:[{
            message:{content:JSON.stringify({reconciledBeats:[{speaker:"旁白", text:"连接测试成功。"}]})}}]})}); return;
        }
        bodies.push(body);
        if (responseMode === "fail") {await route.fulfill({status:503, headers:cors, contentType:"application/json", body:JSON.stringify({error:"upstream_unavailable"})}); return;}
        await route.fulfill({status:200, headers:cors, contentType:"application/json", body:JSON.stringify({model:"exploration-fixture", choices:[{
          finish_reason:"stop", message:{role:"assistant", content:JSON.stringify({beats:[{speaker:"粮官", sub:"模拟回复", text:replyText}],
            choices:[{text:"核对账目"}, {text:"商议运粮"}, {text:"巡查城门"}]})}}], usage:{prompt_tokens:100, completion_tokens:150}})}); return;
      }
      if (req.method() === "POST") unexpected.push(url.origin + url.pathname);
      await route.abort("blockedbyclient");
    });
    try {
      assert.equal((await page.goto(origin, {waitUntil:"domcontentloaded"})).status(), 200);
      await page.waitForFunction(() => window.__vnEngine && document.getElementById("qm-favorites") && document.getElementById("turn-recovery-panel"));
      assert.deepEqual(await page.evaluate(() => ["settings.css", "settings-ui.js", "favorites-ui.js", "recovery-ui.js"].map(name =>
        Boolean(document.querySelector(`link[href^="${name}"], script[src^="${name}"]`)))), [true, true, true, true], "The actual index must load the new modules");

      await page.click("#title-btn-swarm"); await modalReady(page, "drawer-swarm");
      const referenceText = await page.locator("#swarm-observatory-body").textContent();
      assert.match(referenceText, /预设参考分布/); assert.match(referenceText, /游戏内置的设计示例/);
      assert.match(referenceText, /未接入实时玩家统计/);
      assert.doesNotMatch(referenceText, /12,480|12480|全网样本|全服/);
      assert.match(await page.locator("#qm-swarm").getAttribute("title"), /预设人物镜像/);
      await page.click("#btn-close-swarm");

      await openSettings(page, size, true);
      for (const id of ["settings-generation-advanced", "settings-diagnostics", "settings-compatibility"])
        assert.equal(await page.locator("#" + id).getAttribute("open"), null, `${id} must start folded`);
      assert.equal(await page.locator("#setting-max-tokens").isVisible(), false);
      assert.equal(await page.locator("#ai-generation-metrics").isVisible(), false);
      await reachable(page, "#btn-save-settings"); await reachable(page, "#btn-test-ai-connection");
      await page.selectOption("#setting-api-source", "custom");
      await page.fill("#setting-endpoint", "https://exploration.fixture/v1");
      await page.fill("#setting-api-key", "");
      await page.selectOption("#setting-model", "custom"); await page.fill("#setting-custom-model", "exploration-fixture");
      await page.click("#settings-compatibility > summary"); await page.selectOption("#setting-api-adapter", "openai");
      await page.selectOption("#setting-token-parameter", "max_completion_tokens");
      await page.click("#settings-generation-advanced > summary"); await page.fill("#setting-max-tokens", "4096");
      await page.click("#settings-diagnostics > summary"); await reachable(page, "#btn-retry-shared-ai");
      await page.click("#btn-test-ai-connection");
      await page.waitForFunction(() => document.querySelector("#ai-connection-test-status").textContent.includes("测试成功"));
      assert.equal(probeCalls, 1); assert.equal(customCalls, 1); assert.equal(bodies.length, 0);
      await page.click("#btn-save-settings");
      await page.waitForFunction(() => !document.querySelector("#drawer-settings").classList.contains("open"));
      await openSettings(page, size, true);
      assert.equal(await page.locator("#setting-api-source").inputValue(), "custom");
      assert.equal(await page.locator("#setting-api-key").inputValue(), "");
      assert.equal(await page.locator("#setting-max-tokens").inputValue(), "4096");
      await page.selectOption("#setting-api-source", "shared"); await page.click("#btn-save-settings");
      await page.waitForFunction(() => !document.querySelector("#drawer-settings").classList.contains("open"));
      await page.click("#title-btn-start"); await page.waitForFunction(() => window.__vnEngine.gameState === "PLAYING");
      // Set the visible body target through the existing reading UI.
      if (size.mobile) {
        await page.click("#mobile-menu-toggle"); await page.click('.btn-length[data-length="500"]'); await page.click("#mobile-menu-close");
      } else await page.click('.btn-length[data-length="500"]');
      await page.click(size.mobile ? "#mobile-next" : "#dialogue-box");

      const beforeFavorite = await state(page);
      const currentText = await page.evaluate(() => window.__vnEngine.getCurrentReadingScene().text);
      await menuAction(page, size, "#qm-favorites"); await modalReady(page, "drawer-favorites");
      await page.click("#btn-favorite-current"); await page.click("#btn-favorite-current");
      assert.equal(await page.locator(".favorite-scene").count(), 1, "Repeated collection must deduplicate");
      assert.match(await page.locator("#favorites-status").textContent(), /已经收藏/);
      assert.deepEqual(await state(page), beforeFavorite, "Collection must not advance or settle the story");
      await page.click("#btn-close-favorites"); await reloadContinue(page);
      await menuAction(page, size, "#qm-favorites"); await modalReady(page, "drawer-favorites");
      await page.locator(".favorite-scene > summary").click();
      assert.equal(await page.locator(".favorite-text").textContent(), currentText, "Stored scene must remain readable after reload");
      await page.click("#btn-favorite-current"); assert.equal(await page.locator(".favorite-scene").count(), 1);
      await page.locator(".favorite-scene > summary").click();
      await page.locator(".favorite-scene").getByRole("button", {name:"取消收藏", exact:true}).click();
      assert.equal(await page.locator(".favorite-scene").count(), 0);
      await page.click("#btn-close-favorites"); assert.equal(bodies.length, 0, "Favorites must never call a model");

      await toChoices(page, size);
      const beforeFailure = await state(page);
      await submitAction(page, size, actionText); await waitFailed(page);
      assert.deepEqual(await state(page), beforeFailure, "A failed turn must restore the committed world");
      const failed = await pending(page); assert.equal(failed.action, actionText); assert.equal(bodies.length, 1);
      await shot(page, size, "recovery");
      assert.deepEqual(diceIn(bodies[0]), failed.dice);
      await reloadContinue(page); await waitFailed(page);
      assert.equal(bodies.length, 1, "Refreshing a failed turn must not send another request");
      assert.equal((await pending(page)).id, failed.id);
      assert.deepEqual((await pending(page)).dice, failed.dice);
      const beforeCollapse = await state(page);
      await recoveryButton(page, "收起，继续阅读").click();
      await page.locator("#turn-recovery-panel").waitFor({state:"hidden"});
      assert.equal((await pending(page)).id, failed.id, "Collapsing recovery must preserve the pending action");
      await menuAction(page, size, "#qm-recovery"); await waitFailed(page);
      assert.deepEqual(await state(page), beforeCollapse, "Collapsing/reopening recovery must not advance the world");
      await reachable(page, recoveryButton(page, "按原行动重试"));
      // Settings must remain operable above recovery; opening it must not retry.
      await openSettings(page, size); await reachable(page, "#btn-save-settings"); await reachable(page, "#btn-close-settings");
      assert.equal(await page.locator("#turn-recovery-panel").evaluate(n => Boolean(n.closest("[inert]"))), true);
      assert.equal(bodies.length, 1); await closeSettings(page);
      responseMode = "success";
      await reachable(page, recoveryButton(page, "按原行动重试")); await recoveryButton(page, "按原行动重试").click();
      await page.waitForFunction(() => !window.__vnEngine.pendingTurnAttempt && !window.__vnEngine.isAIGenerating);
      assert.equal(bodies.length, 2); assert.deepEqual(diceIn(bodies[1]), failed.dice, "Retry must reuse original dice");
      const delivered = await state(page);
      assert.equal(delivered.turn, beforeFailure.turn + 1); assert.equal(delivered.branchDepth, beforeFailure.branchDepth + 1);
      assert.equal(delivered.history.length, beforeFailure.history.length + 1, "Only one turn may be settled");
      await shot(page, size, "delivered");

      responseMode = "fail"; await toChoices(page, size);
      const deliveredChoices = await choiceLabels(page);
      for (const [index, text] of ["核对账目", "商议运粮", "巡查城门"].entries()) assert.ok(deliveredChoices[index].includes(text));
      await returnToReading(page); await toChoices(page, size);
      assert.deepEqual(await choiceLabels(page), deliveredChoices, "Returning to reading must not consume the delivered choices");
      await returnToReading(page);
      await page.click(size.mobile ? "#mobile-home" : "#qm-home");
      await page.waitForFunction(() => window.__vnEngine.gameState === "TITLE");
      await reloadContinue(page); await toChoices(page, size);
      assert.deepEqual(await choiceLabels(page), deliveredChoices, "Home, reload, and continue must retain the delivered choices");
      assert.equal(bodies.length, 2, "Reading and resuming existing choices must not call AI");
      const beforeReload = await state(page);
      await submitAction(page, size, "检查雨后城墙，安排乡民修缮。"); await waitFailed(page);
      const interrupted = await pending(page), requestCount = bodies.length;
      await reloadContinue(page); await waitFailed(page);
      assert.equal(bodies.length, requestCount, "Reload/continue must not automatically make a paid retry");
      assert.deepEqual((await pending(page)).dice, interrupted.dice);
      assert.equal((await pending(page)).id, interrupted.id);
      assert.equal((await state(page)).turn, beforeReload.turn);
      await reachable(page, recoveryButton(page, "放弃本次尝试")); await recoveryButton(page, "放弃本次尝试").click();
      await page.waitForFunction(() => !window.__vnEngine.pendingTurnAttempt);
      assert.equal((await state(page)).turn, beforeReload.turn); assert.equal(bodies.length, requestCount);
      assert.deepEqual(await choiceLabels(page), deliveredChoices, "Discarding a failed action must return to the original delivered choices");
      await submitAction(page, size, "走访粮仓，按村户商议赈济。"); await waitFailed(page);
      const localAttempt = await pending(page), beforeLocal = await state(page), countBeforeLocal = bodies.length;
      await reloadContinue(page); await waitFailed(page);
      await reachable(page, recoveryButton(page, "改用本地剧情")); await recoveryButton(page, "改用本地剧情").click();
      await page.waitForFunction(() => !window.__vnEngine.pendingTurnAttempt && !window.__vnEngine.isAIGenerating);
      const localState = await state(page);
      assert.equal(bodies.length, countBeforeLocal, "Explicit local recovery must not send an API request");
      assert.equal(localState.turn, beforeLocal.turn + 1); assert.equal(localState.history.length, beforeLocal.history.length + 1);
      assert.equal(localState.history.at(-1).diceTotal, localAttempt.dice[0] + localAttempt.dice[1] + 2);

      const goodSave = await page.evaluate(() => localStorage.getItem("vn_save_state"));
      assert.ok(goodSave, "Fixture must first produce a successful save");
      await page.evaluate(() => {window.__testProgressQuota = true;});
      await page.click(size.mobile ? "#mobile-home" : "#qm-home");
      await page.locator(".save-failure-warning").waitFor({state:"visible"});
      assert.equal(await page.evaluate(() => localStorage.getItem("vn_save_state")), goodSave, "Quota failure must preserve the previous good save byte for byte");
      await reachable(page, ".save-failure-warning"); await page.click(".save-failure-warning"); await modalReady(page, "drawer-settings");
      const progress = page.locator(".progress-save-status");
      assert.equal(await progress.getAttribute("data-state"), "error");
      assert.match(await progress.locator("p").first().textContent(), /空间不足.*上次成功存档仍保留/);
      await progress.getByRole("button", {name:"立即保存", exact:true}).click();
      assert.equal(await page.evaluate(() => localStorage.getItem("vn_save_state")), goodSave);
      const downloadPromise = page.waitForEvent("download");
      await progress.getByRole("button", {name:"导出进度备份", exact:true}).click();
      const download = await downloadPromise, stream = await download.createReadStream();
      const chunks = []; for await (const chunk of stream) chunks.push(chunk);
      const backupText = Buffer.concat(chunks).toString("utf8"), backup = JSON.parse(backupText);
      assert.equal(backup.format, "jiuzhou-progress"); assert.equal(backup.state.currentTurn, localState.turn);
      assert.ok(!/apiConfig|apiKey|exploration\.fixture/.test(backupText), "Progress export must exclude provider configuration");
      const backupFile = {name:"jiuzhou-fixture-progress.json", mimeType:"application/json", buffer:Buffer.from(backupText)};
      const importInput = progress.getByLabel("选择九州进度备份", {exact:true});
      const restoreBackup = progress.getByRole("button", {name:"恢复此备份", exact:true});
      const beforeFailedImport = await state(page);
      await importInput.setInputFiles(backupFile); await restoreBackup.waitFor({state:"visible"});
      assert.deepEqual(await state(page), beforeFailedImport, "File selection is a preview, not a restore");
      await restoreBackup.click();
      assert.match(await progress.locator("p").first().textContent(), /备份尚未恢复/);
      assert.deepEqual(await state(page), beforeFailedImport, "A quota-blocked import must leave the live world intact");
      assert.equal(await page.evaluate(() => localStorage.getItem("vn_save_state")), goodSave);
      await page.evaluate(() => {window.__testProgressQuota = false;});
      await progress.getByRole("button", {name:"立即保存", exact:true}).click();
      await page.waitForFunction(() => document.querySelector(".progress-save-status").dataset.state === "saved");
      assert.equal(await page.locator(".save-failure-warning").isVisible(), false);

      // Continue reading through normal controls so importing the downloaded
      // backup will restore an observably earlier page, without calling AI.
      await closeSettings(page); await page.click("#title-btn-continue");
      await page.waitForFunction(() => window.__vnEngine.gameState === "PLAYING");
      await page.click(size.mobile ? "#mobile-next" : "#dialogue-box");
      const beforeImport = await state(page);
      assert.notEqual(beforeImport.step, backup.state.currentStep, "The import fixture must be an earlier reading position");
      await openSettings(page, size);
      const configBeforeImport = await page.evaluate(() => localStorage.getItem("vn_api_config"));
      const saveBeforeImport = await page.evaluate(() => localStorage.getItem("vn_save_state"));
      await importInput.setInputFiles({name:"invalid-progress.json", mimeType:"application/json", buffer:Buffer.from('{"not_a_game_save":true}')});
      await page.waitForFunction(() => Array.from(document.querySelectorAll(".progress-save-status p")).some(n => n.textContent.includes("无法识别")));
      assert.equal(await restoreBackup.isVisible(), false);
      assert.deepEqual(await state(page), beforeImport, "Invalid files must leave the world intact");
      assert.equal(await page.evaluate(() => localStorage.getItem("vn_save_state")), saveBeforeImport);
      await importInput.setInputFiles(backupFile); await restoreBackup.waitFor({state:"visible"});
      assert.deepEqual(await state(page), beforeImport, "A valid file must also wait for explicit confirmation");
      await reachable(page, restoreBackup); await restoreBackup.click();
      await page.waitForFunction(() => document.querySelector(".progress-save-status").dataset.state === "saved");
      const restored = await state(page);
      assert.equal(restored.turn, backup.state.currentTurn); assert.equal(restored.step, backup.state.currentStep);
      assert.equal(restored.node, backup.state.currentStoryNodeId); assert.deepEqual(restored.queue, backup.state.storyQueue.map(b => b.text));
      assert.equal(await page.evaluate(() => localStorage.getItem("vn_api_config")), configBeforeImport, "Restoring progress must preserve current API settings");
      assert.equal(bodies.length, countBeforeLocal, "Import, preview and restore must never call a model");
      await closeSettings(page); await page.click(size.mobile ? "#mobile-next" : "#dialogue-box");
      assert.equal((await state(page)).step, restored.step + 1, "The restored page must continue through normal reading controls");
      assert.equal((await state(page)).turn, restored.turn);
      await openSettings(page, size);
      await reachable(page, "#btn-save-settings"); await reachable(page, "#btn-close-settings");
      const overflow = await page.evaluate(() => ["#drawer-settings .settings-dialog", "#drawer-settings .settings-body"].filter(selector => {
        const el = document.querySelector(selector); return el.scrollWidth > el.clientWidth + 1;
      }));
      assert.deepEqual(overflow, []); await shot(page, size, "settings-progress");
      await closeSettings(page);
      await menuAction(page, size, "#qm-ribbon"); await modalReady(page, "drawer-ribbon");
      const rewind = page.locator(".ribbon-knot-item").filter({hasText:`外推 #${delivered.turn}`}).locator(".btn-rewind-knot");
      await reachable(page, rewind); await rewind.click();
      await page.waitForFunction(turn => window.__vnEngine.currentTurn === turn, delivered.turn);
      await toChoices(page, size);
      assert.deepEqual(await choiceLabels(page), deliveredChoices, "Rewinding an earlier delivered turn must restore its choices instead of later actions");
      assert.equal(bodies.length, countBeforeLocal, "Rewinding a saved choice snapshot must not call AI");
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      console.log(`PASS ${size.name}: honest preset-persona reference; settings → empty-key custom test/save → shared; favorites persistence/dedupe/delete; retry original dice/one settlement; choices survive reading/home/reload/discard and restore on rewind; reload/collapse/reopen/local; quota notice/last good save/export/import/preview/restore/read; all external requests intercepted`);
    } finally {await context.close();}
  }
} finally {await browser.close(); await new Promise(done => server.close(done));}
