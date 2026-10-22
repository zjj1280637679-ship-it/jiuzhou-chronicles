(function (root, factory) {
  const catalog = typeof module === "object" && module.exports ? require("./data/illustrations/catalog.json") :
    (root.JiuzhouIllustrationCatalog || {version: 1, assets: [], aliases: {}, scenes: {}});
  const api = factory(catalog);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouIllustrations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (defaultCatalog) {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const validId = value => typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
  const validPath = value => typeof value === "string" && /^data\/illustrations\/[a-zA-Z0-9_./-]+\.(?:svg|webp|png|jpe?g)$/.test(value) && !value.includes("..");
  const error = (code, message) => ({ok: false, error: {code, message}});
  const strings = value => Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
  const textFields = ["faction", "factionName", "category", "categoryName", "title", "description", "symbol", "sourcePack"];

  function createRegistry(input = {}) {
    const assets = new Map();
    for (const raw of Array.isArray(input.assets) ? input.assets : []) {
      if (!object(raw) || !validId(raw.id) || !validPath(raw.relativePath) || assets.has(raw.id)) throw new Error("invalid_illustration_catalog");
      const asset = {id: raw.id, relativePath: raw.relativePath};
      for (const key of textFields) asset[key] = typeof raw[key] === "string" ? raw[key] : "";
      for (const key of ["tags", "useWhen", "avoidWhen", "possibleContinuations"]) asset[key] = strings(raw[key]);
      asset.legacy = raw.legacy === true;
      if (object(raw.dimensions) && Number.isSafeInteger(raw.dimensions.width) && raw.dimensions.width > 0 &&
          Number.isSafeInteger(raw.dimensions.height) && raw.dimensions.height > 0) asset.dimensions = {width: raw.dimensions.width, height: raw.dimensions.height};
      assets.set(asset.id, asset);
    }
    const aliases = new Map();
    for (const [id, target] of Object.entries(object(input.aliases) ? input.aliases : {})) {
      if (!validId(id) || !validId(target) || assets.has(id) || !assets.has(target)) throw new Error("invalid_illustration_alias");
      aliases.set(id, target);
    }
    const scenes = clone(object(input.scenes) ? input.scenes : {});
    function find(id) {
      if (!validId(id)) return null;
      return assets.get(id) || assets.get(aliases.get(id)) || null;
    }
    function resolve(id) { const asset = find(id); return asset ? clone(asset) : null; }
    function list(options = {}) {
      const {faction, category, includeLegacy = false} = object(options) ? options : {};
      const query = typeof options?.query === "string" ? options.query.trim().toLocaleLowerCase("zh-CN") : "";
      return [...assets.values()].filter(asset => (includeLegacy || !asset.legacy) &&
        (!faction || asset.faction === faction) && (!category || asset.category === category || asset.categoryName === category) &&
        (!query || [asset.id, asset.title, asset.description, asset.category, ...asset.tags, ...asset.useWhen].join(" ").toLocaleLowerCase("zh-CN").includes(query)))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(clone);
    }
    function normalizeSelection(value) {
      if (!object(value) || !validId(value.id)) return error("invalid_illustration_selection", "提供图库中的准确 id。");
      const asset = find(value.id);
      if (!asset) return error("unknown_illustration", "该插图 id 不在图库中；可先调用 list_illustrations 查找。");
      const afterBeat = value.afterBeat === undefined ? 1 : value.afterBeat;
      if (!Number.isSafeInteger(afterBeat) || afterBeat < 0) return error("invalid_illustration_position", "afterBeat 必须是非负整数：0 为正文前，1 为第一段正文后。");
      if (value.caption !== undefined && typeof value.caption !== "string") return error("invalid_illustration_caption", "caption 必须是文字。");
      return {ok: true, selection: {id: asset.id, afterBeat, caption: typeof value.caption === "string" ? value.caption.trim() : ""}};
    }
    function compose(beats, selections = []) {
      const source = Array.isArray(beats) ? clone(beats) : [];
      const selected = new Map(), warnings = [];
      for (const raw of Array.isArray(selections) ? selections : []) {
        const result = normalizeSelection(raw);
        if (!result.ok) {warnings.push({id: typeof raw?.id === "string" ? raw.id : "", ...result.error}); continue;}
        selected.set(result.selection.afterBeat, result.selection);
      }
      const positions = new Map();
      for (const selection of [...selected.values()].sort((a, b) => a.afterBeat - b.afterBeat)) {
        const position = Math.min(selection.afterBeat, source.length);
        if (selection.afterBeat > source.length) warnings.push({code: "illustration_position_after_end", id: selection.id,
          requestedAfterBeat: selection.afterBeat, afterBeat: position, message: "指定位置超过正文段数，插画已排在本轮末尾。"});
        const asset = find(selection.id);
        const illustrationData = Object.fromEntries(["id", "relativePath", "title", "description", "symbol", "categoryName", "factionName"].map(key => [key, asset[key] || ""]));
        if (selection.caption) illustrationData.description = selection.caption;
        const beat = {speaker: `【${asset.categoryName || "画卷"}】`, sub: asset.title, type: "illustration", stageChar: "center",
          text: selection.caption || asset.description || asset.title, illustrationData};
        if (!positions.has(position)) positions.set(position, []);
        positions.get(position).push(beat);
      }
      const result = [...(positions.get(0) || [])];
      source.forEach((beat, index) => result.push(beat, ...(positions.get(index + 1) || [])));
      return {beats: result, warnings};
    }
    function sceneFor({faction, nodeId, coords, sceneId} = {}) {
      // Only authored bindings and neutral location defaults. Never infer events from prose.
      if (typeof sceneId === "string" && object(scenes.ids) && has(scenes.ids, sceneId)) return resolve(scenes.ids[sceneId]);
      const factionNodes = object(scenes.nodes) && has(scenes.nodes, faction) ? scenes.nodes[faction] : null;
      if (object(factionNodes) && typeof nodeId === "string" && has(factionNodes, nodeId)) return resolve(factionNodes[nodeId]);
      if (object(scenes.locations) && typeof coords === "string" && has(scenes.locations, coords)) return resolve(scenes.locations[coords]);
      return null;
    }
    return {version: 1, list, resolve, normalizeSelection, compose, sceneFor};
  }
  return {...createRegistry(defaultCatalog), createRegistry, catalog: clone(defaultCatalog)};
});
