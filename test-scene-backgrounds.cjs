"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const registry = require("./illustration-system.js");
const catalog = require("./data/illustrations/catalog.json");
const world = require("./skills-data.js");
const batch = require("./docs/scene-background-batch-1.json");
const later = require("./docs/scene-background-batch-2.json");
const latest = require("./docs/scene-background-batch-3.json");
const completion = require("./docs/scene-background-batch-4.json");
const rebuilt = require("./docs/scene-background-batch-5.json");
// Restore batch 4 first: its historical audit remains strict and unchanged in scope.
const batch4Catalog = JSON.parse(JSON.stringify(catalog));
batch4Catalog.assets = batch4Catalog.assets.filter(a => !rebuilt.assets.some(n => n.id === a.id));
for (const edit of rebuilt.bindingChanges) batch4Catalog.scenes.nodes[edit.faction][edit.nodeId] = edit.previousAssetId;
const batch4Registry = registry.createRegistry(batch4Catalog);
const compact = require("./data/illustrations/catalog-index.js");
const {WebVisualNovelEngine} = require("./app.js");
const sha = data => crypto.createHash("sha256").update(data).digest("hex");

test("42 generated environments are unique, real WebP files and registered with exact phrases", () => {
  assert.equal(batch.assets.length, 42);
  assert.equal(new Set(batch.assets.map(a => a.webSha256)).size, 42);
  for (const asset of batch.assets) {
    const bytes = fs.readFileSync(asset.relativePath);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", asset.id);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", asset.id);
    assert.equal(bytes.length, asset.webBytes, asset.id);
    assert.equal(sha(bytes), asset.webSha256, asset.id);
    assert.equal(asset.dimensions.width, 1672, asset.id);
    assert.ok([940, 941].includes(asset.dimensions.height), asset.id);
    assert.equal(registry.resolve(asset.token).id, asset.id);
    assert.ok(asset.prompt.length > 100, asset.id);
  }
});

test("the first four acts have reviewed exact bindings, not blanket faction defaults", () => {
  for (const faction of ["ming", "mongol", "nanming"]) {
    const bindings = catalog.scenes.nodes[faction];
    assert.equal(Object.values(world.canonicalTrees[faction].nodes).filter(n => n.actNumber < 5 && bindings[n.id]).length, 40, faction);
    const expected = Object.values(world.canonicalTrees[faction].nodes).filter(node => node.actNumber < 5).map(node => node.id);
    assert.equal(expected.length, 40, faction);
    for (const nodeId of expected) {
      const asset = registry.sceneFor({faction, nodeId});
      assert.ok(asset, nodeId);
      assert.equal(asset.id, bindings[nodeId]);
      assert.ok(asset.relativePath.endsWith(".webp"), nodeId);
    }
  }
  assert.equal(registry.sceneFor({faction: "ming", nodeId: "ming_act3_b1"}).id, "qing_jh04_00");
  assert.equal(registry.sceneFor({faction: "ming", nodeId: "ming_act2_c"}).id,
    registry.sceneFor({faction: "nanming", nodeId: "nanming_act3_a2"}).id);
});

