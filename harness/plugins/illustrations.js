"use strict";
// importScripts resolves against the Worker entry URL, not this imported plugin's URL.
importScripts(new URL("../illustration-system.js?v=20261025-gallery01", self.location.href).href);

let registry = null;
let selections = [];
let backgroundChange = null;
const invalid = message => ({result: {ok: false, error: {code: "invalid_illustration_arguments", message}}});
function getRegistry(context) {
  if (!registry) registry = self.JiuzhouIllustrations.createRegistry(context.illustrationCatalog ?
    {...context.illustrationCatalog, baseURL: context.illustrationBaseURL} : {assets: Array.isArray(context.illustrations) ? context.illustrations : []});
  return registry;
}
function hasOnly(args, names) {
  return args && typeof args === "object" && !Array.isArray(args) && Object.keys(args).every(name => names.includes(name));
}
self.JiuzhouPlugin = {
  name: "illustrations",
  tools: self.JiuzhouHarnessProtocol.tools.filter(tool => ["list_illustrations", "browse_illustrations", "search_illustrations", "select_illustration", "set_scene_background"].includes(tool.function.name)),
  async execute(name, args, context) {
    if (["list_illustrations", "search_illustrations", "browse_illustrations"].includes(name)) {
      const fields = name === "browse_illustrations" ? ["faction", "includeLegacy", "path", "page", "pageSize"] :
        ["faction", "query", "category", "includeLegacy", "path", "page", "pageSize"];
      if (!hasOnly(args, fields) ||
          ["faction", "query", "category", "path"].some(key => args[key] !== undefined && typeof args[key] !== "string") ||
          (args.includeLegacy !== undefined && typeof args.includeLegacy !== "boolean") ||
          (args.page !== undefined && (!Number.isSafeInteger(args.page) || args.page < 1)) ||
          (args.pageSize !== undefined && (!Number.isSafeInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 50))) {
        return invalid("查询接受文字筛选、includeLegacy，以及正整数page与1至50的pageSize。");
      }
      const currentRegistry = getRegistry(context);
      try {
        const result = name === "browse_illustrations" ? currentRegistry.browse(args) : await currentRegistry.search(args);
        return {result: {ok: true, ...result,
          selectionRule: "用返回的token准确选图；背景与图片弹窗分别调用。结果分页，hasMore为true时可继续下一页；查询不下载图片、不改变画面。"}};
      } catch (_) {
        return {result: {ok: false, error: {code: "illustration_metadata_unavailable", message: "图库检索资料暂不可用；已知短语仍可直接选图，也可继续正文。"}}};
      }
    }
    if (name === "set_scene_background") {
      if (!hasOnly(args, ["id", "token", "clear"]) || (args.clear !== undefined && typeof args.clear !== "boolean")) {
        return invalid("舞台背景只接受token短语或旧id及clear，不接受URL、图片路径或弹窗参数。");
      }
      if (args.clear === true) {
        backgroundChange = {clear: true};
      } else {
        const selected = getRegistry(context).reference(args);
        if (!selected.ok) return {result: selected};
        backgroundChange = {id: selected.asset.id};
      }
      return {result: {ok: true, backgroundChange: {...backgroundChange}, pending: true}};
    }
    if (name === "select_illustration") {
      if (!hasOnly(args, ["id", "token", "afterBeat", "caption", "clear"]) || (args.clear !== undefined && typeof args.clear !== "boolean")) {
        return invalid("选图接受token短语或旧id、afterBeat、caption及clear，不接受URL或图片路径。");
      }
      if (args.clear === true) {
        selections = [];
        return {result: {ok: true, selections: [], pending: true}};
      }
      const normalized = getRegistry(context).normalizeSelection({id: args.id, token: args.token, afterBeat: args.afterBeat, caption: args.caption});
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
