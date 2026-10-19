"use strict";
const protocol = self.JiuzhouHarnessProtocol;
let draft = null;
function inspect(context) {
  const metric = draft ? protocol.measureStory(draft) : {textCharacters: 0, hanCharacters: 0, beatCount: 0};
  return {...metric, targetCharacters: context.targetCharacters, remainingCharacters: Math.max(0, context.targetCharacters - metric.textCharacters),
    countingRule: "仅最终交付的beats[].text非空白Unicode字符；汉字另列；不计思考、工具、JSON、角色名、选项、插画或重复修订稿。"};
}
function deliver(context) {
  const metrics = inspect(context);
  if (!draft || metrics.remainingCharacters > 0) return {result: {ok: false, error: {code: draft ? "draft_too_short" : "missing_draft"}, ...metrics}};
  return {result: {ok: true, delivered: true, ...metrics}, delivery: protocol.normalizeStory(draft)};
}
self.JiuzhouPlugin = {
  name: "story",
  tools: protocol.tools.filter(t => t.function.name !== "read_world"),
  execute(name, args, context) {
    if (name === "read_draft") return {result: {ok: true, story: draft, ...inspect(context)}};
    if (name === "inspect_draft") return {result: {ok: true, ...inspect(context)}};
    if (name === "deliver_story") return deliver(context);
    if (name === "write_draft" || name === "accept_delivery") {
      try {
        if (args.mode !== undefined && args.mode !== "replace" && args.mode !== "append") throw new Error("invalid_mode");
        const next = protocol.normalizeStory(args.story);
        if (args.mode === "append" && draft) {
          draft = {...draft, beats: [...draft.beats, ...next.beats],
            choices: Array.isArray(args.story.choices) ? next.choices : draft.choices,
            stage_effects: [...draft.stage_effects, ...next.stage_effects]};
        } else draft = next;
        return name === "accept_delivery" ? deliver(context) : {result: {ok: true, ...inspect(context)}};
      } catch (_) {
        return {result: {ok: false, error: {code: "invalid_draft", message: "提供包含有效beats[].text的剧情对象；草稿未被替换。"}}};
      }
    }
    throw new Error("unknown_tool");
  }
};
