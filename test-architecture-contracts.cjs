// Contract and state-transition checks. Real worker threads; model responses are fixtures.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const effects = require("./harness/effects.js");
const contracts = require("./harness/contracts.js");
const protocol = require("./harness/protocol.js");
const registry = require("./illustration-system.js");
const {createPluginHost, createGameHarness} = require("./harness/runtime.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");
const {WebVisualNovelEngine} = require("./app.js");
const baseURL = pathToFileURL(path.join(__dirname, "harness", path.sep)).href;
const fixtureURL = pathToFileURL(path.join(__dirname, "test/fixtures/harness-contract-plugin.js")).href;
const options = extra => ({baseURL, workerFactory: createNodeWorkerFactory(), messages: [{role: "user", content: "查验军报"}],
  illustrationCatalog: registry.snapshot(), ...extra});
const story = stage_effects => ({beats: [{text: "军报仍待核实。"}], stage_effects});
const calls = list => ({choices: [{finish_reason: "tool_calls", message: {tool_calls: list.map(([name, args], i) => ({
  id: "contract_" + i, type: "function", function: {name, arguments: JSON.stringify(args)}
}))}}]});
const readStory = result => JSON.parse(result.data.choices[0].message.content);
const image = (token, afterBeat = 1) => ({name: "show_illustration", params: {token, afterBeat}});
const background = token => ({name: "set_scene_background", params: {token}});
const popupClear = {name: "show_illustration", params: {clear: true}};
const backgroundClear = {name: "set_scene_background", params: {clear: true}};

test("tool declarations close story objects and replace the untyped effect bag with registered primitives", () => {
  const schema = protocol.modelTools.find(t => t.function.name === "deliver_story").function.parameters.properties.story;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.beats.items.additionalProperties, false);
  assert.equal(schema.properties.choices.items.additionalProperties, false);
  const effect = schema.properties.stage_effects.items;
  assert.deepEqual(effect.properties.name.enum, ["screen_flash", "screen_shake", "weather_effect"]);
  assert.equal(effect.additionalProperties, false);
  assert.equal(effect.properties.params.additionalProperties, false);
  assert.equal(contracts.issue({beats: [{text: "正文"}], invented: true}, schema), "args.invented 不是可用参数。");
});

test("legacy story normalization projects explicit fields and cannot carry arbitrary choice state or stage classes", () => {
  const output = protocol.normalizeStory({beats: [{text: "正文", type: "invented-class", stageChar: "outside", privateState: true}],
    choices: [{text: "查验", tag: "审慎", privateState: {extra: true}, bias: {authority: 1, cognition: "5", extra: 10}, diceBase: 9,
      isConvergence: true, targetNodeId: "ming_act1"}], privateState: true});
  assert.equal(output.beats[0].type, "narrator"); assert.equal(output.beats[0].stageChar, "center");
  assert.equal(output.privateState, undefined); assert.equal(output.beats[0].privateState, undefined);
  assert.equal(output.choices[0].privateState, undefined);
  assert.deepEqual(output.choices[0].bias, {authority: 1, pragmatism: 0, progress: 0, cognition: 0});
  assert.equal(output.choices[0].diceBase, 9); assert.equal(output.choices[0].targetNodeId, "ming_act1");
});

test("every host tool enforces its envelope before posting a call to a worker", async () => {
  const posted = [];
  const host = await createPluginHost(options({workerFactory: createNodeWorkerFactory({onPostMessage: message => {
    if (message.type === "call") posted.push(message.name);
  }}), context: {world: {location: "城门"}}}));
  try {
    for (const [name, args] of [["read_world", {token: "无关字段"}], ["read_draft", {unexpected: true}],
      ["write_draft", {story: story([]), unknown: true}], ["write_draft", {story: story([]), mode: "merge"}],
      ["show_illustration", {token: "后金·骑军突击", afterBeat: 0.5}], ["search_illustrations", {query: "军", page: Infinity}]]) {
      assert.equal((await host.invoke(name, args)).result.ok, false, name);
    }
    assert.deepEqual(posted, []);
    assert.equal((await host.invoke("read_draft", {})).result.story, null);
    assert.equal((await host.invoke("read_world", {})).result.world.location, "城门");
  } finally {host.dispose();}
});

