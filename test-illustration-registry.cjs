"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const registry = require("./illustration-system.js");
const catalog = require("./data/illustrations/catalog.json");
const imageCount = registry.list({faction: "qing"}).length;
assert.equal(imageCount, 32);
assert.equal(registry.list().length, 50);
assert.equal(registry.list({includeLegacy: true}).length, 56);
assert.equal(registry.list({includeLegacy: true, faction: "qing"}).length, 38);
for (const faction of ["ming", "mongol", "nanming"]) assert.equal(registry.list({faction}).length, 6);
assert.deepEqual(registry.list().map(asset => asset.id), registry.list().map(asset => asset.id).sort());
for (const asset of catalog.assets) {
  assert.ok(fs.existsSync(path.join(__dirname, asset.relativePath)), asset.id);
  if (asset.webSha256) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, asset.relativePath))).digest("hex"), asset.webSha256, asset.id);
}
assert.equal(registry.resolve("qing_war").legacy, true);
assert.equal(registry.resolve("qing_steppe_camp"), null);
assert.equal(registry.resolve("qing_no_such_id"), null);
assert.equal(registry.resolve("__proto__"), null);
const copy = registry.resolve("qing_holding_cell");
copy.title = "changed"; copy.tags.push("changed");
assert.notEqual(registry.resolve(copy.id).title, "changed");
assert.ok(!registry.resolve(copy.id).tags.includes("changed"));
assert.ok(registry.list({query: "囚室"}).some(asset => asset.id === "qing_cell_whispers"));
assert.ok(registry.list({category: "战争"}).some(asset => asset.id === "qing_massacred_village"));
assert.deepEqual(registry.normalizeSelection({id: "qing_lamplit_questioning"}), {ok: true,
  selection: {id: "qing_lamplit_questioning", afterBeat: 1, caption: ""}});
for (const afterBeat of [-1, 1.1, "2", Infinity]) assert.equal(registry.normalizeSelection({id: "qing_holding_cell", afterBeat}).ok, false);
assert.equal(registry.normalizeSelection({id: "qing_missing", title: "财富"}).error.code, "unknown_illustration");
const base = [{text: "第一段正文", type: "narrator"}, {text: "第二段正文", type: "narrator"}, {text: "第三段正文", type: "narrator"}];
const composed = registry.compose(base, [
  {id: "qing_campaign_map", afterBeat: 0},
  {id: "qing_lamplit_questioning", afterBeat: 1},
  {id: "qing_evidence_hearing", afterBeat: 1, caption: "新证词尚待核对。"},
  {id: "qing_missing", afterBeat: 1},
  {id: "qing_holding_cell", afterBeat: 99, url: "https://untrusted.invalid/a.jpg"}
]);
assert.deepEqual(composed.beats.map(beat => beat.illustrationData?.id || beat.text),
  ["qing_campaign_map", "第一段正文", "qing_evidence_hearing", "第二段正文", "第三段正文", "qing_holding_cell"]);
assert.equal(composed.beats[2].text, "新证词尚待核对。");
assert.equal(composed.beats[2].illustrationData.description, "新证词尚待核对。");
assert.equal(composed.warnings.length, 2);
assert.equal(composed.warnings[0].code, "unknown_illustration");
assert.equal(composed.warnings[1].code, "illustration_position_after_end");
assert.equal(base.length, 3);
assert.ok(!JSON.stringify(composed).includes("untrusted.invalid"));
assert.deepEqual(Object.keys(composed.beats[0].illustrationData).sort(), ["id", "relativePath", "title", "description", "symbol", "categoryName", "factionName"].sort());
const custom = registry.createRegistry({assets: [registry.resolve("qing_secret_letter")], aliases: {letter_old: "qing_secret_letter"},
  scenes: {ids: {private_letter: "qing_secret_letter"}, nodes: {ming: {letter_scene: "qing_secret_letter", no_art: null}}, locations: {"test:room": "qing_secret_letter"}}});
assert.equal(custom.resolve("letter_old").id, "qing_secret_letter");
assert.equal(custom.normalizeSelection({id: "letter_old"}).selection.id, "qing_secret_letter");
assert.equal(custom.sceneFor({sceneId: "private_letter", faction: "ming"}).id, "qing_secret_letter");
assert.equal(custom.sceneFor({faction: "ming", nodeId: "letter_scene"}).id, "qing_secret_letter");
assert.equal(custom.sceneFor({faction: "ming", nodeId: "no_art", coords: "test:room"}), null);
assert.equal(custom.sceneFor({coords: "test:room"}).id, "qing_secret_letter");
assert.equal(custom.sceneFor({nodeId: "罪犯屠村胜利财富"}), null);
assert.throws(() => registry.createRegistry({assets: [{id: "bad_asset", relativePath: "https://example.invalid/a.webp"}]}), /invalid_illustration_catalog/);
assert.throws(() => registry.createRegistry({assets: [{id: "bad_asset", relativePath: "data/illustrations/../secret.png"}]}), /invalid_illustration_catalog/);
assert.throws(() => registry.createRegistry({assets: [registry.resolve("qing_secret_letter")], aliases: {old: "absent"}}), /invalid_illustration_alias/);
// Real browser and Worker boot use the same generated JSON and implementation; neither needs a DOM.
const browser = vm.createContext({});
vm.runInContext(fs.readFileSync("data/illustrations/catalog-data.js", "utf8"), browser);
vm.runInContext(fs.readFileSync("illustration-system.js", "utf8"), browser);
assert.equal(JSON.stringify(browser.JiuzhouIllustrations.list({includeLegacy: true})), JSON.stringify(registry.list({includeLegacy: true})));
const worker = vm.createContext({});
vm.runInContext(fs.readFileSync("illustration-system.js", "utf8"), worker);
assert.equal(worker.JiuzhouIllustrations.list().length, 0);
assert.equal(worker.JiuzhouIllustrations.createRegistry({assets: registry.list({includeLegacy: true})}).list().length, 50);
const nodes = require("./skills-data.js").canonicalTrees.qing.nodes;
assert.equal(Object.keys(catalog.scenes.nodes.qing).length, Object.keys(nodes).length);
for (const nodeId of Object.keys(nodes)) assert.ok(registry.sceneFor({faction: "qing", nodeId}), nodeId);
// These branch titles describe a path; their current prose is a generic final
// court decision, not another battle or a scene in which a captive is present.
for (const node of Object.values(nodes).filter(node => node.id.startsWith("qing_act5_"))) {
  assert.equal(registry.sceneFor({faction: "qing", nodeId: node.id}).id, "qing_campaign_map", node.id);
}
for (const nodeId of ["qing_act4_b3_1", "qing_act4_a1_3"]) {
  assert.equal(registry.sceneFor({faction: "qing", nodeId}).id, "qing_campaign_map", nodeId);
}
for (const nodeId of ["qing_act2_civil", "qing_act2_steppe", "qing_act3_civil_exam", "qing_act4_b1_2", "qing_act5_b3_2_3"]) {
  assert.ok(!/battlefield_dead|massacred_village|disarmed_captives|holding_cell/.test(registry.sceneFor({faction: "qing", nodeId}).id));
}
assert.notEqual(registry.sceneFor({faction: "qing", nodeId: "qing_act3_civil_exam", coords: "beijing:high"}).id, "qing_shengjing_palace");
console.log(`Illustration registry passed: 32 new assets, 24 compatible handles, ${Object.keys(nodes).length} authored Qing scene bindings, browser/Worker parity.`);
