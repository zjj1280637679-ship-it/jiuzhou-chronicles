// Test the actual model-facing contract and delivery effects, not implementation internals.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const protocol = require("./harness/protocol.js");
const {createGameHarness, createPluginHost} = require("./harness/runtime.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");
const registry = require("./illustration-system.js");
const {WebVisualNovelEngine} = require("./app.js");
const baseURL = pathToFileURL(path.join(__dirname, "harness", path.sep)).href;
const story = text => ({beats: [{text}], choices: [{text: "继续调查"}, {text: "查看军图"}, {text: "拜访故人"}]});
const options = extra => ({baseURL, workerFactory: createNodeWorkerFactory(), messages: [{role: "user", content: "查清营地发生的事。"}],
  illustrationCatalog: registry.snapshot(), ...extra});
const calls = specs => ({choices: [{finish_reason: "tool_calls", message: {role: "assistant", content: null,
  tool_calls: specs.map(([name, args], i) => ({id: "tool_" + i, type: "function", function: {name, arguments: JSON.stringify(args)}}))}}]});
const finalStory = result => JSON.parse(result.data.choices[0].message.content);

test("fresh models see canonical tools and common parameters while old execution remains registered", async () => {
  const host = await createPluginHost(options({context: {illustrationCatalog: registry.snapshot()}}));
  try {
    const publicTools = protocol.forModel(host.tools), names = publicTools.map(tool => tool.function.name);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.includes("show_illustration"));
    for (const old of ["list_illustrations", "select_illustration", "inspect_draft"]) {
      assert.ok(host.tools.some(tool => tool.function.name === old), old + " remains executable");
      assert.ok(!names.includes(old), old + " does not compete with the canonical interface");
    }
    for (const tool of publicTools.filter(tool => /illustration|background/.test(tool.function.name))) {
      for (const old of ["id", "includeLegacy", "faction", "category", "pageSize"]) assert.equal(tool.function.parameters.properties[old], undefined);
    }
    assert.deepEqual(publicTools.find(tool => tool.function.name === "search_illustrations").function.parameters.required, ["query"]);
    const legacy = (await host.invoke("select_illustration", {id: "qing_cavalry_charge"})).result;
    assert.equal(legacy.selection.id, "qing_cavalry_charge");
  } finally {host.dispose();}
});

test("optional plugin failures do not advertise phantom tools and custom plugins keep their schemas", () => {
  const custom = {type: "function", function: {name: "visit_place", description: "前往地点", parameters: {type: "object", properties: {place: {type: "string"}}, required: ["place"]}}};
  const tools = [protocol.tools.find(tool => tool.function.name === "read_world"), custom];
  const result = protocol.forModel(tools);
  assert.deepEqual(result.map(tool => tool.function.name), ["read_world", "visit_place"]);
  assert.deepEqual(result[1], custom); assert.deepEqual(protocol.forModel([]), []);
});

test("the shortest native delivery takes one model response and requires no draft or inspection", async () => {
  let turns = 0;
  const result = await createGameHarness(options({model: async request => {
    turns++; assert.deepEqual(request.tools, protocol.modelTools);
    return calls([["deliver_story", {story: story("营门渐开，守卒示意你上前。") }]]);
  }}));
  assert.equal(turns, 1); assert.equal(result.harness.toolCalls, 1);
  assert.equal(finalStory(result).beats[0].text, "营门渐开，守卒示意你上前。");
});

test("one phrase shows a popup with default placement and produces only a concise acknowledgement", async () => {
  let turns = 0;
  const result = await createGameHarness(options({model: async request => {
    if (++turns === 1) return calls([["show_illustration", {token: "后金·骑军突击"}]]);
    assert.deepEqual(JSON.parse(request.messages.at(-1).content), {ok: true});
    return calls([["deliver_story", {story: story("骑军朝关口突进，胜负尚未分明。") }]]);
  }}));
  assert.deepEqual(finalStory(result).stage_effects, [{name: "show_illustration", params: {id: "qing_cavalry_charge", afterBeat: 1, caption: ""}}]);
});

