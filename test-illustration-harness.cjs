// Real isolated Workers with deterministic model fixtures; no external API calls.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const protocol = require("./harness/protocol.js");
const {createGameHarness, createPluginHost} = require("./harness/runtime.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");

const baseURL = pathToFileURL(path.join(__dirname, "harness", path.sep)).href;
const assets = [
  {id: "qing_prisoner_escort", title: "押解途中", faction: "qing", relativePath: "data/illustrations/qing/scenes/qing_prisoner_escort.webp",
    category: "captivity", categoryName: "囚禁", description: "雪路上的成年战俘与护卫。", tags: ["押解", "囚犯"], useWhen: ["押解途中"], avoidWhen: ["已经获释"]},
  {id: "qing_holding_cell", title: "狱中长夜", faction: "qing", relativePath: "data/illustrations/qing/scenes/qing_holding_cell.webp",
    category: "captivity", categoryName: "囚禁", description: "北地羁押房舍。", tags: ["囚室", "夜晚"], useWhen: ["狱中"], avoidWhen: []},
  {id: "qing_night_raid", title: "夜袭营垒", faction: "qing", relativePath: "data/illustrations/qing/scenes/qing_night_raid.webp",
    category: "war", categoryName: "战争", description: "夜色中的军营。", tags: ["战争", "夜袭"], useWhen: ["营垒夜袭"], avoidWhen: []},
  {id: "ming_frontier", title: "明军边城", faction: "ming", relativePath: "data/illustrations/ming/frontier.webp",
    category: "place", description: "边城长街。", tags: ["边城"], useWhen: ["明军边城"], avoidWhen: []}
];
const messages = [{role: "system", content: "稳定叙事规则"}, {role: "user", content: "查清押解途中发生的事"}];
const narrative = text => ({beats: [{type: "narrator", speaker: "旁白", text}], choices: [{text: "继续调查"}]});
const completion = story => ({model: "fixture", choices: [{finish_reason: "stop", message: {role: "assistant", content: JSON.stringify(story)}}]});
const calls = specs => ({model: "fixture", choices: [{finish_reason: "tool_calls", message: {role: "assistant", content: null,
  tool_calls: specs.map((spec, index) => ({id: "illustration_call_" + index, type: "function",
    function: {name: spec.name, arguments: JSON.stringify(spec.args || {})}}))}}]});
function options(extra = {}) {
  return {baseURL, workerFactory: createNodeWorkerFactory(), messages: structuredClone(messages),
    world: {faction: "qing", currentScene: {title: "押解途中"}}, illustrations: structuredClone(assets), ...extra};
}
const storyOf = result => JSON.parse(result.data.choices[0].message.content);
const imageEffects = story => story.stage_effects.filter(effect => effect.name === "show_illustration");
const backgroundEffects = story => story.stage_effects.filter(effect => effect.name === "set_scene_background");
async function createHost() {
  return createPluginHost(options({context: {world: {faction: "qing"}, illustrations: structuredClone(assets)}}));
}

test("default workers register distinct stable illustration and story tools", async () => {
  const host = await createHost();
  try {
    assert.deepEqual(host.tools, protocol.tools);
    const listed = await host.invoke("list_illustrations", {query: "押解"});
    assert.equal(listed.result.ok, true);
    assert.deepEqual(listed.result.illustrations.map(item => item.id), ["qing_prisoner_escort"]);
    assert.match(JSON.stringify(listed.result.illustrations), /押解途中/);
    const all = await host.invoke("list_illustrations", {});
    assert.equal(all.result.illustrations.length, 4);
    assert.ok(all.result.illustrations.some(item => item.faction === "ming"), "player faction must not hide other scene settings");
    const ming = await host.invoke("list_illustrations", {faction: "ming"});
    assert.deepEqual(ming.result.illustrations.map(item => item.id), ["ming_frontier"]);
    const inspected = await host.invoke("inspect_draft", {}).then(output => output.result);
    assert.equal(inspected.hasDraft, false); assert.equal(inspected.beatCount, 0);
  } finally {host.dispose();}
});

