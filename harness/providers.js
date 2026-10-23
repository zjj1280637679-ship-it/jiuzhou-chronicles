(function (root, factory) {
  const google = typeof module === "object" && module.exports ? require("./provider-google.js") : root.JiuzhouGoogleProvider;
  const api = factory(google);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouProviders = api;
})(typeof self !== "undefined" ? self : this, function (google) {
  "use strict";
  const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
  const sessionSalt = String(Math.random()) + String(Math.random());
  const plugins = new Map();
  const routeOwners = new WeakMap();
  const fail = code => Object.assign(new Error(code), {code});
  const presets = [
    {id: "deepseek", label: "DeepSeek 官方", source: "custom", endpoint: DEFAULT_ENDPOINT, model: "deepseek-flash", adapter: "auto", tokenParameter: "max_tokens"},
    ...(google ? [{id: "google", label: "Google Gemini", source: "google", endpoint: google.endpoint, model: google.model, adapter: "auto", tokenParameter: "max_tokens"}] : []),
    {id: "custom", label: "自定义 / 本机 API", source: "custom"}
  ];
  function normalizeConfig(value) {
    const saved = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const config = saved || {};
    const endpoint = typeof config.endpoint === "string" ? config.endpoint.trim() : config.source === "google" && google ? google.endpoint : DEFAULT_ENDPOINT;
    const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
    // Retired shared settings must never silently activate stored personal credentials.
    const retiredShared = config.source === "shared" || (!config.source && !apiKey && endpoint.replace(/\/$/, "") === DEFAULT_ENDPOINT);
    const source = retiredShared ? "custom" : typeof config.source === "string" && config.source ? config.source : "custom";
    return {...config, enabled: Boolean(saved && !retiredShared && config.enabled === true), source,
      sharedApiRemoved: config.sharedApiRemoved === true || Boolean(saved && retiredShared),
      adapter: ["auto", "openai", "deepseek"].includes(config.adapter) ? config.adapter : "auto",
      tokenParameter: config.tokenParameter === "max_completion_tokens" ? "max_completion_tokens" : "max_tokens",
      model: typeof config.model === "string" ? config.model.trim() : source === "google" && google ? google.model : "deepseek-flash",
      customModel: typeof config.customModel === "string" ? config.customModel.trim() : "",
      endpoint, apiKey,
      maxTokens: config.maxTokens === "" || config.maxTokens == null ? null : config.maxTokens};
  }
  function endpointURL(value) {
    let url;
    try {url = new URL(value);} catch (_) {throw fail("invalid_private_endpoint");}
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password || url.hash) throw fail("invalid_private_endpoint");
    return url;
  }
  function identity(parts) {
    // An opaque, session-local comparison token; not an authentication mechanism.
    // Credentials never become visible labels, URLs or stored telemetry fields.
    const input = sessionSalt + JSON.stringify(parts);
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < input.length; i++) {
      a = Math.imul(a ^ input.charCodeAt(i), 0x01000193);
      b = Math.imul(b ^ input.charCodeAt(i), 0x85ebca6b);
    }
    return "route-" + (a >>> 0).toString(16) + (b >>> 0).toString(16);
  }
  function register(plugin) {
    if (!plugin || typeof plugin.id !== "string" || typeof plugin.resolve !== "function" || typeof plugin.request !== "function") throw fail("invalid_provider");
    if (plugins.has(plugin.id)) throw fail("duplicate_provider");
    plugins.set(plugin.id, plugin);
    return () => {if (plugins.get(plugin.id) === plugin) plugins.delete(plugin.id);};
  }
  register({
    id: "custom", label: "自定义 API",
    resolve(config) {
      const url = endpointURL(config.endpoint);
      // Accept the conventional /v1 base used by the previous Base URL settings field.
      // Complete this known base only; leave explicit endpoints and custom paths untouched.
      if (/\/v1\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, "") + "/chat/completions";
      const model = config.model === "custom" ? config.customModel : config.model;
      if (typeof model !== "string" || !model.trim()) throw fail("invalid_model");
      const adapter = config.adapter === "auto" ? url.hostname === "api.deepseek.com" ? "deepseek" : "openai" : config.adapter;
      return {source: "custom", id: "custom", label: "自定义 API", useGateway: false, endpoint: url.href, model: model.trim(), adapter,
        tokenParameter: config.tokenParameter,
        headers: {"Content-Type": "application/json", ...(config.apiKey ? {Authorization: "Bearer " + config.apiKey} : {})},
        identity: identity(["custom", url.href, model.trim(), adapter, config.tokenParameter, config.apiKey])};
    },
    request(route, options) {
      const messages = structuredClone(options.messages).map(message => {
        if (route.adapter === "deepseek") return message;
        const {reasoning_content, ...standard} = message;
        return standard;
      });
      return {model: route.model, messages, stream: false,
        ...(options.harness && options.tools?.length ? {tools: structuredClone(options.tools)} : {}),
        ...(route.adapter === "deepseek" ? {thinking: {type: "disabled"},
          ...(!options.harness ? {response_format: {type: "json_object"}} : {})} : {})};
    }
  });
  if (google) register(google.create({endpointURL, identity, fail}));
  function presetId(value) {
    const config = normalizeConfig(value);
    if (config.source === "google") return "google";
    try {
      if (config.source === "custom" && new URL(config.endpoint).hostname === "api.deepseek.com") return "deepseek";
    } catch (_) {}
    return "custom";
  }
  function resolve(value, context = {}) {
    const config = normalizeConfig(value);
    const plugin = plugins.get(config.source);
    if (!plugin) throw fail("invalid_provider");
    const route = Object.freeze({...plugin.resolve(config, context), source: config.source, id: plugin.id});
    routeOwners.set(route, plugin);
    return route;
  }
  function createRequest(route, options) {
    const plugin = routeOwners.get(route);
    if (!plugin || plugins.get(route.id) !== plugin) throw fail("provider_changed");
    const body = plugin.request(route, options);
    if (options.maxTokens !== undefined && options.maxTokens !== null && options.maxTokens !== "") {
      const count = Number(options.maxTokens);
      if (!Number.isSafeInteger(count) || count < 1) throw fail("invalid_max_tokens");
      body[route.useGateway ? "max_tokens" : route.tokenParameter || "max_tokens"] = count;
    }
    return {endpoint: route.endpoint, headers: {...route.headers}, body, useGateway: route.useGateway};
  }
  return {normalizeConfig, resolve, createRequest, register,
    list: () => [...plugins.values()].map(plugin => ({id: plugin.id, label: plugin.label || plugin.id})),
    presets: () => structuredClone(presets), presetId, DEFAULT_ENDPOINT};
});
