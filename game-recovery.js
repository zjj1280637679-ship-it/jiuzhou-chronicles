(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JiuzhouGameRecovery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Progress is an allowlist: provider configuration and authentication never enter a save or export.
  const fields = ["currentFaction", "currentTurn", "currentCoords", "dangerTicks", "ideologyVector", "inventory",
    "backlog", "fateKnots", "storyQueue", "currentStep", "apiHistory", "pendingApiChoices", "cacheTelemetry",
    "currentStoryNodeId", "isExtrapolating", "isEpilogueSequel", "branchDepth", "extrapolationHistory",
    "reconciledCardsCache", "lastSutureNote", "convergenceTargetId", "visitedNodeIds", "inspectedNodeId", "needsSuturing"];
  const clone = value => JSON.parse(JSON.stringify(value));
  function snapshot(engine) {
    const state = {};
    for (const key of fields) if (engine[key] !== undefined) state[key] = clone(engine[key]);
    return state;
  }
  function restore(engine, state) {
    for (const key of fields) {
      if (state[key] === undefined) delete engine[key];
      else engine[key] = clone(state[key]);
    }
  }
  function publicAttempt(attempt) {
    if (!attempt) return null;
    return {version: 1, id: String(attempt.id), choice: clone(attempt.choice), dice: [...attempt.dice],
      expectedLength: attempt.expectedLength, status: "interrupted", errorCode: String(attempt.errorCode || "request_interrupted"),
      createdAt: attempt.createdAt};
  }
  function resumeAttempt(value, state) {
    if (!value || value.version !== 1 || typeof value.id !== "string" || !value.choice || typeof value.choice !== "object" ||
      Array.isArray(value.choice) || !Array.isArray(value.dice) || value.dice.length !== 2 ||
      value.dice.some(n => !Number.isInteger(n) || n < 1 || n > 6)) return null;
    return {...publicAttempt(value), before: snapshot(state), status: "failed"};
  }
  function makeAttempt(engine, choice, dice) {
    return {version: 1, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      choice: clone(choice), dice: [...dice], before: snapshot(engine), status: "running", createdAt: Date.now(),
      expectedLength: engine.expectedLength};
  }
  function savedState(engine) {
    const attempt = engine.pendingTurnAttempt;
    // Tentative ideology, dice outcomes and tool drafts are never the authoritative saved world.
    const state = attempt?.status === "running" ? clone(attempt.before) : snapshot(engine);
    if (state.cacheTelemetry) delete state.cacheTelemetry.lastReasoning;
    state.timestamp = Date.now();
    if (attempt) state.pendingTurnAttempt = publicAttempt(attempt);
    return state;
  }
  function parseSave(raw) {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.currentFaction !== "string" ||
      !["ming", "qing", "mongol", "nanming"].includes(value.currentFaction) ||
      !Number.isInteger(value.currentTurn) || value.currentTurn < 1 ||
      !Array.isArray(value.storyQueue) || !Array.isArray(value.backlog)) throw new Error("invalid_save");
    const state = snapshot(value);
    // Older grant_item effects produced clue cards without the original card fields.
    if (Array.isArray(state.inventory)) state.inventory = state.inventory.map(card => card && typeof card === "object" && !Array.isArray(card) ?
      {...card, power: card.power == null ? 0 : card.power, aspects: card.aspects == null ? [] : card.aspects} : card);
    state.timestamp = value.timestamp;
    const attempt = resumeAttempt(value.pendingTurnAttempt, state);
    if (attempt) state.pendingTurnAttempt = publicAttempt(attempt);
    return state;
  }
  function writeSave(storage, state) {
    // setItem is atomic: on quota/security failure the previous good value remains untouched.
    const serialized = JSON.stringify(state);
    storage.setItem("vn_save_state", serialized);
    return {ok: true, timestamp: state.timestamp};
  }
  function backup(engine) {
    return JSON.stringify({format: "jiuzhou-progress", version: 1, state: savedState(engine)}, null, 2);
  }
  function parseBackup(raw) {
    const data = JSON.parse(raw);
    if (data?.format !== "jiuzhou-progress" || data.version !== 1 || !data.state || typeof data.state !== "object") throw new Error("invalid_backup");
    const state = parseSave(JSON.stringify(data.state));
    // Provider fields are stripped even if somebody inserted them inside an otherwise valid object.
    // Prose stays literal text; it is never evaluated as HTML or JavaScript.
    function clean(value, depth = 0) {
      if (depth > 40) throw new Error("invalid_backup");
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
      if (value && typeof value === "object") {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
          if (["__proto__", "prototype", "constructor", "apiConfig", "apiKey", "authorization", "Authorization", "accessToken", "cookie", "lastReasoning"].includes(key)) continue;
          out[key] = clean(item, depth + 1);
        }
        return out;
      }
      return value;
    }
    const result = clean(state);
    const object = value => value && typeof value === "object" && !Array.isArray(value);
    const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
    const vector = value => object(value) && ["authority", "pragmatism", "progress", "cognition"].every(key =>
      Number.isFinite(value[key]) && value[key] >= -10 && value[key] <= 10);
    const beat = value => object(value) && typeof value.text === "string" &&
      ["speaker", "sub", "type", "stageChar"].every(key => value[key] == null || typeof value[key] === "string") &&
      (!value.illustrationData || (object(value.illustrationData) &&
        typeof value.illustrationData.relativePath === "string" &&
        /^data\/illustrations\/[a-zA-Z0-9_./-]+\.(?:svg|png|jpg|jpeg|webp)$/.test(value.illustrationData.relativePath) &&
        !value.illustrationData.relativePath.includes("..")));
    const choices = value => Array.isArray(value) && value.every(item => typeof item === "string" ||
      (object(item) && typeof item.text === "string" && (item.bias == null || (object(item.bias) && Object.values(item.bias).every(Number.isFinite)))));
    if (!integer(result.currentStep) || result.currentStep > result.storyQueue.length || !vector(result.ideologyVector) ||
      !Number.isFinite(result.dangerTicks) || result.dangerTicks < 0 || result.dangerTicks > 4 ||
      typeof result.currentCoords !== "string" || typeof result.currentStoryNodeId !== "string" ||
      !Array.isArray(result.inventory) || result.inventory.some(card => !object(card) || typeof card.name !== "string" ||
        typeof card.desc !== "string" || !Number.isFinite(card.power) || !Array.isArray(card.aspects) || card.aspects.some(item => typeof item !== "string")) ||
      !Array.isArray(result.fateKnots) || result.fateKnots.some(knot => !object(knot) || !integer(knot.turn, 1) || !vector(knot.vector) ||
        typeof knot.coords !== "string" || typeof knot.title !== "string" || typeof knot.desc !== "string" ||
        ["backlogLength", "apiHistoryLength", "extrapolationHistoryLength", "branchDepth"].some(key => knot[key] != null && !integer(knot[key]))) ||
      result.storyQueue.some(item => !beat(item)) || result.backlog.some(item => !beat(item)) ||
      !Array.isArray(result.apiHistory) || result.apiHistory.some(message => !object(message) ||
        !["user", "assistant"].includes(message.role) || typeof message.content !== "string") ||
      (result.pendingApiChoices != null && !choices(result.pendingApiChoices)) ||
      (result.visitedNodeIds != null && (!Array.isArray(result.visitedNodeIds) || result.visitedNodeIds.some(id => typeof id !== "string"))) ||
      (result.branchDepth != null && !integer(result.branchDepth)) ||
      !Array.isArray(result.extrapolationHistory) || result.extrapolationHistory.some(item => !object(item) || typeof item.choiceText !== "string" ||
        !Number.isFinite(item.diceTotal) || typeof item.success !== "boolean" || !integer(item.turn, 1)) ||
      !object(result.reconciledCardsCache) || Object.values(result.reconciledCardsCache).some(entry => !object(entry) ||
        !Array.isArray(entry.original) || entry.original.some(item => !beat(item)) || !Array.isArray(entry.reconciled) || entry.reconciled.some(item => !beat(item)))) throw new Error("invalid_backup");
    if (["isExtrapolating", "isEpilogueSequel", "needsSuturing"].some(key => result[key] != null && typeof result[key] !== "boolean") ||
      result.fateKnots.some(knot => knot.faction != null && !["ming", "qing", "mongol", "nanming"].includes(knot.faction)) ||
      (data.state.pendingTurnAttempt && (!result.pendingTurnAttempt || !choices([result.pendingTurnAttempt.choice]) ||
        (result.pendingTurnAttempt.choice.customInput != null && typeof result.pendingTurnAttempt.choice.customInput !== "string")))) throw new Error("invalid_backup");
    return result;
  }
  return {snapshot, restore, makeAttempt, resumeAttempt, savedState, parseSave, writeSave, backup, parseBackup};
});
