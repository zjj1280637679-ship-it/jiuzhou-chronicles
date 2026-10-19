// All model responses are fixtures. Plugins run in real isolated worker threads.
// These tests make no network/model request and do not touch a browser save.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createGameHarness, createPluginHost} = require("./harness/runtime.js");
const protocol = require("./harness/protocol.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");
const {WebVisualNovelEngine} = require("./app.js");

const baseURL = pathToFileURL(path.join(__dirname, "harness", path.sep)).href;
const fixtureURL = pathToFileURL(path.join(__dirname, "test", "fixtures", "harness-chaos-plugin.js")).href;
const fixture = name => pathToFileURL(path.join(__dirname, "test", "fixtures", name)).href;
const messages = [{role: "system", content: "稳定游戏规则"}, {role: "system", content: "稳定世界资料"}, {role: "user", content: "先救村民"}];
const narrative = text => ({beats: [{speaker: "旁白", type: "narrator", text}], choices: [{text: "查账"}, {text: "救人"}, {text: "守城"}]});
function completion(story, extra = {}) {
  return {model: "fixture-deepseek", choices: [{finish_reason: "stop", message: {role: "assistant", content: JSON.stringify(story)}}],
    usage: {completion_tokens: 10, reasoning_tokens: 3, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20}, ...extra};
}
function calls(names, reasoning = "内部推演") {
  return {model: "fixture-deepseek", choices: [{finish_reason: "tool_calls", message: {role: "assistant", content: null, reasoning_content: reasoning,
    tool_calls: names.map((spec, i) => ({id: `call_${i}`, type: "function", function: {name: typeof spec === "string" ? spec : spec.name,
      arguments: typeof spec === "string" ? "{}" : (spec.arguments || "{}")}}))}}], usage: {completion_tokens: 4, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 10}};
}
function options(extra = {}) {
  return {baseURL, workerFactory: createNodeWorkerFactory(), messages: structuredClone(messages), world: {location: "城门", facts: ["粮库已开"]}, targetCharacters: 5, ...extra};
}

test("an unknown or failing plugin returns a tool error while an independent plugin remains usable", async () => {
  let terminated = 0;
  const host = await createPluginHost(options({plugins: [{id: "chaos", url: fixtureURL}, {id: "world", url: new URL("plugins/world.js", baseURL).href}],
    context: {world: {location: "城门"}, targetCharacters: 5}, workerFactory: createNodeWorkerFactory({onTerminate() {terminated++;}})}));
  try {
    const failed = await host.invoke("test_throw", {});
    assert.equal(failed.result.ok, false);
    assert.equal(typeof failed.result.error.code, "string");
    assert.match(failed.result.error.message, /fixture|插件/);
    const missing = await host.invoke("not_a_registered_tool", {});
    assert.equal(missing.result.ok, false);
    const echo = await host.invoke("test_echo", {value: "下一工具仍可运行"});
    assert.equal(echo.result.value, "下一工具仍可运行");
    const world = await host.invoke("read_world", {});
    assert.notEqual(world.result.ok, false);
    assert.match(JSON.stringify(world.result), /城门/);
  } finally { host.dispose(); }
  assert.equal(terminated, 2);
});

test("a synchronously stuck plugin is terminated without freezing the host or another plugin", async () => {
  let heartbeats = 0;
  const host = await createPluginHost(options({plugins: [{id: "chaos", url: fixtureURL}, {id: "world", url: new URL("plugins/world.js", baseURL).href}],
    context: {world: {location: "城门"}}, pluginTimeoutMs: 200}));
  const heartbeat = setInterval(() => heartbeats++, 10);
  try {
    const failed = await host.invoke("test_hang", {});
    assert.equal(failed.result.ok, false);
    assert.match(failed.result.error.code, /timeout|unavailable/);
    assert.ok(heartbeats >= 2, "main event loop must remain responsive during a plugin's synchronous loop");
    const healthy = await host.invoke("read_world", {});
    assert.notEqual(healthy.result.ok, false);
  } finally { clearInterval(heartbeat); host.dispose(); }
});

