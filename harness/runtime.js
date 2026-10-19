(function (root, factory) {
  const protocol = typeof module === "object" && module.exports ? require("./protocol.js") : root.JiuzhouHarnessProtocol;
  const scriptURL = typeof document !== "undefined" ? document.currentScript?.src : null;
  const api = factory(protocol, scriptURL ? new URL("./", scriptURL).href : null);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouHarness = api;
})(typeof self !== "undefined" ? self : this, function (protocol, defaultBaseURL) {
  "use strict";
  const clone = value => structuredClone(value);
  const cancelled = () => Object.assign(new Error("request_cancelled"), {code: "request_cancelled"});
  const failure = (code, message) => ({result: {ok: false, error: {code, message}}});
  function checkSignal(signal) { if (signal?.aborted) throw cancelled(); }
  function awaitWithSignal(promise, signal) {
    if (!signal) return promise;
    checkSignal(signal);
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
      {id: "story", url: new URL("plugins/story.js", baseURL).href}
    ];
    const makeWorker = options.workerFactory || (url => new Worker(url));
    const assetVersion = "20261019-0500";
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
            pending.resolve(message.type === "result" ? {result: message.result, ...(message.delivery ? {delivery: message.delivery} : {})}
              : failure("plugin_execution_failed", "插件执行失败，本次没有提交剧情。"));
          };
          worker.onerror = event => {event.preventDefault?.(); stop(entry); entry.readyDone();};
          const pluginURL = new URL(manifest.url, baseURL);
          pluginURL.searchParams.set("v", assetVersion);
          worker.postMessage({type: "init", url: pluginURL.href, context: clone(context)});
        });
      })), signal);
      checkSignal(signal);
      // Registration order belongs to configuration, never to nondeterministic worker boot timing.
      for (const entry of entries) {
        if (entry.failed) continue;
        const definitions = entry.definitions || [];
        const names = definitions.map(t => t?.function?.name);
        if (names.some(n => typeof n !== "string" || registry.has(n)) || new Set(names).size !== names.length) {
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
        entry.pending.set(id, {resolve: value => {clearTimeout(timer); resolve(value);}});
        try {entry.worker.postMessage({type: "call", id, name, args: clone(args)});}
        catch (_) {stop(entry);}
      });
      return awaitWithSignal(operation, signal);
    }
    return {
      tools: [...registry.values()].map(r => clone(r.definition)).sort((a, b) => a.function.name.localeCompare(b.function.name, "en")),
      invoke(name, args) {
        const binding = registry.get(name);
        return binding ? invokeOn(binding.entry, name, args) : Promise.resolve(failure("unknown_tool", "没有注册此工具，请选择可用工具。"));
      },
      acceptDelivery(story) {
        const binding = registry.get("deliver_story");
        return binding ? invokeOn(binding.entry, "accept_delivery", {story}) : Promise.resolve(failure("delivery_unavailable", "剧情交付插件不可用。"));
      },
      dispose() {disposed = true; entries.forEach(entry => stop(entry));}
    };
  }
  async function createGameHarness(options) {
    if (!protocol || typeof options.model !== "function") throw new Error("harness_unconfigured");
    const {signal} = options;
    checkSignal(signal);
    const targetCharacters = Number.isSafeInteger(options.targetCharacters) && options.targetCharacters > 0 ? options.targetCharacters : 2000;
    const messages = clone(options.messages);
    const stats = {mode: "agent", modelCalls: 0, toolCalls: 0, cacheHitTokens: 0, cacheMissTokens: 0,
      completionTokens: 0, reasoningTokens: 0, deliveryCharacters: 0, hanCharacters: 0, providerFinishReason: null, events: []};
    const emit = (type, detail = {}) => {
      const event = {type, modelCalls: stats.modelCalls, toolCalls: stats.toolCalls, ...detail};
      stats.events.push(event);
      try { options.onEvent?.(clone(event)); } catch (_) { /* UI listeners cannot break the turn. */ }
    };
    const host = await createPluginHost({...options, context: {world: clone(options.world || {}), targetCharacters}});
    let lastRejectedStep = null;
    let lastModel = "";
    function settle(delivery) {
      const story = protocol.normalizeStory(delivery);
      const measured = protocol.measureStory(story);
      stats.deliveryCharacters = measured.textCharacters;
      stats.hanCharacters = measured.hanCharacters;
      emit("delivered", {textCharacters: measured.textCharacters, targetCharacters});
      return {data: {model: lastModel, choices: [{message: {role: "assistant", content: JSON.stringify(story)}, finish_reason: "stop"}],
        usage: {prompt_cache_hit_tokens: stats.cacheHitTokens, prompt_cache_miss_tokens: stats.cacheMissTokens,
          prompt_tokens: stats.cacheHitTokens + stats.cacheMissTokens, completion_tokens: stats.completionTokens,
          completion_tokens_details: {reasoning_tokens: stats.reasoningTokens}}, harness: clone(stats)}, harness: clone(stats)};
    }
    function trackProgress(fingerprint, output) {
      // Only consecutive identical steps are stalled. Re-reading after useful work is valid.
      const key = JSON.stringify([fingerprint, output.result]);
      if (lastRejectedStep === key) throw Object.assign(new Error("agent_stalled"), {code: "agent_stalled"});
      lastRejectedStep = key;
    }
    try {
      while (true) {
        checkSignal(signal);
        stats.modelCalls++;
        emit("model_start");
        const data = await awaitWithSignal(options.model({messages: clone(messages), tools: clone(host.tools), signal}), signal);
        checkSignal(signal);
        lastModel = typeof data?.model === "string" ? data.model : lastModel;
        const usage = data?.usage || {};
        const num = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
        const hit = num(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens);
        stats.cacheHitTokens += hit;
        stats.cacheMissTokens += num(usage.prompt_cache_miss_tokens ?? Math.max(0, num(usage.prompt_tokens) - hit));
        stats.completionTokens += num(usage.completion_tokens);
        stats.reasoningTokens += num(usage.completion_tokens_details?.reasoning_tokens);
        emit("model_end");
        const choice = data?.choices?.[0], message = choice?.message;
        stats.providerFinishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
        if (choice?.finish_reason === "length") throw new Error("output_truncated");
        if (choice?.finish_reason && !["stop", "tool_calls"].includes(choice.finish_reason)) throw new Error("output_incomplete");
        const calls = message?.tool_calls;
        if (Array.isArray(calls) && calls.length) {
          if (choice.finish_reason !== "tool_calls") throw new Error("invalid_tool_response");
          const seen = new Set();
          if (calls.some(c => typeof c.id !== "string" || !c.id || seen.has(c.id) || !seen.add(c.id) || c.type !== "function" || typeof c.function?.name !== "string" || typeof c.function?.arguments !== "string")) throw new Error("invalid_tool_response");
          // Keep original argument strings and call IDs. Future steps extend, rather than rewrite, this prefix.
          messages.push({role: "assistant", content: typeof message.content === "string" ? message.content : null, tool_calls: clone(calls),
            ...(typeof message.reasoning_content === "string" ? {reasoning_content: message.reasoning_content} : {})});
          let delivery;
          const stepResults = [];
          for (const call of calls) {
            checkSignal(signal);
            stats.toolCalls++;
            emit("tool_start", {tool: call.function.name});
            let output;
            try {
              const args = JSON.parse(call.function.arguments);
              output = args && typeof args === "object" && !Array.isArray(args) ? await host.invoke(call.function.name, args)
                : failure("invalid_tool_arguments", "工具参数必须是JSON对象。");
            } catch (error) {
              if (signal?.aborted) throw cancelled();
              output = failure("invalid_tool_arguments", "工具参数不是有效JSON对象，请修正参数。");
            }
            messages.push({role: "tool", tool_call_id: call.id, content: JSON.stringify(output.result)});
            emit("tool_end", {tool: call.function.name, ...(output.result?.textCharacters !== undefined ? {textCharacters: output.result.textCharacters, targetCharacters} : {})});
            stepResults.push([call.function.name, call.function.arguments, output.result]);
            if (output.delivery) delivery = output.delivery;
          }
          if (delivery) return settle(delivery);
          trackProgress(["tools", stepResults], {result: null});
          continue;
        }
        if (typeof message?.content !== "string" || !message.content.trim()) throw new Error("invalid_game_response");
        let output;
        try {output = await host.acceptDelivery(JSON.parse(message.content));}
        catch (error) {if (signal?.aborted) throw cancelled(); output = failure("invalid_game_response", "请提供合法剧情JSON或使用write_draft与deliver_story工具。");}
        if (output.delivery) return settle(output.delivery);
        emit("delivery_check", {textCharacters: output.result?.textCharacters || 0, targetCharacters});
        trackProgress(["final", message.content], output);
        if (output.result?.error?.code === "delivery_unavailable") throw new Error("delivery_unavailable");
        messages.push({role: "assistant", content: message.content}, {role: "user", content: "【剧情交付检查，尚未交付】\n" + JSON.stringify(output.result) + "\n请依据检查继续补写或修订，只计算最终正文，达到目标后再交付。"});
      }
    } finally {host.dispose();}
  }
  return {createPluginHost, createGameHarness};
});
