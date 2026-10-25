(function (root, factory) {
  const contracts = typeof module === "object" && module.exports ? require("./contracts.js") : root.JiuzhouContracts;
  const api = factory(contracts);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouEffects = api;
})(typeof self !== "undefined" ? self : this, function (contracts) {
  "use strict";
  const clone = value => structuredClone(value);
  const str = {type: "string"};
  const reference = {id: {...str, minLength: 1}, token: {...str, minLength: 1}, clear: {type: "boolean"}};
  const schemas = {
    screen_flash: {color: {type: "string", enum: ["white", "red", "gold", "dark"]}},
    screen_shake: {intensity: {type: "string", enum: ["light", "medium", "heavy", "earthquake"]},
      duration: {type: "integer", minimum: 1, maximum: 2147483647}},
    weather_effect: {type: {type: "string", enum: ["clear", "rain", "blizzard", "sparks"]}},
    show_illustration: {...reference, afterBeat: {type: "integer", minimum: 0}, caption: str},
    set_scene_background: reference,
    grant_item: {name: {...str, minLength: 1}, desc: str, power: {type: "number"}, aspects: {type: "array", items: str}, type: str, icon: str},
    danger_tick: {delta: {type: "number"}}
  };
  const mediaChannel = name => name === "set_scene_background" ? "background" :
    name === "show_illustration" || name === "select_illustration" || /^(qing|ming|mongol|nanming)_/.test(name || "") ? "popups" : null;
  const invalid = message => ({ok: false, error: {code: "invalid_stage_effect", message}});
  function normalize(value, registry) {
    if (!contracts.object(value)) return invalid("效果必须是对象。");
    let name = value.name || value.tool;
    if (typeof name !== "string") return invalid("效果缺少名称。");
    let params = value.params === undefined ? {} : value.params;
    if (!contracts.object(params)) return invalid("效果参数必须是对象。");
    // Older per-image names and description fields enter through this adapter only.
    if (mediaChannel(name) === "popups") {
      params = {...params};
      if (name !== "show_illustration" && name !== "select_illustration" && params.id === undefined) params.id = name;
      if (params.description !== undefined) {
        if (params.caption === undefined) params.caption = params.description;
        delete params.description;
      }
      name = "show_illustration";
    }
    if (!Object.hasOwn(schemas, name)) return invalid("效果名称未登记。");
    const error = contracts.issue(params, {type: "object", properties: schemas[name], additionalProperties: false,
      required: name === "grant_item" ? ["name"] : name === "danger_tick" ? ["delta"] : []}, "params");
    if (error) return invalid(error);
    if (mediaChannel(name)) {
      if (params.clear === true) {
        if (Object.keys(params).length !== 1) return invalid("清空时只传clear:true。");
        return {ok: true, effect: {name, params: {clear: true}}};
      }
      if (params.id === undefined && params.token === undefined) return invalid("提供图片token短语。");
      if ([params.id, params.token].some(value => typeof value === "string" && /^(?:[a-z][a-z0-9+.-]*:|\/|data[\\/])/i.test(value))) {
        return invalid("图片引用只接受已登记的短语或ID，不接受URL和路径。");
      }
      if (registry) {
        const selected = name === "show_illustration" ? registry.normalizeSelection(params) : registry.reference(params);
        if (!selected.ok) return selected;
        params = name === "show_illustration" ? selected.selection : {id: selected.asset.id};
      }
    }
    return {ok: true, effect: {name, params: clone(params)}};
  }
  function normalizeAll(values, registry) {
    const effects = [], warnings = [];
    for (const value of Array.isArray(values) ? values : []) {
      const result = normalize(value, registry);
      if (result.ok) effects.push(result.effect);
      else warnings.push(result.error);
    }
    return {effects, warnings};
  }
  // Two independent registers; no DOM, model requests, workers or engine state.
  const emptyMedia = () => ({popups: [], background: null, popupsTouched: false, backgroundTouched: false});
  function reduceMedia(state, effect) {
    if (effect.name === "show_illustration") return {...state, popupsTouched: true,
      popups: effect.params.clear === true ? [] : [...state.popups.filter(old => old.afterBeat !== effect.params.afterBeat), clone(effect.params)]
        .sort((a, b) => a.afterBeat - b.afterBeat)};
    if (effect.name === "set_scene_background") return {...state, backgroundTouched: true, background: clone(effect.params)};
    return state;
  }
  function planMedia(values, registry) {
    let state = emptyMedia();
    for (const effect of normalizeAll(values, registry).effects) state = reduceMedia(state, effect);
    return state;
  }
  // Tool receipt integration lives here, rather than in the model loop or renderer.
  function captureToolResult(state, name, result) {
    if (result?.ok !== true) return state;
    if (["show_illustration", "select_illustration"].includes(name) && Array.isArray(result.selections)) {
      return {...state, popupsTouched: true, popups: clone(result.selections)};
    }
    if (name === "set_scene_background" && contracts.object(result.backgroundChange)) {
      return {...state, backgroundTouched: true, background: clone(result.backgroundChange)};
    }
    return state;
  }
  function deliveryEffects(inline, native) {
    // An explicit native operation owns only its own channel, including an empty/cleared one.
    const effects = (Array.isArray(inline) ? inline : []).filter(effect => {
      const channel = mediaChannel(effect.name);
      return !(channel === "popups" && native.popupsTouched) && !(channel === "background" && native.backgroundTouched);
    }).map(clone);
    if (native.backgroundTouched && native.background) effects.push({name: "set_scene_background", params: clone(native.background)});
    effects.push(...native.popups.map(params => ({name: "show_illustration", params: clone(params)})));
    return effects;
  }
  // Models use these three presentation effects. Image tools remain independent.
  const modelSchema = {type: "array", items: {type: "object", additionalProperties: false, required: ["name"], properties: {
    name: {type: "string", enum: ["screen_flash", "screen_shake", "weather_effect"]},
    params: {type: "object", additionalProperties: false,
      properties: {...schemas.screen_flash, ...schemas.screen_shake, ...schemas.weather_effect}}
  }}};
  return {normalize, normalizeAll, mediaChannel, emptyMedia, reduceMedia, planMedia, captureToolResult, deliveryEffects, modelSchema};
});