test("minimal search, paging and direct selection work without IDs, duplicate rules or advanced filters", async () => {
  let turns = 0, selected, count = 0;
  const seen = new Set();
  const result = await createGameHarness(options({model: async request => {
    turns++;
    if (turns === 1) return calls([["search_illustrations", {query: "军"}]]);
    const returned = JSON.parse(request.messages.at(-1).content);
    assert.equal(returned.ok, true);
    assert.equal(returned.selectionRule, undefined); assert.equal(returned.illustrations, undefined);
    if (returned.images) {
      assert.ok(returned.images.length > 0 && returned.images.length <= 8);
      for (const image of returned.images) {
        assert.equal(image.id, undefined); assert.equal(image.relativePath, undefined);
        assert.ok(image.token && image.description); assert.ok(!seen.has(image.token));
        seen.add(image.token); count++;
      }
      selected ||= returned.images[0].token;
      if (returned.nextPage) return calls([["search_illustrations", {query: "军", page: returned.nextPage}]]);
      return calls([["show_illustration", {token: selected}], ["set_scene_background", {token: "后金·关隘烽火"}]]);
    }
    return calls([["deliver_story", {story: story("军报送至案头，众人仍在等待。") }]]);
  }}));
  assert.equal(count, (await registry.search({query: "军"})).total);
  const effects = finalStory(result).stage_effects;
  assert.ok(effects.some(effect => effect.name === "show_illustration" && effect.params.id === registry.resolve(selected).id));
  assert.ok(effects.some(effect => effect.name === "set_scene_background" && effect.params.id === "qing_frontier_pass"));
});

test("search replies retain suitability and avoidance guidance without mutating registry data", async () => {
  const raw = {ok: true, ...(await registry.search({query: "骑兵 冲锋"})), selectionRule: "internal guidance"};
  const before = structuredClone(raw), compact = protocol.modelResult("search_illustrations", raw);
  assert.deepEqual(compact.images[0].useWhen, raw.illustrations[0].useWhen);
  assert.deepEqual(compact.images[0].avoidWhen, raw.illustrations[0].avoidWhen);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(JSON.stringify(raw)));
  assert.deepEqual(raw, before);
  const empty = protocol.modelResult("search_illustrations", {ok: true, illustrations: []});
  assert.match(empty.hint, /browse_illustrations/);
});

test("rejected ambiguous clear commands do not mutate earlier background or popup selections", async () => {
  const host = await createPluginHost(options({context: {illustrationCatalog: registry.snapshot()}}));
  try {
    await host.invoke("show_illustration", {token: "后金·骑军突击"});
    const invalid = (await host.invoke("show_illustration", {token: "后金·夜袭营垒", clear: true})).result;
    assert.equal(invalid.ok, false);
    const selected = (await host.invoke("show_illustration", {token: "后金·夜袭营垒", afterBeat: 2})).result;
    assert.deepEqual(selected.selections.map(selection => selection.id), ["qing_cavalry_charge", "qing_night_raid"]);
    await host.invoke("set_scene_background", {token: "后金·关隘烽火"});
    assert.equal((await host.invoke("set_scene_background", {token: "后金·山川军图", clear: true})).result.ok, false);
    assert.equal((await host.invoke("set_scene_background", {clear: true})).result.backgroundChange.clear, true);
    assert.deepEqual((await host.invoke("show_illustration", {clear: true})).result.selections, []);
    assert.equal((await host.invoke("search_illustrations", {})).result.ok, false);
  } finally {host.dispose();}
});

