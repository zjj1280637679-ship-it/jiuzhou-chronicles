// Local regression tests only; no network, credentials or model charges.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const {WebVisualNovelEngine} = require("./app.js");
global.WORLD_PRESETS = require("./skills-data.js");

function element() {
  const classes = new Set();
  return {textContent: "", innerText: "", classList: {
    add: value => classes.add(value), remove: value => classes.delete(value),
    contains: value => classes.has(value)
  }};
}

function engine() {
  global.window = {fetch() {}, JIUZHOU_AI_GATEWAY: {endpoint: "https://gateway.example.com"}};
  return Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    apiConfig: {enabled: false, source: "shared", apiKey: "", model: "deepseek-flash", endpoint: "https://private.example.com/chat/completions"},
    serverSharedConfig: null, sharedGatewayStatus: {state: "idle", message: "尚未检查"}, aiRequestStatus: null,
    cacheTelemetry: {lastHitTokens: 0, lastMissTokens: 0, lastHitRate: "0.0%"},
    currentFaction: "ming", qmCache: element(), aiConnectionStatus: element(),
    btnRetrySharedAi: element(), settingEnableApi: element(), cacheStatusTag: element()
  });
}

test("health failure is visible; a retry can become ready without claiming a model generation", async () => {
  const e = engine();
  e.apiConfig.enabled = true;
  e.settingEnableApi.checked = true;
  global.fetch = async () => {throw new TypeError("Failed to fetch");};
  await e.checkServerSharedApi();
  assert.equal(e.sharedGatewayStatus.state, "unavailable");
  assert.match(e.aiConnectionStatus.textContent, /共享 AI 无法连接/);
  assert.equal(e.btnRetrySharedAi.disabled, false);
  global.fetch = async () => ({ok: true, json: async () => ({configured: false, enabled: false, jiuzhouEnabled: false, limiters: {ai: false, gm: false}, jiuzhouReady: true})});
  await e.checkServerSharedApi();
  assert.equal(e.sharedGatewayStatus.state, "ready");
  assert.equal(e.apiConfig.enabled, true);
  assert.equal(e.settingEnableApi.checked, true);
  assert.match(e.qmCache.innerText, /待生成/);
  assert.match(e.aiConnectionStatus.textContent, /尚未进行真实 AI 生成/);
  assert.equal(e.qmCache.classList.contains("hit"), false);
  global.fetch = async () => ({ok: true, json: async () => ({jiuzhouReady: false})});
  await e.checkServerSharedApi();
  assert.equal(e.serverSharedConfig, null);
  assert.match(e.aiConnectionStatus.textContent, /共享 AI 密钥尚未配置/);
});

test("remote or offline is a visitor preference, independent of former owner flags", async () => {
  const e = engine();
  e.apiConfig.userDisabledShared = true;
  global.fetch = async () => ({ok: true, json: async () => ({enabled: false, jiuzhouEnabled: false, jiuzhouReady: true})});
  await e.checkServerSharedApi();
  assert.equal(e.serverSharedConfig.hasServerKey, true);
  assert.equal(e.apiConfig.enabled, false);
  assert.match(e.aiConnectionStatus.textContent, /你已选择本地剧情/);
});

test("operator HTTPS gateway origins include custom and same-site domains but exclude ambiguous URLs", () => {
  const e = engine();
  for (const value of ["https://gateway.example.com", "https://game.example.com/", "https://example.account.workers.dev/"]) {
    window.JIUZHOU_AI_GATEWAY.endpoint = value;
    assert.equal(e.getSharedGatewayEndpoint(), new URL(value).origin + "/api/jiuzhou/turn");
  }
  for (const value of ["http://gateway.example.com", "https://user:pass@gateway.example.com", "https://gateway.example.com/api", "https://gateway.example.com//", "https://gateway.example.com?", "https://gateway.example.com?token=secret", "https://gateway.example.com#", "https://gateway.example.com/#fragment", "https:\\gateway.example.com", "/api"]) {
    window.JIUZHOU_AI_GATEWAY.endpoint = value;
    assert.throws(() => e.getSharedGatewayEndpoint(), /gateway_config_invalid/);
  }
});

test("suture sends a bounded recent causal summary and accepts a valid response", async () => {
  const e = engine();
  e.apiConfig.enabled = true;
  e.apiConfig.maxTokens = 20000;
  e.serverSharedConfig = {hasServerKey: true};
  let request;
  global.fetch = async (url, options) => {
    request = {url, body: JSON.parse(options.body)};
    assert.ok(options.signal instanceof AbortSignal && !options.signal.aborted);
    return {ok: true, json: async () => ({model: "fixture-model", choices: [{message: {content: JSON.stringify({
      reconciledBeats: [{speaker: "旁白", type: "narrator", text: "军饷已运至九门。"}], sutureNote: "承接筹饷行动"
    })}}]})};
  };
  const history = Array.from({length: 12}, (_, i) => ({turn: i + 1, choiceText: `${i === 11 ? "最后筹饷行动" : "早前行动"}${"史".repeat(500)}`, diceTotal: 9, success: true}));
  const result = await e.callDeepSeekSutureAPI({title: "九门守城", desc: "守备", originalBeats: [{text: "原剧情"}]}, history);
  assert.equal(request.url, "https://gateway.example.com/api/jiuzhou/turn");
  assert.equal(request.body.mode, "suture");
  assert.equal(request.body.turnstileToken, undefined);
  assert.equal(request.body.max_tokens, 20000);
  assert.equal(request.body.messages.length, 3);
  assert.equal(request.body.messages[2].role, "user");
  assert.match(request.body.messages[2].content, /最后筹饷行动/);
  assert.doesNotMatch(request.body.messages[2].content, /第1轮：/);
  assert.ok(request.body.messages[2].content.length <= 1200);
  assert.equal(result.reconciledBeats[0].text, "军饷已运至九门。");
  assert.equal(e.aiRequestStatus.state, "success");
  assert.match(e.aiConnectionStatus.textContent, /fixture-model/);
});