test("selection uses exact IDs, distinct slots, replacement and explicit clear without mutating on errors", async () => {
  const host = await createHost();
  const select = args => host.invoke("select_illustration", args).then(output => output.result);
  try {
    let selected = await select({id: "qing_prisoner_escort"});
    assert.equal(selected.ok, true); assert.equal(selected.selection.afterBeat, 1);
    selected = await select({id: "qing_holding_cell", afterBeat: 1, caption: "你听见门外的脚步。"});
    assert.deepEqual(selected.selections.map(item => item.id), ["qing_holding_cell"]);
    selected = await select({id: "qing_night_raid", afterBeat: 0});
    assert.deepEqual(selected.selections.map(item => item.afterBeat), [0, 1]);
    for (const args of [
      {id: "unknown_scene"}, {id: "https://example.com/image.webp"},
      {id: "qing_prisoner_escort", url: "https://example.com/image.webp"},
      {id: "qing_prisoner_escort", afterBeat: -1}, {id: "qing_prisoner_escort", afterBeat: 1.5},
      {id: "qing_prisoner_escort", caption: {text: "invalid"}}
    ]) {
      const rejected = await select(args);
      assert.equal(rejected.ok, false, JSON.stringify(args));
      assert.ok(rejected.error);
    }
    selected = await select({id: "qing_prisoner_escort", afterBeat: 7});
    assert.deepEqual(selected.selections.map(item => item.id), ["qing_night_raid", "qing_holding_cell", "qing_prisoner_escort"]);
    selected = await select({clear: true});
    assert.deepEqual(selected.selections, []);
  } finally {host.dispose();}
});

test("native selection is appended only to a successful final story after all calls in the delivery batch", async () => {
  let step = 0;
  const original = {...narrative("你凝神听着门外的脚步。"), stage_effects: [{name: "weather_effect", params: {type: "rain"}}]};
  const result = await createGameHarness(options({model: async request => {
    step++;
    if (step === 1) return calls([{name: "write_draft", args: {story: original}}]);
    assert.equal(step, 2);
    assert.deepEqual(request.tools, protocol.tools);
    return calls([{name: "deliver_story"}, {name: "select_illustration", args: {id: "qing_holding_cell", afterBeat: 0, caption: "门闩未动。"}},
      {name: "select_illustration", args: {id: "qing_prisoner_escort", afterBeat: 99}}]);
  }}));
  const story = storyOf(result);
  assert.equal(story.stage_effects[0].name, "weather_effect");
  assert.deepEqual(imageEffects(story).map(effect => ({id: effect.params.id, afterBeat: effect.params.afterBeat})),
    [{id: "qing_holding_cell", afterBeat: 0}, {id: "qing_prisoner_escort", afterBeat: 99}]);
  assert.deepEqual(story.beats.map(beat => beat.text), original.beats.map(beat => beat.text));
  assert.equal(result.harness.beatCount, 1);
});

test("selected art and a short manuscript deliver in one model call without length checks or forced expansion", async () => {
  let step = 0;
  const result = await createGameHarness(options({model: async () => {
    step++;
    assert.equal(step, 1, "the host cannot require a longer manuscript after a valid delivery");
    return calls([{name: "select_illustration", args: {id: "qing_holding_cell", caption: "插画说明".repeat(2000)}},
      {name: "write_draft", args: {story: narrative("门闩未动。")}}, {name: "deliver_story"}]);
  }}));
  assert.equal(step, 1); assert.equal(result.harness.beatCount, 1);
  assert.equal(result.harness.deliveryCharacters, undefined);
  assert.equal(result.harness.hanCharacters, undefined);
  assert.deepEqual(storyOf(result).beats.map(beat => beat.text), ["门闩未动。"]);
  assert.equal(imageEffects(storyOf(result)).length, 1);
  assert.deepEqual(backgroundEffects(storyOf(result)), [], "A popup selection cannot implicitly change the background");
});

