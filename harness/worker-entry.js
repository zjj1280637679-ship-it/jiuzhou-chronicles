"use strict";
importScripts("protocol.js?v=20261019-0501");
// Each plugin gets its own Worker and structured-cloned data. It receives no DOM or engine reference.
let plugin, context;
self.onmessage = async event => {
  const message = event.data;
  try {
    if (message.type === "init") {
      context = message.context;
      importScripts(message.url);
      plugin = self.JiuzhouPlugin;
      if (!plugin || typeof plugin.execute !== "function" || !Array.isArray(plugin.tools)) throw new Error("invalid_plugin");
      self.postMessage({type: "ready", tools: plugin.tools});
      return;
    }
    if (message.type !== "call" || !plugin) throw new Error("plugin_unavailable");
    const output = await plugin.execute(message.name, message.args, context);
    self.postMessage({type: "result", id: message.id, result: output.result, ...(output.delivery ? {delivery: output.delivery} : {})});
  } catch (error) {
    // Never send plugin stacks, captured environment variables or request credentials to the model.
    self.postMessage({type: "error", id: message.id, error: {code: "plugin_execution_failed", message: "插件执行失败，本次没有提交剧情。"}});
  }
};
