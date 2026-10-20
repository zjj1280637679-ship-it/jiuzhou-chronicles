// Inject the platform viewport; no storage, credentials, game engine, or network.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createInputViewportAdapter, measureInputViewport} = require("./input-viewport.js");

function target(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    emit(type) { for (const handler of listeners.get(type) || []) handler({type}); },
    count() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); }
  }, extra);
}
function fixture() {
  const frames = new Map();
  let nextFrame = 0, observations = 0;
  const vv = target({height: 844, offsetTop: 0, scale: 1});
  const query = target({matches: true});
  const body = {scrollTop: 0, getBoundingClientRect() { return {top: 70, bottom: 310, height: 240}; }};
  const classes = new Set(["drawer", "open"]);
  const styles = new Map();
  const modal = {
    classList: {add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)},
    style: {setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name)},
    contains: node => node === body
  };
  const field = {
    tagName: "TEXTAREA", disabled: false, readOnly: false,
    matches: () => true,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({top: 290 - body.scrollTop, bottom: 370 - body.scrollTop, height: 80}),
    closest: selector => selector === ".drawer-body" ? body : selector.includes(".drawer.open") ? classes.has("open") ? modal : null : null
  };
  const doc = target({activeElement: null, documentElement: {clientWidth: 390, clientHeight: 844}, querySelectorAll: () => [modal]});
  let observeCallback;
  const win = target({visualViewport: vv, innerWidth: 390, innerHeight: 844, matchMedia: () => query,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class { constructor(callback) { observeCallback = callback; } observe() { observations++; } disconnect() { observations = 0; } }
  });
  const adapter = createInputViewportAdapter({window: win, document: doc});
  return {vv, query, doc, win, modal, field, body, classes, styles, adapter,
    focus() { doc.activeElement = field; doc.emit("focusin"); },
    change() { observeCallback(); },
    pending: () => frames.size,
    observations: () => observations,
    flush() { const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback()); }
  };
}

test("IME detection excludes address-bar changes, blur, desktop, and pinch zoom", () => {
  const sample = {mobile: true, focused: true, scale: 1, viewportHeight: 380, offsetTop: 45, referenceHeight: 844};
  assert.deepEqual(measureInputViewport(sample), {height: 380, top: 45});
  for (const change of [{viewportHeight: 760}, {focused: false}, {mobile: false}, {scale: 1.4}]) {
    assert.equal(measureInputViewport({...sample, ...change}), null);
  }
  assert.deepEqual(measureInputViewport({...sample, referenceHeight: 390, viewportHeight: 240, offsetTop: 0}), {height: 240, top: 0});
});

test("viewport events are batched, fit only the edited modal, and scroll only obscured sheet content", () => {
  const f = fixture();
  f.focus();
  f.vv.height = 380;
  f.vv.offsetTop = 45;
  for (let i = 0; i < 10; i++) { f.vv.emit("resize"); f.vv.emit("scroll"); }
  assert.equal(f.pending(), 1, "one animation frame for the event burst");
  f.flush();
  assert.ok(f.classes.has("input-viewport-fit"));
  assert.equal(f.styles.get("--input-viewport-height"), "380px");
  assert.equal(f.styles.get("--input-viewport-top"), "45px");
  assert.equal(f.body.scrollTop, 70, "move the obscured field exactly into view");
  f.vv.emit("resize"); f.flush();
  assert.equal(f.body.scrollTop, 70, "a visible field does not scroll repeatedly");
  f.adapter.destroy();
});

test("blur, modal close, breakpoint changes, and zoom immediately clear temporary fitting", () => {
  for (const reason of ["blur", "close", "desktop", "zoom", "dismiss"]) {
    const f = fixture();
    f.focus(); f.vv.height = 380; f.vv.emit("resize"); f.flush();
    assert.ok(f.classes.has("input-viewport-fit"));
    if (reason === "blur") { f.doc.activeElement = null; f.doc.emit("focusout"); }
    if (reason === "close") { f.classes.delete("open"); f.change(); }
    if (reason === "desktop") { f.query.matches = false; f.query.emit("change"); }
    if (reason === "zoom") { f.vv.scale = 1.3; f.vv.emit("resize"); }
    if (reason === "dismiss") { f.vv.height = 844; f.vv.emit("resize"); }
    f.flush();
    assert.equal(f.classes.has("input-viewport-fit"), false, reason);
    assert.equal(f.styles.size, 0, reason);
    f.adapter.destroy();
  }
});

test("reference survives content-resizing keyboards, but a new orientation gets a new baseline", () => {
  const f = fixture();
  f.focus();
  f.doc.documentElement.clientHeight = f.win.innerHeight = f.vv.height = 380;
  f.win.emit("resize"); f.flush();
  assert.ok(f.classes.has("input-viewport-fit"), "baseline captured before keyboard resized the layout viewport");
  f.doc.documentElement.clientWidth = f.win.innerWidth = 844;
  f.doc.documentElement.clientHeight = f.win.innerHeight = f.vv.height = 390;
  f.win.emit("orientationchange"); f.flush();
  assert.equal(f.classes.has("input-viewport-fit"), false, "landscape itself is not keyboard occlusion");
  f.vv.height = 230; f.vv.emit("resize"); f.flush();
  assert.ok(f.classes.has("input-viewport-fit"));
  f.adapter.destroy();
});

test("read-only fields do not activate; dispose cancels pending work and removes all observers/listeners", () => {
  const f = fixture();
  f.field.readOnly = true;
  f.focus(); f.vv.height = 380; f.vv.emit("resize"); f.flush();
  assert.equal(f.classes.has("input-viewport-fit"), false);
  f.field.readOnly = false; f.focus(); f.flush();
  assert.ok(f.classes.has("input-viewport-fit"));
  f.vv.emit("resize");
  assert.equal(f.pending(), 1);
  f.adapter.destroy(); f.adapter.destroy();
  assert.equal(f.pending(), 0);
  assert.equal(f.observations(), 0);
  assert.equal(f.vv.count() + f.doc.count() + f.win.count() + f.query.count(), 0);
  assert.equal(f.classes.has("input-viewport-fit"), false);
  assert.equal(f.styles.size, 0);
  f.vv.emit("resize"); assert.equal(f.pending(), 0);
});

test("browsers without VisualViewport retain normal layout", () => {
  const adapter = createInputViewportAdapter({window: {}, document: {}});
  assert.doesNotThrow(() => adapter.destroy());
});
