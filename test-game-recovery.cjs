const assert = require("node:assert/strict");
const {test} = require("node:test");
const {WebVisualNovelEngine} = require("./app.js");
const recovery = require("./game-recovery.js");
const providers = require("./harness/providers.js");
function fixture(t) {
  const old = {window: global.window, document: global.document, localStorage: global.localStorage, fetch: global.fetch, WORLD_PRESETS: global.WORLD_PRESETS};
  t.after(() => Object.assign(global, old));
  global.WORLD_PRESETS = require("./skills-data.js");
  global.window = {};
  const element = () => ({style: {}, classList: {add() {}, remove() {}, contains() {return false;}}});
  global.document = {getElementById: () => element()};
  const store = new Map();
  global.localStorage = {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)};
  const e = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    currentFaction: "ming", currentTurn: 3, currentCoords: "beijing:high", dangerTicks: 2, maxDangerTicks: 4,
    ideologyVector: {authority: 2, pragmatism: 3, progress: 2, cognition: 1}, inventory: [], backlog: [{speaker: "旁白", text: "此前已交付的剧情"}],
    fateKnots: [], storyQueue: [{speaker: "旁白", text: "此前已交付的剧情"}], currentStep: 1, apiHistory: [], pendingApiChoices: null,
    currentStoryNodeId: "ming_act1", isExtrapolating: true, branchDepth: 2, extrapolationHistory: [], reconciledCardsCache: {},
    visitedNodeIds: ["ming_act1"], cacheTelemetry: {}, expectedLength: 500, gameState: "PLAYING", aiConfigRevision: 0,
    apiConfig: providers.normalizeConfig({enabled: true, source: "custom", endpoint: "https://fixture.example/v1", model: "test-model", apiKey: "fixture-secret"}),
    choiceOverlay: element(), isAIGenerating: false,
    updateDialogueNavUI() {}, updateIncenseHUD() {}, updateBranchIndicatorUI() {}, updateCachePillUI() {}, updateCacheTelemetryUI() {},
    executeAITools() {}, appendBacklogEntry() {}, updateAIProviderSettingsUI() {}, invalidateAIConnectionTest() {},
    displayDialogue(speaker, sub, type, text) {this.backlog.push({speaker, text});},
    buildDeepSeekCachePayload(choice, d1, d2, total, success) {
      const content = JSON.stringify({action: choice.customInput || choice.text, d1, d2, total, success, turn: this.currentTurn, ideology: this.ideologyVector});
      return {messages: [{role: "user", content}], ephemeralTail: content};
    }
  });
  return {e, store};
}
const action = {text: "先救出村民，再查询账本", customInput: "先救出村民，再查询账本", diceBase: 9, bias: {authority: 2}, isExtrapolation: true};
const completed = () => ({ok: true, json: async () => ({model: "test-model", choices: [{finish_reason: "stop", message: {content: JSON.stringify({
  beats: [{speaker: "旁白", text: "村民已脱险。".repeat(100)}], choices: [{text: "安排医者"}, {text: "查验账本"}, {text: "寻找船只"}]
})}}]})});

test("a failed turn rolls back world and formal history; only explicit retry reuses its dice and settles once", async t => {
  const {e, store} = fixture(t);
  const before = recovery.snapshot(e), requests = [];
  global.fetch = async (_url, init) => {requests.push(JSON.parse(JSON.parse(init.body).messages.at(-1).content)); throw new TypeError("network down");};
  await e.resolveFactionAction(action);
  assert.deepEqual(recovery.snapshot(e), before);
  assert.equal(requests.length, 1); assert.equal(e.pendingTurnAttempt.status, "failed");
  const saved = recovery.parseSave(store.get("vn_save_state"));
  assert.equal(saved.currentTurn, 3); assert.equal(saved.apiHistory.length, 0); assert.equal(saved.extrapolationHistory.length, 0);
  global.fetch = async (_url, init) => {requests.push(JSON.parse(JSON.parse(init.body).messages.at(-1).content)); return completed();};
  await e.retryPendingTurn();
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(e.currentTurn, 4); assert.equal(e.branchDepth, 3); assert.equal(e.ideologyVector.authority, 4);
  assert.equal(e.apiHistory.length, 2); assert.equal(e.extrapolationHistory.length, 1); assert.equal(e.pendingTurnAttempt, null);
  assert.equal(e.backlog.some(beat => /正在推演/.test(beat.text)), false);
});

