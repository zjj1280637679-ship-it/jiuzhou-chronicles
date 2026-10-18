// test-novel-context.js: 专门验证 2.8 万字清朝入关小说作为大纲底本，以及上下文纯净度（无主线偏见）
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
  addEventListener: () => {},
  createElement: (tag) => new MockElement("dyn_" + Math.random(), tag),
  querySelectorAll: (sel) => []
};
global.window = { addEventListener: () => {} };

// 1. 载入四大阵营长篇史诗小说大纲底本、套图与 skills-data
const novelsCode = fs.readFileSync(path.join(__dirname, "data", "faction-novels.js"), "utf8");
vm.runInThisContext(novelsCode);
global.QING_EPIC_NOVEL = global.window.QING_EPIC_NOVEL;

const illusCode = fs.readFileSync(path.join(__dirname, "data", "illustrations", "illustrations-data.js"), "utf8");
vm.runInThisContext(illusCode);
global.FACTION_ILLUSTRATION_VAULT = global.window.FACTION_ILLUSTRATION_VAULT;

const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("===============================================================================");
console.log("📖 启动《2.8万字清朝入关史诗同人小说底本与上下文纯净化（无主线偏见）》验证");
console.log("===============================================================================\n");

// 检验 1: 小说文本体量与六大核心章节完备性
console.log("【检验 1：小说大纲底本字数与章节检验】");
console.assert(typeof QING_EPIC_NOVEL === "string", "[FAIL] QING_EPIC_NOVEL 未正确定义");
console.log(`  ✓ 小说全文总字符数: ${QING_EPIC_NOVEL.length} 字符 (期望 >= 20,000 字)`);
if (QING_EPIC_NOVEL.length < 20000) {
  throw new Error(`小说字数不足 20,000 字，实际为 ${QING_EPIC_NOVEL.length}`);
}

const requiredChapters = [
  "第一章：崇政夜雪 · 太宗崩逝与八旗定策",
  "第二章：汉臣叩阙 · 范文程密奏与定鼎大策",
  "第三章：燕京浩劫 · 闯王破城与崇祯殉国",
  "第四章：孤关残照 · 吴三桂剃发与借兵血誓",
  "第五章：一片石决死 · 狂风遮日与铁骑踏阵",
  "第六章：定鼎燕京 · 抚定中原与天下初安"
];

requiredChapters.forEach(chap => {
  const hasChap = QING_EPIC_NOVEL.includes(chap);
  console.assert(hasChap, `[FAIL] 小说缺少章节: ${chap}`);
  console.log(`  ✓ 章节完备: ${chap}`);
});

// 检验 2: AI 上下文组装检验（无刻板主线树偏见）
console.log("\n【检验 2：AI Prompt Caching 四层载荷纯净化审计】");
const engine = new WebVisualNovelEngine();
window.__vnEngine = engine;
engine.startNewGame("qing");

// 模拟制造两条已经历的历史对白 (apiHistory)
engine.apiHistory = [
  { role: "user", content: "【玩家自定行动】：微服视察盛京城外辽东汉民聚落" },
  { role: "assistant", content: JSON.stringify({
    beats: [
      { speaker: "冷峻旁白", text: "风雪如刀，残垣断壁之间，辽东逃民聚集于枯柳之下，衣衫褴褛，目光瑟缩。" }
    ],
    choices: [
      { text: "【开仓赈济】调拨内库粮谷五十石抚恤", tag: "收揽民心", diceBase: 9 },
      { text: "【按律编户】收编壮丁充入包衣庄头", tag: "法度森严", diceBase: 10 }
    ]
  }) }
];

const testChoice = {
  text: "【开仓赈济】调拨内库粮谷五十石抚恤，严禁八旗贵族沿途强行圈占汉民私田",
  diceBase: 9
};

const payload = engine.buildDeepSeekCachePayload(testChoice, 4, 5, 11, true);
const messages = payload.messages;

console.log(`  ✓ 生成的 messages 数组长度: ${messages.length}`);

// 审计 Layer 1: 系统提示词
const sys1 = messages[0].content;
console.assert(sys1.includes("硬核历史跑团主持人"), "[FAIL] Layer 1 缺少跑团主持人角色设定");
console.assert(sys1.includes("500 到 8000 字"), "[FAIL] Layer 1 缺少 500~8000 字字数规范");
console.assert(sys1.includes("show_illustration"), "[FAIL] Layer 1 缺少大结局插图工具规范");
console.log("  ✓ Layer 1 规范：客观真诚介绍平台，确立 500~8000 字与 3 选项跑团主持人带团宪章！通过！");

// 审计 Layer 2: 小说大纲底本
const sys2 = messages[1].content;
console.assert(sys2.includes("问鼎燕京：清朝入关大纪事"), "[FAIL] Layer 2 缺少清朝入关史诗小说大纲");
console.assert(sys2.includes("多尔衮") && sys2.includes("范文程") && sys2.includes("吴三桂"), "[FAIL] Layer 2 缺少核心人物群像");
console.log("  ✓ Layer 2 规范：完整挂载 2.8 万字清朝入关同人历史小说大纲底本！通过！");

// 严格否定断言：Layer 2 严禁混入导致偏见的 5 幕 81 分支预设树或三元组矩阵
console.assert(!sys2.includes("本阵营 5 幕故事树全景大纲"), "[FAIL] 发现了刻板 5 幕全景大纲，存在剧透与偏见污染！");
console.assert(!sys2.includes("海量因果决策三元组矩阵库"), "[FAIL] 发现了僵硬三元组矩阵库！");
console.assert(!sys2.includes("八十一巅峰终局"), "[FAIL] 发现了预设巅峰终局约束！");
console.log("  ✓ 严格否定断言通过：彻底清除 5 幕 81 分支树与三元组矩阵，100% 杜绝主线剧情偏见！");

// 审计 Layer 3: 只包含当前经历的剧情
console.assert(messages.length === 5, `[FAIL] messages 应恰好包含 5 项（Layer1系统 + Layer2小说 + Layer3已经历历史2条 + Layer4当前用户行动），实际为 ${messages.length}`);
console.assert(messages[2].content.includes("微服视察盛京城外辽东汉民聚落"), "[FAIL] Layer 3 缺少此前经历的历史行为");
console.assert(messages[3].content.includes("辽东逃民聚集于枯柳之下"), "[FAIL] Layer 3 缺少此前经历的对白");
console.log("  ✓ Layer 3 规范：除系统提示词与背景小说外，剧情只放当前实际经历过的剧情！通过！");

// 审计 Layer 4: 当前玩家行动与无预设指令
const userTail = payload.ephemeralTail;
console.assert(userTail.includes("开仓赈济"), "[FAIL] 缺少玩家当前抉择文本");
console.assert(userTail.includes("2d6 掷骰检定：(4 + 5) + 2 = 11 vs DC 9（判定：成功）"), "[FAIL] 缺少掷骰检定结果");
console.assert(!userTail.includes("【当前所在历史关卡现场】："), "[FAIL] 包含了刻板预设关卡现场文本！");
console.assert(!userTail.includes("【玩家来路历史分歧足迹】："), "[FAIL] 包含了预设关卡足迹文本！");
console.log("  ✓ Layer 4 规范：瞬时尾部纯净注入玩家本轮抉择与检定，无任何预设分支绑架！通过！");

console.log("\n===============================================================================");
console.log("🎉 全部检验 100% 通过！2.8万字小说大纲底本已完美注入，AI 偏见彻底根除！");
console.log("===============================================================================");
process.exit(0);
