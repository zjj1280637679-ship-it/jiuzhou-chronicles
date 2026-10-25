// test-open-input-flow.js: 测试第4选项【输入文字开放式外推】输入弹窗与AI接住推演支线卡的完整交互链路

const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.JiuzhouProviders = require("./harness/providers.js");
global.JiuzhouEffects = require("./harness/effects.js");
global.JiuzhouGameRecovery = require("./game-recovery.js");

const localStorageStore = {};
global.localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { for (const k in localStorageStore) delete localStorageStore[k]; }
};

class MockElement {
  constructor(id, tag = "div") {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.classList = new Set();
    this.classList.add = (c) => this.classList[c] = true;
    this.classList.remove = (c) => delete this.classList[c];
    this.classList.contains = (c) => !!this.classList[c];
    this.listeners = {};
    this.style = {};
    this._innerHTML = "";
    this.innerText = "";
    this.disabled = false;
    this.children = [];
    this.value = "";
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = val;
    if (!val) this.children = [];
  }
  appendChild(child) { this.children.push(child); }
  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }
  click() {
    if (this.listeners["click"]) this.listeners["click"].forEach(fn => fn());
  }
  focus() {}
}

const elements = {};
function getElem(id) {
  if (!elements[id]) elements[id] = new MockElement(id);
  return elements[id];
}

global.document = {
  getElementById: (id) => getElem(id),
  addEventListener: () => {},
  createElement: (tag) => new MockElement("dyn_" + Math.random(), tag)
};
global.window = { addEventListener: () => {} };

const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("=== 启动【输入文字开放式外推】交互测试 ===");

const engine = new WebVisualNovelEngine();
engine.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
window.__vnEngine = engine;

// 1. 启动大清阵营
engine.startNewGame("qing");
console.log("✓ 成功启动大清阵营新篇");

// 2. 模拟第一幕呈现抉择
engine.presentFactionChoices();

const choiceContainer = getElem("choice-container");
console.assert(choiceContainer.children.length === 4, `[FAIL] 选项数必须为 4，实际为 ${choiceContainer.children.length}`);
console.log(`✓ 界面成功渲染 4 个选项卡 (3 主干 + 1 开放外推)`);

// 检查前 3 个为主干选项，第 4 个为输入文字开放式外推
const tree = WORLD_PRESETS.canonicalTrees.qing;
const act1Node = tree.nodes[tree.initialNodeId];
console.assert(act1Node.choices.length === 4, "[FAIL] 节点 choices 长度必须为 4");
console.assert(!act1Node.choices[0].isExtrapolation, "[FAIL] 选项 1 必须为主干");
console.assert(!act1Node.choices[1].isExtrapolation, "[FAIL] 选项 2 必须为主干");
console.assert(!act1Node.choices[2].isExtrapolation, "[FAIL] 选项 3 必须为主干");
console.assert(act1Node.choices[3].isExtrapolation && act1Node.choices[3].isOpenEndedInput, "[FAIL] 选项 4 必须为 isOpenEndedInput");
console.log(`✓ 数据层校验：选项 1, 2, 3 为纯主干真分支，选项 4 为【输入文字开放式外推】`);

// 3. 点击第 4 个选项卡 (触发开放文字输入弹窗)
const openInputCard = choiceContainer.children[3];
const drawerOpenInput = getElem("drawer-open-input");
console.assert(!drawerOpenInput.classList.contains("open"), "弹窗初始状态应为关闭");

openInputCard.click();
console.assert(drawerOpenInput.classList.contains("open"), "[FAIL] 点击第4选项后弹窗未打开！");
console.assert(engine.pendingExtrapolationChoice !== null, "[FAIL] 未暂存 pendingExtrapolationChoice");
console.log(`✓ 点击第4选项成功唤出【输入文字开放式外推】模态弹窗`);

// 4. 用户输入自定义文字，点击提交
const inputText = getElem("open-input-text");
const userAction = "潜入大内盗取军机处密档，并设法离间多尔衮与豪格";
inputText.value = userAction;

const btnSubmit = getElem("btn-submit-open-input");
btnSubmit.click();

console.assert(!drawerOpenInput.classList.contains("open"), "[FAIL] 提交后弹窗未关闭");
console.assert(engine.isExtrapolating === true, "[FAIL] 提交后未进入 isExtrapolating 状态");
console.log(`✓ 提交自定义行动后，成功关闭弹窗并进入外推模式 (isExtrapolating: true)`);

// 5. 校验 AI 接住推演生成的支线卡对白 beats
const currentQueue = engine.storyQueue;
console.assert(currentQueue && currentQueue.length >= 2, "[FAIL] 外推未生成支线对白 beats");
const firstBeat = currentQueue[0];
const outcomeBeat = currentQueue.find(b => b.sub.includes("AI 接住推演支线卡")) || firstBeat;
console.assert(currentQueue.some(b => b.text.includes(userAction)), `[FAIL] 生成的支线剧情卡未包含玩家输入的自定义行动`);
console.assert(currentQueue.some(b => b.sub.includes("AI 接住推演支线卡") || b.sub.includes("GM 局势暗盘深思")), `[FAIL] 未标记 AI 接戏或深度推演`);
console.log(`✓ AI 成功进行 GM 深度暗盘推演并即时生成支线场景卡：`);
console.log(`  [思考推演]: ${firstBeat.speaker} (${firstBeat.sub}) -> ${firstBeat.text.substring(0, 60)}...`);
console.log(`  [接戏对白]: ${outcomeBeat.speaker} (${outcomeBeat.sub}) -> ${outcomeBeat.text.substring(0, 60)}...`);

// 6. 校验外推态下的抉择呈现 (严格遵循与原版一致：3 个选项 + 1 个开放输入窗口，共 4 个卡片)
engine.presentFactionChoices();
console.assert(choiceContainer.children.length === 4, `[FAIL] 外推态下的抉择数应为 4（3选项+1开放窗口），实际为 ${choiceContainer.children.length}`);
console.log(`✓ 外推态下成功提供 3 个分支选项与第 4 项【输入文字开放式外推】`);

console.log("\n=================================================");
console.log("🎉 【输入文字开放式外推】交互全流程测试 100% PASS！");
console.log("=================================================");
process.exit(0);