test("a short compatibility story settles once without rejection or an automatic expansion request", async t => {
  const {e, store} = fixture(t), requests = [], effects = [];
  e.expectedLength = 2000;
  e.executeAITools = tools => effects.push(...tools);
  const shortStory = {
    beats: [{speaker: "角色名".repeat(2000), sub: "神态".repeat(2000), text: "村民已脱险。\n\t "},
      {type: "illustration", text: "画面说明".repeat(2000)}],
    choices: [{text: "可选行动".repeat(2000)}], deliberation: "思考".repeat(2000),
    stage_effects: [{name: "screen_flash", params: {color: "gold"}}]
  };
  assert.ok(JSON.stringify(shortStory).length > 20000);
  const respond = story => ({ok: true, json: async () => ({model: "test-model", choices: [{finish_reason: "stop", message: {content: JSON.stringify(story)}}]})});
  global.fetch = async (_url, init) => {
    requests.push(JSON.parse(JSON.parse(init.body).messages.at(-1).content));
    return respond(shortStory);
  };
  await e.resolveFactionAction(action);
  assert.equal(requests.length, 1, "valid short prose must not trigger an automatic expansion request");
  assert.equal(e.aiRequestStatus.state, "success");
  assert.equal(e.isAIGenerating, false);
  assert.equal(e.activeAIRequestController, null);
  assert.equal(e.aiGenerationMetrics.textCharacters, undefined);
  assert.equal(e.aiGenerationMetrics.hanCharacters, undefined);
  assert.equal(e.aiGenerationMetrics.beatCount, 1);
  assert.equal(e.pendingTurnAttempt, null);
  assert.equal(e.apiHistory.length, 2);
  assert.equal(e.currentTurn, 4);
  assert.equal(e.extrapolationHistory.length, 1);
  assert.deepEqual(effects, [{tool: "screen_flash", params: {color: "gold"}}]);
  assert.equal(await e.retryPendingTurn(), undefined, "a successful short response must not expose a failed-turn retry");
  assert.equal(requests.length, 1);
  const completedSave = recovery.parseSave(store.get("vn_save_state"));
  assert.equal(completedSave.currentTurn, 4);
  assert.equal(completedSave.apiHistory.length, 2);
  assert.equal(completedSave.pendingTurnAttempt, undefined);
});

test("discarding a failed attempt keeps the committed world without sending another request", async t => {
  const {e} = fixture(t), before = recovery.snapshot(e); let calls = 0, choices = 0;
  global.fetch = async () => {calls++; throw new TypeError("offline");};
  e.presentFactionChoices = () => choices++;
  await e.resolveFactionAction(action);
  e.discardPendingTurn();
  assert.deepEqual(recovery.snapshot(e), before); assert.equal(e.pendingTurnAttempt, null); assert.equal(calls, 1); assert.equal(choices, 1);
});

test("explicit local continuation reuses the original roll without an automatic second paid request", async t => {
  const {e} = fixture(t); let calls = 0;
  global.fetch = async () => {calls++; throw new TypeError("offline");};
  await e.resolveFactionAction(action);
  const dice = [...e.pendingTurnAttempt.dice];
  await e.retryPendingTurn(true);
  assert.equal(calls, 1); assert.equal(e.currentTurn, 4); assert.equal(e.extrapolationHistory.length, 1);
  assert.equal(e.extrapolationHistory[0].diceTotal, dice[0] + dice[1] + 2);
  assert.equal(e.apiHistory.length, 0); assert.equal(e.pendingTurnAttempt, null);
});

test("manual cancellation and source changes cannot commit old output; retry uses the newly selected route", async t => {
  const {e} = fixture(t); let firstSignal, requests = [];
  global.fetch = async (url, init) => {
    requests.push(url); firstSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
  };
  const running = e.resolveFactionAction(action);
  assert.equal(e.isAIGenerating, true);
  const next = {...e.apiConfig, endpoint: "https://new.fixture/v1"};
  e.readAISettingsConfig = () => next;
  e.saveAISettings();
  await running;
  assert.equal(firstSignal.aborted, true); assert.equal(e.apiHistory.length, 0); assert.equal(e.currentTurn, 3);
  assert.equal(e.pendingTurnAttempt.errorCode, "source_changed");
  global.fetch = async url => {requests.push(url); return completed();};
  await e.retryPendingTurn();
  assert.equal(requests.at(-1), "https://new.fixture/v1/chat/completions"); assert.equal(e.currentTurn, 4);
});

