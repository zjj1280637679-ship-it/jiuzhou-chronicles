(function (root, factory) {
  const protocol = typeof module === "object" && module.exports ? require("./protocol.js") : root.JiuzhouHarnessProtocol;
  const pluginHost = typeof module === "object" && module.exports ? require("./plugin-host.js") : root.JiuzhouPluginHost;
  const effects = typeof module === "object" && module.exports ? require("./effects.js") : root.JiuzhouEffects;
  const api = factory(protocol, pluginHost, effects);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouHarness = api;
})(typeof self !== "undefined" ? self : this, function (protocol, pluginHost, effects) {
  "use strict";
  const clone = value => structuredClone(value);
  const {createPluginHost, awaitWithSignal, checkSignal, cancelled, failure} = pluginHost;
  async function createGameHarness(options) {
    if (!protocol || typeof options.model !== "function") throw new Error("harness_unconfigured");
    const {signal} = options;
    checkSignal(signal);
    const messages = clone(options.messages);
    const stats = {mode: "agent", modelCalls: 0, toolCalls: 0, cacheHitTokens: 0, cacheMissTokens: 0, cacheUsageKnown: true, promptTokens: 0,
      completionTokens: 0, reasoningTokens: 0, beatCount: 0, providerFinishReason: null, events: []};
    const emit = (type, detail = {}) => {
      const event = {type, modelCalls: stats.modelCalls, toolCalls: stats.toolCalls, ...detail};
      stats.events.push(event);
      try { options.onEvent?.(clone(event)); } catch (_) { /* UI listeners cannot break the turn. */ }
    };
    const host = await createPluginHost({...options, context: {world: clone(options.world || {}),
      illustrations: clone(Array.isArray(options.illustrations) ? options.illustrations : []),
      ...(options.illustrationCatalog ? {illustrationCatalog: clone(options.illustrationCatalog), illustrationBaseURL: options.illustrationBaseURL} : {})}});
    const modelTools = protocol.forModel(host.tools);
    // Background and popup drafts belong to this generation only and never change each other.
    let media = effects.emptyMedia();
    let lastRejectedStep = null;
    let lastModel = "";
    function settle(delivery) {
      checkSignal(signal);
      const story = protocol.normalizeStory(delivery);
      story.stage_effects = effects.deliveryEffects(story.stage_effects, media);
      stats.beatCount = story.beats.length;
      emit("delivered", {beatCount: stats.beatCount});
      return {data: {model: lastModel, choices: [{message: {role: "assistant", content: JSON.stringify(story)}, finish_reason: "stop"}],
        usage: {...(stats.cacheUsageKnown ? {prompt_cache_hit_tokens: stats.cacheHitTokens, prompt_cache_miss_tokens: stats.cacheMissTokens} : {}),
          prompt_tokens: stats.promptTokens, completion_tokens: stats.completionTokens,
          completion_tokens_details: {reasoning_tokens: stats.reasoningTokens}}, harness: clone(stats)}, harness: clone(stats)};
    }
    function trackProgress(fingerprint, output) {
      // Only consecutive identical steps are stalled. Re-reading after useful work is valid.
      const key = JSON.stringify([fingerprint, output.result]);
      if (lastRejectedStep === key) throw Object.assign(new Error("agent_stalled"), {code: "agent_stalled"});
      lastRejectedStep = key;
    }
    try {
      if (!host.tools.some(tool => tool.function.name === "deliver_story")) throw new Error("delivery_unavailable");
      while (true) {
        checkSignal(signal);
        stats.modelCalls++;
        emit("model_start");
        checkSignal(signal);
        const data = await awaitWithSignal(options.model({messages: clone(messages), tools: clone(modelTools), signal}), signal);
        checkSignal(signal);
        lastModel = typeof data?.model === "string" ? data.model : lastModel;
        const usage = data?.usage || {};
        const validCount = value => Number.isSafeInteger(value) && value >= 0;
        const num = value => validCount(value) ? value : 0;
        const hitValue = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens;
        const totalValue = usage.prompt_tokens;
        const missValue = validCount(usage.prompt_cache_miss_tokens) ? usage.prompt_cache_miss_tokens :
          validCount(totalValue) && validCount(hitValue) && totalValue >= hitValue ? totalValue - hitValue : null;
        const stepCacheKnown = validCount(hitValue) && validCount(missValue);
        stats.cacheUsageKnown = stats.cacheUsageKnown && stepCacheKnown;
        const hit = num(hitValue);
        stats.promptTokens += validCount(totalValue) ? totalValue : stepCacheKnown ? hit + missValue : 0;
        stats.cacheHitTokens += hit;
        stats.cacheMissTokens += num(missValue);
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
            ...(message.extra_content && typeof message.extra_content === "object" ? {extra_content: clone(message.extra_content)} : {}),
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
            messages.push({role: "tool", tool_call_id: call.id, content: JSON.stringify(protocol.modelResult(call.function.name, output.result))});
            media = effects.captureToolResult(media, call.function.name, output.result);
            emit("tool_end", {tool: call.function.name});
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
        emit("delivery_check");
        trackProgress(["final", message.content], output);
        if (output.result?.error?.code === "delivery_unavailable") throw new Error("delivery_unavailable");
        messages.push({role: "assistant", content: message.content,
          ...(message.extra_content && typeof message.extra_content === "object" ? {extra_content: clone(message.extra_content)} : {})},
          {role: "user", content: "【剧情格式有误，尚未交付】\n" + JSON.stringify(output.result) + "\n请修正剧情对象格式，提供有效的正文 beats[].text 后交付。"});
      }
    } finally {host.dispose();}
  }
  return {createPluginHost, createGameHarness};
});
