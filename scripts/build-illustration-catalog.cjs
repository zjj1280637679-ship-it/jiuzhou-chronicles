#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const repo = path.resolve(__dirname, "..");
const catalogPath = path.join(repo, "data/illustrations/catalog.json");
const clone = value => JSON.parse(JSON.stringify(value));
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const validPath = value => typeof value === "string" && /^data\/illustrations\/[a-zA-Z0-9_./-]+\.(?:svg|webp|png|jpe?g)$/.test(value) && !value.includes("..");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const legacy = read(path.join(repo, "data/illustrations/illustrations-data.json"));
const catalog = fs.existsSync(catalogPath) ? read(catalogPath) : {
  version: 1, title: "九州场景插画注册表", assets: Object.values(legacy).flatMap(faction => Object.values(faction)).map(asset => ({
    ...asset, legacy: asset.faction === "qing", sourcePack: "legacy-factions", tags: [], useWhen: [], avoidWhen: []
  })), aliases: {}, scenes: {ids: {}, nodes: {}, locations: {}}
};
const args = process.argv.slice(2);
while (args.length) {
  const command = args.shift();
  if (command !== "--import-pack" || !args.length) throw new Error("Usage: node scripts/build-illustration-catalog.cjs [--import-pack PATH/pack.json]");
  const packPath = path.resolve(args.shift());
  const pack = read(packPath), packRoot = path.dirname(packPath);
  if (!Array.isArray(pack.assets)) throw new Error("Pack must contain assets[]");
  for (const raw of pack.assets) {
    if (!/^[a-z][a-z0-9_]*$/.test(raw.id) || raw.faction !== "qing" || !/^web\/[a-z0-9_]+\.webp$/.test(raw.relativePath)) throw new Error("Invalid source asset " + raw.id);
    const source = path.join(packRoot, raw.relativePath);
    if (raw.webSha256 && hash(source) !== raw.webSha256) throw new Error("Source hash mismatch: " + raw.id);
    const relativePath = `data/illustrations/qing/scenes/${raw.id}.webp`;
    const destination = path.join(repo, relativePath);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(source, destination);
    if (hash(source) !== hash(destination)) throw new Error("Copy hash mismatch: " + raw.id);
    const asset = {id: raw.id, faction: raw.faction, factionName: "后金女真", category: raw.category, categoryName: raw.category,
      title: raw.title, description: raw.description, symbol: ({地点: "🏯", 事件: "📜", 物件: "🗝️", 战争: "⚔️", 囚禁: "⛓️", 仆役: "🪵", 审讯与处置: "🕯️"})[raw.category] || "🖼️",
      relativePath, tags: clone(raw.tags || []), useWhen: clone(raw.useWhen || []), avoidWhen: clone(raw.avoidWhen || []),
      possibleContinuations: clone(raw.possibleContinuations || []), legacy: false, sourcePack: pack.title,
      dimensions: clone(raw.dimensions), webBytes: fs.statSync(destination).size, webSha256: hash(destination)};
    const index = catalog.assets.findIndex(item => item.id === asset.id);
    if (index < 0) catalog.assets.push(asset);
    else if (catalog.assets[index].relativePath === relativePath) catalog.assets[index] = asset;
    else throw new Error("Existing handle points to another resource: " + asset.id);
  }
}
const seen = new Set();
for (const asset of catalog.assets) {
  if (!/^[a-z][a-z0-9_]*$/.test(asset.id) || seen.has(asset.id) || !validPath(asset.relativePath)) throw new Error("Invalid or duplicate asset: " + asset.id);
  seen.add(asset.id);
  const file = path.join(repo, asset.relativePath);
  if (!fs.existsSync(file)) throw new Error("Missing asset: " + asset.relativePath);
  if (asset.webSha256 && hash(file) !== asset.webSha256) throw new Error("Asset hash mismatch: " + asset.id);
}
for (const [alias, id] of Object.entries(catalog.aliases || {})) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias) || seen.has(alias) || !seen.has(id)) throw new Error("Invalid alias: " + alias);
}
for (const bindings of [catalog.scenes?.ids || {}, catalog.scenes?.locations || {}, ...Object.values(catalog.scenes?.nodes || {})]) {
  for (const [scene, id] of Object.entries(bindings)) if (id !== null && !seen.has(id)) throw new Error("Unknown scene asset: " + scene + " -> " + id);
}
catalog.assets.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
const browserSource = `// Generated from catalog.json by scripts/build-illustration-catalog.cjs.\n(function(root){\n  \"use strict\";\n  const catalog = ${JSON.stringify(catalog, null, 2)};\n  if (typeof module === \"object\" && module.exports) module.exports = catalog;\n  else root.JiuzhouIllustrationCatalog = catalog;\n})(typeof globalThis !== \"undefined\" ? globalThis : this);\n`;
fs.writeFileSync(path.join(repo, "data/illustrations/catalog-data.js"), browserSource);
console.log(`Illustration catalog built: ${catalog.assets.length} handles, ${catalog.assets.filter(asset => !asset.legacy).length} listed by default.`);