test("reloading an in-flight attempt restores baseline and recovery controls without a model call", async t => {
  const {e, store} = fixture(t); let release;
  global.fetch = () => new Promise(resolve => release = resolve);
  const running = e.resolveFactionAction(action);
  e.saveGameState();
  const pendingSave = recovery.parseSave(store.get("vn_save_state"));
  assert.equal(pendingSave.currentTurn, 3); assert.equal(pendingSave.apiHistory.length, 0);
  const replacement = Object.assign(Object.create(WebVisualNovelEngine.prototype), e, {isAIGenerating: false, activeAIRequestController: null});
  replacement.continueGame();
  assert.equal(replacement.currentTurn, 3); assert.equal(replacement.pendingTurnAttempt.status, "failed");
  assert.deepEqual(replacement.pendingTurnAttempt.dice, e.pendingTurnAttempt.dice);
  // Finish and discard the old page's request without pretending the replacement already delivered it.
  e.abandonTurnForNavigation(); release(completed()); await running;
  assert.equal(e.apiHistory.length, 0); assert.equal(replacement.apiHistory.length, 0);
});

test("quota failure is visible and retains the complete previous successful save and histories", t => {
  const {e, store} = fixture(t);
  assert.equal(e.saveGameState(), true); const good = store.get("vn_save_state");
  e.backlog.push({speaker: "旁白", text: "最新剧情"});
  global.localStorage.setItem = () => {throw new DOMException("Full", "QuotaExceededError");};
  assert.equal(e.saveGameState(), false); assert.equal(e.saveStatus.state, "error"); assert.match(e.saveStatus.message, /上次成功存档仍保留/);
  assert.equal(store.get("vn_save_state"), good); assert.equal(e.backlog.length, 2);
  assert.equal(JSON.parse(recovery.backup(e)).state.backlog.length, 2);
});

test("backup preview is inert, strips credential fields, and a failed restore cannot change the live world", t => {
  const {e, store} = fixture(t); e.saveGameState(); const good = store.get("vn_save_state"), before = recovery.snapshot(e);
  const exported = recovery.backup(e); assert.doesNotMatch(exported, /fixture-secret|apiConfig|apiKey/);
  const file = JSON.parse(exported); file.state.currentTurn = 42; file.state.apiConfig = {apiKey: "injected-secret"};
  file.state.inventory = [{name: "道具", power: 1, desc: "描述", aspects: [], apiKey: "injected-secret"}];
  const preview = e.previewGameBackup(JSON.stringify(file));
  assert.deepEqual(recovery.snapshot(e), before); assert.doesNotMatch(JSON.stringify(preview), /injected-secret|apiConfig|apiKey/);
  global.localStorage.setItem = () => {throw new DOMException("Full", "QuotaExceededError");};
  assert.equal(e.restoreGameBackup(preview.state), false); assert.deepEqual(recovery.snapshot(e), before); assert.equal(store.get("vn_save_state"), good);
});

test("restoring a reviewed backup preserves provider configuration and literal prose; unsupported formats are rejected", t => {
  const {e} = fixture(t), config = structuredClone(e.apiConfig);
  const data = JSON.parse(recovery.backup(e)); data.state.currentTurn = 12;
  const preview = e.previewGameBackup(JSON.stringify(data));
  assert.equal(e.restoreGameBackup(preview.state), true); assert.equal(e.currentTurn, 12); assert.deepEqual(e.apiConfig, config);
  data.state.storyQueue[0].text = '正文保留 <tag> 字面标记';
  assert.equal(e.previewGameBackup(JSON.stringify(data)).state.storyQueue[0].text, data.state.storyQueue[0].text);
  assert.throws(() => e.previewGameBackup('{"format":"provider-config","version":1}'), /invalid_backup/);
});

test("imported inventory and fate labels escape markup while preserving their literal contents", t => {
  const {e} = fixture(t), payload = '<img src=x onerror="window.__backupExecuted=true">';
  e.inventory = [{name: payload, desc: payload, power: 1, aspects: [payload]}];
  e.fateKnots = [{turn: 1, title: payload, desc: payload, vector: {...e.ideologyVector}, coords: e.currentCoords}];
  const preview = e.previewGameBackup(recovery.backup(e));
  assert.equal(e.restoreGameBackup(preview.state), true);
  e.pocketGrid = {}; e.ribbonKnotsList = {};
  e.renderPocket(); e.renderRibbon();
  for (const html of [e.pocketGrid.innerHTML, e.ribbonKnotsList.innerHTML]) {
    assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img src=x onerror=&quot;/);
  }
});

