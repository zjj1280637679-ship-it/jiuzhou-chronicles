// Test-only Web Worker adapter. Executes the same classic worker entry and plugins
// in real Node worker threads; fixtures never make a paid model request.
const path = require("node:path");
const {fileURLToPath} = require("node:url");
const {Worker} = require("node:worker_threads");

function localPath(value, relativeTo = __dirname) {
  if (value instanceof URL || String(value).startsWith("file:")) return fileURLToPath(value);
  if (/^https?:/i.test(String(value))) {
    const url = new URL(value);
    const marker = "/harness/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) throw new Error("Test worker only loads local harness assets");
    return path.resolve(__dirname, decodeURIComponent(url.pathname.slice(index + marker.length)));
  }
  return path.isAbsolute(String(value)) ? String(value) : path.resolve(relativeTo, String(value));
}

function createNodeWorkerFactory(hooks = {}) {
  return function nodeWorkerFactory(url = path.join(__dirname, "worker-entry.js")) {
    const entry = localPath(url);
    const worker = new Worker(`
      const fs = require("node:fs");
      const path = require("node:path");
      const vm = require("node:vm");
      const {fileURLToPath, pathToFileURL} = require("node:url");
      const {parentPort, workerData} = require("node:worker_threads");
      // A classic browser worker has no CommonJS globals. Hide Node's eval
      // globals so the production UMD protocol takes its browser branch.
      globalThis.module = undefined;
      globalThis.exports = undefined;
      globalThis.require = undefined;
      globalThis.self = globalThis;
      globalThis.location = {href: pathToFileURL(workerData.entry).href};
      globalThis.postMessage = value => parentPort.postMessage(value);
      globalThis.close = () => process.exit(0);
      globalThis.importScripts = (...urls) => {
        for (const url of urls) {
          let filename;
          if (String(url).startsWith("file:")) filename = fileURLToPath(url);
          else if (/^https?:/i.test(String(url))) {
            const pathname = decodeURIComponent(new URL(url).pathname);
            const index = pathname.indexOf("/harness/");
            if (index < 0) throw new Error("Test worker only loads local harness assets");
            filename = path.resolve(path.dirname(workerData.entry), pathname.slice(index + 9));
          } else filename = path.isAbsolute(String(url)) ? String(url) : fileURLToPath(new URL(String(url), pathToFileURL(workerData.entry)));
          vm.runInThisContext(fs.readFileSync(filename, "utf8"), {filename});
        }
      };
      globalThis.addEventListener = (type, callback) => {
        if (type === "message") parentPort.on("message", data => callback({data}));
      };
      parentPort.on("message", data => {
        if (typeof globalThis.onmessage === "function") globalThis.onmessage({data});
      });
      vm.runInThisContext(fs.readFileSync(workerData.entry, "utf8"), {filename: workerData.entry});
    `, {eval: true, workerData: {entry}});
    const listeners = {message: new Set(), error: new Set()};
    const adapter = {
      onmessage: null,
      onerror: null,
      postMessage(value) { hooks.onPostMessage?.(value); worker.postMessage(value); },
      terminate() { hooks.onTerminate?.(adapter); return worker.terminate(); },
      addEventListener(type, callback) { listeners[type]?.add(callback); },
      removeEventListener(type, callback) { listeners[type]?.delete(callback); }
    };
    worker.on("message", data => {
      const event = {data};
      hooks.onMessage?.(data);
      adapter.onmessage?.(event);
      for (const listener of listeners.message) listener(event);
    });
    worker.on("error", error => {
      const event = {message: error.message, error, preventDefault() {}};
      adapter.onerror?.(event);
      for (const listener of listeners.error) listener(event);
    });
    hooks.onCreate?.(adapter);
    return adapter;
  };
}

module.exports = {createNodeWorkerFactory, nodeWorkerFactory: createNodeWorkerFactory()};
