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

function progressClock(t) {
  const original = {setInterval: global.setInterval, clearInterval: global.clearInterval, now: Date.now};
  let now = 10000, next = 0;
  const running = new Map(), callbacks = new Map(), cleared = [];
  global.setInterval = (callback, ms) => {
    assert.equal(ms, 1000, "Waiting progress must refresh without an automatic request deadline");
    const id = ++next; running.set(id, callback); callbacks.set(id, callback); return id;
  };
  global.clearInterval = id => {running.delete(id); cleared.push(id);};
  Date.now = () => now;
  t.after(() => {global.setInterval = original.setInterval; global.clearInterval = original.clearInterval; Date.now = original.now;});
  return {running, callbacks, cleared, advance(ms) {now += ms; for (const callback of running.values()) callback();}};
}

function waitingRequest(e, route = e.resolveAIProvider()) {
  return e.requestAICompletion(route.endpoint, {}, route.headers, route.useGateway, "story", async signal => {
    e.updateAIHarnessProgress({type: "model_start", modelCalls: 1, toolCalls: 0});
    return e.fetchAICompletion(route.endpoint, {}, route.headers, signal);
  }, route);
}

test("a delayed model response keeps its waiting clock live without issuing a second request", async t => {
  const e = engine(t), clock = progressClock(t); let release, requests = 0;
  global.fetch = () => {requests++; return new Promise(resolve => {release = resolve;});};
  const pending = waitingRequest(e);
  assert.equal(clock.running.size, 1); assert.equal(requests, 1);
  assert.equal(e.aiHarnessProgress.phase, "model_start");
  clock.advance(1000);
  const first = e.aiHarnessProgressDisplay.textContent;
  assert.match(first, /1\.0\s*秒/);
  clock.advance(2000);
  assert.match(e.aiHarnessProgressDisplay.textContent, /3\.0\s*秒/);
  assert.notEqual(e.aiHarnessProgressDisplay.textContent, first);
  assert.equal(e.aiHarnessProgress.modelCalls, 1); assert.equal(e.aiHarnessProgress.toolCalls, 0);
  assert.equal(requests, 1, "A progress heartbeat must never retry or probe the model");
  release(response(final())); await pending;
  assert.equal(clock.running.size, 0); assert.equal(clock.cleared.length, 1);
  assert.equal(e.aiHarnessProgressDisplay.hidden, true); assert.equal(e.btnCancelAIRequest.hidden, true);
  assert.equal(e.activeAIRequestController, null);
});

test("an authentication failure clears waiting state and preserves the selected provider without retrying", async t => {
  const e = engine(t), clock = progressClock(t), config = structuredClone(e.apiConfig); let requests = 0;
  global.fetch = async () => {requests++; return {ok: false, status: 401, json: async () => ({error: "invalid_api_key"})};};
  await assert.rejects(waitingRequest(e), {code: "upstream_auth_failed"});
  assert.equal(requests, 1); assert.deepEqual(e.apiConfig, config);
  assert.equal(e.aiRequestStatus.state, "fallback"); assert.equal(e.aiRequestStatus.channel, "custom");
  assert.match(e.aiRequestStatus.message, /认证|密钥|Key|鉴权/);
  assert.equal(e.activeAIRequestController, null); assert.equal(clock.running.size, 0);
  assert.equal(e.aiHarnessProgressDisplay.hidden, true); assert.equal(e.btnCancelAIRequest.hidden, true);
});

for (const interruption of ["cancel", "source change"]) {
  test(`${interruption} clears its clock and a queued old heartbeat cannot overwrite a later request`, async t => {
    const e = engine(t), clock = progressClock(t); let requests = 0;
    global.fetch = (_url, init) => {
      requests++;
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
    };
    const first = waitingRequest(e), oldHeartbeat = [...clock.callbacks.values()][0];
    assert.equal(typeof oldHeartbeat, "function");
    if (interruption === "cancel") e.cancelAIRequest();
    else {e.settingEndpoint.value = "https://custom-b.fixture/v1/chat/completions"; e.saveAISettings();}
    await assert.rejects(first, {code: interruption === "cancel" ? "request_cancelled" : "source_changed"});
    assert.equal(clock.running.size, 0); assert.equal(e.activeAIRequestController, null);
    const second = waitingRequest(e);
    e.aiHarnessProgressDisplay.textContent = "Later request owns this display";
    oldHeartbeat();
    assert.equal(e.aiHarnessProgressDisplay.textContent, "Later request owns this display");
    clock.advance(1000);
    assert.match(e.aiHarnessProgressDisplay.textContent, /1\.0\s*秒/);
    assert.equal(requests, 2, "Only the two explicit requests may reach the provider");
    e.cancelAIRequest(); await assert.rejects(second, {code: "request_cancelled"});
    assert.equal(clock.running.size, 0); assert.equal(e.aiHarnessProgressDisplay.hidden, true);
  });
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