test("cancelling a stuck plugin rejects the whole turn and releases workers", async () => {
  const controller = new AbortController(); let terminated = 0;
  const host = await createPluginHost(options({plugins: [{id: "chaos", url: fixtureURL}], signal: controller.signal,
    workerFactory: createNodeWorkerFactory({onTerminate() {terminated++;}})}));
  const pending = host.invoke("test_hang", {});
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, error => error.code === "request_cancelled");
  host.dispose();
  assert.ok(terminated >= 1);
});

test("plugin startup failure cannot prevent another plugin from registering or running", async () => {
  const host = await createPluginHost(options({plugins: [{id: "broken", url: fixture("harness-load-failure-plugin.js")},
    {id: "world", url: new URL("plugins/world.js", baseURL).href}], context: {world: {location: "城门"}}}));
  try {
    assert.deepEqual(host.tools.map(tool => tool.function.name), ["read_world"]);
    assert.match(JSON.stringify((await host.invoke("read_world", {})).result), /城门/);
  } finally {host.dispose();}
});

test("each plugin receives a private snapshot, with no references to the main world or another plugin", async () => {
  const world = {location: "城门"};
  const host = await createPluginHost(options({plugins: [{id: "mutator", url: fixture("harness-mutating-plugin.js")},
    {id: "world", url: new URL("plugins/world.js", baseURL).href}], context: {world}}));
  try {
    assert.match(JSON.stringify((await host.invoke("mutate_snapshot", {})).result), /已改写/);
    assert.equal(world.location, "城门");
    const other = await host.invoke("read_world", {});
    assert.equal(other.result.world.location, "城门");
  } finally {host.dispose();}
});

test("tool-name conflicts resolve by configured priority rather than whichever worker boots first", async () => {
  const host = await createPluginHost(options({plugins: [{id: "world", url: fixture("harness-slow-world-plugin.js")},
    {id: "conflict", url: fixture("harness-collision-plugin.js")}], context: {world: {location: "城门"}}}));
  try {
    assert.deepEqual(host.tools.map(tool => tool.function.name), ["read_world"]);
    const result = await host.invoke("read_world", {});
    assert.equal(result.result.world.location, "城门");
    assert.equal(result.result.stolen, undefined);
  } finally {host.dispose();}
});

test("native tools, error results, reasoning and stable schemas survive the complete model loop", async () => {
  const requests = [];
  const result = await createGameHarness(options({model: async request => {
    requests.push(structuredClone({messages: request.messages, tools: request.tools}));
    if (requests.length === 1) return calls(["not_a_registered_tool"]);
    if (requests.length === 2) {
      const tool = request.messages.at(-1);
      assert.equal(tool.role, "tool"); assert.equal(tool.tool_call_id, "call_0");
      assert.equal(JSON.parse(tool.content).ok, false);
      const assistant = request.messages.at(-2);
      assert.equal(assistant.reasoning_content, "内部推演");
      assert.equal(assistant.tool_calls[0].id, "call_0");
      return calls(["read_world"], "查明已确认事实");
    }
    assert.match(request.messages.at(-1).content, /粮库已开/);
    return completion(narrative("你打开粮库，先救村民。"));
  }}));
  assert.equal(result.harness.modelCalls, 3);
  assert.equal(result.harness.toolCalls, 2);
  assert.equal(result.harness.deliveryCharacters, Array.from("你打开粮库，先救村民。").length);
  assert.equal(result.harness.completionTokens, 18);
  for (const request of requests) {
    assert.deepEqual(request.messages.slice(0, 3), messages);
    assert.deepEqual(request.tools, requests[0].tools);
  }
  assert.equal(JSON.parse(result.data.choices[0].message.content).beats[0].text, "你打开粮库，先救村民。");
});

