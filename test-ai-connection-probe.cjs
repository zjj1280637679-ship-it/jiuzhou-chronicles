// Regression tests only: fetch is mocked; no real Key, network call or model charge.
const assert = require("node:assert/strict");
const {test, afterEach} = require("node:test");
const {WebVisualNovelEngine} = require("./app.js");

const originalFetch = global.fetch;
const originalWindow = global.window;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

afterEach(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
});

function engine() {
  global.window = {JIUZHOU_AI_GATEWAY: {endpoint: "https://gateway.example.com"}};
  return Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    apiConfig: {
      enabled: false, apiKey: "saved-private-fixture", endpoint: "https://saved.example.com/chat/completions",
      model: "saved-model", customModel: "", maxTokens: 32768, userDisabledShared: true
    },
    serverSharedConfig: null,
    settingApiKey: {value: ""},
    settingEndpoint: {value: "https://unsaved.example.com/chat/completions"},
    settingModel: {value: "deepseek-flash"},
    settingCustomModel: {value: ""},
    settingEnableApi: {checked: false},
    settingMaxTokens: {value: "393216"},
    btnTestAiConnection: {disabled: false, textContent: "测试请求", innerText: "测试请求"},
    aiConnectionTestStatus: {textContent: ""},
    aiConnectionTestRunning: false,
    aiConnectionTestFormVersion: 0,
    isAIGenerating: false,
    apiHistory: [{role: "assistant", content: "existing-story-must-not-be-sent"}],
    aiRequestStatus: {state: "success", mode: "story", model: "previous-story-model"},
    cacheTelemetry: {lastHitTokens: 123, lastMissTokens: 45, lastHitRate: "73.2%", totalHits: 9},
    storyQueue: [{text: "existing-story-must-not-change"}],
    pendingApiChoices: [{text: "existing-choice"}]
  });
}

function gameState(e) {
  return structuredClone({
    apiConfig: e.apiConfig, apiHistory: e.apiHistory, aiRequestStatus: e.aiRequestStatus,
    cacheTelemetry: e.cacheTelemetry, storyQueue: e.storyQueue, pendingApiChoices: e.pendingApiChoices
  });
}

function successResponse(model = "fixture-returned-model") {
  return {ok: true, status: 200, json: async () => ({
    model, choices: [{message: {content: JSON.stringify({
      reconciledBeats: [{text: "连接测试成功。"}]
    })}}], usage: {prompt_cache_hit_tokens: 9999, prompt_cache_miss_tokens: 1}
  })};
}

function assertRestored(e) {
  assert.equal(e.aiConnectionTestRunning, false);
  assert.equal(e.btnTestAiConnection.disabled, false);
  assert.equal(e.btnTestAiConnection.textContent, "测试请求");
}

test("probe uses the unsaved private Key, endpoint and custom model without saving or changing game state", async () => {
  const e = engine();
  e.settingApiKey.value = "  unsaved-private-fixture  ";
  e.settingEndpoint.value = "  https://unsaved.example.com/chat/completions  ";
  e.settingModel.value = "custom";
  e.settingCustomModel.value = "  fixture-custom-model  ";
  e.serverSharedConfig = {hasServerKey: true};
  const before = gameState(e);
  let requests = 0;
  global.fetch = async (url, options) => {
    requests++;
    assert.equal(url, "https://unsaved.example.com/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer unsaved-private-fixture");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "fixture-custom-model");
    assert.equal(body.max_tokens, 256);
    assert.equal(body.messages.length, 3);
    assert.deepEqual(body.messages.map(m => m.role), ["system", "system", "user"]);
    assert.ok(options.signal instanceof AbortSignal);
    assert.doesNotMatch(options.body, /existing-story|saved-private-fixture/);
    return successResponse();
  };
  await e.testAIConnection();
  assert.equal(requests, 1);
  assert.match(e.aiConnectionTestStatus.textContent, /测试成功/);
  assert.match(e.aiConnectionTestStatus.textContent, /私有/);
  assert.match(e.aiConnectionTestStatus.textContent, /fixture-returned-model/);
  assert.match(e.aiConnectionTestStatus.textContent, /耗时|\d+(?:\.\d+)?\s*秒/);
  assert.doesNotMatch(e.aiConnectionTestStatus.textContent, /private-fixture/);
  assert.deepEqual(gameState(e), before);
  assertRestored(e);
});