test("reviewed later scenes have evidence-backed bindings and preserve all old assets", () => {
  assert.equal(later.generatedCount, 76);
  assert.equal(later.assets.length, 76);
  assert.equal(later.reviewedBindingChanges, 1251);
  assert.equal(later.existingReuse.length, 4);
  assert.equal(later.totalExplicitlyBoundNodes, 1371);
  assert.equal(completion.sourceStorySha256, later.sourceStorySha256, "historical art-only baseline is preserved in the edit audit");
  assert.equal(new Set([...batch.assets, ...later.assets].map(a => a.webSha256)).size, 118);
  for (const asset of later.assets) {
    const bytes = fs.readFileSync(asset.relativePath);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", asset.id);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", asset.id);
    assert.equal(sha(bytes), asset.webSha256, asset.id);
    assert.equal(bytes.length, asset.webBytes, asset.id);
    assert.equal(asset.dimensions.width, 1672);
    assert.ok([940, 941].includes(asset.dimensions.height));
    assert.ok(asset.visualQA.passed && asset.prompt.length > 100, asset.id);
    assert.equal(registry.resolve(asset.token).id, asset.id);
    for (const nodeId of asset.sceneNodeIds) {
      assert.ok(world.canonicalTrees[asset.faction].nodes[nodeId], nodeId);
      assert.equal(registry.sceneFor({faction: asset.faction, nodeId}).id, asset.id, nodeId);
    }
  }
  for (const old of later.retainedExistingAssets) {
    const current = registry.resolve(old.id);
    assert.ok(current, old.id);
    assert.equal(current.relativePath, old.relativePath);
    if (old.webSha256) assert.equal(sha(fs.readFileSync(old.relativePath)), old.webSha256, old.id);
  }
  for (const change of later.bindingChanges) {
    assert.equal(catalog.scenes.nodes[change.faction][change.nodeId], change.assetId, change.nodeId);
  }
  for (const f of ["ming", "mongol", "nanming"]) {
    const nodes = Object.values(world.canonicalTrees[f].nodes).filter(n => n.actNumber >= 5);
    assert.equal(nodes.length, 324, f);
    assert.ok(nodes.every(n => registry.sceneFor({faction: f, nodeId: n.id})), f);
  }
  assert.ok(!Object.values(catalog.scenes.nodes).some(nodes => Object.values(nodes).includes("shared_bg_history_epilogue")));
});

test("the final 55 editorial decisions resolve exactly the historical pending set", () => {
  assert.equal(completion.generatedCount, 0, "reuse suitable art rather than claim new images");
  assert.deepEqual(completion.assets, []);
  assert.equal(completion.existingReuse.length, 2);
  assert.equal(completion.bindingChanges.length, 55);
  assert.equal(new Set(completion.bindingChanges.map(b => b.nodeId)).size, 55);
  assert.deepEqual(new Set(completion.bindingChanges.map(b => b.nodeId)),
    new Set(latest.pendingEditorial.map(n => n.nodeId)));
  assert.equal(completion.pendingEditorialCount, 0);
  assert.deepEqual(completion.pendingEditorial, []);
  for (const {faction, nodeId, assetId, previousAssetId} of completion.bindingChanges) {
    assert.equal(previousAssetId, null);
    assert.equal(batch4Catalog.scenes.nodes[faction][nodeId], assetId, nodeId);
    const node = world.canonicalTrees[faction].nodes[nodeId];
    assert.equal(batch4Registry.sceneFor({faction, nodeId, coords: node.coords}).id, assetId, nodeId);
  }
  assert.equal(Object.values(catalog.scenes.nodes).flatMap(nodes => Object.values(nodes)).filter(Boolean).length, 1456);
});

test("Qing endings follow real branch ancestry and keep three outcomes visually distinct", () => {
  const nodes = world.canonicalTrees.qing.nodes;
  const seen = new Set();
  for (const route of ["iron", "civil", "steppe"]) {
    const reachable = new Set();
    const walk = id => {
      if (reachable.has(id) || !nodes[id]) return;
      reachable.add(id);
      for (const c of nodes[id].choices || []) if (c.targetNodeId) walk(c.targetNodeId);
    };
    walk(`qing_act2_${route}`);
    for (const [theme, marker] of Object.entries({order: "高压中央集权", union: "包容、均权", fracture: "割据一隅"})) {
      const asset = later.assets.find(a => a.id === `qing_bg_ending_${route}_${theme}`);
      assert.equal(asset.sceneNodeIds.length, 27);
      for (const id of asset.sceneNodeIds) {
        assert.ok(reachable.has(id), id);
        assert.ok(nodes[id].desc.includes(marker), id);
        assert.ok(!seen.has(id), id); seen.add(id);
      }
    }
  }
  assert.equal(seen.size, 243);
});

