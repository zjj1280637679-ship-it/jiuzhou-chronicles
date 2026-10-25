"use strict";
const protocol = self.JiuzhouHarnessProtocol;
let draft = null;
function inspect() {
  return {hasDraft: Boolean(draft), beatCount: draft?.beats.length || 0, choiceCount: draft?.choices.length || 0};
}
function deliver() {
  const overview = inspect();
  if (!draft) return {result: {ok: false, error: {code: "missing_draft", message: '还没有草稿；用deliver_story({story:{beats:[{text:"正文"}]}})直接交付，或先write_draft写草稿。'}, ...overview}};
  return {result: {ok: true, delivered: true, ...overview}, delivery: protocol.normalizeStory(draft)};
}
self.JiuzhouPlugin = {
  name: "story",
  tools: protocol.tools.filter(t => ["read_draft", "write_draft", "inspect_draft", "deliver_story"].includes(t.function.name)),
  execute(name, args) {
    if (name === "read_draft") return {result: {ok: true, story: draft, ...inspect()}};
    if (name === "inspect_draft") return {result: {ok: true, ...inspect()}};
    if (name === "deliver_story" && Object.keys(args).some(key => key !== "story")) {
      return {result: {ok: false, error: {code: "invalid_draft", message: "直接交付只传story；交付已有草稿则传{}。需要追加草稿时使用write_draft。"}}};
    }
    if (name === "deliver_story" && args.story === undefined) return deliver();
    if (name === "write_draft" || name === "accept_delivery" || name === "deliver_story") {
      try {
        if (args.mode !== undefined && args.mode !== "replace" && args.mode !== "append") throw new Error("invalid_mode");
        const next = protocol.normalizeStory(args.story);
        if (args.mode === "append" && draft) {
          draft = {...draft, beats: [...draft.beats, ...next.beats],
            choices: Array.isArray(args.story.choices) ? next.choices : draft.choices,
            stage_effects: [...draft.stage_effects, ...next.stage_effects]};
        } else draft = next;
        return name === "write_draft" ? {result: {ok: true, ...inspect()}} : deliver();
      } catch (_) {
        return {result: {ok: false, error: {code: "invalid_draft", message: "提供包含有效beats[].text的剧情对象；草稿未被替换。"}}};
      }
    }
    throw new Error("unknown_tool");
  }
};
