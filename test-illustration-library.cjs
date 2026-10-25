// Behavioral coverage for the shared gallery registry and real isolated AI Workers.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createServer} = require("node:http");
const registry = require("./illustration-system.js");
const catalog = require("./data/illustrations/catalog.json");
const compact = require("./data/illustrations/catalog-index.js");
const {createPluginHost, createGameHarness} = require("./harness/runtime.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");
const {WebVisualNovelEngine} = require("./app.js");

test("exact phrases, authored synonyms and old IDs resolve to one immutable identity", () => {
  for (const asset of catalog.assets) {
    for (const token of [asset.id, asset.token, ...asset.tokenAliases]) {
      assert.equal(registry.resolve(token).id, asset.id);
      assert.equal(registry.normalizeSelection({token}).selection.id, asset.id);
    }
  }
  assert.equal(registry.resolve(" 后金·骑兵冲锋 ").id, "qing_cavalry_charge");
  assert.equal(registry.resolve("骑兵冲锋"), null, "resolution does not guess a faction or approximate a phrase");
  assert.equal(registry.reference({id: "qing_campaign_map", token: "后金·骑军突击"}).error.code, "illustration_reference_conflict");
  assert.equal(registry.reference({id: "qing_campaign_map", token: "不存在"}).ok, false);
  const assets = catalog.assets.slice(0, 2).map(asset => ({...asset, token: "重复短语", tokenAliases: []}));
  assert.throws(() => registry.createRegistry({assets}), /invalid_illustration_token/);
  assert.throws(() => registry.createRegistry({assets: [{...assets[0], token: assets[1].id}, {...assets[1], token: "其他短语"}]}), /invalid_illustration_token/);
  const copied = registry.snapshot(); copied.assets[0].token = "changed";
  assert.notEqual(registry.resolve(catalog.assets[0].id).token, "changed");
});

test("classification exposes one level, accurate subtree counts and exact leaf images", () => {
  const root = registry.browse();
  assert.equal(root.total, 50); assert.equal(root.illustrations.length, 0);
  assert.equal(root.children.reduce((sum, child) => sum + child.count, 0), root.total);
  assert.deepEqual(new Set(root.children.map(child => child.name)), new Set(["环境", "事件", "人物关系", "物件"]));
  assert.ok(registry.browse({path: "事件"}).children.some(child => child.path === "事件/军事行动"));
  const leaf = registry.browse({path: "事件/军事行动/骑兵突击"});
  assert.deepEqual(leaf.children, []);
  assert.ok(leaf.illustrations.some(asset => asset.token === "后金·骑军突击"));
  assert.ok(leaf.illustrations.some(asset => asset.faction === "mongol"));
  const filtered = registry.browse({path: leaf.path, faction: "qing"});
  assert.equal(filtered.total, 1); assert.equal(filtered.illustrations[0].id, "qing_cavalry_charge");
  assert.equal(registry.browse({path: "未登记的分类"}).total, 0);
  assert.equal(registry.browse({includeLegacy: true}).total, 56);
});

test("phrase separators share one identity and ambiguous normalized tokens fail registration", () => {
  for (const token of ["后金 盛京宫庭", "后金　盛京宫庭", "后金 ・ 盛京宫庭", "后金•盛京宫庭", "  后金  盛京宫庭  "]) {
    assert.equal(registry.resolve(token).id, "qing_shengjing_palace", token);
    assert.equal(registry.normalizeSelection({token}).selection.id, "qing_shengjing_palace");
    assert.equal(registry.resolve(token).token, "后金·盛京宫庭", "Results retain the authored canonical phrase");
  }
  assert.equal(registry.resolve("盛京宫庭"), null, "The faction remains part of the identity");
  assert.equal(registry.resolve("后金·盛京宫殿"), null, "Different wording needs search or an authored synonym");
  const assets = catalog.assets.slice(0, 2).map((asset, index) => ({...asset,
    token:index ? "同一 图片" : "同一·图片", tokenAliases:[]}));
  assert.throws(() => registry.createRegistry({assets}), /invalid_illustration_token/);
  assets[1].token = "另一张图";
  assets[1].tokenAliases = ["同一・图片"];
  assert.throws(() => registry.createRegistry({assets}), /invalid_illustration_token/);
});

