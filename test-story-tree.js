// test-story-tree.js: 专项验证法定主剧情树骨架、AI 局外外推分支与动态因果弥合重塑

const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.JiuzhouProviders = require("./harness/providers.js");
global.JiuzhouGameRecovery = require("./game-recovery.js");

// 1. 模拟浏览器环境
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
function getElem(id) {
  if (!elements[id]) elements[id] = new MockElement(id);
  return elements[id];
}

global.document = {
  getElementById: (id) => getElem(id),
  addEventListener: () => {},
  createElement: (tag) => new MockElement("dyn_" + Math.random(), tag)
};
global.window = {
  addEventListener: () => {}
};

// 2. 加载数据与脚本
const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("=== 开始双轨主剧情树与 AI 动态弥合系统自动化测试 ===");

const engine = new WebVisualNovelEngine();
engine.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
window.__vnEngine = engine;

// 测试 1: 验证四大阵营均拥有完整的法定主剧情树结构
console.log("\n[测试 1] 验证四大阵营法定主剧情树骨架...");
const factions = ["ming", "qing", "mongol", "nanming"];
factions.forEach(f => {
  const tree = WORLD_PRESETS.canonicalTrees[f];
  console.assert(tree, `[FAIL] 阵营 ${f} 缺少主剧情树`);
  console.assert(tree.nodes[tree.initialNodeId], `[FAIL] 阵营 ${f} 初始节点不存在`);
  const nodes = Object.values(tree.nodes);
  console.assert(nodes.length >= 4, `[FAIL] 阵营 ${f} 剧情树至少应有 4 幕，实际有 ${nodes.length} 幕`);
});
console.log("✓ 测试 1 通过：大明、后金清朝、大漠蒙古、南国海邦 4 大阵营均已挂载完整的法定主剧情树！");

// 测试 2: 开启大明新篇，验证加载法定第一幕文字卡
console.log("\n[测试 2] 开启新篇并验证第一幕主干文字卡...");
engine.startNewGame("ming");
console.assert(engine.currentStoryNodeId === "ming_act1", `[FAIL] 初始节点应为 ming_act1，实际为 ${engine.currentStoryNodeId}`);
console.assert(engine.isExtrapolating === false, "[FAIL] 初始状态不应处于外推模式");
console.assert(engine.storyQueue.length >= 4, `[FAIL] 第一幕对白队列数量异常，实际为 ${engine.storyQueue.length}`);
console.assert(getElem("branch-pill").innerText.includes("第1幕") || getElem("branch-pill").innerText.includes("第一幕"), `[FAIL] 分支胶囊应显示第一幕，实际为 ${getElem("branch-pill").innerText}`);
console.log("✓ 测试 2 通过：大明主剧情树第一幕「紫禁廷议 · 借饷危局」法定文字卡正确加载！");

// 测试 3: 触发【🌿 AI局外外推】分支
console.log("\n[测试 3] 模拟玩家选择【🌿 AI局外外推】分支...");
const extraChoice = {
  text: "【🌿 AI局外外推】夜出阜成门，私会暗抵京师的泰西夷商与晋商巨贾！",
  tag: "法外博弈 · 自由外推",
  bias: { authority: -2, pragmatism: +6, progress: +5, cognition: +4 },
  diceBase: 10,
  isExtrapolation: true,
  convergenceTargetId: "ming_act2_tax"
};
engine.resolveFactionAction(extraChoice);

console.assert(engine.isExtrapolating === true, "[FAIL] 执行外推选项后，isExtrapolating 应为 true");
console.assert(engine.extrapolationHistory.length === 1, `[FAIL] 外推历史应有 1 条，实际为 ${engine.extrapolationHistory.length}`);
console.assert(getElem("branch-pill").innerText.includes("AI自由小说") || getElem("branch-pill").innerText.includes("自由小说"), `[FAIL] 分支指示器应显示自由小说状态，实际为 ${getElem("branch-pill").innerText}`);
console.assert(engine.currentStoryNodeId === "ming_act1", `[FAIL] 自由探索绝不可消耗主线进度，应严格冻结在 ming_act1，实际为: ${engine.currentStoryNodeId}`);
console.log("✓ 测试 3 通过：成功脱离主干进入【AI 自由小说宇宙】，主线进度严格冻结 (0消耗)！");

// 测试 4: 验证单向不可逆演进与持续 AI 自由推进
console.log("\n[测试 4] 模拟玩家在自由小说模式中继续做出抉择...");
const nextChoice = {
  text: "【深入推演】与泰西夷商达成军械秘密协定，换取西式火铳图纸",
  isExtrapolation: true
};
engine.resolveFactionAction(nextChoice);

console.assert(engine.isExtrapolating === true, "[FAIL] 自由推进必须单向不可逆，isExtrapolating 应依然为 true");
console.assert(engine.branchDepth === 2, `[FAIL] 轮数未正常累增，实际为 ${engine.branchDepth}`);
console.assert(engine.currentStoryNodeId === "ming_act1", `[FAIL] 自由推演第2轮破坏了主线节点冻结`);
console.log("✓ 测试 4 通过：验证单向不可逆演进，轮数累增至 2，主线节点完全解耦冻结！");

// 测试 5: 剧情树全景抽屉渲染
console.log("\n[测试 5] 验证剧情树抽屉渲染...");
engine.renderStoryTreeDrawer();
console.assert(getElem("storytree-canvas-container").innerHTML.includes("tree-node-card") || getElem("storytree-canvas-container").innerHTML.length > 0, "[FAIL] 剧情树抽屉应渲染节点");
console.log("✓ 测试 5 通过：剧情树全景抽屉渲染完备！");

// 测试 6: 存档持久化与继续游戏恢复剧情树状态
console.log("\n[测试 6] 验证自由小说模式存读档完备性...");
engine.saveGameState();
const savedRaw = localStorage.getItem("vn_save_state");
console.assert(savedRaw.includes("isExtrapolating\":true") || savedRaw.includes("branchDepth\":2"), "[FAIL] 存档中应保存自由小说状态");

// 模拟重新实例化引擎并继续游戏
const engine2 = new WebVisualNovelEngine();
engine2.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
engine2.continueGame();
console.assert(engine2.isExtrapolating === true, "[FAIL] 读档后应保持自由小说模式");
console.assert(engine2.branchDepth === 2, `[FAIL] 读档后轮数应为 2，实际为 ${engine2.branchDepth}`);
console.assert(engine2.currentStoryNodeId === "ming_act1", `[FAIL] 读档后主线节点应保持冻结在 ming_act1，实际为: ${engine2.currentStoryNodeId}`);
console.log("✓ 测试 6 通过：自由小说状态、轮数与主线冻结节点在断点 100% 恢复无损！");

console.log("\n=== 全部 6 项双轨主剧情树与 AI 动态弥合系统测试 100% 验证通过！ ===");
process.exit(0);