test("a failed model request shows fallback rather than stale successful cache status", async () => {
  const e = engine();
  e.apiConfig.enabled = true;
  e.serverSharedConfig = {hasServerKey: true};
  e.setAIRequestStatus("success", "story", null, "previous-model");
  global.fetch = async () => ({ok: false, status: 503, json: async () => ({error: "upstream_unavailable"})});
  await assert.rejects(() => e.requestAICompletion(e.getSharedGatewayEndpoint(), {}, {}, true, "story"));
  assert.equal(e.aiRequestStatus.state, "fallback");
  assert.match(e.aiConnectionStatus.textContent, /本轮剧情尚未交付：AI 服务暂时不可用/);
  assert.match(e.qmCache.innerText, /本轮尚未交付/);
  assert.equal(e.qmCache.classList.contains("hit"), false);
  assert.doesNotMatch(e.cacheStatusTag.innerText, /命中率/);
});

test("arbitrary story JSON and empty beats cannot report success or enter AI history", async () => {
  const e = engine();
  e.apiConfig.enabled = true;
  e.serverSharedConfig = {hasServerKey: true};
  e.apiHistory = [];
  e.buildDeepSeekCachePayload = () => ({messages: [
    {role: "system", content: "规则"}, {role: "system", content: "背景"}, {role: "user", content: "筹饷"}
  ], ephemeralTail: "筹饷"});
  for (const invalid of [{unexpected: "invalid game fixture"}, {choices: [{text: "只有选项"}]}, {beats: []}, {beats: [{text: "   "}]}, ["非剧情对象"]]) {
    global.fetch = async () => ({ok: true, json: async () => ({choices: [{message: {content: JSON.stringify(invalid)}}]})});
    await assert.rejects(() => e.callDeepSeekLiveAPI({text: "筹饷"}, 3, 4, 9, true), /invalid_game_response/);
    assert.equal(e.apiHistory.length, 0);
    assert.notEqual(e.aiRequestStatus.state, "success");
    assert.equal(e.qmCache.classList.contains("hit"), false);
  }
});

test("an existing private Key continues to use the private endpoint", async () => {
  const e = engine();
  e.apiConfig.enabled = true;
  e.apiConfig.source = "custom";
  e.apiConfig.apiKey = "fixture-private-placeholder";
  e.serverSharedConfig = {hasServerKey: true};
  global.fetch = async (url, options) => {
    assert.equal(url, e.apiConfig.endpoint);
    assert.equal(options.headers.Authorization, "Bearer fixture-private-placeholder");
    assert.equal(JSON.parse(options.body).turnstileToken, undefined);
    return {ok: true, json: async () => ({choices: [{message: {content: JSON.stringify({reconciledBeats: [{text: "私人测试剧情"}]})}}]})};
  };
  await e.callDeepSeekSutureAPI({title: "守城", desc: "", originalBeats: [{text: "原剧情"}]}, []);
  assert.equal(e.aiRequestStatus.channel, "custom");
  assert.match(e.aiConnectionStatus.textContent, /当前使用自定义 API/);
});

test("shared story generation directly forwards large requested output with no challenge or generation timer", async () => {
  const e = engine();
  e.apiConfig.enabled = true;
  e.apiConfig.maxTokens = 32768;
  e.serverSharedConfig = {hasServerKey: true};
  e.apiHistory = [];
  e.expectedLength = 5000;
  e.buildDeepSeekCachePayload = () => ({messages: [
    {role: "system", content: "规则"}, {role: "system", content: "背景"}, {role: "user", content: "筹饷"}
  ], ephemeralTail: "筹饷"});
  Object.defineProperty(window, "turnstile", {get() {throw Error("A challenge must never be accessed");}});
  let requests = 0;
  global.fetch = async (url, options) => {
    requests++;
    assert.equal(url, "https://gateway.example.com/api/jiuzhou/turn");
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 32768);
    assert.equal(body.mode, "story");
    assert.equal(body.turnstileToken, undefined);
    assert.ok(options.signal instanceof AbortSignal && !options.signal.aborted);
    return {ok: true, json: async () => ({choices: [{message: {content: JSON.stringify({
      beats: [{text: "军饷已由商帮送入京城。"}], choices: [{text: "前往九门"}, {text: "核对账册"}, {text: "召集商帮"}]
    })}}]})};
  };
  const result = await e.callDeepSeekLiveAPI({text: "筹饷"}, 3, 4, 9, true);
  assert.equal(requests, 1);
  assert.equal(result.beats[0].text, "军饷已由商帮送入京城。");
  assert.equal(e.aiRequestStatus.state, "success");
});
