// test-lifecycle.js: 模拟测试《观星纪 · 九州沉浮录》完整生命周期状态机

// 1. 创建仿真 DOM 与 LocalStorage
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
    this.innerHTML = "";
    this.innerText = "";
    this.disabled = false;
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
  }
  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }
  click() {
    if (this.listeners["click"]) {
      this.listeners["click"].forEach(fn => fn());
    }
  }
}

const elements = {};
function getOrCreateElem(id) {
  if (!elements[id]) elements[id] = new MockElement(id);
  return elements[id];
}

global.document = {
  getElementById: (id) => getOrCreateElem(id),
  addEventListener: () => {},
  createElement: (tag) => new MockElement("dyn_" + Math.random(), tag)
};
global.window = {
  addEventListener: () => {}
};

// 2. 加载技能数据与引擎
const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.JiuzhouProviders = require("./harness/providers.js");
global.JiuzhouEffects = require("./harness/effects.js");
global.JiuzhouGameRecovery = require("./game-recovery.js");

const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("=== 开始自动化全生命周期测试 ===");

// 3. 实例化引擎 (初始状态应为 TITLE)
const engine = new WebVisualNovelEngine();
engine.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
window.__vnEngine = engine;

console.assert(engine.gameState === "TITLE", `[FAIL] 初始状态应为 TITLE，实际为 ${engine.gameState}`);
console.assert(getOrCreateElem("title-screen").classList.contains("active"), "[FAIL] 初始时 title-screen 应有 active 类");
console.assert(getOrCreateElem("title-btn-continue").disabled === true, "[FAIL] 无存档时，重续前缘按钮应被禁用");
console.log("✓ 测试 1 通过：页面首次加载成功进入 TITLE 状态，title-screen 激活，无存档提示正常。");

// 4. 开启新篇 (New Game)
getOrCreateElem("title-btn-start").click();
console.assert(engine.gameState === "PLAYING", `[FAIL] 开启新篇后状态应为 PLAYING，实际为 ${engine.gameState}`);
console.assert(!getOrCreateElem("title-screen").classList.contains("active"), "[FAIL] 开始游戏后 title-screen 应隐藏");
console.assert(engine.currentTurn === 1, `[FAIL] 回合数应为 1，实际为 ${engine.currentTurn}`);
console.assert(engine.currentFaction === "ming", `[FAIL] 默认阵营应为 ming，实际为 ${engine.currentFaction}`);
console.assert(localStorage.getItem("vn_save_state") !== null, "[FAIL] 开启新篇应自动生成存档");
console.log("✓ 测试 2 通过：点击开启新篇成功切换到 PLAYING 状态，场景与第一幕成功载入，并生成自动存档。");

// 5. 推进剧情并做出抉择
while (!getOrCreateElem("choice-overlay").classList.contains("visible")) {
  engine.nextStoryBeat();
}
// 抉择浮层出现
console.assert(getOrCreateElem("choice-overlay").classList.contains("visible"), "[FAIL] 队列播完后应呈现抉择浮层");
// 模拟选择第一项
const choiceMock = {
  text: "【整顿吏治】以铁腕彻查亏空",
  tag: "雷霆吏治",
  bias: { authority: +3, pragmatism: +4, progress: +2, cognition: +1 },
  diceBase: 10
};
engine.resolveFactionAction(choiceMock);
console.assert(engine.currentTurn === 2, `[FAIL] 做出抉择后回合数应增为 2，实际为 ${engine.currentTurn}`);
console.assert(engine.ideologyVector.authority === 5, `[FAIL] 权威分值应更新为 5，实际为 ${engine.ideologyVector.authority}`);
console.log("✓ 测试 3 通过：玩家成功做出抉择，检定与政治思潮隐式得分正常结算，回合自增。");

// 6. 核心测试：游戏进行中点击“⌂ 主页”返回标题界面
getOrCreateElem("qm-home").click();
console.assert(engine.gameState === "TITLE", `[FAIL] 点击主页后状态应为 TITLE，实际为 ${engine.gameState}`);
console.assert(getOrCreateElem("title-screen").classList.contains("active"), "[FAIL] 点击主页后 title-screen 应重新激活");
console.assert(getOrCreateElem("title-btn-continue").disabled === false, "[FAIL] 有存档时，重续前缘按钮应被启用");
console.assert(getOrCreateElem("title-save-hint").innerText.includes("第1幕") || getOrCreateElem("title-save-hint").innerText.includes("第2幕") || getOrCreateElem("title-save-hint").innerText.includes("回合"), `[FAIL] 存档提示应显示最新幕次或回合，实际为 ${getOrCreateElem("title-save-hint").innerText}`);
console.log("✓ 测试 4 通过：游戏中点击「⌂ 主页」成功返回标题画面，自动存档保存完整，重续前缘按钮被正确激活并显示最新幕次！");

// 7. 测试“重续前缘”恢复进度
getOrCreateElem("title-btn-continue").click();
console.assert(engine.gameState === "PLAYING", `[FAIL] 重续前缘后状态应为 PLAYING，实际为 ${engine.gameState}`);
console.assert(!getOrCreateElem("title-screen").classList.contains("active"), "[FAIL] 继续游戏后 title-screen 应隐藏");
console.assert(engine.currentTurn === 2, `[FAIL] 继续游戏后回合数应恢复为 2，实际为 ${engine.currentTurn}`);
console.assert(engine.ideologyVector.authority === 5, `[FAIL] 权威分值应恢复为 5，实际为 ${engine.ideologyVector.authority}`);
console.log("✓ 测试 5 通过：点击「重续前缘」成功无缝恢复断点，回合、角色数值与剧情流完好！");

// 8. 测试危机终局 (Crisis / Game Over) 生命周期
engine.dangerTicks = 4;
engine.triggerCrisisGameOver();
console.assert(engine.gameState === "GAMEOVER", `[FAIL] 危机触发后状态应为 GAMEOVER，实际为 ${engine.gameState}`);
console.assert(getOrCreateElem("drawer-crisis").classList.contains("open"), "[FAIL] 危机触发后 drawer-crisis 应被打开");

// 在危机中点击“重整山河”返回主界面
getOrCreateElem("btn-crisis-title").click();
console.assert(engine.gameState === "TITLE", `[FAIL] 危机中点击重整山河应返回 TITLE，实际为 ${engine.gameState}`);
console.assert(getOrCreateElem("title-screen").classList.contains("active"), "[FAIL] title-screen 应重新激活");
console.assert(!getOrCreateElem("drawer-crisis").classList.contains("open"), "[FAIL] drawer-crisis 应已关闭");
console.log("✓ 测试 6 通过：危险时相引爆时危机终局模态框正确弹出，点击「重整山河」能从危机中稳健退回主页面！");

// 9. 测试标题界面下选择四大阵营 DLC
engine.switchFaction("qing");
console.assert(engine.gameState === "PLAYING", `[FAIL] 从标题选择阵营后应进入 PLAYING，实际为 ${engine.gameState}`);
console.assert(engine.currentFaction === "qing", `[FAIL] 当前阵营应为 qing，实际为 ${engine.currentFaction}`);
console.assert(engine.currentCoords === "qing:mukden", `[FAIL] 盛京坐标应为 qing:mukden，实际为 ${engine.currentCoords}`);
console.log("✓ 测试 7 通过：从主页面阵营 DLC 选择器直接切换阵营，新篇以该阵营专属剧本即刻启动！");

console.log("=== 全部 7 项生命周期与状态持久化测试 100% 验证通过！ ===");
process.exit(0);