test("all five actual maps have exact defaults and a map visit overrides an old story node", () => {
  for (const coords of Object.keys(world.thinMaps)) assert.ok(registry.sceneFor({coords}), coords);
  assert.equal(registry.sceneFor({coords: "mongol:steppe"}).id, "mongol_khan_council_tent");
  assert.equal(registry.sceneFor({coords: "nanming:maritime"}).id, "nanming_bg_fuzhou_palace");
  const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    currentFaction: "ming", currentStoryNodeId: "ming_act1", currentCoords: "jiangnan:mid", stageBackground: null
  });
  assert.equal(engine.getSceneIllustration().id, "ming_bg_fengqiao_canal");
});

test("compact browser and Worker scene bindings match the source catalog", () => {
  assert.deepEqual(compact.scenes, catalog.scenes);
  const compactRegistry = registry.createRegistry(compact);
  for (const faction of ["ming", "mongol", "nanming", "qing"]) for (const [nodeId, id] of Object.entries(catalog.scenes.nodes[faction])) {
    assert.equal(compactRegistry.sceneFor({faction, nodeId})?.id || null, id, nodeId);
  }
});

test("four third-batch environments resolve exactly 30 prior pending nodes and preserve original PNGs", () => {
  assert.equal(latest.assets.length, 4);
  assert.equal(latest.reviewedBindingChanges, 30);
  assert.equal(latest.totalExplicitlyBoundNodes, 1401);
  assert.equal(completion.sourceStorySha256, latest.sourceStorySha256);
  assert.equal(latest.sourceStorySha256, later.sourceStorySha256);
  assert.deepEqual(catalog.scenes.locations, latest.unchangedMapBindings);
  assert.equal(new Set([...batch.assets, ...later.assets, ...latest.assets].map(a => a.webSha256)).size, 122);
  const {publicPathAllowed} = require("./server.js");
  for (const asset of latest.assets) {
    const bytes = fs.readFileSync(asset.relativePath);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", asset.id);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", asset.id);
    assert.equal(sha(bytes), asset.webSha256, asset.id);
    assert.equal(bytes.length, asset.webBytes, asset.id);
    assert.deepEqual(asset.dimensions, {width: 1672, height: 941});
    assert.ok(asset.visualQA.passed && asset.prompt.length > 100, asset.id);
    assert.equal(registry.resolve(asset.token).id, asset.id);
    const original = fs.readFileSync(asset.originalRelativePath);
    assert.equal(original.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(sha(original), asset.originalSha256, asset.id);
    assert.equal(original.length, asset.originalBytes, asset.id);
    assert.equal(publicPathAllowed(asset.originalRelativePath), false, "production source is not a public game asset");
    for (const nodeId of asset.sceneNodeIds) assert.equal(registry.sceneFor({faction: "qing", nodeId}).id, asset.id, nodeId);
  }
  assert.equal(latest.retainedExistingAssets.length, 282);
  for (const old of latest.retainedExistingAssets) {
    assert.equal(registry.resolve(old.id).relativePath, old.relativePath, old.id);
    assert.equal(sha(fs.readFileSync(old.relativePath)), old.webSha256, old.id);
  }
  const changed = latest.bindingChanges.map(change => change.nodeId);
  assert.equal(new Set(changed).size, 30);
  for (const change of latest.bindingChanges) {
    assert.equal(change.previousAssetId, null);
    assert.equal(catalog.scenes.nodes[change.faction][change.nodeId], change.assetId);
  }
  assert.deepEqual(new Set([...changed, ...latest.pendingEditorial.map(n => n.nodeId)]),
    new Set(later.pendingEditorial.map(n => n.nodeId)), "the previous 85 nodes are partitioned, never dropped");
  assert.equal(completion.previousExplicitlyBoundNodes, 1401);
});