test("custom tool schemas enforce nested objects, enums, arrays and finite safe integers without coercion", async () => {
  const host = await createPluginHost(options({plugins: [{id: "contract", url: fixtureURL}]}));
  try {
    const valid = {payload: {mode: "read", values: [0, 1]}};
    assert.deepEqual((await host.invoke("echo_typed", valid)).result.payload, valid.payload);
    for (const payload of [{mode: "other", values: [0]}, {mode: "read", values: []}, {mode: "read", values: ["1"]},
      {mode: "read", values: [Number.MAX_SAFE_INTEGER + 1]}, {mode: "read", values: [0], extra: 1}, {mode: "read"}]) {
      assert.equal((await host.invoke("echo_typed", {payload})).result.error.code, "invalid_tool_arguments");
    }
    assert.deepEqual(valid, {payload: {mode: "read", values: [0, 1]}});
  } finally {host.dispose();}
});

test("built-in workers receive only their declared data and custom context projections are explicit", async () => {
  const contexts = new Map();
  const host = await createPluginHost(options({context: {world: {location: "城门"}, illustrations: [],
    illustrationCatalog: registry.snapshot(), illustrationBaseURL: "https://game.example/", unrelated: "unused"},
    workerFactory: createNodeWorkerFactory({onPostMessage: message => {
      if (message.type === "init") contexts.set(new URL(message.url).pathname.split("/").at(-1), Object.keys(message.context).sort());
    }})}));
  host.dispose();
  assert.deepEqual(contexts.get("world.js"), ["world"]);
  assert.deepEqual(contexts.get("story.js"), []);
  assert.deepEqual(contexts.get("illustrations.js"), ["illustrationBaseURL", "illustrationCatalog", "illustrations"]);
  const custom = await createPluginHost(options({plugins: [{id: "custom", url: fixtureURL, contextKeys: ["world"]}],
    context: {world: {location: "城门"}, unrelated: "not for this plugin"}}));
  try {assert.deepEqual((await custom.invoke("inspect_context", {})).result.context, {world: {location: "城门"}});}
  finally {custom.dispose();}
});

test("only the registered delivery operation can submit a story, and malformed receipts cannot deliver", async () => {
  let turns = 0;
  const result = await createGameHarness(options({plugins: [{id: "world", url: fixtureURL},
    {id: "story", url: new URL("plugins/story.js", baseURL).href}], model: async () => {
    if (++turns === 1) return calls([["read_world", {}], ["invalid_receipt", {}]]);
    return calls([["deliver_story", {story: {beats: [{text: "这是经过交付工具的正文。"}]}}]]);
  }}));
  assert.equal(turns, 2);
  assert.equal(readStory(result).beats[0].text, "这是经过交付工具的正文。");
});

test("a missing delivery plugin fails before starting a model request and disposes workers", async () => {
  let requested = 0, disposed = 0;
  await assert.rejects(createGameHarness(options({plugins: [{id: "world", url: new URL("plugins/world.js", baseURL).href}],
    workerFactory: createNodeWorkerFactory({onTerminate() {disposed++;}}), model: async () => {requested++;}})), /delivery_unavailable/);
  assert.equal(requested, 0); assert.ok(disposed > 0);
});

test("effect normalization rejects unknown operations, wrong primitives and conflicting clear commands", () => {
  const invalid = [{name: "anything_at_all"}, {name: "constructor"}, {name: "screen_flash", params: 5},
    {name: "screen_flash", params: {color: "rainbow"}}, {name: "screen_flash", params: {color: "red", extra: 1}},
    {name: "screen_shake", params: {duration: -1}}, {name: "screen_shake", params: {duration: Infinity}},
    {name: "weather_effect", params: {type: "rain", intensity: "heavy"}}, {name: "danger_tick", params: {delta: NaN}},
    {name: "grant_item", params: {name: "军报", power: "100"}}, {name: "grant_item", params: {name: "军报", aspects: [5]}},
    {name: "show_illustration", params: {clear: true, token: "后金·骑军突击"}},
    {name: "show_illustration", params: {token: "https://unregistered.example/picture.jpg"}}];
  for (const effect of invalid) assert.equal(effects.normalize(effect, registry).ok, false, JSON.stringify(effect));
  const result = effects.normalizeAll([...invalid, {name: "screen_flash", params: {color: "gold"}}], registry);
  assert.equal(result.effects.length, 1); assert.equal(result.warnings.length, invalid.length);
  assert.deepEqual(protocol.normalizeStory(story(invalid)).stage_effects, [], "optional effect failures retain valid prose");
});

