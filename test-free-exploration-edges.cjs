// Isolated boundary regressions: all network responses are fixtures, with no model charges.
const assert = require("node:assert/strict");
const {test, afterEach} = require("node:test");
const {WebVisualNovelEngine} = require("./app.js");
const originals = {fetch: global.fetch, window: global.window, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout};
global.WORLD_PRESETS = require("./skills-data.js");
afterEach(() => Object.assign(global, originals));

function element() {
  const classes = new Set();
  return {textContent: "", innerText: "", hidden: true, classList: {
    add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)
  }};
}
function engine() {
  global.window = {JIUZHOU_AI_GATEWAY: {endpoint: "https://gateway.example.com"}};
  return Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    apiConfig: {enabled: true, source: "shared", apiKey: "", model: "deepseek-flash", endpoint: "https://private.example.com/chat/completions", maxTokens: 32768},
    serverSharedConfig: {hasServerKey: true}, apiHistory: [], expectedLength: 5000, currentFaction: "ming", branchDepth: 1,
    ideologyVector: {authority: 0, pragmatism: 0, progress: 0, cognition: 0},
    cacheTelemetry: {lastHitTokens: 0, lastMissTokens: 0, lastHitRate: "0.0%"},
    qmCache: element(), aiConnectionStatus: element(), cacheStatusTag: element(),
    aiGenerationMetricsDisplay: element(), btnCancelAIRequest: element(),
    buildDeepSeekCachePayload() { return {messages: [
      {role: "system", content: "JSON 剧情规则"}, {role: "system", content: "时代背景"}, {role: "user", content: "先救百姓，再核对军粮账册"}
    ], ephemeralTail: "先救百姓，再核对军粮账册"}; }
  });
}
function response(content, finish = "stop") {
  return {ok: true, status: 200, json: async () => ({model: "fixture-model", choices: [{message: {
    content: typeof content === "string" ? content : JSON.stringify(content)
  }, ...(finish ? {finish_reason: finish} : {})}], usage: {completion_tokens: 1234}})};
}
function story(text = "你核对粮册，决定先救百姓。") {
  return {beats: [{speaker: "旁白", text}], choices: [{text: "安置流民"}, {text: "查验粮库"}, {text: "召集医者"}]};
}
const action = {text: "先救百姓，再核对军粮账册"};
const turn = e => e.callDeepSeekLiveAPI(action, 3, 4, 9, true);

test("the current long action and a previous 5000-character JSON survive forwarding intact", () => {
  const e = engine();
  const previous = JSON.stringify(story("前情".repeat(2500) + "重要结尾：已经救出村民"));
  const current = "准备工作".repeat(500) + "最后决定：暂不追击，先送伤员就医";
  const input = [{role: "system", content: "规则"}, {role: "system", content: "背景"},
    {role: "user", content: "此前决定"}, {role: "assistant", content: previous}, {role: "user", content: current}];
  const result = e.buildGatewayMessages(input);
  assert.equal(result.at(-1).content, current);
  assert.equal(result[3].content, previous);
  assert.equal(JSON.parse(result[3].content).beats[0].text.endsWith("已经救出村民"), true);
  assert.deepEqual(input.at(-1), {role: "user", content: current});
});

test("history drops older whole turns within its character and message budgets", () => {
  const e = engine();
  const prefix = [{role: "system", content: "规".repeat(10000)}, {role: "system", content: "史".repeat(21000)}];
  const pairs = Array.from({length: 12}, (_, i) => [
    {role: "user", content: `行动${i}` + "文".repeat(1000)},
    {role: "assistant", content: JSON.stringify(story(`结果${i}` + "文".repeat(10000)))}
  ]).flat();
  const current = {role: "user", content: "当前行动".repeat(2000)};
  const result = e.buildGatewayMessages([...prefix, ...pairs, current]);
  assert.equal(result[0].content.length, 8500);
  assert.equal(result[1].content.length, 18000);
  assert.ok(result.reduce((n, m) => n + m.content.length, 0) <= 120000);
  assert.ok(result.length <= 19);
  assert.equal(result.length % 2, 1);
  for (let i = 2; i < result.length - 1; i += 2) {
    assert.equal(result[i].role, "user"); assert.equal(result[i + 1].role, "assistant");
    assert.equal(typeof JSON.parse(result[i + 1].content).beats[0].text, "string");
  }
  assert.equal(result.at(-2).content, pairs.at(-1).content);
  assert.deepEqual(result.at(-1), current);
});

test("at most eight complete historical pairs are sent, with no orphan assistant", () => {
  const e = engine();
  const messages = [{role: "system", content: "规则"}, {role: "system", content: "背景"},
    {role: "assistant", content: "孤立旧回复"}, ...Array.from({length: 10}, (_, i) => [
      {role: "user", content: `u${i}`}, {role: "assistant", content: `a${i}`}
    ]).flat(), {role: "user", content: "当前行动"}];
  const result = e.buildGatewayMessages(messages);
  assert.equal(result.length, 19); assert.equal(result[2].content, "u2");
  assert.equal(result.at(-2).content, "a9");
});