test("only the final delivered beats text satisfies 5000, excluding drafts, reasoning, metadata, illustrations and JSON", async () => {
  let modelCalls = 0;
  const result = await createGameHarness(options({targetCharacters: 5000, model: async request => {
    modelCalls++;
    const story = narrative("文".repeat(modelCalls === 1 ? 10 : 5000));
    story.deliberation = "思考".repeat(5000);
    story.beats[0].speaker = "人物".repeat(5000);
    story.beats[0].sub = "动作".repeat(5000);
    story.beats.push({type: "illustration", text: "插画".repeat(5000)});
    story.choices[0].text = "选项".repeat(5000);
    if (modelCalls === 2) assert.match(request.messages.at(-1).content, /5000|4990|10/);
    return completion(story);
  }}));
  assert.equal(modelCalls, 2);
  assert.equal(result.harness.deliveryCharacters, 5000);
  assert.equal(result.harness.hanCharacters, 5000);
  assert.equal(result.harness.completionTokens, 20);
  assert.equal(JSON.parse(result.data.choices[0].message.content).beats[0].text.length, 5000);
});

test("thought and metadata cards do not inflate delivery metrics, and Unicode text is counted after whitespace removal", () => {
  const story = narrative("山河 A🌟！\n\t");
  for (const type of ["thought", "thinking", "reasoning", "metadata", "tool", "tool_result", "deliberation", "illustration"]) {
    story.beats.push({type, text: "不交付".repeat(5000)});
  }
  assert.deepEqual(protocol.measureStory(story), {textCharacters: 5, hanCharacters: 2, beatCount: 1});
});

test("leaked JSON inside a text field is cleaned before length checks, so syntax cannot satisfy a prose target", async () => {
  let calls = 0;
  const result = await createGameHarness(options({targetCharacters: 5000, model: async request => {
    calls++;
    if (calls === 1) return completion(narrative('{"speaker":"npc","text":"正文"}'.repeat(1000)));
    const feedback = request.messages.at(-1).content;
    assert.match(feedback, /"textCharacters":2000/);
    assert.match(feedback, /"remainingCharacters":3000/);
    return completion(narrative("文".repeat(5000)));
  }}));
  assert.equal(calls, 2); assert.equal(result.harness.deliveryCharacters, 5000);
  assert.equal(JSON.parse(result.data.choices[0].message.content).beats[0].text, "文".repeat(5000));
});

test("draft tools measure the current manuscript once, replace revisions and append only new delivered text", async () => {
  const host = await createPluginHost(options({context: {world: {}, targetCharacters: 5000}}));
  try {
    let result = await host.invoke("write_draft", {story: narrative("甲".repeat(3000))});
    assert.equal(result.result.textCharacters, 3000);
    result = await host.invoke("write_draft", {mode: "replace", story: narrative("乙".repeat(2000))});
    assert.equal(result.result.textCharacters, 2000);
    result = await host.invoke("deliver_story", {});
    assert.equal(result.result.ok, false); assert.equal(result.delivery, undefined);
    assert.equal(result.result.remainingCharacters, 3000);
    result = await host.invoke("write_draft", {mode: "append", story: narrative("丙".repeat(3000))});
    assert.equal(result.result.textCharacters, 5000);
    result = await host.invoke("deliver_story", {});
    assert.equal(result.result.ok, true);
    assert.deepEqual(result.delivery.beats.map(beat => beat.text), ["乙".repeat(2000), "丙".repeat(3000)]);
  } finally {host.dispose();}
});

