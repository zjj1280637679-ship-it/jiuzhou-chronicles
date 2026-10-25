// test-all-factions-tree.js: 自动化贯通测试全部 4 个阵营的主剧情树加载、外推与因果弥合

const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.JiuzhouProviders = require("./harness/providers.js");
global.JiuzhouEffects = require("./harness/effects.js");
global.JiuzhouGameRecovery = require("./game-recovery.js");
const assert = require("node:assert/strict");

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
  appendChild(child) { this.children.push(child); }
  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }
  click() {
    if (this.listeners["click"]) this.listeners["click"].forEach(fn => fn());
  }
}

const elements = {};
function getElem(id) {
  if (!elements[id]) elements[id] = new MockElement(id);
  return elements[id];
}

global.document = {
  getElementById: (id) => getElem(id),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: (tag) => new MockElement("dyn_" + Math.random(), tag)
};
global.window = { addEventListener: () => {} };

const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("=== 开始 4 大阵营全量主剧情树与影视文学升级验证 ===");

async function main() {
const engine = new WebVisualNovelEngine();
engine.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
window.__vnEngine = engine;

const factions = [
  { id: "ming", name: "大明紫禁", act1Key: "太仓库竭" },
  { id: "qing", name: "后金八旗", act1Key: "崇政殿密议" },
  { id: "mongol", name: "大漠蒙古", act1Key: "察哈尔西奔" },
  { id: "nanming", name: "南国海邦", act1Key: "龙旗出洋" }
];

for (const f of factions) {
  console.log(`\n[阵营测试: ${f.name} (${f.id})]`);
  engine.startNewGame(f.id);
  
  const tree = WORLD_PRESETS.canonicalTrees[f.id];
  assert(tree, `缺少 ${f.id} 主剧情树`);
  const initialNode = tree.nodes[tree.initialNodeId];
  assert(initialNode, `缺少初始节点 ${tree.initialNodeId}`);
  
  // 验证文本关键词
  const hasKeyword = initialNode.title.includes(f.act1Key) || 
                     initialNode.desc.includes(f.act1Key) || 
                     initialNode.originalBeats.some(b => b.text.includes(f.act1Key));
  assert(hasKeyword, `[FAIL] ${f.name} 第一幕文本未包含当前阵营意象: ${f.act1Key}`);
  console.log(`  ✓ 第一幕「${initialNode.title}」深度文本意象校验通过！`);

  // 验证 AI 自由推进模式与主线解耦 (0 消耗与单向不可逆)
  const extraChoice = initialNode.choices.find(c => c.isExtrapolation);
  assert(extraChoice, `[FAIL] ${f.id} 第一幕缺少外推选项`);
  await engine.resolveFactionAction(extraChoice);
  assert(engine.isExtrapolating === true, `[FAIL] ${f.id} 无法进入外推模式`);
  assert(engine.currentStoryNodeId === tree.initialNodeId, `[FAIL] ${f.id} 自由推进污染了主线节点进度`);
  console.log(`  ✓ 成功触发【🌿 AI局外自由小说推进】，主线节点进度冻结在 [${tree.initialNodeId}] (0消耗)`);

  // 验证不可逆性：在自由推进中后续抉择永远处于 AI 自由推进状态，不回流主线
  const nextChoice = {
    text: "【继续探索】踏入茫茫关外风雪，探访辽东流民聚落",
    isExtrapolation: true
  };
  await engine.resolveFactionAction(nextChoice);
  assert(engine.isExtrapolating === true, `[FAIL] ${f.id} 自由推进不可逆失效`);
  assert(engine.currentStoryNodeId === tree.initialNodeId, `[FAIL] ${f.id} 自由推进后续抉择破坏了主线冻结`);
  assert(engine.branchDepth === 2, `[FAIL] ${f.id} 轮数未递增为 2`);
  console.log(`  ✓ 验证单向不可逆推进：轮数累进至 ${engine.branchDepth}，主线依然冻结，永不回流主线！`);

  // 验证预设主剧情树原生载入正常无损
  const canonicalChoices = initialNode.choices.filter(c => !c.isExtrapolation && c.targetNodeId);
  assert(canonicalChoices.length > 0, `[FAIL] ${f.id} 缺少预设主线选项`);
  const targetCanonicalNode = tree.nodes[canonicalChoices[0].targetNodeId];
  assert(targetCanonicalNode, `[FAIL] ${f.id} 预设目标节点 ${canonicalChoices[0].targetNodeId} 不存在`);
  console.log(`  ✓ 预设主剧情树路径与节点完好无损！`);
}

console.log("\n=== 全部 4 大阵营双轨主剧情树无缝验证通过！ ===");
}
main().then(() => process.exit(0), error => {console.error(error); process.exit(1);});
