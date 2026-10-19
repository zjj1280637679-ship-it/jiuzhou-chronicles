// App/provider integration fixtures. Model HTTP is mocked; native tools run in real workers.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {WebVisualNovelEngine} = require("./app.js");
const providers = require("./harness/providers.js");
const protocol = require("./harness/protocol.js");
const {createGameHarness} = require("./harness/runtime.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");
const baseURL = pathToFileURL(path.join(__dirname, "harness", path.sep)).href;
function element(value = "") {
  const classes = new Set();
  return {value, checked: false, disabled: false, textContent: "", innerText: "", hidden: true, style: {}, classList: {
    add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)
  }};
}
function engine(t, config = {}) {
  const original = {fetch: global.fetch, window: global.window, WORLD_PRESETS: global.WORLD_PRESETS, localStorage: global.localStorage};
  t.after(() => Object.assign(global, original));
  global.WORLD_PRESETS = require("./skills-data.js");
  global.localStorage = {setItem() {}};
  global.window = {fetch() {}, JIUZHOU_AI_GATEWAY: {endpoint: "https://shared.fixture"}, JiuzhouProviders: providers, JiuzhouHarnessProtocol: protocol,
    JiuzhouHarness: {createGameHarness: options => createGameHarness({...options, baseURL, workerFactory: createNodeWorkerFactory()})}};
  const e = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    apiConfig: providers.normalizeConfig({enabled: true, source: "custom", endpoint: "https://custom-a.fixture/v1/chat/completions",
      model: "generic-model", apiKey: "", maxTokens: 32768, ...config}),
    serverSharedConfig: null, sharedGatewayStatus: {state: "idle", message: "尚未检查"}, apiHistory: [], expectedLength: 500,
    currentFaction: "ming", branchDepth: 1, aiConfigRevision: 0,
    ideologyVector: {authority: 0, pragmatism: 0, progress: 0, cognition: 0},
    cacheTelemetry: {lastHitTokens: null, lastMissTokens: null, lastHitRate: "未提供", cacheUsageKnown: false},
    qmCache: element(), aiConnectionStatus: element(), cacheStatusTag: element(), aiHarnessProgressDisplay: element(),
    aiGenerationMetricsDisplay: element(), btnCancelAIRequest: element(), btnRetrySharedAi: element(), executeAITools() {},
    settingApiSource: element(), settingApiAdapter: element(), settingTokenParameter: element(), settingModel: element(),
    settingCustomModel: element(), settingApiKey: element(), settingEndpoint: element(), settingMaxTokens: element(), settingEnableApi: element(),
    aiConnectionTestStatus: element(), aiConnectionTestFormVersion: 0
  });
  form(e, e.apiConfig);
  return e;
}
function form(e, config) {
  for (const [field, key] of [["settingApiSource", "source"], ["settingApiAdapter", "adapter"], ["settingTokenParameter", "tokenParameter"],
    ["settingModel", "model"], ["settingCustomModel", "customModel"], ["settingApiKey", "apiKey"], ["settingEndpoint", "endpoint"], ["settingMaxTokens", "maxTokens"]]) {
    e[field].value = config[key] ?? "";
  }
  e.settingEnableApi.checked = config.enabled;
}
const story = {beats: [{speaker: "旁白", text: "文".repeat(500)}], choices: [{text: "救人"}, {text: "查账"}, {text: "守城"}]};
const final = () => ({model: "generic-returned-model", choices: [{finish_reason: "stop", message: {role: "assistant", content: JSON.stringify(story)}}], usage: {prompt_tokens: 123, completion_tokens: 50}});
const response = data => ({ok: true, status: 200, json: async () => data});
const turn = e => e.callDeepSeekLiveAPI({text: "先救人，再查账", diceBase: 7}, 3, 4, 9, true);
function toolCall() {
  return {model: "generic-returned-model", choices: [{finish_reason: "tool_calls", message: {role: "assistant", content: null,
    tool_calls: [{id: "generic_world_call", type: "function", function: {name: "read_world", arguments: "{}"}}]}}], usage: {prompt_tokens: 100, completion_tokens: 5}};
}