test("background tool and popup selections retain independent state, validation and clears", async () => {
  const host = await createHost();
  const set = args => host.invoke("set_scene_background", args).then(output => output.result);
  const popup = args => host.invoke("select_illustration", args).then(output => output.result);
  try {
    assert.deepEqual((await set({id:"qing_night_raid"})).backgroundChange, {id:"qing_night_raid"});
    assert.deepEqual((await popup({id:"qing_holding_cell"})).selections.map(item => item.id), ["qing_holding_cell"]);
    for (const invalid of [{id:"unknown_scene"}, {id:"https://example.com/image.webp"}, {id:"qing_prisoner_escort", caption:"popup-only"}, {}]) {
      assert.equal((await set(invalid)).ok, false, JSON.stringify(invalid));
    }
    const clearedPopup = await popup({clear:true});
    assert.deepEqual(clearedPopup.selections, []);
    assert.deepEqual((await set({id:"qing_night_raid"})).backgroundChange, {id:"qing_night_raid"});
    await popup({id:"qing_holding_cell"});
    assert.deepEqual((await set({clear:true})).backgroundChange, {clear:true});
    assert.deepEqual((await popup({id:"qing_holding_cell"})).selections.map(item => item.id), ["qing_holding_cell"],
      "Clearing the background cannot clear popup selections");
  } finally {host.dispose();}
});

test("background-only delivery changes only the explicit background effect and preserves prose beats", async () => {
  const original = narrative("背景切换后，正文照常交付。");
  const result = await createGameHarness(options({model:async () => calls([
    {name:"set_scene_background", args:{id:"qing_night_raid"}},
    {name:"write_draft", args:{story:original}}, {name:"deliver_story"}
  ])}));
  const delivered = storyOf(result);
  assert.deepEqual(backgroundEffects(delivered), [{name:"set_scene_background", params:{id:"qing_night_raid"}}]);
  assert.deepEqual(imageEffects(delivered), []);
  assert.deepEqual(delivered.beats.map(beat => beat.text), original.beats.map(beat => beat.text));
});

test("one native delivery batch can request a background and a different popup after delivery", async () => {
  const result = await createGameHarness(options({model:async () => calls([
    {name:"write_draft", args:{story:narrative("各自负责自己的画面。")}}, {name:"deliver_story"},
    {name:"set_scene_background", args:{id:"qing_night_raid"}},
    {name:"select_illustration", args:{id:"qing_holding_cell", afterBeat:0}}
  ])}));
  assert.deepEqual(backgroundEffects(storyOf(result)), [{name:"set_scene_background", params:{id:"qing_night_raid"}}]);
  assert.deepEqual(imageEffects(storyOf(result)).map(effect => effect.params.id), ["qing_holding_cell"]);
});

test("popup clear leaves background change while background clear leaves popup selection", async () => {
  for (const clearTool of ["select_illustration", "set_scene_background"]) {
    const result = await createGameHarness(options({model:async () => calls([
      {name:"set_scene_background", args:{id:"qing_night_raid"}},
      {name:"select_illustration", args:{id:"qing_holding_cell"}},
      {name:clearTool, args:{clear:true}}, {name:"write_draft", args:{story:narrative("清除操作互不干扰。")}}, {name:"deliver_story"}
    ])}));
    const delivered = storyOf(result);
    assert.deepEqual(backgroundEffects(delivered), [{name:"set_scene_background",
      params:clearTool === "set_scene_background" ? {clear:true} : {id:"qing_night_raid"}}]);
    assert.equal(imageEffects(delivered).length, clearTool === "select_illustration" ? 0 : 1);
  }
});

