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
      dimensions: clone(raw.dimensions), webBytes: fs.statSync(destination).size, webSha256: hash(destination),
      ...(typeof raw.token === "string" ? {token: raw.token} : {}),
      ...(Array.isArray(raw.tokenAliases) ? {tokenAliases: clone(raw.tokenAliases)} : {}),
      ...(Array.isArray(raw.categoryPath) ? {categoryPath: clone(raw.categoryPath)} : {})};
    const index = catalog.assets.findIndex(item => item.id === asset.id);
    if (index < 0) catalog.assets.push(asset);
    else if (catalog.assets[index].relativePath === relativePath) catalog.assets[index] = {...catalog.assets[index], ...asset};
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
// The production parser also checks phrase collisions, including old ID aliases.
const {createRegistry} = require("../illustration-system.js");
createRegistry(catalog);
for (const asset of catalog.assets) {
  if (!asset.token || !Array.isArray(asset.categoryPath) || !asset.categoryPath.length) throw new Error("Add token and categoryPath for " + asset.id);
  for (let depth = 1; depth <= asset.categoryPath.length; depth++) {
    if (!catalog.taxonomy?.[asset.categoryPath.slice(0, depth).join("/")]) throw new Error("Missing taxonomy node for " + asset.id);
  }
}
for (const ids of [catalog.featured?.global || [], ...Object.values(catalog.featured?.factions || {}), ...Object.values(catalog.featured?.locations || {})]) {
  for (const id of ids) if (!seen.has(id) || catalog.assets.find(asset => asset.id === id).legacy) throw new Error("Invalid featured asset: " + id);
}
catalog.assets.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
const browserSource = `// Generated from catalog.json by scripts/build-illustration-catalog.cjs.\n(function(root){\n  \"use strict\";\n  const catalog = ${JSON.stringify(catalog, null, 2)};\n  if (typeof module === \"object\" && module.exports) module.exports = catalog;\n  else root.JiuzhouIllustrationCatalog = catalog;\n})(typeof globalThis !== \"undefined\" ? globalThis : this);\n`;
fs.writeFileSync(path.join(repo, "data/illustrations/catalog-data.js"), browserSource);
// Boot with a compact identity/scene index. Search text and detailed descriptions
// are separate resources; none of these resources contains embedded image bytes.
const directory = path.join(repo, "data/illustrations/library");
fs.mkdirSync(directory, {recursive: true});
const write = (prefix, data) => {
  const content = JSON.stringify(data) + "\n";
  const revision = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  const filename = `${prefix}-${revision}.json`;
  fs.writeFileSync(path.join(directory, filename), content);
  return `data/illustrations/library/${filename}`;
};
const shards = new Map(), detailPaths = {};
for (const asset of catalog.assets) {
  const group = asset.faction;
  if (!/^[a-z][a-z0-9_]*$/.test(group)) throw new Error("Invalid metadata shard");
  if (!shards.has(group)) shards.set(group, []);
  const fields = ["id", "description", "tags", "useWhen", "avoidWhen", "possibleContinuations", "sourcePack"];
  shards.get(group).push(Object.fromEntries(fields.map(key => [key, asset[key]])));
}
for (const [group, assets] of shards) {
  const relativePath = write(`details-${group}`, {version: 2, assets});
  for (const asset of assets) detailPaths[asset.id] = relativePath;
}
const searchPath = write("search", {version: 2, documents: catalog.assets.map(asset => ({id: asset.id, description: asset.description,
  tags: asset.tags || [], useWhen: asset.useWhen || []}))});
const indexFields = ["id", "token", "tokenAliases", "relativePath", "faction", "factionName", "title", "category", "categoryName", "categoryPath", "symbol", "legacy", "dimensions"];
const compact = {...catalog, assets: catalog.assets.map(asset => ({...Object.fromEntries(indexFields.filter(key => asset[key] !== undefined).map(key => [key, asset[key]])),
  description: asset.description?.slice(0, 84) || ""})),
  lazy: {search: searchPath, details: detailPaths}};
fs.writeFileSync(path.join(repo, "data/illustrations/catalog-index.js"),
  `// Generated by scripts/build-illustration-catalog.cjs.\n(function(root){\nconst catalog=${JSON.stringify(compact)};\nif(typeof module === "object" && module.exports) module.exports=catalog; else root.JiuzhouIllustrationIndex=catalog;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`);
console.log(`Illustration catalog built: ${catalog.assets.length} handles, ${catalog.assets.filter(asset => !asset.legacy).length} listed by default.`);