test("overlong current input is explicitly rejected instead of silently sliced", () => {
  const e = engine(), input = "文".repeat(40001);
  assert.throws(() => e.buildGatewayMessages([{role: "system", content: "规则"}, {role: "system", content: "背景"}, {role: "user", content: input}]), /context_too_large/);
  assert.match(e.describeAIError(new Error("context_too_large")), /没有被截断发送/);
  const allowed = e.buildGatewayMessages([{role: "system", content: "规则"}, {role: "system", content: "背景"}, {role: "user", content: input.slice(1)}]);
  assert.equal(allowed.at(-1).content.length, 40000);
});

test("bad optional choices and effects do not discard valid long-form prose", async () => {
  const e = engine(), effects = [];
  e.executeAITools = tools => effects.push(...tools);
  const fixture = story("史".repeat(5000));
  fixture.choices = [null, 99, [], {}, {text: {wrong: true}}, {text: "安置流民", tag: {}, bias: {authority: "bad"}}, "查验粮库"];
  fixture.stage_effects = [null, 5, [], {name: 7}, {name: "screen_flash", params: 5}];
  global.fetch = async () => response(fixture);
  const result = await turn(e);
  assert.equal(result.beats[0].text.length, 5000);
  assert.equal(result.choices.length, 3);
  assert.equal(result.choices[0].bias.authority, 0);
  assert.equal(result.choices[0].tag, "抉择");
  assert.deepEqual(effects, [{tool: "screen_flash", params: {}}]);
  assert.equal(e.apiHistory.length, 2); assert.equal(e.aiRequestStatus.state, "success");
  assert.equal(e.aiGenerationMetrics.beatCount, 1); assert.equal(e.aiGenerationMetrics.choiceCount, 2);
});

test("optional effect execution failures cannot erase a successfully normalized story", async () => {
  const e = engine();
  e.executeAITools = () => {throw new Error("fixture effect failure");};
  global.fetch = async () => response({...story(), stage_effects: [{name: "weather_effect", params: {type: "rain"}}]});
  assert.equal((await turn(e)).choices.length, 3);
  assert.equal(e.aiRequestStatus.state, "success");
});

test("invalid required prose does not commit either side of a history turn", async () => {
  const e = engine();
  e.apiHistory = [{role: "user", content: "既往行动"}, {role: "assistant", content: "既往剧情"}];
  const before = structuredClone(e.apiHistory);
  global.fetch = async () => response({beats: [null, {}], choices: [null]});
  await assert.rejects(turn(e), /invalid_game_response/);
  assert.deepEqual(e.apiHistory, before); assert.equal(e.aiGenerationMetrics, null);
});

test("length finish reason rejects both valid and partial JSON without fake success or history writes", async () => {
  for (const content of [story(), '{"beats":[{"text":"前半段。"},{"text":"尚未写完']) {
    const e = engine();
    global.fetch = async () => response(content, "length");
    await assert.rejects(turn(e), /output_truncated/);
    assert.equal(e.apiHistory.length, 0); assert.equal(e.aiGenerationMetrics, null);
    assert.equal(e.aiRequestStatus.state, "fallback");
    assert.match(e.aiConnectionStatus.textContent, /输出未完整结束/);
    assert.doesNotMatch(e.qmCache.innerText, /AI 已生成/);
  }
});

test("suture truncation also receives the dedicated failure rather than a valid partial result", async () => {
  const e = engine();
  global.fetch = async () => response({reconciledBeats: [{text: "部分对白"}]}, "length");
  await assert.rejects(e.callDeepSeekSutureAPI({title: "守城", desc: "", originalBeats: [{text: "原文"}]}, []), /output_truncated/);
  assert.equal(e.aiRequestStatus.state, "fallback");
});

test("interrupted and other non-stop endings never count as successful story or suture generation", async () => {
  for (const reason of ["insufficient_system_resource", "aborted", "content_filter", "tool_calls", "unexpected_provider_reason"]) {
    for (const mode of ["story", "suture"]) {
      const e = engine();
      global.fetch = async () => response(mode === "story" ? story() : {reconciledBeats: [{text: "部分对白"}]}, reason);
      const request = mode === "story" ? turn(e) : e.callDeepSeekSutureAPI({title: "守城", desc: "", originalBeats: [{text: "原文"}]}, []);
      await assert.rejects(request, {code: "output_incomplete"}, `${mode}: ${reason}`);
      assert.equal(e.apiHistory.length, 0);
      assert.equal(e.aiGenerationMetrics, null);
      assert.equal(e.aiRequestStatus.state, "fallback");
      assert.match(e.aiConnectionStatus.textContent, /生成被中断，尚未获得完整剧情/);
      assert.doesNotMatch(e.qmCache.innerText, /AI 已生成/);
    }
  }
});