test("native draft, inspect, expand and deliver is a tool-driven loop rather than concatenated model completions", async () => {
  let turns = 0;
  const result = await createGameHarness(options({targetCharacters: 5000, model: async request => {
    turns++;
    if (turns === 1) return calls([{name: "write_draft", arguments: JSON.stringify({story: narrative("甲".repeat(3000))})}]);
    if (turns === 2) {
      assert.equal(JSON.parse(request.messages.at(-1).content).textCharacters, 3000);
      return calls(["inspect_draft"]);
    }
    if (turns === 3) {
      assert.equal(JSON.parse(request.messages.at(-1).content).remainingCharacters, 2000);
      return calls([{name: "write_draft", arguments: JSON.stringify({mode: "append", story: narrative("乙".repeat(2000))})}]);
    }
    assert.equal(turns, 4);
    return calls(["deliver_story"]);
  }}));
  assert.equal(result.harness.deliveryCharacters, 5000);
  assert.equal(result.harness.modelCalls, 4); assert.equal(result.harness.toolCalls, 4);
  assert.deepEqual(JSON.parse(result.data.choices[0].message.content).beats.map(beat => beat.text), ["甲".repeat(3000), "乙".repeat(2000)]);
});

test("reading the same world again after a productive draft step is not mistaken for a stalled agent", async () => {
  let turns = 0;
  const text = "你打开粮库，先救村民。";
  const result = await createGameHarness(options({targetCharacters: Array.from(text).length, model: async () => {
    turns++;
    if (turns === 1 || turns === 3) return calls(["read_world"]);
    if (turns === 2) return calls([{name: "write_draft", arguments: JSON.stringify({story: narrative(text)})}]);
    assert.equal(turns, 4);
    return calls(["deliver_story"]);
  }}));
  assert.equal(result.harness.modelCalls, 4); assert.equal(result.harness.toolCalls, 4);
  assert.equal(result.harness.deliveryCharacters, Array.from(text).length);
});

test("malformed tool arguments become feedback rather than crashing the webpage loop", async () => {
  let modelCalls = 0;
  const result = await createGameHarness(options({model: async request => {
    modelCalls++;
    if (modelCalls === 1) return calls([{name: "read_world", arguments: "{broken"}]);
    assert.equal(request.messages.at(-1).role, "tool");
    assert.equal(JSON.parse(request.messages.at(-1).content).ok, false);
    return completion(narrative("你决定先安置村民。"));
  }}));
  assert.equal(result.harness.modelCalls, 2);
});

test("an incomplete provider ending is not delivered as a successful story", async () => {
  await assert.rejects(createGameHarness(options({model: async () => completion(narrative("你决定先安置村民。"), {
    choices: [{finish_reason: "length", message: {content: JSON.stringify(narrative("你决定先安置村民。"))}}]
  })})), error => (error.code || error.message) === "output_truncated");
});

test("network failure has no blind automatic paid retry and a new turn can still succeed", async () => {
  let attempts = 0;
  const input = structuredClone(messages), world = {location: "城门", facts: ["粮库已开"]};
  await assert.rejects(createGameHarness(options({messages: input, world, model: async () => {attempts++; throw new TypeError("fixture disconnected");}})), /fixture disconnected/);
  assert.equal(attempts, 1); assert.deepEqual(input, messages); assert.deepEqual(world, {location: "城门", facts: ["粮库已开"]});
  const next = await createGameHarness(options({model: async () => {attempts++; return completion(narrative("你决定先安置村民。"));}}));
  assert.equal(next.harness.modelCalls, 1); assert.equal(attempts, 2);
});

test("a cancelled model turn uses one signal, disposes plugins and permits a subsequent turn", async () => {
  const controller = new AbortController(); let calls = 0, disposed = 0, modelStarted;
  const started = new Promise(resolve => {modelStarted = resolve;});
  const pending = createGameHarness(options({signal: controller.signal, workerFactory: createNodeWorkerFactory({onTerminate() {disposed++;}}), model: ({signal}) => {
    calls++; assert.equal(signal, controller.signal); modelStarted();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
  }}));
  await started; controller.abort();
  await assert.rejects(pending, error => error.code === "request_cancelled");
  assert.equal(calls, 1); assert.ok(disposed >= 2);
  const next = await createGameHarness(options({model: async () => completion(narrative("你决定先安置村民。"))}));
  assert.equal(next.harness.modelCalls, 1);
});

test("repeated identical rejected deliveries stop with an explicit stalled error", async () => {
  let calls = 0;
  await assert.rejects(createGameHarness(options({targetCharacters: 5000, model: async () => {calls++; return completion(narrative("太短。"));}})), error => error.code === "agent_stalled");
  assert.ok(calls >= 2 && calls < 5);
});