test("a Keyless custom provider has a live route and does not access an unselected shared configuration", async t => {
  const e = engine(t);
  Object.defineProperty(window, "JIUZHOU_AI_GATEWAY", {get() {throw new Error("Unselected shared provider must not be read");}});
  assert.equal(e.hasLiveAIRoute(), true);
  global.fetch = async (url, init) => {
    assert.equal(url, e.apiConfig.endpoint); assert.equal(init.headers.Authorization, undefined);
    const body = JSON.parse(init.body);
    assert.equal(body.mode, undefined); assert.equal(body.thinking, undefined); assert.equal(body.reasoning_effort, undefined);
    return response({choices: [{finish_reason: "stop", message: {content: JSON.stringify({reconciledBeats: [{text: "自定义来源续接成功"}]})}}]});
  };
  const result = await e.callDeepSeekSutureAPI({title: "守城", desc: "", originalBeats: [{text: "原文"}]}, []);
  assert.equal(result.reconciledBeats[0].text, "自定义来源续接成功");
});

test("explicit shared selection ignores a saved personal Key and an invalid unselected custom endpoint", async t => {
  const e = engine(t, {source: "shared", apiKey: "fixture-personal-key", endpoint: "broken-unselected-endpoint", model: "personal-model"});
  assert.equal(e.hasLiveAIRoute(), true); let requests = 0;
  global.fetch = async (url, init) => {
    requests++; assert.equal(url, "https://shared.fixture/api/jiuzhou/turn"); assert.equal(init.headers.Authorization, undefined);
    const body = JSON.parse(init.body); assert.equal(body.mode, "suture"); assert.equal(body.model, undefined);
    assert.doesNotMatch(init.body, /fixture-personal-key|personal-model/);
    return response({model: "shared-returned-model", choices: [{finish_reason: "stop", message: {content: JSON.stringify({reconciledBeats: [{text: "共享来源续接成功"}]})}}]});
  };
  await e.callDeepSeekSutureAPI({title: "守城", desc: "", originalBeats: [{text: "原文"}]}, []);
  assert.equal(requests, 1); assert.equal(e.aiRequestStatus.channel, "shared");
});

test("shared health success and failure do not change the selected custom provider or offline preference", async t => {
  const e = engine(t, {enabled: false}); const before = structuredClone(e.apiConfig);
  global.fetch = async () => response({jiuzhouReady: true, model: "shared-model"});
  await e.checkServerSharedApi();
  assert.deepEqual(e.apiConfig, before); assert.equal(e.settingEnableApi.checked, false);
  assert.equal(e.serverSharedConfig.hasServerKey, true);
  global.fetch = async () => {throw new TypeError("shared unavailable");};
  await e.checkServerSharedApi();
  assert.deepEqual(e.apiConfig, before); assert.equal(e.apiConfig.source, "custom");
});

test("a late older health failure cannot overwrite a newer successful shared check", async t => {
  const e = engine(t); const requests = [];
  global.fetch = () => new Promise(resolve => requests.push(resolve));
  const old = e.checkServerSharedApi(), latest = e.checkServerSharedApi();
  assert.equal(requests.length, 2);
  requests[1](response({jiuzhouReady: true, model: "newest-shared-model"})); await latest;
  requests[0](response({jiuzhouReady: false})); await old;
  assert.equal(e.sharedGatewayStatus.state, "ready"); assert.equal(e.serverSharedConfig.model, "newest-shared-model");
  assert.equal(e.apiConfig.source, "custom");
});

test("a generic Keyless custom provider runs the same native-tool harness and reports missing cache telemetry honestly", async t => {
  const e = engine(t); e.serverSharedConfig = {hasServerKey: true}; let requests = 0; const signals = [];
  global.fetch = async (url, init) => {
    requests++; signals.push(init.signal); assert.equal(url, e.apiConfig.endpoint);
    assert.equal(init.headers.Authorization, undefined);
    const body = JSON.parse(init.body);
    assert.equal(body.mode, undefined); assert.equal(body.enabledTools, undefined); assert.equal(body.expectedLength, undefined);
    assert.equal(body.thinking, undefined); assert.equal(body.reasoning_effort, undefined);
    assert.deepEqual(body.tools, protocol.tools);
    if (requests === 1) return response(toolCall());
    assert.equal(body.messages.at(-1).role, "tool"); assert.equal(body.messages.at(-1).tool_call_id, "generic_world_call");
    return response(final());
  };
  await turn(e);
  assert.equal(requests, 2); assert.equal(signals[0], signals[1]); assert.equal(e.apiHistory.length, 2);
  assert.equal(e.aiGenerationMetrics.textCharacters, 500); assert.equal(e.aiGenerationMetrics.harness.modelCalls, 2);
  assert.equal(e.cacheTelemetry.cacheUsageKnown, false); assert.equal(e.cacheTelemetry.lastHitTokens, null);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /未提供|未知/);
  assert.doesNotMatch(e.aiGenerationMetricsDisplay.textContent, /命中 0 Token|命中率 0\.0%/);
});