test("all 81 Qing final acts now agree on Beijing, Taihe dialogue, and forecourt art", () => {
  const fifth = Object.values(world.canonicalTrees.qing.nodes).filter(n => /^qing_act5_[abc][1-3]_[1-3]_[1-3]$/.test(n.id));
  assert.equal(fifth.length, 81);
  const resolved = latest.assets.find(a => a.id === "qing_bg_taihe_final_forecourt");
  assert.equal(resolved.sceneNodeIds.length, 27, "third-batch manifest remains a historical snapshot");
  let transitioned = 0;
  for (const node of fifth) {
    assert.ok(node.beats.some(b => b.text.includes("才走到这金銮太和殿前")), node.id);
    assert.equal(node.coords, "beijing:high", node.id);
    assert.equal(registry.sceneFor({faction: "qing", nodeId: node.id, coords: node.coords}).id, node.id.startsWith("qing_act5_b") ? resolved.id : "qing_bg_taihe_decision_rebuilt", node.id);
    if (!node.id.startsWith("qing_act5_b")) {
      transitioned++;
      for (const key of ["originalBeats", "beats"]) {
        assert.equal(node[key][0].sub, "北京紫禁城 · 太和殿前", node.id);
        assert.ok(node[key][0].text.startsWith("前幕风波之后，众人来到北京紫禁城太和殿前。"), node.id);
      }
    }
  }
  assert.equal(transitioned, 54);
});

test("early Qing locations keep exact evidence and resolve the sole conflicting court subtitle", () => {
  const nodes = world.canonicalTrees.qing.nodes;
  assert.match(nodes.qing_act3_civil_exam.beats[0].text, /大成殿前/);
  assert.equal(registry.sceneFor({faction: "qing", nodeId: "qing_act3_civil_exam"}).id, "qing_bg_confucius_dawn_court");
  assert.match(nodes.qing_act4_b1_1.title, /皇极殿/);
  assert.match(nodes.qing_act4_b1_1.desc, /太和殿/);
  assert.equal(registry.sceneFor({faction: "qing", nodeId: "qing_act4_b1_1"}).id, "qing_bg_mainhall_joint_court");
  assert.match(nodes.qing_act4_c2_1.beats[0].sub, /普陀宗乘之庙金顶法台/);
  assert.ok(nodes.qing_act4_c2_1.beats.some(b => b.speaker === "五世达赖法使"));
  assert.equal(registry.sceneFor({faction: "qing", nodeId: "qing_act4_c2_1"}).id, "qing_bg_rehe_golden_roof_terrace");
  assert.match(nodes.qing_act4_b3_1.desc, /皇极殿/);
  assert.equal(nodes.qing_act4_b3_1.beats[0].sub, "紫禁城 · 皇极殿御前");
  assert.equal(nodes.qing_act4_b3_1.originalBeats[0].sub, "紫禁城 · 皇极殿御前");
  assert.match(nodes.qing_act4_b3_1.beats[0].text, /殿内/);
  assert.equal(registry.sceneFor({faction: "qing", nodeId: "qing_act4_b3_1", coords: "beijing:high"}).id, "qing_bg_huangji_justice_rebuilt");
});

const clone = value => JSON.parse(JSON.stringify(value));
function restoreStoryEdits(nodes) {
  for (const {nodeId, fields} of completion.storyEdits) {
    const allowed = nodeId === "qing_act4_b3_1"
      ? ["originalBeats.0.sub", "beats.0.sub"]
      : ["coords", "originalBeats.0.sub", "originalBeats.0.text", "beats.0.sub", "beats.0.text"];
    if (nodeId !== "qing_act4_b3_1") assert.match(nodeId, /^qing_act5_[ac][1-3]_[1-3]_[1-3]$/);
    assert.deepEqual(fields.map(f => f.path), allowed, nodeId);
    for (const {path, before, after} of fields) {
      const keys = path.split(".");
      let target = nodes[nodeId];
      for (const key of keys.slice(0, -1)) target = target[key];
      assert.equal(target[keys.at(-1)], after, `${nodeId}.${path}`);
      assert.notEqual(before, after);
      target[keys.at(-1)] = before;
    }
  }
}

