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
    apiConfig: {enabled: true, source: "custom", apiKey: "", model: "deepseek-flash", endpoint: "https://private.example.com/chat/completions", maxTokens: 32768},
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
function story(text = "文".repeat(5000)) {
  return {beats: [{speaker: "旁白", text}], choices: [{text: "安置流民"}, {text: "查验粮库"}, {text: "召集医者"}]};
}
const action = {text: "先救百姓，再核对军粮账册"};
const turn = e => e.callDeepSeekLiveAPI(action, 3, 4, 9, true);

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
  assert.equal(body.expectedLength, undefined);
  assert.doesNotMatch(body.messages[0].content, /3500~4800|至少\s*5000|少于\s*5000/);
  assert.match(body.messages.at(-1).content, /至少\s*5000/);
  assert.match(body.messages.at(-1).content, /最后决定：先救村民/);
  assert.ok(body.max_tokens >= 12288);
});

test("every length tier reaches the first real request with an explicit final-prose-only counting contract", async () => {
  for (const target of [500, 2000, 5000]) {
    const e = engine(); delete e.buildDeepSeekCachePayload;
    e.expectedLength = target;
    const requests = [];
    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return response(story("文".repeat(target)));
    };
    await turn(e);
    assert.equal(requests.length, 1);
    const tail = requests[0].messages.at(-1).content;
    assert.match(tail, new RegExp(`至少\\s*${target}`), `${target}: target must be model-visible before any tool feedback`);
    assert.match(tail, /beats\[\]\.text/, `${target}: identify the delivered text fields`);
    assert.match(tail, /最终交付/, `${target}: count the delivered story, not every revision`);
    assert.match(tail, /非空白.*Unicode.*字符/, `${target}: specify the counter's unit`);
    for (const excluded of ["JSON", "角色名", "选项", "思考", "工具", "插画"]) {
      assert.ok(tail.includes(excluded), `${target}: explicitly exclude ${excluded}`);
    }
    assert.equal(e.aiGenerationMetrics.textCharacters, target);
    assert.equal(e.aiGenerationMetrics.expectedLength, target);
  }
});

test("compatibility mode rejects 1999 delivered characters even when JSON and non-prose fields are much longer", async () => {
  const e = engine(), effects = [];
  e.expectedLength = 2000;
  e.apiHistory = [{role: "user", content: "既往行动"}, {role: "assistant", content: "既往剧情"}];
  const before = structuredClone(e.apiHistory);
  e.executeAITools = tools => effects.push(...tools);
  // The supplementary-plane Han character is one Unicode character, not two UTF-16 code units.
  const fixture = story("文".repeat(1997) + "，𠮷\n\t ");
  fixture.beats[0].speaker = "角色名".repeat(2000);
  fixture.beats[0].sub = "动作".repeat(2000);
  for (const type of ["illustration", "tool", "tool_result", "thinking", "reasoning", "metadata", "deliberation"]) {
    fixture.beats.push({type, text: "不算正文".repeat(1000)});
  }
  fixture.choices = [{text: "选项".repeat(2000)}];
  fixture.deliberation = "思考".repeat(2000);
  fixture.stage_effects = [{name: "screen_flash", params: {color: "gold"}},
    {name: "show_illustration", params: {id: "qing_night_raid", caption: "插画说明".repeat(2000)}}];
  assert.ok(JSON.stringify(fixture).length > 20000);
  global.fetch = async () => response(fixture);
  await assert.rejects(turn(e), /delivery_too_short/);
  assert.deepEqual(e.apiHistory, before);
  assert.deepEqual(effects, []);
  assert.equal(e.aiGenerationMetrics, null);
  assert.notEqual(e.aiRequestStatus?.state, "success");
  assert.doesNotMatch(e.qmCache.innerText, /AI 已生成/);
});

