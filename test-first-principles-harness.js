// test-first-principles-harness.js: 全量贯通测试第一性原理“3剧情方向+1玩家自填”通用互动小说 Harness
const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.JiuzhouProviders = require("./harness/providers.js");
global.JiuzhouEffects = require("./harness/effects.js");
global.JiuzhouGameRecovery = require("./game-recovery.js");

console.log("===============================================================================");
console.log("🎮 启动《通用互动小说 Harness · 第一性原理 (3+1 铁律)》全量集成回归测试套件");
console.log("===============================================================================\n");

// 1. 初始化虚拟浏览器全局环境
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
  focus() {}
}

const elements = {};
function getElem(id) {
  if (!elements[id]) elements[id] = new MockElement(id);
  return elements[id];
}

global.document = {
  getElementById: (id) => getElem(id),
  createElement: (tag) => new MockElement("elem_" + Math.random().toString(16).substring(2, 6), tag),
  addEventListener: (evt, fn) => {}
};
global.window = {
  addEventListener: (evt, fn) => {},
  removeEventListener: (evt, fn) => {}
};
global.fetch = async (url, opts) => {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            deliberation: "【GM 局势暗盘深思】基于第一性原理，深入推演玩家决策引发的宏大地缘震荡。",
            beats: [
              { speaker: "天道推演", sub: "【第一性原理推演】", type: "voice-court", stageChar: "center", text: "历史长河奔腾，新的世界线在玩家行动下展开！" }
            ],
            choices: [
              { text: "【AI生成方向 1】顺应大势深入推进", tag: "鼎新", bias: { authority: 2, pragmatism: 3, progress: 4, cognition: 3 }, diceBase: 10 },
              { text: "【AI生成方向 2】权衡妥协化解暗流", tag: "经世", bias: { authority: 1, pragmatism: 5, progress: 1, cognition: 4 }, diceBase: 9 },
              { text: "【AI生成方向 3】奇兵别辟独辟蹊径", tag: "机变", bias: { authority: 0, pragmatism: 4, progress: 5, cognition: 5 }, diceBase: 10 }
            ]
          })
        }
      }]
    })
  };
};

// 2. 加载 skills-data.js 与 app.js
const skillsDataPath = path.join(__dirname, "skills-data.js");
const appJsPath = path.join(__dirname, "app.js");

vm.runInThisContext(fs.readFileSync(skillsDataPath, "utf8"));
vm.runInThisContext(fs.readFileSync(appJsPath, "utf8"));

const engine = new WebVisualNovelEngine();
global.__vnEngine = engine;

let passedAssertions = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  } else {
    passedAssertions++;
  }
}

// ===========================================================================
// 测试 1: 四大阵营所有非结局场景节点严格遵循“3剧情方向 + 1开放输入 = 4选项”
// ===========================================================================
console.log("--- 测试 1: 四大阵营所有场景节点“3+1”结构审计 ---");
const factions = ["qing", "ming", "mongol", "nanming"];

factions.forEach(f => {
  engine.startNewGame(f);
  const tree = WORLD_PRESETS.canonicalTrees[f];
  assert(tree, `缺少阵营 ${f} 的主剧情树`);

  let checkedNodes = 0;
  for (const nodeId in tree.nodes) {
    const node = tree.nodes[nodeId];
    if (node.actNumber >= 5 && (!node.choices || node.choices.every(c => !c.targetNodeId))) {
      // 结局节点在下一测试中专项验证
      continue;
    }

    engine.currentStoryNodeId = nodeId;
    engine.isExtrapolating = false;
    engine.isEpilogueSequel = false;
    engine.presentFactionChoices();

    const renderedCards = engine.choiceContainer.children;
    assert(renderedCards.length === 4, `[FAIL] 阵营 ${f} 节点 ${nodeId} (${node.title}) 呈现的选项卡数量为 ${renderedCards.length}，不是严格的 4！`);
    
    // 检查第 4 项必须为开放式输入
    const card4Text = renderedCards[3].innerHTML;
    assert(card4Text.includes("[✍️ 开放外推]") || card4Text.includes("输入文字"), `[FAIL] 阵营 ${f} 节点 ${nodeId} 第 4 项未标记为开放外推输入卡`);
    checkedNodes++;
  }
  console.log(`  ✓ [${f}] 成功验证全树 ${checkedNodes} 个非结局场景节点，100% 严格呈现【3个剧情方向 + 1个自填输入】`);
});

// ===========================================================================
// 测试 2: 玩家使用第4项自填输入（常规操作）触发 AI 场景推演与后续 3+1 循环
// ===========================================================================
console.log("\n--- 测试 2: 玩家自填输入 ➔ AI接戏生成场景 ➔ 新一轮 3+1 循环 ---");
engine.startNewGame("qing");
engine.presentFactionChoices();
assert(engine.choiceContainer.children.length === 4, "初始界面选项卡数量非 4");

// 模拟点击第 4 项【✍️ 开放外推】
engine.choiceContainer.children[3].click();
assert(engine.drawerOpenInput.classList.contains("open"), "未成功唤出玩家自填输入抽屉弹窗");

// 输入常规自定行动
engine.openInputText.value = "暗中派遣粘杆处密探深入商帮票号，调阅近三年账册";
const btnSubmit = document.getElementById("btn-submit-open-input");