test("reversing only 272 audited fields restores every byte of the prior story and backup", () => {
  assert.equal(completion.storyEdits.length, 55);
  assert.equal(completion.storyEdits.reduce((n, edit) => n + edit.fields.length, 0), 272);
  assert.deepEqual(new Set(completion.storyEdits.map(e => e.nodeId)), new Set(latest.pendingEditorial.map(n => n.nodeId)));
  assert.equal(sha(fs.readFileSync("skills-data.js")), completion.currentStorySha256);
  const original = clone(world);
  restoreStoryEdits(original.canonicalTrees.qing.nodes);
  const prefix = "// skills-data.js: 动态技能检定、宏观地缘时相、四大阵营剧情树与世界观设定\nconst _WORLD_PRESETS = ";
  const suffix = ";\nif (typeof window !== 'undefined') window.WORLD_PRESETS = _WORLD_PRESETS;\nif (typeof global !== 'undefined') global.WORLD_PRESETS = _WORLD_PRESETS;\nif (typeof module !== 'undefined' && module.exports) module.exports = _WORLD_PRESETS;\n";
  assert.equal(sha(prefix + JSON.stringify(original, null, 2) + suffix), completion.sourceStorySha256,
    "all choices, outcomes, non-Qing data, and other nodes are byte-for-byte unchanged");
  const backup = JSON.parse(fs.readFileSync("data/qing-363-tree.json", "utf8"));
  for (const {nodeId} of completion.storyEdits) assert.deepEqual(backup.nodes[nodeId], world.canonicalTrees.qing.nodes[nodeId], nodeId);
  restoreStoryEdits(backup.nodes);
  assert.equal(sha(JSON.stringify(backup, null, 2)), completion.baselineSha256["data/qing-363-tree.json"]);
  for (const [file, expected] of Object.entries(completion.currentSha256)) assert.equal(sha(fs.readFileSync(file)), expected, file);
});

test("all 286 assets keep their bytes and catalog changes are limited to the audited binding and usage edits", () => {
  assert.equal(completion.retainedExistingAssets.length, 286);
  assert.equal(batch4Catalog.assets.length, 286);
  for (const old of completion.retainedExistingAssets) {
    const current = catalog.assets.find(a => a.id === old.id);
    assert.equal(current.relativePath, old.relativePath, old.id);
    assert.equal(sha(fs.readFileSync(old.relativePath)), old.sha256, old.id);
    assert.equal(sha(JSON.stringify(current)), old.metadataSha256, old.id);
  }
  const before = clone(batch4Catalog);
  for (const edit of completion.bindingChanges) before.scenes.nodes[edit.faction][edit.nodeId] = edit.previousAssetId;
  assert.equal(completion.metadataEdits.length, 1);
  for (const edit of completion.metadataEdits) {
    assert.equal(edit.id, "qing_bg_taihe_final_forecourt");
    const index = before.assets.findIndex(a => a.id === edit.id);
    assert.deepEqual(before.assets[index], edit.after);
    before.assets[index] = edit.before;
  }
  assert.equal(sha(JSON.stringify(before, null, 2) + "\n"), completion.baselineCatalogSha256,
    "all original bindings, aliases, maps, and metadata are preserved outside the exact audit");
  assert.deepEqual(catalog.scenes.locations, completion.unchangedMapBindings);
});

