(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouContracts = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  // The JSON Schema subset used by our tools. No coercion, defaults or mutation.
  function issue(value, schema, path = "args") {
    const kinds = {object, array: Array.isArray, string: v => typeof v === "string", boolean: v => typeof v === "boolean",
      number: Number.isFinite, integer: Number.isSafeInteger};
    if (schema.type && (!kinds[schema.type] || !kinds[schema.type](value))) return `${path} 应为 ${schema.type}。`;
    if (schema.enum && !schema.enum.includes(value)) return `${path} 应选 ${schema.enum.join(" / ")}。`;
    if (typeof value === "number" && ((schema.minimum !== undefined && value < schema.minimum) ||
        (schema.maximum !== undefined && value > schema.maximum))) return `${path} 超出允许范围。`;
    if (typeof value === "string" && schema.minLength !== undefined && value.trim().length < schema.minLength) return `${path} 不能为空。`;
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) return `${path} 缺少内容。`;
      if (schema.items) for (let i = 0; i < value.length; i++) {
        const error = issue(value[i], schema.items, `${path}[${i}]`);
        if (error) return error;
      }
    }
    if (object(value)) {
      const properties = schema.properties || {};
      for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return `${path}.${key} 为必填。`;
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          if (schema.additionalProperties === false) return `${path}.${key} 不是可用参数。`;
        } else {
          const error = issue(value[key], properties[key], `${path}.${key}`);
          if (error) return error;
        }
      }
    }
    return null;
  }
  function toolDefinition(value) {
    return value?.type === "function" && typeof value.function?.name === "string" &&
      /^[a-zA-Z0-9_-]+$/.test(value.function.name) && object(value.function.parameters) && value.function.parameters.type === "object";
  }
  function argumentError(name, message) {
    const code = /^(?:browse_illustrations|search_illustrations|list_illustrations|show_illustration|select_illustration|set_scene_background)$/.test(name)
      ? "invalid_illustration_arguments" : ["write_draft", "deliver_story"].includes(name) ? "invalid_draft" : "invalid_tool_arguments";
    return {result: {ok: false, error: {code, message}}};
  }
  return {object, issue, toolDefinition, argumentError};
});
