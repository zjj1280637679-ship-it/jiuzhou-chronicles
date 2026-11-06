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
  assert.equal(sha(fs.readFileSync("skills-data.js")), later.sourceStorySha256, "art work does not rewrite story");
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

test("55 unresolved Qing locations stay explicitly unbound, even when a map background exists", () => {
  assert.equal(latest.pendingEditorial.length, 55);
  assert.equal(new Set(latest.pendingEditorial.map(n => n.nodeId)).size, 55);
  for (const {nodeId, reason} of latest.pendingEditorial) {
    assert.ok(reason.length > 10, nodeId);
    const node = world.canonicalTrees.qing.nodes[nodeId];
    assert.equal(catalog.scenes.nodes.qing[nodeId], null, nodeId);
    assert.equal(registry.sceneFor({faction: "qing", nodeId, coords: node.coords}), null, nodeId);
  }
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
  assert.equal(sha(fs.readFileSync("skills-data.js")), latest.sourceStorySha256);
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
  assert.equal(Object.values(catalog.scenes.nodes).flatMap(nodes => Object.values(nodes)).filter(Boolean).length, 1401);
});

test("only 27 Qing B-line final acts have matching Beijing coordinates and Taihe forecourt art", () => {
  const fifth = Object.values(world.canonicalTrees.qing.nodes).filter(n => /^qing_act5_[abc][1-3]_[1-3]_[1-3]$/.test(n.id));
  assert.equal(fifth.length, 81);
  const resolved = latest.assets.find(a => a.id === "qing_bg_taihe_final_forecourt");
  assert.equal(resolved.sceneNodeIds.length, 27);
  for (const node of fifth) {
    assert.ok(node.beats.some(b => b.text.includes("才走到这金銮太和殿前")), node.id);
    const isCivil = node.id.startsWith("qing_act5_b");
    assert.equal(resolved.sceneNodeIds.includes(node.id), isCivil, node.id);
    if (isCivil) {
      assert.equal(node.coords, "beijing:high", node.id);
      assert.equal(registry.sceneFor({faction: "qing", nodeId: node.id, coords: node.coords}).id, resolved.id, node.id);
    } else {
      assert.ok(["jiangnan:mid", "mongol:steppe"].includes(node.coords), node.id);
      assert.equal(registry.sceneFor({faction: "qing", nodeId: node.id, coords: node.coords}), null, node.id);
    }
  }
});

test("resolved early Qing scenes preserve exact evidence while the disputed court remains unbound", () => {
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
  assert.match(nodes.qing_act4_b3_1.beats[0].sub, /乾清门/);
  assert.equal(registry.sceneFor({faction: "qing", nodeId: "qing_act4_b3_1", coords: "beijing:high"}), null);
});