test("invalid backup structure is rejected before it can overwrite the saved or live world", t => {
  const {e, store} = fixture(t); e.saveGameState(); const good = store.get("vn_save_state");
  const initial = JSON.parse(recovery.backup(e));
  for (const mutate of [state => state.currentStep = -1, state => state.currentStep = 99,
    state => state.ideologyVector = [], state => state.ideologyVector.authority = "7",
    state => state.apiHistory = {}, state => state.inventory = [{}], state => state.fateKnots = [null]]) {
    const data = structuredClone(initial); mutate(data.state);
    assert.throws(() => e.previewGameBackup(JSON.stringify(data)), /invalid_backup/);
    assert.equal(store.get("vn_save_state"), good); assert.equal(e.currentTurn, 3);
  }
});

test("a presentation failure after valid delivery still saves the delivered turn and never offers a paid retry", async t => {
  const {e, store} = fixture(t); global.fetch = async () => completed();
  e.playNextInQueue = () => {throw new Error("fixture_render_failure");};
  await e.resolveFactionAction(action);
  const saved = recovery.parseSave(store.get("vn_save_state"));
  assert.equal(e.currentTurn, 4); assert.equal(e.apiHistory.length, 2); assert.equal(e.pendingTurnAttempt, null);
  assert.equal(saved.currentTurn, 4); assert.equal(saved.apiHistory.length, 2); assert.equal(saved.pendingTurnAttempt, undefined);
  assert.match(e.turnPresentationError, /无需重新请求 AI/); assert.equal(await e.retryPendingTurn(), undefined);
});

test("manual cancellation keeps the same failed action and does not automatically enter local play", async t => {
  const {e} = fixture(t); let calls = 0;
  global.fetch = async (_url, init) => {calls++; return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));};
  const running = e.resolveFactionAction(action);
  e.cancelAIRequest(); await running;
  assert.equal(e.currentTurn, 3); assert.equal(e.pendingTurnAttempt.errorCode, "request_cancelled"); assert.equal(calls, 1);
  assert.equal(e.apiHistory.length, 0); assert.equal(e.extrapolationHistory.length, 0);
});

test("persisted progress and backups omit telemetry reasoning without removing delivered history", t => {
  const {e} = fixture(t);
  e.cacheTelemetry.lastReasoning = "private-thought-fixture";
  e.apiHistory = [{role: "user", content: "行动"}, {role: "assistant", content: "已交付剧情"}];
  assert.doesNotMatch(recovery.backup(e), /private-thought-fixture/);
  assert.equal(recovery.savedState(e).apiHistory[1].content, "已交付剧情");
  assert.equal(e.cacheTelemetry.lastReasoning, "private-thought-fixture");
});

test("continuing an illustration page retains the image instead of replacing it with plain typewriter text", t => {
  const {e} = fixture(t);
  e.storyQueue = [{speaker: "旁白", text: "已保存画卷说明", illustrationData: {relativePath: "data/illustrations/ming/wealth.svg", title: "画卷"}}];
  e.currentStep = 1;
  e.displayDialogue = WebVisualNovelEngine.prototype.displayDialogue;
  e.speakerName = {}; e.speakerSub = {}; e.speakerBadge = {}; e.continuePrompt = {style: {}};
  e.typewriterText = {innerHTML: "", textContent: ""}; e.updateCharacterStage = () => {};
  e.fastForwardTypewriter = () => {throw new Error("An illustration must never be replaced with plain text");};
  e.saveGameState(); e.continueGame();
  assert.match(e.typewriterText.innerHTML, /<img src="data\/illustrations\/ming\/wealth.svg"/);
  assert.equal(e.saveStatus.state, "saved"); assert.equal(e.currentStep, 1);
});

test("grant_item supplies complete card fields and its result can render and round-trip through a backup", t => {
  const {e} = fixture(t);
  e.executeAITools = WebVisualNovelEngine.prototype.executeAITools;
  e.pocketGrid = {};
  e.executeAITools([{tool: "grant_item", params: {name: "粮册"}}]);
  assert.equal(e.inventory[0].power, 0); assert.deepEqual(e.inventory[0].aspects, []);
  assert.match(e.pocketGrid.innerHTML, /粮册/);
  assert.equal(e.previewGameBackup(recovery.backup(e)).state.inventory[0].name, "粮册");
  const old = JSON.parse(recovery.backup(e)); delete old.state.inventory[0].power; delete old.state.inventory[0].aspects;
  assert.deepEqual(e.previewGameBackup(JSON.stringify(old)).state.inventory[0].aspects, []);
});