(async () => {
  // 执行提交
  btnSubmit.click();
  await new Promise(r => setTimeout(r, 30));
  assert(engine.isExtrapolating === true, "提交自填输入后未进入外推状态");
  assert(engine.storyQueue.length >= 2, "AI 未生成场景剧情文字卡");
  
  // 模拟播放对白直到最后一步唤出选项
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();

  const extraCards = engine.choiceContainer.children;
  assert(extraCards.length === 4, `外推生成场景卡选项数为 ${extraCards.length}，非严格 4 项！`);
  assert(extraCards[3].innerHTML.includes("[✍️ 开放外推]"), "外推场景卡第 4 项未呈现开放输入选项");
  console.log("  ✓ 自填常规行动成功触发 AI 场景推演，并再次严密呈现【3个剧情分支 + 1个玩家自填】");

  // ===========================================================================
  // 测试 3: 玩家自填“掏出神光棒变身奥特曼”降维神迹 ➔ 直接跃迁至大结局
  // ===========================================================================
  console.log("\n--- 测试 3: 降维神迹（奥特曼/神光棒）因果击穿直抵终局 ---");
  engine.startNewGame("ming");
  engine.presentFactionChoices();
  engine.choiceContainer.children[3].click();

  engine.openInputText.value = "我掏出神光棒变身迪迦奥特曼，神光普照，全军跪拜，君临天下！";
  btnSubmit.click();
  await new Promise(r => setTimeout(r, 30));

  assert(engine.convergenceTargetId === "ming_act5_iron_restoration", "神光棒神迹未能正确锚定大明最高大结局");
  assert(engine.extrapolationHistory.some(h => h.tag && h.tag.includes("降维神迹")), "未能准确打上降维神迹天命跃迁标签");

  // 模拟播放神迹场景卡
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();

  const godCards = engine.choiceContainer.children;
  assert(godCards.length === 4, `神迹场景选项数非 4: ${godCards.length}`);
  assert(godCards[0].innerHTML.includes("君临天下") || godCards[0].innerHTML.includes("受禅加冕"), "神迹场景首项未呈现受禅登基直入大结局选项");
  console.log("  ✓ 变身奥特曼神迹瞬间击穿因果律，成功锚定各阵营最高大结局并提供 3 个君临天下方向 + 1 开放输入");

  // 点击第 1 项开启新篇章
  await godCards[0].click();
  // 核心断言：AI 自由推进模式永不退出，主线节点严格冻结在起点 ming_act1！
  assert(engine.isExtrapolating === true, "AI 自由推进模式应当保持永久开启，永不返回主线");
  assert(engine.currentStoryNodeId === "ming_act1", "主线剧情进度遭到篡改！主线必须严格冻结于起点！");
  console.log("  ✓ 点击神迹走向后，主线进度严格冻结 (0消耗)，AI小说持续不可逆推进");

  // ===========================================================================
  // 测试 4: 预设大结局终章后日谈无限续写（3续集方向 + 1自填）
  // ===========================================================================
  console.log("\n--- 测试 4: 大结局终章后日谈无限续写（3续集方向 + 1自填） ---");
  engine.loadCanonicalNode("ming_act5_iron_restoration", false);
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();

  const epilogueCards = engine.choiceContainer.children;
  assert(epilogueCards.length === 4, `大结局终章选项非 4: ${epilogueCards.length}`);
  assert(epilogueCards[0].innerHTML.includes("后日谈"), "大结局首选项未呈现后日谈新纪元选项");
  assert(epilogueCards[3].innerHTML.includes("[✍️ 开放外推]"), "大结局第4项未呈现自填后日谈输入窗口");
  console.log("  ✓ 大结局终章节点成功呈现【3个后日谈续集分支 + 1个自填输入】");

  // 触发第 1 代续集
  await epilogueCards[0].click();
  assert(engine.isEpilogueSequel === true, "未正确置位后日谈续集状态");
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();
  assert(engine.choiceContainer.children.length === 4, "第 1 代续集场景后选项非 4 项");
  console.log("  ✓ 第 1 代续集场景推演完毕，持续循环呈现 4 项选择卡");

  // ===========================================================================
  // 测试 5: 时光机悔棋与 apiHistory 历史同步修剪
  // ===========================================================================
  console.log("\n--- 测试 5: 命运之结时光机回溯与历史污染防御 ---");
  engine.apiHistory = [
    { role: "user", content: "回合1" },
    { role: "assistant", content: "对白1" }
  ];
  engine.recordFateKnot("测试时光锚点", "记录初始状态");
  const knotIdx = engine.fateKnots.length - 1;

  // 推进 2 轮未来历史
  engine.apiHistory.push({ role: "user", content: "未来回合2" });
  engine.apiHistory.push({ role: "assistant", content: "未来对白2" });
  engine.apiHistory.push({ role: "user", content: "未来回合3" });
  engine.apiHistory.push({ role: "assistant", content: "未来对白3" });
  assert(engine.apiHistory.length === 6, "历史长度未达到 6");

  // 启动时光机悔棋
  engine.rewindToKnot(knotIdx);
  assert(engine.apiHistory.length === 2, `时光机回溯后历史长度为 ${engine.apiHistory.length}，未能同步切除未来幽灵历史！`);
  console.log("  ✓ 时光机成功修剪未来历史，100% 杜绝多轮模型因果倒错幻觉");

  console.log("\n===============================================================================");
  console.log(`🎉 全部集成测试通过！通过断言数: ${passedAssertions} / ${passedAssertions} (100% PASS)`);
  console.log("===============================================================================\n");
  process.exit(0);
})();
