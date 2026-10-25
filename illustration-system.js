(function (root, factory) {
  const catalog = typeof module === "object" && module.exports ? require("./data/illustrations/catalog.json") :
    (root.JiuzhouIllustrationIndex || root.JiuzhouIllustrationCatalog || {version: 1, assets: [], aliases: {}, scenes: {}});
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
  const phrase = value => typeof value === "string" ? value.normalize("NFC").trim() : "";
  // Models may render the same authored phrase with a space or a middle dot.
  // Register and resolve through one collision-checked typography key while
  // retaining the authored token for results, prompts and saved identities.
  const tokenKey = value => phrase(value).replace(/[·・•]/gu, " ").replace(/\s+/gu, " ").trim();
  const fold = value => phrase(value).toLocaleLowerCase("zh-CN");
  const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const validJSONPath = value => typeof value === "string" && /^data\/illustrations\/[a-zA-Z0-9_/-]+\.json$/.test(value) && !value.includes("..");
  const textFields = ["faction", "factionName", "category", "categoryName", "title", "description", "symbol", "sourcePack"];

  function createRegistry(input = {}) {
    const assets = new Map();
    for (const raw of Array.isArray(input.assets) ? input.assets : []) {
      if (!object(raw) || !validId(raw.id) || !validPath(raw.relativePath) || assets.has(raw.id)) throw new Error("invalid_illustration_catalog");
      const asset = {id: raw.id, relativePath: raw.relativePath};
      for (const key of textFields) asset[key] = typeof raw[key] === "string" ? raw[key] : "";
      for (const key of ["tags", "useWhen", "avoidWhen", "possibleContinuations"]) asset[key] = strings(raw[key]);
      asset.token = phrase(raw.token) || raw.id;
      asset.tokenAliases = strings(raw.tokenAliases).map(phrase);
      asset.categoryPath = strings(raw.categoryPath).map(phrase);
      if (asset.categoryPath.some(part => !part || part.includes("/"))) throw new Error("invalid_illustration_category");
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
    // Phrases, old IDs and renamed IDs share one collision-checked namespace.
    const tokens = new Map([...assets.keys()].map(id => [tokenKey(id), id]));
    for (const [alias, target] of aliases) tokens.set(tokenKey(alias), target);
    for (const asset of assets.values()) for (const token of [asset.token, ...asset.tokenAliases]) {
      const key = tokenKey(token);
      if (!key || /[\u0000-\u001f]/.test(token) || (tokens.has(key) && tokens.get(key) !== asset.id)) throw new Error("invalid_illustration_token");
      tokens.set(key, asset.id);
    }
    const scenes = clone(object(input.scenes) ? input.scenes : {});
    const taxonomy = clone(object(input.taxonomy) ? input.taxonomy : {});
    const curated = clone(object(input.featured) ? input.featured : {});
    const lazy = object(input.lazy) ? clone(input.lazy) : null;
    const loads = new Map();
    const loadJSON = input.loadJSON || (async relativePath => {
      // Worker URLs are relative to /harness/, not the page; the host supplies its page base.
      const base = input.baseURL || (typeof document !== "undefined" ? document.baseURI :
        typeof location !== "undefined" ? new URL("../", location.href).href : undefined);
      const response = await fetch(new URL(relativePath, base).href);
      if (!response.ok) throw new Error("illustration_metadata_unavailable");
      return response.json();
    });
    function load(relativePath) {
      if (!validJSONPath(relativePath)) return Promise.reject(new Error("invalid_illustration_metadata_path"));
      if (!loads.has(relativePath)) loads.set(relativePath, Promise.resolve().then(() => loadJSON(relativePath)).catch(error => {
        loads.delete(relativePath); throw error;
      }));
      return loads.get(relativePath);
    }
    function find(id) {
      return assets.get(tokens.get(tokenKey(id))) || null;
    }
    function resolve(id) { const asset = find(id); return asset ? clone(asset) : null; }
    function reference(value) {
      if (!object(value) || (value.id === undefined && value.token === undefined) ||
          ["id", "token"].some(key => value[key] !== undefined && (typeof value[key] !== "string" || !phrase(value[key])))) {
        return error("invalid_illustration_selection", "提供图库中登记的 token 短语或旧 id。");
      }
      const byID = value.id === undefined ? null : find(value.id);
      const byToken = value.token === undefined ? null : find(value.token);
      if ((value.id !== undefined && !byID) || (value.token !== undefined && !byToken)) return error("unknown_illustration", "该短语或 id 未登记；可搜索或浏览图库。");
      if (byID && byToken && byID.id !== byToken.id) return error("illustration_reference_conflict", "token 与 id 指向不同图片，请只提供一个准确引用。");
      return {ok: true, asset: clone(byID || byToken)};
    }
    function list(options = {}) {
      const {faction, category, includeLegacy = false} = object(options) ? options : {};
      const query = typeof options?.query === "string" ? options.query.trim().toLocaleLowerCase("zh-CN") : "";
      return [...assets.values()].filter(asset => (includeLegacy || !asset.legacy) &&
        (!faction || asset.faction === faction) && (!category || asset.category === category || asset.categoryName === category) &&
        (!query || [asset.id, asset.token, ...asset.tokenAliases, asset.title, asset.description, asset.category, ...asset.categoryPath, ...asset.tags, ...asset.useWhen].join(" ").toLocaleLowerCase("zh-CN").includes(query)))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(clone);
    }
    function normalizeSelection(value) {
      const selected = reference(value);
      if (!selected.ok) return selected;
      const asset = selected.asset;
      const afterBeat = value.afterBeat === undefined ? 1 : value.afterBeat;
      if (!Number.isSafeInteger(afterBeat) || afterBeat < 0) return error("invalid_illustration_position", "afterBeat 必须是非负整数：0 为正文前，1 为第一段正文后。");
      if (value.caption !== undefined && typeof value.caption !== "string") return error("invalid_illustration_caption", "caption 必须是文字。");
      return {ok: true, selection: {id: asset.id, afterBeat, caption: typeof value.caption === "string" ? value.caption.trim() : ""}};
    }
    function summary(asset) {
      return Object.fromEntries(["id", "token", "title", "description", "faction", "factionName", "categoryPath", "tags", "useWhen", "avoidWhen", "legacy"].map(key => [key, clone(asset[key])]));
    }
    function featured({faction, coords, backgroundId, limit = 6} = {}) {
      const ids = [backgroundId, ...(curated.locations?.[coords] || []), ...(curated.factions?.[faction] || []), ...(curated.global || [])];
      const chosen = [...new Set(ids)].map(find).filter(asset => asset && !asset.legacy);
      // Minimal custom registries have no authored curation; do not invent recommendations.
      return chosen.slice(0, Number.isSafeInteger(limit) && limit > 0 ? limit : 6).map(summary);
    }
    function pageOf(items, {page = 1, pageSize = 8} = {}) {
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error("invalid_illustration_page");
      const offset = (page - 1) * pageSize;
      return {illustrations: items.slice(offset, offset + pageSize).map(summary), count: items.slice(offset, offset + pageSize).length,
        total: items.length, page, pageSize, hasMore: offset + pageSize < items.length, nextPage: offset + pageSize < items.length ? page + 1 : null};
    }
    function browse(options = {}) {
      const path = phrase(options.path), prefix = path ? path.split("/") : [];
      const candidates = list(options).filter(asset => prefix.every((part, i) => asset.categoryPath[i] === part));
      const children = new Map();
      for (const asset of candidates) {
        const name = asset.categoryPath[prefix.length];
        if (!name) continue;
        if (!children.has(name)) {
          const childPath = [...prefix, name].join("/");
          children.set(name, {name, path: childPath, description: taxonomy[childPath]?.description || "", count: 0});
        }
        children.get(name).count++;
      }
      const direct = candidates.filter(asset => asset.categoryPath.length === prefix.length);
      return {...pageOf(direct, options), path, description: taxonomy[path]?.description || "", total: candidates.length, resultTotal: direct.length,
        children: [...children.values()].sort((a, b) => order(a.path, b.path))};
    }
    async function details(id) {
      const asset = find(id);
      if (!asset) return null;
      if (lazy) {
        const relativePath = lazy.details?.[asset.id];
        if (!relativePath) throw new Error("illustration_metadata_unavailable");
        const block = await load(relativePath);
        if (!Array.isArray(block.assets) || !block.assets.some(raw => raw.id === asset.id)) throw new Error("invalid_illustration_metadata");
        for (const raw of block.assets) {
          const target = assets.get(raw.id);
          if (!target) continue;
          // Lazy metadata cannot change the approved identity, path, token or category tree.
          for (const key of ["description", "sourcePack"]) if (typeof raw[key] === "string") target[key] = raw[key];
          for (const key of ["tags", "useWhen", "avoidWhen", "possibleContinuations"]) if (Array.isArray(raw[key])) target[key] = strings(raw[key]);
        }
      }
      return resolve(asset.id);
    }
    async function search(options = {}) {
      const query = fold(options.query), terms = query.split(/\s+/u).filter(Boolean);
      let documents = null;
      if (query && lazy) {
        const index = await load(lazy.search);
        if (!Array.isArray(index.documents)) throw new Error("invalid_illustration_search_index");
        documents = new Map(index.documents.map(doc => [doc.id, doc]));
      }
      const candidates = list({...options, query: ""}).filter(asset => !options.path || asset.categoryPath.join("/") === options.path || asset.categoryPath.join("/").startsWith(options.path + "/"));
      const scored = candidates.map(asset => {
        if (!query) return {asset, score: 0};
        const doc = documents?.get(asset.id) || asset;
        const fields = [
          [fold([asset.id, asset.token, ...asset.tokenAliases, asset.title].join(" ")), 12],
          [fold((doc.tags || []).join(" ")), 6],
          [fold((doc.useWhen || []).join(" ")), 3],
          [fold([doc.description || "", ...asset.categoryPath].join(" ")), 1]
        ];
        if (!terms.every(term => fields.some(([text]) => text.includes(term)))) return null;
        const exact = [asset.id, asset.token, ...asset.tokenAliases, asset.title].some(text => fold(text) === query) ? 100 : 0;
        return {asset, score: exact + terms.reduce((sum, term) => sum + fields.reduce((n, [text, weight]) => n + (text.includes(term) ? weight : 0), 0), 0)};
      }).filter(Boolean).sort((a, b) => b.score - a.score || order(a.asset.id, b.asset.id));
      const result = pageOf(scored.map(item => item.asset), options);
      // Fetch only the descriptions for this page, never images or other result pages.
      await Promise.all(result.illustrations.map(asset => details(asset.id)));
      result.illustrations = result.illustrations.map(asset => summary(find(asset.id)));
      return {...result, query: options.query || ""};
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
    function snapshot() {
      return {version: 2, assets: [...assets.values()].map(clone), aliases: Object.fromEntries(aliases), scenes: clone(scenes),
        taxonomy: clone(taxonomy), featured: clone(curated), ...(lazy ? {lazy: clone(lazy)} : {}), ...(input.baseURL ? {baseURL: input.baseURL} : {})};
    }
    return {version: 2, list, resolve, reference, normalizeSelection, compose, sceneFor, featured, browse, search, details, snapshot};
  }
  return {...createRegistry(defaultCatalog), createRegistry, catalog: clone(defaultCatalog)};
});
