(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouSceneFavorites = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const STORAGE_KEY = "vn_scene_favorites_v1";
  // Project only player-facing scene fields. Never serialize the engine/config.
  function scene(value) {
    if (!value || typeof value.text !== "string" || !value.text.trim()) return null;
    const pick = key => typeof value[key] === "string" ? value[key] : "";
    const image = pick("image");
    return {id: pick("id"), faction: pick("faction"), chapter: pick("chapter"),
      speaker: pick("speaker"), sub: pick("sub"), text: value.text,
      image: /^data\/illustrations\/[\w/.-]+\.(?:svg|webp|png|jpe?g)$/i.test(image) && !image.includes("..") ? image : ""};
  }
  function fingerprint(value) {
    const input = JSON.stringify([value.faction, value.chapter, value.turn, value.step, value.text]);
    let a = 2166136261, b = 5381;
    for (let i = 0; i < input.length; i++) { a = Math.imul(a ^ input.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ input.charCodeAt(i); }
    return "scene-" + (a >>> 0).toString(16) + "-" + (b >>> 0).toString(16);
  }
  function createStore(storage) {
    let items = [], error = null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some(item => !scene(item)?.id)) throw new Error("invalid_favorites");
      items = parsed.map(item => ({...scene(item), savedAt: Number(item.savedAt) || 0}));
    } catch (_) { error = "收藏暂时无法读取；原有数据未被覆盖。"; }
    function write(next) {
      // A failed read must never overwrite an unparsed collection.
      if (error) return {ok: false, message: error};
      try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); items = next; return {ok: true}; }
      catch (_) { return {ok: false, message: "收藏未保存，浏览器存储可能已满；原有收藏仍保留。"}; }
    }
    return {
      list: () => items.map(item => ({...item})), error: () => error,
      add(value) {
        const next = scene(value);
        if (!next?.id) return {ok: false, message: "当前没有可收藏的已交付场景。"};
        if (items.some(item => item.id === next.id && item.text === next.text)) return {ok: true, duplicate: true};
        return write([{...next, savedAt: Date.now()}, ...items]);
      },
      remove(id) { return write(items.filter(item => item.id !== id)); }
    };
  }
  return {createStore, fingerprint, scene, STORAGE_KEY};
});
