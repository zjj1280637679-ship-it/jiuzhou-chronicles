"use strict";
// importScripts resolves against the Worker entry URL, not this imported plugin's URL.
importScripts(new URL("../illustration-system.js?v=20261026-token04", self.location.href).href);

let registry = null;
const effects = self.JiuzhouEffects;
let media = effects.emptyMedia();
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
  tools: self.JiuzhouHarnessProtocol.tools.filter(tool => ["list_illustrations", "browse_illustrations", "search_illustrations", "select_illustration", "show_illustration", "set_scene_background"].includes(tool.function.name)),
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
      if (name === "search_illustrations" && !args.query?.trim()) return invalid("请传query关键词；浏览全图库请用browse_illustrations({})。");
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
      const result = effects.normalize({name, params: args}, getRegistry(context));
      if (!result.ok) return result.error.code === "invalid_stage_effect" ? invalid(result.error.message) : {result};
      media = effects.reduceMedia(media, result.effect);
      return {result: {ok: true, backgroundChange: {...media.background}, pending: true}};
    }
    if (name === "select_illustration" || name === "show_illustration") {
      const result = effects.normalize({name: "show_illustration", params: args}, getRegistry(context));
      if (!result.ok) return result.error.code === "invalid_stage_effect" ? invalid(result.error.message) : {result};
      media = effects.reduceMedia(media, result.effect);
      return {result: {ok: true, ...(result.effect.params.clear ? {} : {selection: result.effect.params}), selections: media.popups, pending: true}};
    }
    throw new Error("unknown_tool");
  }
};