test("empty current Key probes shared AI despite a saved private Key, offline preference and unavailable health", async () => {
  const e = engine();
  e.settingApiKey.value = "   ";
  e.settingEndpoint.value = "invalid private endpoint must be ignored";
  e.settingModel.value = "custom";
  e.settingCustomModel.value = "ignored-private-model";
  const before = gameState(e);
  let requests = 0;
  global.fetch = async (url, options) => {
    requests++;
    assert.equal(url, "https://gateway.example.com/api/jiuzhou/turn");
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.mode, "suture");
    assert.equal(body.max_tokens, 256);
    assert.deepEqual(body.messages.map(m => m.role), ["system", "system", "user"]);
    assert.equal(body.model, undefined);
    assert.equal(body.turnstileToken, undefined);
    assert.equal(body.inviteCode, undefined);
    return successResponse("fixture-shared-model");
  };
  await e.testAIConnection();
  assert.equal(requests, 1, "health is not a prerequisite or a substitute for a real request");
  assert.match(e.aiConnectionTestStatus.textContent, /测试成功/);
  assert.match(e.aiConnectionTestStatus.textContent, /共享/);
  assert.match(e.aiConnectionTestStatus.textContent, /fixture-shared-model/);
  assert.deepEqual(gameState(e), before);
  assertRestored(e);
});

test("a private probe does not require a valid shared gateway setting", async () => {
  const e = engine();
  window.JIUZHOU_AI_GATEWAY.endpoint = "broken shared setting";
  e.settingApiKey.value = "unsaved-private-fixture";
  global.fetch = async url => {
    assert.equal(url, "https://unsaved.example.com/chat/completions");
    return successResponse();
  };
  await e.testAIConnection();
  assert.match(e.aiConnectionTestStatus.textContent, /测试成功.*私有/);
  assertRestored(e);
});

test("double clicking while a probe is pending sends only one request and restores the button", async () => {
  const e = engine();
  let release;
  let requests = 0;
  global.fetch = () => {
    requests++;
    return new Promise(resolve => {release = resolve;});
  };
  const first = e.testAIConnection();
  assert.equal(e.aiConnectionTestRunning, true);
  assert.equal(e.btnTestAiConnection.disabled, true);
  await e.testAIConnection();
  assert.equal(requests, 1);
  release(successResponse());
  await first;
  assertRestored(e);
});

test("a running story generation prevents a simultaneous probe", async () => {
  const e = engine();
  e.isAIGenerating = true;
  const before = gameState(e);
  let requests = 0;
  global.fetch = async () => {requests++; return successResponse();};
  await e.testAIConnection();
  assert.equal(requests, 0);
  assert.deepEqual(gameState(e), before);
  assertRestored(e);
});

test("authentication and rate errors remain failures, do not leak provider detail and leave game status intact", async () => {
  for (const [status, code, expected] of [
    [401, "invalid_api_key", /认证|密钥|Key|401/i],
    [429, "rate_limit_exceeded", /繁忙|频率|限流|429/]
  ]) {
    const e = engine();
    e.settingApiKey.value = "unsaved-private-fixture";
    const before = gameState(e);
    global.fetch = async () => ({ok: false, status, json: async () => ({
      error: {code, message: "sensitive-provider-body unsaved-private-fixture"}
    })});
    await e.testAIConnection();
    assert.match(e.aiConnectionTestStatus.textContent, /测试失败/);
    assert.match(e.aiConnectionTestStatus.textContent, expected);
    assert.doesNotMatch(e.aiConnectionTestStatus.textContent, /sensitive-provider-body|private-fixture/);
    assert.deepEqual(gameState(e), before);
    assertRestored(e);
  }
});