test("cancelled background and popup drafts cannot leak into the next independent request", async () => {
  const controller = new AbortController();
  await assert.rejects(createGameHarness(options({signal:controller.signal,
    onEvent(event) {if (event.type === "tool_end" && event.tool === "set_scene_background") controller.abort();},
    model:async () => calls([{name:"select_illustration", args:{id:"qing_holding_cell"}},
      {name:"write_draft", args:{story:narrative("这份草稿不会提交。")}}, {name:"deliver_story"},
      {name:"set_scene_background", args:{id:"qing_night_raid"}}])
  })), error => error.code === "request_cancelled");
  const next = await createGameHarness(options({model:async () => completion(narrative("新回合保留既有舞台。"))}));
  assert.deepEqual(backgroundEffects(storyOf(next)), []); assert.deepEqual(imageEffects(storyOf(next)), []);
});

test("clear selection before a valid compatibility delivery leaves no pending illustration", async () => {
  let step = 0;
  const result = await createGameHarness(options({model: async () => {
    step++;
    if (step === 1) return calls([{name: "select_illustration", args: {id: "qing_prisoner_escort"}}, {name: "select_illustration", args: {clear: true}}]);
    return completion(narrative("你把眼前的经过记在心中。"));
  }}));
  assert.deepEqual(imageEffects(storyOf(result)), []);
});

test("cancellation from the last tool notification cannot commit a successful draft or pending image", async () => {
  const controller = new AbortController();
  await assert.rejects(createGameHarness(options({signal: controller.signal,
    onEvent(event) {if (event.type === "tool_end" && event.tool === "select_illustration") controller.abort();},
    model: async () => calls([{name: "write_draft", args: {story: narrative("你已经听清了门外的争执。")}},
      {name: "deliver_story"}, {name: "select_illustration", args: {id: "qing_holding_cell"}}])
  })), error => error.code === "request_cancelled");
});

test("an optional illustration plugin startup failure does not prevent story delivery", async () => {
  let step = 0;
  const result = await createGameHarness(options({plugins: [
    {id: "world", url: new URL("plugins/world.js", baseURL).href},
    {id: "story", url: new URL("plugins/story.js", baseURL).href},
    {id: "illustrations", url: pathToFileURL(path.join(__dirname, "test", "fixtures", "harness-load-failure-plugin.js")).href}
  ], model: async request => {
    step++;
    assert.equal(request.tools.some(tool => tool.function.name === "select_illustration"), false);
    if (step === 1) return calls([{name: "select_illustration", args: {id: "qing_holding_cell"}}]);
    assert.equal(JSON.parse(request.messages.at(-1).content).ok, false);
    return completion(narrative("你仍能把眼前的事实逐一查明。"));
  }}));
  assert.equal(result.harness.modelCalls, 2);
  assert.deepEqual(imageEffects(storyOf(result)), []);
});

test("an illustration execution error is returned to the model while the story worker remains available", async () => {
  let step = 0;
  const result = await createGameHarness(options({illustrations: [{...assets[0], relativePath: "https://example.com/untrusted.webp"}],
    model: async request => {
      step++;
      if (step === 1) return calls([{name: "list_illustrations"}]);
      const error = JSON.parse(request.messages.at(-1).content);
      assert.equal(error.ok, false); assert.equal(error.error.code, "plugin_execution_failed");
      return completion(narrative("你仍能继续听取当事人的证词。"));
    }}));
  assert.equal(result.harness.modelCalls, 2);
  assert.deepEqual(imageEffects(storyOf(result)), []);
});

test("cancelled pending art is discarded and the next request has independent empty selection", async () => {
  const controller = new AbortController();
  let step = 0, waiting, terminated = 0;
  const reachedWait = new Promise(resolve => {waiting = resolve;});
  const pending = createGameHarness(options({signal: controller.signal, workerFactory: createNodeWorkerFactory({onTerminate() {terminated++;}}),
    model: async ({signal}) => {
      step++;
      if (step === 1) return calls([{name: "select_illustration", args: {id: "qing_holding_cell"}}]);
      waiting();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true}));
    }}));
  await reachedWait; controller.abort();
  await assert.rejects(pending, error => error.code === "request_cancelled");
  assert.equal(terminated, 3);
  const next = await createGameHarness(options({model: async () => completion(narrative("你开始另一段完全独立的调查。"))}));
  assert.deepEqual(imageEffects(storyOf(next)), []);
});