test("compatibility mode commits exactly 2000 Unicode prose characters across beats, excluding whitespace", async () => {
  const e = engine(), effects = [];
  e.expectedLength = 2000;
  e.executeAITools = tools => effects.push(...tools);
  const fixture = story("文".repeat(999) + "𠮷\n\t ");
  fixture.beats.push({speaker: "守军", type: "npc", text: "\n " + "话".repeat(999) + "！\t"});
  fixture.beats.push({type: "illustration", text: "插画说明不计入正文"});
  fixture.stage_effects = [{name: "screen_flash", params: {color: "gold"}}];
  global.fetch = async () => response(fixture);
  const result = await turn(e);
  assert.deepEqual(result.beats.map(beat => beat.type), ["narrator", "npc"]);
  assert.equal(e.aiGenerationMetrics.textCharacters, 2000);
  assert.equal(e.aiGenerationMetrics.hanCharacters, 1999);
  assert.equal(e.aiGenerationMetrics.beatCount, 2);
  assert.equal(e.aiGenerationMetrics.expectedLength, 2000);
  assert.equal(e.aiGenerationMetrics.harness.mode, "compatibility");
  assert.equal(e.aiRequestStatus.state, "success");
  assert.equal(e.apiHistory.length, 2);
  assert.deepEqual(effects, [{tool: "screen_flash", params: {color: "gold"}}]);
});

test("metrics describe only valid prose, not whitespace, reasoning or synthesized choices", async () => {
  const e = engine();
  global.fetch = async () => response({beats: [{speaker: "旁白", text: "你 A。\n\t山河！" + "文".repeat(4994)}, {type: "illustration", text: "插画说明不算正文"}], choices: [null], deliberation: "模型局势思考不算正文"});
  await turn(e);
  assert.equal(e.aiGenerationMetrics.textCharacters, 5000);
  assert.equal(e.aiGenerationMetrics.hanCharacters, 4997);
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

test("changing the length preference while waiting cannot lower the in-flight 5000-character delivery threshold", async () => {
  const e = engine(); let resolveResponse, sentBody;
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return new Promise(resolve => {resolveResponse = resolve;});
  };
  const pending = turn(e);
  assert.equal(sentBody.expectedLength, undefined);
  e.expectedLength = 500;
  resolveResponse(response(story("史".repeat(3600))));
  await assert.rejects(pending, /delivery_too_short/);
  assert.equal(e.expectedLength, 500);
  assert.equal(e.aiGenerationMetrics, null);
  assert.equal(e.apiHistory.length, 0);
  assert.notEqual(e.aiRequestStatus?.state, "success");
});

test("a completed in-flight 5000-character story retains its original metric target after preference changes", async () => {
  const e = engine(); let resolveResponse;
  global.fetch = async () => new Promise(resolve => {resolveResponse = resolve;});
  const pending = turn(e);
  e.expectedLength = 500;
  resolveResponse(response(story()));
  await pending;
  assert.equal(e.expectedLength, 500);
  assert.equal(e.aiGenerationMetrics.expectedLength, 5000);
  assert.equal(e.aiGenerationMetrics.textCharacters, 5000);
  assert.match(e.aiGenerationMetricsDisplay.textContent, /正文已达目标/);
  assert.equal(e.apiHistory.length, 2);
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

test("legacy illustration names queue exact registered assets without opening a modal or guessing unknown IDs", () => {
  const e = engine(); let shown;
  e.showIllustration = (...args) => {shown = args;};
  e.executeAITools([{tool: "ming_war", params: {}}]);
  assert.equal(shown, undefined);
  assert.deepEqual(e.pendingIllustrationSelections, [{id: "ming_war", afterBeat: 1, caption: ""}]);
  e.executeAITools([{tool: "show_illustration", params: {id: "qing_missing", title: "俘虏", url: "https://invalid.example/a.png"}}]);
  assert.equal(e.pendingIllustrationSelections.length, 1);
  const result = e.getIllustrationRegistry().compose([{text: "正文继续。"}], e.pendingIllustrationSelections);
  assert.equal(result.beats[1].illustrationData.id, "ming_war");
  assert.equal(result.beats[1].illustrationData.relativePath, "data/illustrations/ming/war.svg");
});