test("native clear suppresses stale inline popups in either call order in a delivery batch", async () => {
  const inline = [image("后金·骑军突击"), background("后金·关隘烽火"), {name: "screen_flash", params: {color: "gold"}}];
  for (const reverse of [false, true]) {
    const batch = [["show_illustration", {clear: true}], ["deliver_story", {story: story(inline)}]];
    const result = await createGameHarness(options({model: async () => calls(reverse ? batch.reverse() : batch)}));
    const delivered = readStory(result).stage_effects;
    assert.equal(delivered.some(effect => effects.mediaChannel(effect.name) === "popups"), false);
    assert.equal(delivered.some(effect => effect.name === "set_scene_background"), true);
    assert.equal(delivered.some(effect => effect.name === "screen_flash"), true);
  }
});

test("native replacement owns only its channel and leaves the other inline channel intact", async () => {
  const inline = [image("后金·骑军突击", 0), image("后金·夜袭营垒", 2), background("后金·关隘烽火")];
  const result = await createGameHarness(options({model: async () => calls([
    ["show_illustration", {token: "后金·夜袭营垒", afterBeat: 1}], ["deliver_story", {story: story(inline)}]
  ])}));
  const plan = effects.planMedia(readStory(result).stage_effects, registry);
  assert.deepEqual(plan.popups.map(popup => [popup.id, popup.afterBeat]), [["qing_night_raid", 1]]);
  assert.equal(plan.background.id, "qing_frontier_pass");
  const clearedBackground = await createGameHarness(options({model: async () => calls([
    ["set_scene_background", {clear: true}], ["deliver_story", {story: story(inline)}]
  ])}));
  const other = effects.planMedia(readStory(clearedBackground).stage_effects, registry);
  assert.equal(other.popups.length, 2); assert.deepEqual(other.background, {clear: true});
});

test("legacy image names and canonical tokens share the same validated media reducer", () => {
  const old = [{tool: "qing_war", params: {description: "军报"}}];
  const plan = effects.planMedia(old, registry);
  assert.deepEqual(plan.popups, [{id: registry.resolve("qing_war").id, afterBeat: 1, caption: "军报"}]);
  const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {pendingIllustrationSelections: []});
  engine.executeAITools(old);
  assert.deepEqual(engine.pendingIllustrationSelections, plan.popups);
  assert.deepEqual(engine.illustrationSelectionsFromEffects(old), plan.popups);
});

test("bounded exhaustive media transitions preserve independence, replacement and deterministic replay", () => {
  const commands = [image("后金·骑军突击", 0), image("后金·夜袭营垒", 0), image("后金·夜袭营垒", 1), popupClear,
    background("后金·关隘烽火"), backgroundClear].map(value => effects.normalize(value, registry).effect);
  let checked = 0;
  function explore(state, depth) {
    checked++;
    const before = structuredClone(state);
    for (const command of commands) {
      const next = effects.reduceMedia(state, command);
      assert.deepEqual(state, before, "transition must not mutate its input");
      assert.deepEqual(effects.reduceMedia(state, command), next, "deterministic replay");
      assert.deepEqual(effects.reduceMedia(next, command), next, "same assignment is idempotent");
      assert.equal(new Set(next.popups.map(p => p.afterBeat)).size, next.popups.length);
      assert.deepEqual(next.popups.map(p => p.afterBeat), next.popups.map(p => p.afterBeat).sort((a, b) => a - b));
      if (command.name === "show_illustration") {
        assert.deepEqual(next.background, state.background);
        assert.equal(next.backgroundTouched, state.backgroundTouched);
      } else {
        assert.deepEqual(next.popups, state.popups);
        assert.equal(next.popupsTouched, state.popupsTouched);
      }
      if (depth > 0) explore(next, depth - 1);
    }
  }
  explore(effects.emptyMedia(), 3);
  assert.equal(checked, 259); // 1 + 6 + 36 + 216 states, checking 1,554 outgoing transitions.
  for (const popup of commands.slice(0, 4)) for (const bg of commands.slice(4)) {
    const start = effects.emptyMedia();
    assert.deepEqual(effects.reduceMedia(effects.reduceMedia(start, popup), bg), effects.reduceMedia(effects.reduceMedia(start, bg), popup));
  }
});