test("cancellation while a model promise is being created consumes its rejection and releases workers", async () => {
  const controller = new AbortController(); let terminated = 0;
  await assert.rejects(createGameHarness(options({signal: controller.signal,
    workerFactory: createNodeWorkerFactory({onTerminate() {terminated++;}}),
    model: async () => {controller.abort(); throw new Error("late_fixture");}
  })), error => error.code === "request_cancelled");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(terminated, 2);
});

test("cancelling from a step notification never starts an already-cancelled model request", async () => {
  const controller = new AbortController(); let modelStarted = false;
  await assert.rejects(createGameHarness(options({signal: controller.signal,
    onEvent(event) {if (event.type === "model_start") controller.abort();},
    model: async () => {modelStarted = true; throw new Error("must_not_run");}
  })), error => error.code === "request_cancelled");
  assert.equal(modelStarted, false);
});

function element() {
  const classes = new Set();
  return {textContent: "", innerText: "", hidden: true, style: {}, classList: {
    add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)
  }};
}
function appEngine(t) {
  const original = {window: global.window, fetch: global.fetch, WORLD_PRESETS: global.WORLD_PRESETS};
  t.after(() => Object.assign(global, original));
  global.WORLD_PRESETS = require("./skills-data.js");
  global.window = {JIUZHOU_AI_GATEWAY: {endpoint: "https://fixture.gateway"}, JiuzhouHarnessProtocol: protocol,
    JiuzhouHarness: {createGameHarness: opts => createGameHarness({...opts, baseURL, workerFactory: createNodeWorkerFactory()})}};
  return Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    apiConfig: {enabled: true, apiKey: "", model: "deepseek-flash", endpoint: "https://private.fixture/chat/completions", maxTokens: 32768},
    serverSharedConfig: {hasServerKey: true}, apiHistory: [], expectedLength: 500, currentFaction: "ming", branchDepth: 1,
    ideologyVector: {authority: 0, pragmatism: 0, progress: 0, cognition: 0},
    cacheTelemetry: {lastHitTokens: 0, lastMissTokens: 0, lastHitRate: "0.0%"},
    qmCache: element(), aiConnectionStatus: element(), cacheStatusTag: element(), aiHarnessProgressDisplay: element(),
    aiGenerationMetricsDisplay: element(), btnCancelAIRequest: element(), executeAITools() {}
  });
}
const response = data => ({ok: true, status: 200, json: async () => data});
const appTurn = engine => engine.callDeepSeekLiveAPI({text: "先救百姓，再核对军粮账册"}, 3, 4, 9, true);

test("app runs native agent requests with one signal and commits only the verified final delivery", async t => {
  const engine = appEngine(t), requests = [], signals = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); requests.push(body); signals.push(init.signal);
    assert.equal(body.mode, "agent"); assert.equal(body.response_format, undefined);
    assert.equal(body.thinking.type, "disabled");
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.enabledTools, protocol.tools.map(tool => tool.function.name));
    assert.equal(engine.apiHistory.length, 0);
    assert.equal(engine.btnCancelAIRequest.hidden, false);
    if (requests.length === 1) return response(calls(["read_world"], "不得计入正文或存档的本轮思考"));
    assert.equal(body.messages.at(-1).role, "tool"); assert.equal(body.messages.at(-1).tool_call_id, "call_0");
    assert.equal(body.messages.at(-2).reasoning_content, "不得计入正文或存档的本轮思考");
    return response(completion({...narrative("文".repeat(500)), deliberation: "内部思考".repeat(1000)}));
  };
  const result = await appTurn(engine);
  assert.equal(requests.length, 2); assert.equal(signals[0], signals[1]);
  assert.deepEqual(requests[1].messages.slice(0, requests[0].messages.length), requests[0].messages);
  assert.deepEqual(requests[1].enabledTools, requests[0].enabledTools);
  assert.equal(engine.apiHistory.length, 2);
  assert.doesNotMatch(JSON.stringify(engine.apiHistory), /tool_calls|tool_call_id|reasoning_content|内部思考|不得计入正文/);
  assert.equal(result.beats.map(beat => beat.text).join("").length, 500);
  assert.equal(engine.aiGenerationMetrics.textCharacters, 500);
  assert.equal(engine.aiGenerationMetrics.harness.modelCalls, 2);
  assert.equal(engine.aiGenerationMetrics.harness.toolCalls, 1);
  assert.equal(engine.activeAIRequestController, null);
  assert.equal(engine.btnCancelAIRequest.hidden, true); assert.equal(engine.aiHarnessProgressDisplay.hidden, true);
});

