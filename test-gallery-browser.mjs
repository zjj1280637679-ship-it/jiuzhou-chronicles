// Real browser/network checks for the 108-image pack; no external model calls.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {createStaticServer} from "./server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL(".", import.meta.url));
const server = createStaticServer({root});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true, executablePath: process.env.JIUZHOU_BROWSER_EXECUTABLE});
try {
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    const context = await browser.newContext({viewport, reducedMotion: "reduce", serviceWorkers: "block"});
    const page = await context.newPage(), imageRequests = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (/\/qing_jh\d+_.*\.webp$/.test(path)) imageRequests.push(path);
    });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      await page.goto(origin, {waitUntil: "networkidle"});
      await page.waitForFunction(() => Boolean(window.__vnEngine && window.JiuzhouIllustrations));
      assert.deepEqual(imageRequests, [], "the title screen does not preload the new pack");
      await page.click("#title-btn-gallery");
      await page.locator(".gallery-card").first().waitFor();
      assert.match(await page.locator("#gallery-overview").textContent(), /158/);
      assert.deepEqual(imageRequests, [], "featured cards do not load thumbnails or originals");
      await page.click("#gallery-tab-browse");
      await page.getByRole("button", {name: /^场景\s*108 幅/}).click();
      await page.getByRole("button", {name: /^后金\s*108 幅/}).click();
      assert.equal(await page.locator(".gallery-category").count(), 12);
      await page.getByRole("button", {name: /^河岸渡口\s*9 幅/}).click();
      assert.equal(await page.locator(".gallery-card").count(), 8);
      await page.getByRole("button", {name: "下一页 →", exact: true}).click();
      assert.equal(await page.locator(".gallery-card").count(), 1);
      assert.deepEqual(imageRequests, [], "classification and pagination load no images");
      await page.click("#gallery-tab-search");
      async function search(query, expected) {
        await page.fill("#gallery-query", query);
        await page.locator("#gallery-search-form").evaluate(form => form.requestSubmit());
        await page.waitForFunction(expected => {
          const results = document.querySelector("#gallery-results");
          return results.getAttribute("aria-busy") === "false" && results.querySelector(".gallery-card")?.dataset.assetId === expected;
        }, expected);
      }
      await search("后金・渡口核名・兜档布", "qing_jh07_01_l01");
      assert.equal(await page.locator(".gallery-card").count(), 1);
      assert.match(await page.locator(".gallery-card code").textContent(), /后金·渡口核名·兜裆布/);
      assert.deepEqual(imageRequests, [], "search returns exact handles without downloading images");
      await page.locator(".gallery-preview-button").click();
      await page.waitForFunction(() => {
        const image = document.querySelector("#gallery-image-wrap img");
        return image?.complete && image.naturalWidth > 1600;
      });
      assert.deepEqual(imageRequests, ["/data/illustrations/qing/scenes/qing_jh07_01_l01.webp"]);
      assert.equal(await page.locator("#gallery-token").inputValue(), "后金·渡口核名·兜裆布");
      await search("背景·后金河岸渡口·常态", "qing_jh07_00");
      await search("JH07-01", "qing_jh07_01");
      assert.equal(imageRequests.length, 1, "further text searches do not fetch unselected originals or mothers");
      await page.locator(".gallery-card[data-asset-id='qing_jh07_01'] .gallery-preview-button").click();
      await page.waitForFunction(() => {
        const image = document.querySelector("#gallery-image-wrap img");
        return image?.src.includes("qing_jh07_01.webp") && image.complete && image.naturalWidth > 1600;
      });
      assert.equal(imageRequests.length, 2);
      assert.deepEqual(new Set(imageRequests), new Set([
        "/data/illustrations/qing/scenes/qing_jh07_01_l01.webp", "/data/illustrations/qing/scenes/qing_jh07_01.webp"
      ]));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      assert.deepEqual(errors, []);
      console.log(`Gallery ${viewport.width}×${viewport.height}: 108 text entries, family navigation and exact phrase search; only 2 explicitly previewed images fetched.`);
    } finally {await context.close();}
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