test("native clear, background and popup changes stay independent through final delivery", async () => {
  let turns = 0;
  const result = await createGameHarness(options({model: async () => {
    if (++turns === 1) return calls([
      ["set_scene_background", {token: "后金·关隘烽火"}],
      ["show_illustration", {token: "后金·骑军突击"}], ["show_illustration", {clear: true}],
      ["show_illustration", {token: "后金·夜袭营垒", afterBeat: 0}],
      ["set_scene_background", {clear: true}], ["deliver_story", {story: story("营栅后仍有动静。") }]
    ]);
    assert.fail("direct delivery should not require another model call");
  }}));
  assert.deepEqual(finalStory(result).stage_effects, [
    {name: "set_scene_background", params: {clear: true}},
    {name: "show_illustration", params: {id: "qing_night_raid", afterBeat: 0, caption: ""}}
  ]);
});

test("an invalid direct delivery keeps the previous draft available for correction", async () => {
  const host = await createPluginHost(options({context: {}}));
  try {
    await host.invoke("write_draft", {story: story("上一份有效草稿。")});
    assert.equal((await host.invoke("deliver_story", {story: {beats: []}})).result.ok, false);
    assert.equal((await host.invoke("deliver_story", {story: story("不该追加。"), mode: "append"})).result.ok, false);
    assert.equal((await host.invoke("read_draft", {})).result.story.beats[0].text, "上一份有效草稿。");
    assert.equal((await host.invoke("deliver_story", {})).delivery.beats[0].text, "上一份有效草稿。");
  } finally {host.dispose();}
});

test("cancelling after the canonical popup call discards its draft and prevents direct delivery", async () => {
  const controller = new AbortController(); let delivered = false;
  await assert.rejects(createGameHarness(options({signal: controller.signal,
    onEvent(event) {
      if (event.type === "tool_end" && event.tool === "show_illustration") controller.abort();
      if (event.type === "delivered") delivered = true;
    },
    model: async () => calls([["show_illustration", {token: "后金·骑军突击"}], ["deliver_story", {story: story("不应交付。") }]])
  })), error => error.code === "request_cancelled");
  assert.equal(delivered, false);
  const fresh = await createGameHarness(options({model: async () => calls([["deliver_story", {story: story("新的独立回合。") }]])}));
  assert.deepEqual(finalStory(fresh).stage_effects, []);
});

test("empty native delivery returns an actionable error and invalid reference guidance uses the public API", async () => {
  const host = await createPluginHost(options({context: {illustrationCatalog: registry.snapshot()}}));
  try {
    const empty = (await host.invoke("deliver_story", {})).result;
    assert.equal(empty.error.code, "missing_draft"); assert.match(empty.error.message, /deliver_story\(\{story:/);
    const unknown = protocol.modelResult("show_illustration", (await host.invoke("show_illustration", {token: "未登记"})).result);
    assert.equal(unknown.error.code, "unknown_illustration"); assert.match(unknown.error.message, /search_illustrations/);
    assert.doesNotMatch(unknown.error.message, /旧id|list_illustrations/);
  } finally {host.dispose();}
});

test("JSON and native effects agree on clearing and reject conflicting background arguments", () => {
  const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {currentFaction: "qing", pendingIllustrationSelections: []});
  const effect = params => ({name: "show_illustration", params});
  const effects = [effect({token: "后金·骑军突击"}), effect({clear: true}), effect({token: "后金·夜袭营垒"})];
  engine.executeAITools(effects);
  assert.deepEqual(engine.pendingIllustrationSelections.map(selection => selection.id), ["qing_night_raid"]);
  assert.equal(registry.compose([{text: "正文。"}], engine.illustrationSelectionsFromEffects(effects)).beats[1].illustrationData.id, "qing_night_raid");
  assert.deepEqual(engine.illustrationSelectionsFromEffects([effect({token: "后金·夜袭营垒"}), effect({clear: true})]), []);
  assert.equal(engine.setSceneBackground({token: "后金·关隘烽火"}), true);
  assert.equal(engine.setSceneBackground({token: "后金·山川军图", clear: true}), false);
  assert.equal(engine.stageBackground.id, "qing_frontier_pass");
});