test("app cancellation after a tool step aborts the active model request without committing partial history", async t => {
  const engine = appEngine(t); let count = 0, waiting;
  const secondStarted = new Promise(resolve => {waiting = resolve;});
  global.fetch = async (_url, init) => {
    count++;
    if (count === 1) return response(calls(["read_world"]));
    waiting();
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
  };
  const pending = appTurn(engine);
  await secondStarted; engine.cancelAIRequest();
  await assert.rejects(pending, error => error.code === "request_cancelled");
  assert.equal(count, 2); assert.equal(engine.apiHistory.length, 0); assert.equal(engine.aiGenerationMetrics, null);
  assert.equal(engine.activeAIRequestController, null); assert.equal(engine.btnCancelAIRequest.hidden, true);
  global.fetch = async () => response(completion(narrative("文".repeat(500))));
  await appTurn(engine);
  assert.equal(engine.apiHistory.length, 2); assert.equal(engine.aiRequestStatus.state, "success");
});

test("app reports a network failure mid-loop, keeps the prior turn and accepts a later fresh turn", async t => {
  const engine = appEngine(t); engine.apiHistory = [{role: "user", content: "旧行动"}, {role: "assistant", content: JSON.stringify(narrative("旧正文"))}];
  const before = structuredClone(engine.apiHistory); let count = 0;
  global.fetch = async () => {count++; if (count === 1) return response(calls(["read_world"])); throw new TypeError("fixture offline");};
  await assert.rejects(appTurn(engine), /fixture offline/);
  assert.equal(count, 2); assert.deepEqual(engine.apiHistory, before); assert.equal(engine.aiGenerationMetrics, null);
  assert.equal(engine.aiRequestStatus.state, "fallback"); assert.equal(engine.activeAIRequestController, null);
  global.fetch = async () => response(completion(narrative("文".repeat(500))));
  await appTurn(engine);
  assert.equal(engine.apiHistory.length, before.length + 2);
});

test("changing desired length, dice or action leaves the cacheable system prefix unchanged", t => {
  const engine = appEngine(t);
  const first = engine.buildDeepSeekCachePayload({text: "先救人", diceBase: 9}, 1, 2, 5, false);
  engine.expectedLength = 5000; engine.branchDepth = 99;
  engine.ideologyVector = {authority: 9, pragmatism: 8, progress: 7, cognition: 6};
  const second = engine.buildDeepSeekCachePayload({text: "再查账", diceBase: 12}, 6, 6, 14, true);
  assert.deepEqual(first.messages.slice(0, 2), second.messages.slice(0, 2));
  assert.notEqual(first.messages.at(-1).content, second.messages.at(-1).content);
  assert.match(first.messages.at(-1).content, /至少500/); assert.match(second.messages.at(-1).content, /至少5000/);
});