test("single-request cache metrics also require a denominator and may derive misses from a valid prompt total", t => {
  const e = engine(t), route = e.resolveAIProvider();
  e.recordAIProviderCache({usage: {prompt_tokens_details: {cached_tokens: 20}}}, route);
  assert.equal(e.cacheTelemetry.cacheUsageKnown, false); assert.equal(e.cacheTelemetry.lastHitTokens, null);
  assert.equal(e.cacheTelemetry.lastMissTokens, null); assert.equal(e.cacheTelemetry.lastHitRate, "未提供");
  e.recordAIProviderCache({usage: {prompt_tokens: 100, prompt_cache_hit_tokens: 20, prompt_cache_miss_tokens: -1}}, route);
  assert.equal(e.cacheTelemetry.cacheUsageKnown, true); assert.equal(e.cacheTelemetry.lastHitTokens, 20);
  assert.equal(e.cacheTelemetry.lastMissTokens, 80); assert.equal(e.cacheTelemetry.lastHitRate, "20.0%");
});

test("saving a new custom endpoint clears only provider results and keeps narrative history", t => {
  const e = engine(t); e.apiHistory = [{role: "user", content: "既往行动"}, {role: "assistant", content: JSON.stringify(story)}];
  const history = structuredClone(e.apiHistory);
  e.aiRequestStatus = {state: "success", channel: "custom"}; e.aiGenerationMetrics = {textCharacters: 500};
  e.cacheTelemetry = {lastHitTokens: 1234, lastMissTokens: 0, lastHitRate: "100.0%", cacheUsageKnown: true};
  e.settingEndpoint.value = "https://custom-b.fixture/v1/chat/completions";
  e.saveAISettings();
  assert.equal(e.apiConfig.endpoint, "https://custom-b.fixture/v1/chat/completions"); assert.equal(e.aiConfigRevision, 1);
  assert.equal(e.aiRequestStatus, null); assert.equal(e.aiGenerationMetrics, null); assert.equal(e.qmCache.classList.contains("hit"), false);
  assert.deepEqual(e.apiHistory, history);
});

test("a new custom endpoint cannot inherit a different endpoint's successful cache badge or displayed metrics", async t => {
  const e = engine(t);
  global.fetch = async () => response({...final(), usage: {prompt_tokens: 100, prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 0, completion_tokens: 50}});
  await turn(e);
  assert.equal(e.qmCache.classList.contains("hit"), true);
  e.apiConfig.endpoint = "https://custom-b.fixture/v1/chat/completions";
  e.updateCachePillUI();
  assert.equal(e.qmCache.classList.contains("hit"), false);
  assert.match(e.aiConnectionStatus.textContent, /当前来源尚未进行真实 AI 生成/);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /尚无有效/);
});

test("changing sources aborts an in-flight route and rejects its late completion before writing history", async t => {
  const e = engine(t); let release, started;
  const firstStarted = new Promise(resolve => {started = resolve;});
  global.fetch = (_url, _init) => {started(); return new Promise(resolve => {release = resolve;});};
  const pending = turn(e);
  await firstStarted;
  e.settingEndpoint.value = "https://custom-b.fixture/v1/chat/completions";
  e.saveAISettings();
  release(response(final()));
  await assert.rejects(pending, error => (error.code || error.message) === "source_changed");
  assert.equal(e.apiHistory.length, 0); assert.equal(e.aiGenerationMetrics, null);
  assert.equal(e.qmCache.classList.contains("hit"), false);
  global.fetch = async (url, init) => {assert.equal(url, e.apiConfig.endpoint); assert.equal(init.signal.aborted, false); return response(final());};
  await turn(e);
  assert.equal(e.apiHistory.length, 2); assert.equal(e.aiRequestStatus.state, "success");
});
