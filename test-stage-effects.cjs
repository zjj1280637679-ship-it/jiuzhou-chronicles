// Actual engine methods with fake elements and node:test timers; no browser or API.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const {WebVisualNovelEngine} = require("./app.js");

function element(className = "") {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  return {
    offsetWidth: 100,
    get className() { return [...classes].join(" "); },
    set className(value) {
      classes.clear();
      String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    },
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); }
    }
  };
}

function engine(t) {
  t.mock.timers.enable({apis: ["setTimeout"]});
  return Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    vignetteOverlay: element("vignette-overlay"),
    screenFlashOverlay: element("screen-flash-overlay"),
    dangerPulseTimer: null,
    flashTimer: null
  });
}

const pulseIsActive = e => e.vignetteOverlay.classList.contains("danger-pulse");
const flashIsActive = e => e.screenFlashOverlay.classList.contains("active");
const flash = (e, color = "red") => e.executeAITools([{tool: "screen_flash", params: {color}}]);

test("danger pulse terminates at its default duration and clears its timer", t => {
  const e = engine(t);
  e.triggerDangerPulse();
  assert.equal(pulseIsActive(e), true);
  assert.notEqual(e.dangerPulseTimer, null);
  t.mock.timers.tick(1599);
  assert.equal(pulseIsActive(e), true);
  t.mock.timers.tick(1);
  assert.equal(pulseIsActive(e), false);
  assert.equal(e.dangerPulseTimer, null);
  assert.equal(e.vignetteOverlay.className, "vignette-overlay");
});

test("repeated danger pulses replace the earlier timer and expire after the last trigger", t => {
  const e = engine(t);
  e.triggerDangerPulse(1200);
  const firstTimer = e.dangerPulseTimer;
  t.mock.timers.tick(400);
  e.triggerDangerPulse(1200);
  assert.notEqual(e.dangerPulseTimer, firstTimer);
  t.mock.timers.tick(800); // First trigger would have expired here.
  assert.equal(pulseIsActive(e), true);
  t.mock.timers.tick(399);
  assert.equal(pulseIsActive(e), true);
  t.mock.timers.tick(1);
  assert.equal(pulseIsActive(e), false);
  assert.equal(e.dangerPulseTimer, null);
});

test("native stage-effect dispatch starts a red flash and clears it after 600 ms", t => {
  const e = engine(t);
  flash(e);
  assert.equal(e.screenFlashOverlay.className, "screen-flash-overlay active flash-red");
  assert.notEqual(e.flashTimer, null);
  t.mock.timers.tick(599);
  assert.equal(flashIsActive(e), true);
  t.mock.timers.tick(1);
  assert.equal(e.screenFlashOverlay.className, "screen-flash-overlay");
  assert.equal(e.flashTimer, null);
});

test("repeated flash dispatch replaces the earlier timer and color", t => {
  const e = engine(t);
  flash(e);
  const firstTimer = e.flashTimer;
  t.mock.timers.tick(400);
  // Both accepted naming forms go through the actual engine dispatcher.
  e.executeAITools([{name: "screen_flash", params: {color: "gold"}}]);
  assert.notEqual(e.flashTimer, firstTimer);
  assert.equal(e.screenFlashOverlay.className, "screen-flash-overlay active flash-gold");
  t.mock.timers.tick(200); // First trigger would have expired here.
  assert.equal(flashIsActive(e), true);
  t.mock.timers.tick(399);
  assert.equal(flashIsActive(e), true);
  t.mock.timers.tick(1);
  assert.equal(e.screenFlashOverlay.className, "screen-flash-overlay");
  assert.equal(e.flashTimer, null);
});

test("pulse and flash keep independent expiration and timer state", t => {
  const e = engine(t);
  e.triggerDangerPulse();
  flash(e);
  t.mock.timers.tick(600);
  assert.equal(flashIsActive(e), false);
  assert.equal(e.flashTimer, null);
  assert.equal(pulseIsActive(e), true);
  assert.notEqual(e.dangerPulseTimer, null);
  t.mock.timers.tick(1000);
  assert.equal(pulseIsActive(e), false);
  assert.equal(e.dangerPulseTimer, null);
});

test("explicit cleanup cancels both pending callbacks and is idempotent", t => {
  const e = engine(t);
  e.triggerDangerPulse();
  flash(e);
  t.mock.timers.tick(200);
  e.clearAllScreenEffects();
  assert.equal(pulseIsActive(e), false);
  assert.equal(e.screenFlashOverlay.className, "screen-flash-overlay");
  assert.equal(e.dangerPulseTimer, null);
  assert.equal(e.flashTimer, null);
  e.clearAllScreenEffects();

  // A cancelled callback must not overwrite a later owner of either element.
  e.vignetteOverlay.classList.add("danger-pulse");
  e.screenFlashOverlay.className = "replacement-owner";
  t.mock.timers.tick(2000);
  assert.equal(pulseIsActive(e), true);
  assert.equal(e.screenFlashOverlay.className, "replacement-owner");
});

test("a new effect after cleanup uses its own lifetime", t => {
  const e = engine(t);
  e.triggerDangerPulse(300);
  flash(e);
  t.mock.timers.tick(100);
  e.clearAllScreenEffects();
  e.triggerDangerPulse(1200);
  flash(e, "white");
  t.mock.timers.tick(500); // Reaches the cancelled first flash deadline.
  assert.equal(pulseIsActive(e), true);
  assert.equal(e.screenFlashOverlay.className, "screen-flash-overlay active flash-white");
  t.mock.timers.tick(100);
  assert.equal(flashIsActive(e), false);
  assert.equal(pulseIsActive(e), true);
  t.mock.timers.tick(600);
  assert.equal(pulseIsActive(e), false);
});

test("missing or detached overlays allow effect completion and cleanup without throwing", t => {
  const e = engine(t);
  e.vignetteOverlay = null;
  e.screenFlashOverlay = null;
  assert.doesNotThrow(() => e.triggerDangerPulse());
  assert.doesNotThrow(() => flash(e));
  assert.doesNotThrow(() => e.clearAllScreenEffects());
  assert.equal(e.dangerPulseTimer, null);
  assert.equal(e.flashTimer, null);

  e.vignetteOverlay = element();
  e.screenFlashOverlay = element();
  e.triggerDangerPulse();
  flash(e);
  e.vignetteOverlay = null;
  e.screenFlashOverlay = null;
  assert.doesNotThrow(() => t.mock.timers.tick(1600));
  assert.equal(e.dangerPulseTimer, null);
  assert.equal(e.flashTimer, null);
  assert.doesNotThrow(() => e.clearAllScreenEffects());
});