test("world lookup carries an index rather than duplicating three long player actions already in the transcript", t => {
  const engine = appEngine(t);
  engine.extrapolationHistory = Array.from({length: 3}, (_, i) => ({choiceText: `第${i + 1}轮` + "长".repeat(25000), turn: i + 1, success: i % 2 === 0}));
  const before = structuredClone(engine.extrapolationHistory);
  const world = engine.buildAIHarnessWorldSnapshot();
  assert.equal(world.recentActions, undefined);
  assert.ok(world.historySource);
  assert.deepEqual(world.recentActionIndex, before.map(entry => ({turn: entry.turn, success: entry.success, textCharacters: entry.choiceText.length})));
  assert.ok(JSON.stringify(world).length < 2000, "tool results must not duplicate more than 75000 characters of existing actions");
  assert.deepEqual(engine.extrapolationHistory, before);
});

test("gateway context reserves tool space while retaining the complete latest action and whole historical turns", t => {
  const engine = appEngine(t);
  const prefix = [{role: "system", content: "规".repeat(8500)}, {role: "system", content: "史".repeat(18000)}];
  const history = Array.from({length: 3}, (_, i) => [
    {role: "user", content: `行动${i}` + "长".repeat(25000)},
    {role: "assistant", content: JSON.stringify(narrative(`结果${i}` + "文".repeat(5000)))}
  ]).flat();
  const current = {role: "user", content: "本轮" + "探".repeat(25000) + "结尾必须保留：先救人"};
  const input = [...prefix, ...history, current], before = structuredClone(input), reserve = 14500;
  const baseline = engine.buildGatewayMessages(input);
  const bounded = engine.buildGatewayMessages(input, reserve);
  assert.ok(bounded.reduce((sum, message) => sum + message.content.length, 0) + reserve <= 120000);
  assert.deepEqual(bounded.at(-1), current);
  assert.deepEqual(bounded.slice(2, -1), history.slice(-2));
  assert.ok(baseline.length > bounded.length, "the reserved tool budget should displace older whole turns");
  assert.deepEqual(input, before);
});

test("app reserves world and draft tool space once, then preserves that selected prefix across model steps", async t => {
  const engine = appEngine(t);
  engine.expectedLength = 5000;
  const actions = Array.from({length: 3}, (_, i) => `历史行动${i}` + "长".repeat(25000));
  engine.extrapolationHistory = actions.map((choiceText, i) => ({choiceText, turn: i + 1, success: true}));
  engine.apiHistory = actions.flatMap((content, i) => [{role: "user", content}, {role: "assistant", content: JSON.stringify(narrative(`此前结果${i}` + "文".repeat(5000)))}]);
  const priorHistory = structuredClone(engine.apiHistory);
  const originalBuilder = engine.buildGatewayMessages;
  const builderCalls = [], requests = [];
  engine.buildGatewayMessages = function (messages, reserveCharacters = 0) {
    builderCalls.push(reserveCharacters);
    return originalBuilder.call(this, messages, reserveCharacters);
  };
  const current = "当前行动" + "探".repeat(25000) + "最终意图：安置受伤村民";
  const expectedReserve = 2 * engine.expectedLength + JSON.stringify(engine.buildAIHarnessWorldSnapshot()).length + 4000;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); requests.push(body);
    if (requests.length === 1) return response(calls(["read_world"]));
    assert.deepEqual(body.messages.slice(0, requests[0].messages.length), requests[0].messages);
    assert.ok(body.messages.at(-1).content.length < 2500, "read_world should return only the compact world and action index");
    return response(completion(narrative("文".repeat(5000))));
  };
  await engine.callDeepSeekLiveAPI({text: current, customInput: current, diceBase: 9}, 3, 4, 9, true);
  assert.deepEqual(builderCalls, [expectedReserve]);
  const first = requests[0].messages;
  assert.ok(first.reduce((sum, message) => sum + message.content.length, 0) + expectedReserve <= 120000);
  assert.match(first.at(-1).content, /最终意图：安置受伤村民/);
  assert.ok(first.at(-1).content.includes(current));
  const selectedHistory = first.slice(2, -1);
  assert.equal(selectedHistory.length % 2, 0);
  assert.deepEqual(selectedHistory, priorHistory.slice(-selectedHistory.length));
  assert.ok(selectedHistory.length < priorHistory.length);
  assert.equal(requests.length, 2);
});
