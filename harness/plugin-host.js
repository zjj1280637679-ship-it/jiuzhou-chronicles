(function (root, factory) {
  const contracts = typeof module === "object" && module.exports ? require("./contracts.js") : root.JiuzhouContracts;
  const scriptURL = typeof document !== "undefined" ? document.currentScript?.src : null;
  const api = factory(contracts, scriptURL ? new URL("./", scriptURL).href : null);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouPluginHost = api;
})(typeof self !== "undefined" ? self : this, function (contracts, defaultBaseURL) {
  "use strict";
  const clone = value => structuredClone(value);
  const cancelled = () => Object.assign(new Error("request_cancelled"), {code: "request_cancelled"});
  const failure = (code, message) => ({result: {ok: false, error: {code, message}}});
  function checkSignal(signal) { if (signal?.aborted) throw cancelled(); }
  function awaitWithSignal(promise, signal) {
    if (!signal) return promise;
    // The operation may have synchronously aborted while creating an already-rejected Promise.
    // Consume that rejection even when cancellation wins before the listener can be installed.
    if (signal.aborted) {
      Promise.resolve(promise).catch(() => {});
      return Promise.reject(cancelled());
    }
    return new Promise((resolve, reject) => {
      const abort = () => reject(cancelled());
      signal.addEventListener("abort", abort, {once: true});
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  async function createPluginHost(options = {}) {
    const {signal, context = {}} = options;
    checkSignal(signal);
    const baseURL = options.baseURL || defaultBaseURL;
    if (!baseURL) throw new Error("plugin_base_url_missing");
    const manifests = options.plugins || [
      {id: "world", url: new URL("plugins/world.js", baseURL).href},
      {id: "story", url: new URL("plugins/story.js", baseURL).href},
      {id: "illustrations", url: new URL("plugins/illustrations.js", baseURL).href}
    ];
    const builtInContext = {world: ["world"], story: [], illustrations: ["illustrations", "illustrationCatalog", "illustrationBaseURL"]};
    function contextFor(manifest) {
      const keys = manifest.contextKeys ?? builtInContext[manifest.id];
      // Explicit projections for built-ins; older custom plugins keep their private clone.
      return clone(Array.isArray(keys) ? Object.fromEntries(keys.filter(key => Object.hasOwn(context, key)).map(key => [key, context[key]])) : context);
    }
    const makeWorker = options.workerFactory || (url => new Worker(url));
    const assetVersion = "20261025-contract03";
    const timeoutMs = options.pluginTimeoutMs ?? 10000;
    const entries = [], registry = new Map();
    let sequence = 0, disposed = false;
    function stop(entry, code = "plugin_unavailable") {
      entry.failed = true;
      entry.worker.terminate();
      for (const pending of entry.pending.values()) pending.resolve(failure(code, "此插件暂不可用，其他插件可继续运行。"));
      entry.pending.clear();
      entry.readyDone?.();
    }
    try {
      // Boot independently: a bad optional plugin cannot suppress healthy registrations.
      await awaitWithSignal(Promise.all(manifests.map(async manifest => {
        if (entries.some(e => e.id === manifest.id)) throw new Error("duplicate_plugin");
        let worker;
        try { worker = makeWorker(new URL("worker-entry.js?v=" + assetVersion, baseURL).href); }
        catch (_) { return; }
        const entry = {id: manifest.id, worker, pending: new Map(), failed: false};
        entries.push(entry);
        await new Promise(resolve => {
          let ready = false;
          const timer = setTimeout(() => {stop(entry, "plugin_start_timeout"); resolve();}, timeoutMs);
          entry.readyDone = () => {clearTimeout(timer); resolve();};
          worker.onmessage = event => {
            const message = event.data;
            if (message.type === "ready" && !ready && !entry.failed) {
              ready = true;
              const definitions = Array.isArray(message.tools) ? message.tools : [];
              entry.definitions = definitions;
              entry.readyDone();
              return;
            }
            if (message.type === "error" && !ready) {stop(entry); entry.readyDone(); return;}
            const pending = entry.pending.get(message.id);
            if (!pending) return;
            entry.pending.delete(message.id);
            if (message.type !== "result" || typeof message.result?.ok !== "boolean") {
              pending.resolve(failure("plugin_execution_failed", "插件未返回有效回执，本次没有提交剧情。"));
              return;
            }
            const canDeliver = registry.get("deliver_story")?.entry === entry &&
              ["deliver_story", "accept_delivery"].includes(pending.name) && message.result.ok === true;
            pending.resolve({result: message.result, ...(canDeliver && message.delivery ? {delivery: message.delivery} : {})});
          };
          worker.onerror = event => {event.preventDefault?.(); stop(entry); entry.readyDone();};
          const pluginURL = new URL(manifest.url, baseURL);
          pluginURL.searchParams.set("v", assetVersion);
          worker.postMessage({type: "init", url: pluginURL.href, context: contextFor(manifest)});
        });
      })), signal);
      checkSignal(signal);
      // Registration order belongs to configuration, never to nondeterministic worker boot timing.
      for (const entry of entries) {
        if (entry.failed) continue;
        const definitions = entry.definitions || [];
        const names = definitions.map(t => t?.function?.name);
        if (definitions.some(definition => !contracts.toolDefinition(definition)) || names.some(n => registry.has(n)) || new Set(names).size !== names.length) {
          stop(entry, "duplicate_tool");
          continue;
        }
        for (const definition of definitions) registry.set(definition.function.name, {entry, definition});
      }
    } catch (error) {
      entries.forEach(entry => stop(entry));
      throw error;
    }
    function invokeOn(entry, name, args) {
      checkSignal(signal);
      if (disposed || entry.failed) return Promise.resolve(failure("plugin_unavailable", "插件暂不可用。"));
      const id = ++sequence;
      const operation = new Promise(resolve => {
        const timer = setTimeout(() => stop(entry, "plugin_timeout"), timeoutMs);
        entry.pending.set(id, {name, resolve: value => {clearTimeout(timer); resolve(value);}});
        try {entry.worker.postMessage({type: "call", id, name, args: clone(args)});}
        catch (_) {stop(entry);}
      });
      return awaitWithSignal(operation, signal);
    }
    return {
      tools: [...registry.values()].map(r => clone(r.definition)).sort((a, b) => a.function.name.localeCompare(b.function.name, "en")),
      invoke(name, args) {
        const binding = registry.get(name);
        if (!binding) return Promise.resolve(failure("unknown_tool", "没有注册此工具，请选择可用工具。"));
        const error = contracts.issue(args, binding.definition.function.parameters);
        return error ? Promise.resolve(contracts.argumentError(name, error)) : invokeOn(binding.entry, name, args);
      },
      acceptDelivery(story) {
        const binding = registry.get("deliver_story");
        return binding ? invokeOn(binding.entry, "accept_delivery", {story}) : Promise.resolve(failure("delivery_unavailable", "剧情交付插件不可用。"));
      },
      dispose() {disposed = true; entries.forEach(entry => stop(entry));}
    };
  }
  return {createPluginHost, awaitWithSignal, checkSignal, cancelled, failure};
});
