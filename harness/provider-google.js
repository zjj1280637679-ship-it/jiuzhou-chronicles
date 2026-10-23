(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouGoogleProvider = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  const model = "gemini-flash-lite-latest";
  function create({endpointURL, identity, fail}) {
    return {
      id: "google", label: "Google Gemini",
      resolve(config) {
        const url = endpointURL(config.endpoint);
        if (/\/v1beta\/openai\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, "") + "/chat/completions";
        const selectedModel = config.model === "custom" ? config.customModel : config.model;
        if (typeof selectedModel !== "string" || !selectedModel.trim()) throw fail("invalid_model");
        if (url.hostname === "generativelanguage.googleapis.com" && !config.apiKey) throw fail("missing_api_key");
        return {label: "Google Gemini", endpoint: url.href,
          model: selectedModel.trim(), adapter: "google", tokenParameter: "max_tokens",
          headers: {"Content-Type": "application/json", ...(config.apiKey ? {Authorization: "Bearer " + config.apiKey} : {})},
          identity: identity(["google", url.href, selectedModel.trim(), config.apiKey])};
      },
      request(route, options) {
        const messages = structuredClone(options.messages).map(message => {
          const {reasoning_content, ...standard} = message;
          return standard; // Preserve opaque Google thought signatures and original tool call IDs.
        });
        return {model: route.model, messages, stream: false,
          ...(options.harness && options.tools?.length ? {tools: structuredClone(options.tools)} : {}),
          ...(!options.harness ? {response_format: {type: "json_object"}} : {})};
      }
    };
  }
  return {create, endpoint, model};
});