test("the Qing generator reproduces all corrected scenes without reviving old coordinates or subtitles", () => {
  const os = require("node:os"), path = require("node:path"), {execFileSync} = require("node:child_process");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jiuzhou-story-generation-"));
  try {
    fs.mkdirSync(path.join(temporary, "data"));
    for (const file of ["skills-data.js", "build-qing-363-tree.js"]) fs.copyFileSync(file, path.join(temporary, file));
    for (const file of fs.readdirSync("data").filter(f => /^qing-act[23]-.*\.json$/.test(f))) {
      fs.copyFileSync(path.join("data", file), path.join(temporary, "data", file));
    }
    execFileSync(process.execPath, ["build-qing-363-tree.js"], {cwd: temporary, stdio: "pipe", timeout: 30000});
    const regenerated = JSON.parse(fs.readFileSync(path.join(temporary, "data/qing-363-tree.json"), "utf8"));
    for (const {nodeId} of completion.storyEdits) assert.deepEqual(regenerated.nodes[nodeId], world.canonicalTrees.qing.nodes[nodeId], nodeId);
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
});


test("batch 5 adds exactly two genuine images and reversibly changes only the final 55 bindings", () => {
  assert.equal(rebuilt.generatedCount, 2);
  assert.equal(rebuilt.assets.length, 2);
  assert.equal(catalog.assets.length, 288);
  assert.equal(catalog.assets.filter(a => !a.legacy).length, 282);
  assert.equal(rebuilt.retainedExistingAssets.length, 286);
  assert.equal(rebuilt.bindingChanges.length, 55);
  assert.deepEqual(new Set(rebuilt.bindingChanges.map(e => e.nodeId)), new Set(completion.bindingChanges.map(e => e.nodeId)));
  assert.equal(sha(JSON.stringify(batch4Catalog, null, 2) + "\n"), rebuilt.baselineCatalogSha256);
  for (const old of rebuilt.retainedExistingAssets) {
    assert.equal(sha(fs.readFileSync(old.relativePath)), old.sha256, old.id);
    assert.equal(sha(JSON.stringify(catalog.assets.find(a => a.id === old.id))), old.metadataSha256, old.id);
  }
  for (const [file, hash] of Object.entries(rebuilt.unchangedFilesSha256)) assert.equal(sha(fs.readFileSync(file)), hash, file);
  const hashes = new Set(rebuilt.retainedExistingAssets.map(a => a.sha256));
  const {publicPathAllowed} = require("./server.js");
  for (const asset of rebuilt.assets) {
    const bytes = fs.readFileSync(asset.relativePath);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(sha(bytes), asset.webSha256);
    assert.equal(bytes.length, asset.webBytes);
    assert.ok(!hashes.has(asset.webSha256)); hashes.add(asset.webSha256);
    assert.deepEqual(asset.dimensions, {width: 1672, height: 941});
    assert.ok(asset.prompt.length > 100 && asset.visualQA.passed && asset.visualQA.independentReview);
    const png = fs.readFileSync(asset.originalRelativePath);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(sha(png), asset.originalSha256);
    assert.equal(png.length, asset.originalBytes);
    assert.equal(publicPathAllowed(asset.originalRelativePath), false);
    assert.equal(registry.resolve(asset.token).id, asset.id);
  }
  for (const edit of rebuilt.bindingChanges) {
    assert.equal(edit.previousAssetId, completion.bindingChanges.find(e => e.nodeId === edit.nodeId).assetId);
    assert.equal(edit.assetId, edit.nodeId === "qing_act4_b3_1" ? "qing_bg_huangji_justice_rebuilt" : "qing_bg_taihe_decision_rebuilt");
    assert.equal(registry.sceneFor({faction: edit.faction, nodeId: edit.nodeId}).id, edit.assetId);
  }
  const bNodes = Object.keys(catalog.scenes.nodes.qing).filter(id => /^qing_act5_b[1-3]_[1-3]_[1-3]$/.test(id));
  assert.equal(bNodes.length, 27);
  for (const nodeId of bNodes) assert.equal(registry.sceneFor({faction: "qing", nodeId}).id, "qing_bg_taihe_final_forecourt");
  assert.deepEqual(catalog.scenes.locations, rebuilt.unchangedMapBindings);
});
