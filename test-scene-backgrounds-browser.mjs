// Reviewed scene backgrounds in disposable browsers. No external model calls.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {mkdir} from "node:fs/promises";
import {join} from "node:path";
import {createStaticServer} from "./server.js";
const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const batches = [require("./docs/scene-background-batch-1.json"), require("./docs/scene-background-batch-2.json")];
const batch = {assets: batches.flatMap(b => b.assets)};
const catalog = require("./data/illustrations/catalog.json");
const world = require("./skills-data.js");
const root = fileURLToPath(new URL(".", import.meta.url));
const server = createStaticServer({root});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const output = process.env.JIUZHOU_SCENE_SCREENSHOTS;
if (output) await mkdir(output, {recursive: true});
try {
  browser = await chromium.launch({headless: true, executablePath: process.env.JIUZHOU_BROWSER_EXECUTABLE});
  for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    const context = await browser.newContext({viewport, reducedMotion: "reduce", serviceWorkers: "block"});
    const page = await context.newPage(), requests = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (new URL(request.url()).pathname.includes("/backgrounds/")) requests.push(request.url());
    });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      await page.goto(origin, {waitUntil: "networkidle"});
      await page.waitForFunction(() => Boolean(window.__vnEngine && window.JiuzhouIllustrations));
      assert.deepEqual(requests, [], "new backgrounds are not preloaded on the title screen");
      await page.click("#title-btn-gallery");
      await page.locator(".gallery-card").first().waitFor();
      assert.deepEqual(requests, [], "the gallery shows text before explicit preview");
      const decoded = await page.evaluate(async assets => {
        const results = [];
        for (const asset of assets) {
          const response = await fetch(asset.relativePath);
          const image = new Image(); image.src = asset.relativePath;
          try {
            await image.decode();
            results.push({id: asset.id, status: response.status, width: image.naturalWidth, height: image.naturalHeight});
          } catch {results.push({id: asset.id, status: response.status, decode: false});}
        }
        return results;
      }, batch.assets);
      assert.deepEqual(decoded, batch.assets.map(a => ({id: a.id, status: 200, ...a.dimensions})),
        "all generated images return HTTP 200 and decode at their recorded, uncropped dimensions");
      // Reload closes the gallery and clears transient UI without modifying user data.
      await page.reload({waitUntil: "networkidle"});
      for (const faction of ["ming", "mongol", "nanming", "qing"]) {
        await page.evaluate(faction => window.__vnEngine.startNewGame(faction), faction);
        const nodes = Object.values(world.canonicalTrees[faction].nodes).filter(n => catalog.scenes.nodes[faction][n.id]);
        for (const node of nodes) {
          const expected = catalog.scenes.nodes[faction][node.id];
          await page.evaluate(node => {
            const e = window.__vnEngine;
            e.currentStoryNodeId = node.id; e.currentCoords = node.coords; e.stageBackground = null;
            e.refreshStageBackground();
          }, node);
          await page.waitForFunction(id => window.__vnEngine.currentSceneIllustration?.id === id &&
            document.querySelector("#bg-active").dataset.backgroundId === id &&
            document.querySelector("#mobile-scene-art").getAttribute("src")?.includes(id), expected);
        }
        if (faction === "qing") {
          for (const {nodeId} of batches[1].pendingEditorial) {
            const node = world.canonicalTrees.qing.nodes[nodeId];
            await page.evaluate(node => {
              const e = window.__vnEngine;
              e.currentStoryNodeId = node.id; e.currentCoords = node.coords; e.stageBackground = null;
              e.refreshStageBackground();
            }, node);
            await page.waitForFunction(() => window.__vnEngine.currentSceneIllustration === null &&
              document.querySelector("#bg-active").dataset.backgroundId === "" &&
              document.querySelector("#mobile-scene-art").getAttribute("src") === "data/mobile/palace-night.webp");
          }
        }
        await page.evaluate(faction => window.__vnEngine.startNewGame(faction), faction);
        await page.waitForFunction(() => document.querySelector("#mobile-scene-art")?.complete);
        if (output) await page.screenshot({path: join(output, `${faction}-${viewport.width}.png`)});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}×${viewport.height}: ${batch.assets.length} decoded backgrounds, all 1371 reviewed scene bindings, both display surfaces, no eager gallery image loads.`);
    } finally {await context.close();}
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
