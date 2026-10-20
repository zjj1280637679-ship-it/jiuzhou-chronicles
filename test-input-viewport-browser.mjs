// Browser geometry for an isolated sheet fixture with a simulated VisualViewport.
// No game state, settings, network, or model calls are involved.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
const {chromium} = createRequire(import.meta.url)("playwright");
const css = (await Promise.all(["styles.css", "mobile.css", "input-viewport.css"].map(name => readFile(new URL(name, import.meta.url), "utf8")))).join("\n");
const script = await readFile(new URL("input-viewport.js", import.meta.url), "utf8");
const browser = await chromium.launch({headless: true, executablePath: process.env.JIUZHOU_BROWSER_EXECUTABLE});
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await context.route("**/*", route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
    <div class="webvn-viewport"><aside id="drawer-open-input" class="drawer drawer-modal open"><div class="ribbon-modal-box">
    <div class="drawer-header"><div class="drawer-title">自由行动</div><button class="drawer-close">收起</button></div>
    <div class="drawer-body"><p>输入自己的行动</p><textarea id="open-input-text" class="form-input" rows="4"></textarea></div>
    <div class="open-input-actions" style="display:flex;gap:12px"><button id="btn-cancel-open-input">取消</button><button id="btn-submit-open-input">开始推演</button></div>
    </div></aside></div></body></html>`);
  await page.evaluate(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, {height: 844, offsetTop: 0, scale: 1});
    Object.defineProperty(window, "visualViewport", {configurable: true, value: viewport});
  });
  await page.addScriptTag({content: script});
  await page.locator("#open-input-text").focus();
  async function geometry(height, top = 0, scale = 1) {
    await page.evaluate(({height, top, scale}) => {
      Object.assign(visualViewport, {height, offsetTop: top, scale});
      visualViewport.dispatchEvent(new Event("resize"));
    }, {height, top, scale});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(errors, [], "adapter must not throw in a browser");
  }
  async function withinVisibleViewport(height, top) {
    const result = await page.evaluate(() => {
      const rect = selector => {const b = document.querySelector(selector).getBoundingClientRect();return {top: b.top, bottom: b.bottom, height: b.height};};
      return {modal: rect("#drawer-open-input"), submit: rect("#btn-submit-open-input"), cancel: rect("#btn-cancel-open-input"), close: rect(".drawer-close"), field: rect("#open-input-text"), stageHeight: document.querySelector(".webvn-viewport").getBoundingClientRect().height,
        diagnostic: {active: document.activeElement.id, width: document.documentElement.clientWidth, height: innerHeight, visualHeight: visualViewport.height, mobile: matchMedia(JiuzhouInputViewport.MOBILE_QUERY).matches, classes: document.querySelector("#drawer-open-input").className}};
    });
    for (const [name, box] of Object.entries(result)) {
      if (name === "stageHeight" || name === "diagnostic") continue;
      assert.ok(box.height > 0 && box.top >= top - 1 && box.bottom <= top + height + 1, `${name}: clipped ${JSON.stringify(result)}`);
    }
    assert.equal(result.stageHeight, 844, "only the input sheet fits the keyboard, not the story stage");
  }
  await geometry(360);
  await withinVisibleViewport(360, 0);
  await geometry(420, 120);
  await withinVisibleViewport(420, 120);
  await geometry(760);
  assert.equal(await page.locator("#drawer-open-input").evaluate(node => node.classList.contains("input-viewport-fit")), false, "address-bar-sized changes keep normal layout");
  await geometry(360, 100, 1.5);
  assert.equal(await page.locator("#drawer-open-input").evaluate(node => node.classList.contains("input-viewport-fit")), false, "pinch zoom is not treated as a keyboard");
  await geometry(360);
  await page.locator("#open-input-text").blur();
  await page.waitForFunction(() => !document.querySelector("#drawer-open-input").classList.contains("input-viewport-fit"));
  await context.close();
  console.log("PASS isolated mobile input sheet: simulated 360px keyboard, 120px viewport offset, fixed submit/cancel/close, normal stage, address-bar and zoom exclusions, blur restore");
} finally {
  await browser.close();
}
