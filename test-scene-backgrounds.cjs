"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const registry = require("./illustration-system.js");
const catalog = require("./data/illustrations/catalog.json");
const world = require("./skills-data.js");
const batch = require("./docs/scene-background-batch-1.json");
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
    assert.equal(Object.values(bindings).filter(Boolean).length, 40, faction);
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

test("972 unreviewed final-act nodes stay explicitly unbound instead of inheriting a mismatched map", () => {
  let count = 0;
  for (const [faction, progress] of Object.entries(batch.factions)) {
    assert.equal(progress.pendingReview.length, 324, faction);
    for (const nodeId of progress.pendingReview) {
      const coords = world.canonicalTrees[faction].nodes[nodeId].coords;
      assert.equal(catalog.scenes.nodes[faction][nodeId], null, nodeId);
      assert.equal(registry.sceneFor({faction, nodeId, coords}), null, nodeId);
      count++;
    }
  }
  assert.equal(count, 972);
  assert.ok(!Object.values(catalog.scenes.nodes).some(nodes => Object.values(nodes).includes("shared_bg_history_epilogue")));
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
  for (const faction of ["ming", "mongol", "nanming"]) for (const [nodeId, id] of Object.entries(catalog.scenes.nodes[faction])) {
    assert.equal(compactRegistry.sceneFor({faction, nodeId})?.id || null, id, nodeId);
  }
});
