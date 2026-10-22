"use strict";
// importScripts resolves against the Worker entry URL, not this imported plugin's URL.
importScripts(new URL("../illustration-system.js?v=20261022-2200", self.location.href).href);

let registry = null;
let selections = [];
const invalid = message => ({result: {ok: false, error: {code: "invalid_illustration_arguments", message}}});
function getRegistry(context) {
  if (!registry) registry = self.JiuzhouIllustrations.createRegistry({assets: Array.isArray(context.illustrations) ? context.illustrations : []});
  return registry;
}
function hasOnly(args, names) {
  return args && typeof args === "object" && !Array.isArray(args) && Object.keys(args).every(name => names.includes(name));
}
self.JiuzhouPlugin = {
  name: "illustrations",
  tools: self.JiuzhouHarnessProtocol.tools.filter(tool => ["list_illustrations", "select_illustration"].includes(tool.function.name)),
  execute(name, args, context) {
    if (name === "list_illustrations") {
      if (!hasOnly(args, ["faction", "query", "category", "includeLegacy"]) ||
          ["faction", "query", "category"].some(key => args[key] !== undefined && typeof args[key] !== "string") ||
          (args.includeLegacy !== undefined && typeof args.includeLegacy !== "boolean")) {
        return invalid("目录查询只接受faction、query、category文字与includeLegacy布尔值。");
      }
      const items = getRegistry(context).list(args);
      return {result: {ok: true, illustrations: items, count: items.length,
        selectionRule: "按目录ID选图；afterBeat为原始正文段落位置，插画只在本轮正文成功交付后出现。"}};
    }
    if (name === "select_illustration") {
      if (!hasOnly(args, ["id", "afterBeat", "caption", "clear"]) || (args.clear !== undefined && typeof args.clear !== "boolean")) {
        return invalid("选图只接受id、afterBeat、caption及clear，不接受URL或图片路径。");
      }
      if (args.clear === true) {
        selections = [];
        return {result: {ok: true, selections: [], pending: true}};
      }
      const normalized = getRegistry(context).normalizeSelection({id: args.id, afterBeat: args.afterBeat, caption: args.caption});
      if (!normalized.ok) return {result: {ok: false, error: normalized.error || {code: "invalid_illustration_selection", message: "请使用目录中的有效插画ID与非负整数段落位置。"}}};
      const selection = normalized.selection;
      selections = selections.filter(previous => previous.afterBeat !== selection.afterBeat);
      selections.push(selection);
      selections.sort((left, right) => left.afterBeat - right.afterBeat);
      return {result: {ok: true, selection, selections, pending: true}};
    }
    throw new Error("unknown_tool");
  }
};