test("the model sees a small contextual selection instead of the entire image directory", () => {
  const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    currentFaction: "qing", currentCoords: "qing:mukden", expectedLength: 500, apiHistory: [],
    ideologyVector: {authority: 0, pragmatism: 0, progress: 0, cognition: 0}
  });
  const payload = engine.buildDeepSeekCachePayload({text: "在此观察", diceBase: 8}, 3, 4, 9, true);
  const system = payload.messages[0].content;
  const exposed = system.split("本轮少量精选")[1].split("4. 行动抉择")[0];
  const count = [...exposed.matchAll(/\* [^\n]+:/g)].length;
  assert.ok(count > 0 && count <= 6);
  assert.match(exposed, /后金·盛京宫庭/);
  assert.doesNotMatch(exposed, /后金·屠村余火|relativePath|webSha256/);
  assert.match(system, /search_illustrations/); assert.match(system, /browse_illustrations/);
  const capital = registry.featured({faction: "qing", coords: "qing:mukden"}).map(asset => asset.id);
  const frontier = registry.featured({faction: "qing", coords: "shanhaiguan:pass"}).map(asset => asset.id);
  assert.notDeepEqual(capital, frontier);
  assert.ok(frontier.includes("qing_siege"));
});

test("ranked multi-keyword search paginates without dropping candidates or leaking paths", async () => {
  const exact = await registry.search({query: "后金·骑兵冲锋"});
  assert.equal(exact.illustrations[0].id, "qing_cavalry_charge");
  const combined = await registry.search({query: "骑兵 冲锋"});
  assert.ok(combined.illustrations.some(asset => asset.id === "qing_cavalry_charge"));
  assert.ok(combined.illustrations.every(asset => !asset.legacy));
  assert.doesNotMatch(JSON.stringify(combined), /relativePath|webSha256|data\/illustrations/);
  const ids = [], seen = new Set(); let page = 1;
  while (page) {
    const result = await registry.search({page, pageSize: 7});
    assert.equal(result.total, 50); assert.ok(result.count <= 7);
    for (const asset of result.illustrations) {assert.ok(!seen.has(asset.id)); seen.add(asset.id); ids.push(asset.id);}
    page = result.nextPage;
  }
  assert.deepEqual(ids, registry.list().map(asset => asset.id));
  const filtered = await registry.search({query: "军图", faction: "qing", path: "物件"});
  assert.ok(filtered.illustrations.some(asset => asset.id === "qing_campaign_map"));
  await assert.rejects(registry.search({pageSize: 0}), /invalid_illustration_page/);
});

test("compact boot, navigation, curation and direct selection require no downloads", async () => {
  const requests = [];
  const lazy = registry.createRegistry({...compact, loadJSON: async filename => {
    requests.push(filename);
    assert.match(filename, /\.json$/);
    return JSON.parse(await fs.readFile(path.join(__dirname, filename), "utf8"));
  }});
  lazy.browse(); lazy.browse({path: "事件/军事行动"});
  assert.ok(lazy.featured({faction: "qing", limit: 6}).length <= 6);
  assert.equal(lazy.normalizeSelection({token: "后金·骑军突击"}).selection.id, "qing_cavalry_charge");
  assert.deepEqual(requests, []);
  const [one, two] = await Promise.all([lazy.search({query: "骑兵 冲锋"}), lazy.search({query: "骑兵 冲锋"})]);
  assert.deepEqual(one, two);
  assert.equal(requests.filter(filename => /\/search-[a-f0-9]+\.json$/.test(filename)).length, 1);
  assert.equal(new Set(requests).size, requests.length, "concurrent metadata requests are deduplicated");
  assert.ok(!requests.some(filename => /details-ming|details-nanming/.test(filename)), "irrelevant faction details stay unloaded");
  assert.equal(one.illustrations[0].id, (await registry.search({query: "骑兵 冲锋"})).illustrations[0].id);
  const before = requests.length;
  await lazy.search({query: "骑兵 冲锋"});
  assert.equal(requests.length, before);
  for (const asset of catalog.assets) assert.equal(lazy.resolve(asset.token).id, registry.resolve(asset.token).id);
});

test("failed metadata can retry and lazy content cannot rewrite approved paths or tokens", async () => {
  let fail = true;
  const lazy = registry.createRegistry({...compact, loadJSON: async filename => {
    if (fail) {fail = false; throw new Error("offline");}
    const data = JSON.parse(await fs.readFile(path.join(__dirname, filename), "utf8"));
    if (data.assets) data.assets = data.assets.map(asset => ({...asset, relativePath: "https://unapproved.invalid/pic.webp", token: "偷偷改名"}));
    return data;
  }});
  await assert.rejects(lazy.search({query: "骑兵 冲锋"}), /offline/);
  assert.equal(lazy.resolve("后金·骑军突击").id, "qing_cavalry_charge");
  assert.ok((await lazy.search({query: "骑兵 冲锋"})).total > 0);
  assert.equal(lazy.resolve("后金·骑军突击").relativePath, registry.resolve("qing_cavalry_charge").relativePath);
  assert.equal(lazy.resolve("偷偷改名"), null);
});