test("a JSON null error body still reports the HTTP authentication failure", async () => {
  const e = engine();
  global.fetch = async () => ({ok: false, status: 401, json: async () => null});
  await e.testAIConnection();
  assert.match(e.aiConnectionTestStatus.textContent, /测试失败/);
  assert.match(e.aiConnectionTestStatus.textContent, /认证|密钥|401/);
  assertRestored(e);
});

test("HTTP 200 is insufficient: missing, non-JSON or empty model dialogue is rejected", async () => {
  for (const data of [
    null,
    {},
    {choices: [{message: {content: "not JSON"}}]},
    {choices: [{message: {content: JSON.stringify({unexpected: "arbitrary JSON"})}}]},
    {choices: [{message: {content: JSON.stringify({reconciledBeats: []})}}]},
    {choices: [{message: {content: JSON.stringify({reconciledBeats: [{text: "   "}]})}}]}
  ]) {
    const e = engine();
    const before = gameState(e);
    global.fetch = async () => ({ok: true, status: 200, json: async () => data});
    await e.testAIConnection();
    assert.match(e.aiConnectionTestStatus.textContent, /测试失败/);
    assert.doesNotMatch(e.aiConnectionTestStatus.textContent, /测试成功/);
    assert.deepEqual(gameState(e), before);
    assertRestored(e);
  }
});

test("reasoning output without final answer content cannot be mistaken for a successful Key test", async () => {
  const e = engine();
  e.settingApiKey.value = "unsaved-private-fixture";
  e.settingModel.value = "deepseek-reasoner";
  const before = gameState(e);
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deepseek-reasoner");
    assert.equal(body.response_format, undefined);
    return {ok: true, status: 200, json: async () => ({
      model: "deepseek-reasoner", choices: [{finish_reason: "length", message: {
        content: "", reasoning_content: "A reasoning-only response is not a valid final test answer."
      }}]
    })};
  };
  await e.testAIConnection();
  assert.match(e.aiConnectionTestStatus.textContent, /测试失败/);
  assert.doesNotMatch(e.aiConnectionTestStatus.textContent, /测试成功/);
  assert.deepEqual(gameState(e), before);
  assertRestored(e);
});

test("changing the form during a pending probe cannot label the new configuration as tested", async () => {
  const e = engine();
  let release;
  global.fetch = () => new Promise(resolve => {release = resolve;});
  const pending = e.testAIConnection();
  e.settingApiKey.value = "new-unverified-private-fixture";
  e.invalidateAIConnectionTest();
  assert.equal(e.aiConnectionTestFormVersion, 1);
  release(successResponse());
  await pending;
  assert.match(e.aiConnectionTestStatus.textContent, /配置已修改/);
  assertRestored(e);
});

test("probe timeout aborts only its request and clears timer, lock and button state", async () => {
  const e = engine();
  const before = gameState(e);
  const scheduled = [];
  const cleared = [];
  global.setTimeout = (callback, delay) => {
    const token = {callback, delay};
    scheduled.push(token);
    return token;
  };
  global.clearTimeout = token => {cleared.push(token);};
  let signal;
  global.fetch = (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason || new DOMException("Aborted", "AbortError")), {once: true});
    });
  };
  const pending = e.testAIConnection();
  assert.ok(signal instanceof AbortSignal);
  assert.equal(scheduled.length, 1, "one probe-specific deadline should be scheduled");
  assert.ok(scheduled[0].delay > 0 && scheduled[0].delay <= 75000);
  scheduled[0].callback();
  await pending;
  assert.equal(signal.aborted, true);
  assert.match(e.aiConnectionTestStatus.textContent, /测试失败/);
  assert.match(e.aiConnectionTestStatus.textContent, /超时/);
  assert.ok(cleared.includes(scheduled[0]), "timer must be cleared in finally");
  assert.deepEqual(gameState(e), before);
  assertRestored(e);
});