test("real payload builder transmits the 5000 tier and preserves a long latest action", async () => {
  const e = engine(); delete e.buildDeepSeekCachePayload;
  const customInput = "核对军需记录。".repeat(250) + "最后决定：先救村民";
  let body;
  global.fetch = async (_url, options) => {body = JSON.parse(options.body); return response(story());};
  await e.callDeepSeekLiveAPI({text: customInput, customInput}, 3, 4, 9, true);
  assert.equal(body.expectedLength, 5000);
  assert.doesNotMatch(body.messages[0].content, /3500~4800|至少\s*5000|少于\s*5000/);
  assert.match(body.messages.at(-1).content, /至少\s*5000/);
  assert.match(body.messages.at(-1).content, /最后决定：先救村民/);
  assert.ok(body.max_tokens >= 12288);
});

test("metrics describe only valid prose, not whitespace, reasoning or synthesized choices", async () => {
  const e = engine();
  global.fetch = async () => response({beats: [{speaker: "旁白", text: "你 A。\n\t山河！"}, {type: "illustration", text: "插画说明不算正文"}], choices: [null], deliberation: "模型局势思考不算正文"});
  await turn(e);
  assert.equal(e.aiGenerationMetrics.textCharacters, 6);
  assert.equal(e.aiGenerationMetrics.hanCharacters, 3);
  assert.equal(e.aiGenerationMetrics.choiceCount, 0);
  assert.equal(e.aiGenerationMetrics.displayChoiceCount, 4);
  assert.equal(e.aiGenerationMetrics.beatCount, 1);
  assert.equal(e.aiGenerationMetrics.completionTokens, 1234);
  assert.equal(e.aiGenerationMetrics.finishReason, "stop");
  assert.equal(e.aiGenerationMetrics.expectedLength, 5000);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /最近一次有效剧情/);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /完成 Token 1234/);
});

test("an absent finish reason is reported as unknown, never as confirmed complete", async () => {
  const e = engine(); global.fetch = async () => response(story(), null);
  await turn(e);
  assert.equal(e.aiGenerationMetrics.finishReason, null);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /结束原因 未知/);
});

test("changing the length preference while waiting cannot relabel the in-flight generation metrics", async () => {
  const e = engine(); let resolveResponse, sentBody;
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return new Promise(resolve => {resolveResponse = resolve;});
  };
  const pending = turn(e);
  assert.equal(sentBody.expectedLength, 5000);
  e.expectedLength = 500;
  resolveResponse(response(story("史".repeat(3600))));
  await pending;
  assert.equal(e.expectedLength, 500);
  assert.equal(e.aiGenerationMetrics.expectedLength, 5000);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /未达目标|正文偏短/);
  assert.doesNotMatch(e.aiGenerationMetricsDisplay.textContent, /超出偏好/);
});

test("manual cancellation exposes its cause, cleans up and permits a fresh request without retries", async () => {
  const e = engine(); let requests = 0, firstSignal;
  global.fetch = async (_url, options) => {
    requests++; firstSignal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
  };
  const pending = e.requestAICompletion("https://gateway.example.com", {}, {}, true, "story");
  assert.equal(e.btnCancelAIRequest.hidden, false); assert.ok(firstSignal instanceof AbortSignal);
  e.cancelAIRequest();
  await assert.rejects(pending, {code: "request_cancelled"});
  assert.equal(requests, 1); assert.equal(e.activeAIRequestController, null); assert.equal(e.btnCancelAIRequest.hidden, true);
  assert.equal(e.aiRequestStatus.message, "已取消本次请求，保留原行动供重试");
  global.fetch = async (_url, options) => {requests++; assert.notEqual(options.signal, firstSignal); assert.equal(options.signal.aborted, false); return response(story());};
  await turn(e); assert.equal(requests, 2); assert.equal(e.aiRequestStatus.state, "success");
});

test("shared generation has no automatic deadline; private deadline clears in finally", async () => {
  const e = engine(); let timer, cleared;
  global.fetch = async () => response(story());
  global.setTimeout = () => {throw new Error("Shared generation must not create a deadline");};
  await e.requestAICompletion("https://gateway.example.com", {}, {}, true, "story");
  global.setTimeout = (callback, ms) => {assert.equal(ms, 75000); timer = callback; return "private-timer";};
  global.clearTimeout = token => {cleared = token;};
  await e.requestAICompletion("https://private.example.com", {}, {}, false, "suture");
  assert.equal(typeof timer, "function"); assert.equal(cleared, "private-timer");
  assert.equal(e.activeAIRequestController, null); assert.equal(e.btnCancelAIRequest.hidden, true);
});

test("illustration tool uses the current tool name instead of an undefined identifier", () => {
  const e = engine(); let shown;
  window.FACTION_ILLUSTRATION_VAULT = {ming: {ming_war: {title: "战局", description: "画卷", relativePath: "war.jpg"}}};
  e.showIllustration = (...args) => {shown = args;};
  e.executeAITools([{tool: "ming_war", params: {}}]);
  assert.equal(shown[0], "战局"); assert.equal(shown[3], "war.jpg");
});