test("real AI Worker resolves phrases and preserves aliases across the host boundary", async () => {
  const snapshot = registry.snapshot(); snapshot.aliases.compatible_map = "qing_campaign_map";
  const host = await createPluginHost({baseURL: pathToFileURL(path.join(__dirname, "harness", path.sep)).href,
    workerFactory: createNodeWorkerFactory(), context: {illustrationCatalog: snapshot}});
  try {
    const root = (await host.invoke("browse_illustrations", {})).result;
    assert.equal(root.ok, true); assert.equal(root.total, 50);
    const search = (await host.invoke("search_illustrations", {query: "骑兵 冲锋"})).result;
    assert.ok(search.illustrations.some(asset => asset.token === "后金·骑军突击"));
    assert.equal((await host.invoke("set_scene_background", {id: "compatible_map"})).result.backgroundChange.id, "qing_campaign_map");
    const selected = (await host.invoke("select_illustration", {token: "后金·骑兵冲锋"})).result;
    assert.equal(selected.selection.id, "qing_cavalry_charge");
    const spaced = (await host.invoke("show_illustration", {token: "后金 盛京宫庭"})).result;
    assert.equal(spaced.selection.id, "qing_shengjing_palace");
    const conflict = (await host.invoke("select_illustration", {token: "后金·夜袭营垒", id: "qing_campaign_map"})).result;
    assert.equal(conflict.ok, false);
    const reset = (await host.invoke("set_scene_background", {clear: true})).result;
    assert.deepEqual(reset.backgroundChange, {clear: true});
  } finally {host.dispose();}
});

test("native model tool loop fetches metadata under a Pages subpath and commits canonical IDs", async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push(req.url);
    if (!req.url.startsWith("/game/data/illustrations/library/")) {res.writeHead(404).end(); return;}
    try {res.setHeader("content-type", "application/json"); res.end(await fs.readFile(path.join(__dirname, req.url.slice(6))));}
    catch (_) {res.writeHead(404).end();}
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise(done => {server.closeAllConnections(); server.close(done);}));
  let step = 0;
  const toolReply = specs => ({choices: [{finish_reason: "tool_calls", message: {role: "assistant", content: null,
    tool_calls: specs.map((spec, i) => ({id: `${step}_${i}`, type: "function", function: {name: spec.name, arguments: JSON.stringify(spec.args)}}))}}]});
  const result = await createGameHarness({baseURL: pathToFileURL(path.join(__dirname, "harness", path.sep)).href,
    workerFactory: createNodeWorkerFactory(), messages: [{role: "user", content: "骑兵冲锋，给这一段配图。"}],
    illustrationCatalog: compact, illustrationBaseURL: `http://127.0.0.1:${server.address().port}/game/`,
    model: async request => {
      step++;
      if (step === 1) return toolReply([{name: "search_illustrations", args: {query: "骑兵 冲锋", faction: "qing"}}]);
      assert.ok(request.messages.some(message => message.role === "tool" && message.content.includes("后金·骑军突击")));
      if (step === 2) return toolReply([
        {name: "select_illustration", args: {token: "后金·骑军突击", afterBeat: 1}},
        {name: "set_scene_background", args: {token: "后金·关隘烽火"}},
        {name: "write_draft", args: {story: {beats: [{text: "骑兵向城下突进，胜负仍未分明。"}], choices: [{text: "观察城门"}]}}}
      ]);
      assert.equal(step, 3); return toolReply([{name: "deliver_story", args: {}}]);
    }});
  const story = JSON.parse(result.data.choices[0].message.content);
  assert.ok(story.stage_effects.some(effect => effect.name === "show_illustration" && effect.params.id === "qing_cavalry_charge"));
  assert.ok(story.stage_effects.some(effect => effect.name === "set_scene_background" && effect.params.id === "qing_frontier_pass"));
  assert.equal(requests.filter(url => /\/search-[a-f0-9]+\.json$/.test(url)).length, 1);
  assert.ok(requests.every(url => url.endsWith(".json")), "AI selection never downloads image files");
});

test("compatibility JSON effects resolve the same tokens and keep popup/background separate", () => {
  const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {currentFaction: "qing", pendingIllustrationSelections: []});
  engine.executeAITools([
    {name: "set_scene_background", params: {token: "后金·关隘烽火"}},
    {name: "show_illustration", params: {token: "后金·骑军突击", afterBeat: 1}}
  ]);
  assert.deepEqual(engine.stageBackground, {id: "qing_frontier_pass"});
  const composition = registry.compose([{text: "骑兵突进。"}], engine.pendingIllustrationSelections);
  assert.equal(composition.beats[1].illustrationData.id, "qing_cavalry_charge");
  const extracted = engine.illustrationSelectionsFromEffects([{name: "show_illustration", params: {token: "后金·夜袭营垒"}}]);
  assert.equal(registry.compose([{text: "夜色渐深。"}], extracted).beats[1].illustrationData.id, "qing_night_raid");
  assert.equal(engine.setSceneBackground({token: "未登记短语"}), false);
  assert.deepEqual(engine.stageBackground, {id: "qing_frontier_pass"});
});