test("the title screen cannot overwrite an existing save with its unstarted default world", t => {
  const {e, store} = fixture(t); e.saveGameState(); const good = store.get("vn_save_state");
  e.gameState = "TITLE"; e.currentTurn = 1; e.backlog = [];
  e.hasActiveProgress = false;
  assert.equal(e.saveGameState(), false); assert.equal(store.get("vn_save_state"), good);
});

test("returning to title after a quota failure can export and later save the latest in-memory progress", t => {
  const {e, store} = fixture(t);
  e.hasActiveProgress = true;
  e.saveGameState(); const good = store.get("vn_save_state");
  e.currentTurn = 4; e.backlog.push({speaker: "旁白", text: "还没写入浏览器的最新进度"});
  const write = global.localStorage.setItem;
  global.localStorage.setItem = () => {throw new DOMException("Full", "QuotaExceededError");};
  // returnToTitle saves before showing title; a failed save must not discard the live world.
  assert.equal(e.saveGameState(), false); e.gameState = "TITLE";
  global.document.createElement = () => ({click() {}});
  const previousTimer = global.setTimeout;
  t.after(() => global.setTimeout = previousTimer);
  global.setTimeout = callback => {callback(); return 0;};
  const backup = JSON.parse(e.exportGameProgress());
  assert.equal(backup.state.currentTurn, 4); assert.equal(backup.state.backlog.at(-1).text, "还没写入浏览器的最新进度");
  assert.equal(store.get("vn_save_state"), good);
  global.localStorage.setItem = write;
  assert.equal(e.saveGameState(), true);
  assert.equal(recovery.parseSave(store.get("vn_save_state")).currentTurn, 4);
});

test("a cold title screen exports the existing saved game instead of its fresh default state", t => {
  const {e} = fixture(t); e.saveGameState();
  e.gameState = "TITLE"; e.hasActiveProgress = false; e.currentTurn = 1; e.backlog = [];
  global.document.createElement = () => ({click() {}});
  const previousTimer = global.setTimeout;
  t.after(() => global.setTimeout = previousTimer);
  global.setTimeout = callback => {callback(); return 0;};
  const backup = JSON.parse(e.exportGameProgress());
  assert.equal(backup.state.currentTurn, 3); assert.equal(backup.state.backlog.length, 1);
});

test("rewind restores an independent choice snapshot while older knots clear later choices", t => {
  const {e} = fixture(t);
  e.drawerRibbon = {classList: {remove() {}}};
  e.pendingApiChoices = [{text: "查验旧粮册", tag: "查验", bias: {authority: 2}, diceBase: 11}];
  e.recordFateKnot("旧时刻", "已交付");
  e.pendingApiChoices[0].text = "未来战后册封功臣";
  assert.equal(e.fateKnots[0].choices[0].text, "查验旧粮册", "later actions cannot mutate the knot snapshot");
  e.rewindToKnot(0);
  assert.equal(e.pendingApiChoices[0].text, "查验旧粮册");
  assert.equal(e.pendingApiChoices[0].diceBase, 11);
  assert.equal(e.pendingApiChoices[0].bias.authority, 2);
  e.pendingApiChoices[0].text = "本轮临时变更";
  assert.equal(e.fateKnots[0].choices[0].text, "查验旧粮册");
  delete e.fateKnots[0].choices;
  e.pendingApiChoices = [{text: "未来战后册封功臣"}];
  e.rewindToKnot(0);
  assert.equal(e.pendingApiChoices, null, "legacy knots must not inherit later choices");
});

test("explicit scene navigation and canonical loading clear the previous scene's choices", async t => {
  const {e} = fixture(t);
  e.pendingApiChoices = [{text: "离开场景前的行动"}];
  e.abandonTurnForNavigation();
  assert.equal(e.pendingApiChoices, null);
  e.pendingApiChoices = [{text: "主线加载前的行动"}];
  await e.loadCanonicalNode("ming_act1", false);
  assert.equal(e.pendingApiChoices, null);
});
