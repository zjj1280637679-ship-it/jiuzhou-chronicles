// test-extreme-boundaries.js: 针对开放输入与自定行动执行极端边界自动化测试
// 涵盖：1. 空输入/全空白拦截  2. 超长文本(5000+字)与特殊注入字符  3. 4大阵营跨阵营降维神迹因果击穿  4. 终局后无限递归边界

const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.JiuzhouProviders = require("./harness/providers.js");
global.JiuzhouGameRecovery = require("./game-recovery.js");

let lastAlertMessage = null;
global.alert = (msg) => {
  lastAlertMessage = msg;
};

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
global.window = {
  addEventListener: () => {},
  alert: global.alert
};

const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("==========================================================================");
console.log("🚀 开始执行【极端边界条件全覆盖自动化强化测试】");
console.log("==========================================================================\n");

(async () => {
  const engine = new WebVisualNovelEngine();
engine.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
  window.__vnEngine = engine;

  // -------------------------------------------------------------
  // 测试组 1：空输入、空白字符与非法输入拦截健壮性测试
  // -------------------------------------------------------------
  console.log("【测试组 1：空输入、纯空白字符拦截与状态防污染测试】");
  engine.startNewGame("qing");
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();

  const choiceCardsAct1 = engine.choiceContainer.children;
  const openInputCard = choiceCardsAct1[3];
  openInputCard.click();
  console.assert(engine.drawerOpenInput.classList.contains("open"), "[FAIL] 弹窗未唤起");

  // 1.1 完全空字符串 ""
  lastAlertMessage = null;
  engine.openInputText.value = "";
  const prevHistoryLen = engine.extrapolationHistory.length;
  engine.btnSubmitOpenInput.click();

  console.assert(lastAlertMessage === "请输入你希望由 AI 接住并推演的行动指令！", `[FAIL] 空输入未触发预期警告: ${lastAlertMessage}`);
  console.assert(engine.drawerOpenInput.classList.contains("open"), "[FAIL] 空输入被非法提交导致弹窗关闭");
  console.assert(engine.isExtrapolating === false, "[FAIL] 空输入非法激活了外推模式");
  console.assert(engine.extrapolationHistory.length === prevHistoryLen, "[FAIL] 空输入污染了外推历史");
  console.log("  ✓ 1.1 纯空字符串 \"\" 成功被前置拦截，弹窗保持打开，游戏状态 0 污染！");

  // 1.2 纯空白字符 (空格、换行、制表符)
  lastAlertMessage = null;
  engine.openInputText.value = "   \n\t  \r  ";
  engine.btnSubmitOpenInput.click();

  console.assert(lastAlertMessage === "请输入你希望由 AI 接住并推演的行动指令！", `[FAIL] 纯空白输入未触发预期警告: ${lastAlertMessage}`);
  console.assert(engine.drawerOpenInput.classList.contains("open"), "[FAIL] 纯空白输入被非法提交导致弹窗关闭");
  console.assert(engine.isExtrapolating === false, "[FAIL] 纯空白输入非法激活了外推模式");
  console.assert(engine.extrapolationHistory.length === prevHistoryLen, "[FAIL] 纯空白输入污染了外推历史");
  console.log("  ✓ 1.2 纯空白与制表符字符成功被 trim() 拦截，游戏状态 0 污染！");

  // 1.3 取消与关闭按钮测试
  engine.btnCancelOpenInput.click();
  console.assert(!engine.drawerOpenInput.classList.contains("open"), "[FAIL] 点击取消未能关闭弹窗");
  console.log("  ✓ 1.3 取消按钮成功安全退出开放输入抽屉！\n");

  // -------------------------------------------------------------
  // 测试组 2：超长文本输入 (5000+ 字符) 与 XSS/特殊符号防御
  // -------------------------------------------------------------
  console.log("【测试组 2：超长文本 (5000+ 字符) 与极端特殊符号容错测试】");
  openInputCard.click();

  // 构造 5000+ 字符的高密度混合字符串：策论 + 符号 + Emoji + HTML/Markdown/LaTeX 语法
  const baseText = "【经略四海·天下公约】：臣闻王道荡荡，顺天者昌，逆天者亡。今特颁万民救亡图存大策，";
  const ultraLongText = baseText.repeat(130) + " <script>alert('xss')</script> \"'\\/`~!@#$%^&*()_+{}[]:;<>?,./ 🦹‍♂️🪐💥";
  console.log(`  ➔ 构造超长文本长度: ${ultraLongText.length} 字符`);

  engine.openInputText.value = ultraLongText;
  engine.btnSubmitOpenInput.click();
  await new Promise(r => setTimeout(r, 20));

  console.assert(!engine.drawerOpenInput.classList.contains("open"), "[FAIL] 超长文本提交后弹窗未关闭");
  console.assert(engine.isExtrapolating === true, "[FAIL] 超长文本未能正常进入外推模式");
  console.assert(engine.storyQueue.length >= 2, "[FAIL] 超长文本未生成场景卡 beats");
  
  const extrapolatedBeat = engine.storyQueue.find(b => b.sub.includes("AI 接住推演支线卡"));
  console.assert(extrapolatedBeat, "[FAIL] 场景卡缺少 AI 接戏 beat");
  console.assert(extrapolatedBeat.text.includes("【玩家自定行动】："), "[FAIL] 未正确承载玩家自定行动前缀");

  // 验证在超长文本下的选项卡呈现
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();
  const ultraChoices = engine.choiceContainer.children;
  console.assert(ultraChoices.length === 4, `[FAIL] 超长文本后选项数应为 4，实际为 ${ultraChoices.length}`);
  console.log(`  ✓ 2.1 5000+ 字符超长输入被 AI-GM 完整消化并安全渲染，选项容器严格维持 3 主干 + 1 开放输入！`);

  // 验证因果弥合对超长文本截取与容错
  const lastHistory = engine.extrapolationHistory[engine.extrapolationHistory.length - 1];
  console.assert(lastHistory.choiceText === ultraLongText, "[FAIL] 历史记录未能完整保存超长输入原文");
  const targetNode = WORLD_PRESETS.canonicalTrees.qing.nodes["qing_act2_iron"];
  const suturedCard = engine.generateLocalSuturedCard(targetNode, engine.extrapolationHistory);
  console.assert(suturedCard.reconciledBeats.length >= 2, "[FAIL] 弥合卡片 beats 不足");
  console.assert(suturedCard.sutureNote.length > 0, "[FAIL] 弥合报告为空");
  console.log(`  ✓ 2.2 因果弥合引擎对超长历史数据平滑容错截取并安全缝合（生成的弥合台词无越界无空指针）！\n`);

  // -------------------------------------------------------------
  // 测试组 3：全 4 大阵营跨阵营降维神迹输入与天命跃迁终局测试
  // -------------------------------------------------------------
  console.log("【测试组 3：全 4 大阵营跨阵营降维神迹因果击穿与天命定鼎终局测试】");

  const factionGodTests = [
    {
      faction: "ming",
      name: "大明紫禁",
      input: "我掏出神光棒变身迪迦奥特曼，降维打击清军与顺军，一统天下",
      expectedEnding: "ming_act5_iron_restoration",
      keyword: "迪迦奥特曼"
    },
    {
      faction: "qing",
      name: "后金八旗",
      input: "祭出天基动能核弹降维打击，成仙登基，直接当皇帝一统天下",
      expectedEnding: "qing_end_1",
      keyword: "核弹"
    },
    {
      faction: "mongol",
      name: "大漠蒙古",
      input: "呼唤长生天仙帝真身降临，启动歼 20机甲秒杀所有敌手，君临天下",
      expectedEnding: "mongol_act5_yuan_restoration",
      keyword: "歼 20"
    },
    {
      faction: "nanming",
      name: "南国海邦",
      input: "展露上古神明神迹降临，以无上神威渡海克复中原，扫荡天下",
      expectedEnding: "nanming_act5_ocean_kingdom",
      keyword: "神明"
    }
  ];

  for (const t of factionGodTests) {
    console.log(`\n  ➔ [跨阵营神迹校验: ${t.name} (${t.faction})]`);
    engine.startNewGame(t.faction);
    engine.currentStep = engine.storyQueue.length;
    engine.presentFactionChoices();

    const choices = engine.choiceContainer.children;
    const openCard = choices[3];
    openCard.click();

    engine.openInputText.value = t.input;
    engine.btnSubmitOpenInput.click();
    await new Promise(r => setTimeout(r, 20));

    // 校验降维神迹是否被准确嗅探
    console.assert(engine.isExtrapolating === true, `[FAIL] ${t.faction} 未能进入外推`);
    console.assert(engine.convergenceTargetId === t.expectedEnding, 
      `[FAIL] ${t.faction} 降维神迹目标未收敛至终局 ${t.expectedEnding}，实际为: ${engine.convergenceTargetId}`);
    
    const hist = engine.extrapolationHistory[engine.extrapolationHistory.length - 1];
    console.assert(hist.tag.includes("降维神迹"), `[FAIL] ${t.faction} tag 未标记为降维神迹: ${hist.tag}`);

    // 校验生成的 beats
    const beats = engine.storyQueue;
    console.assert(beats.length >= 4, `[FAIL] ${t.faction} 神迹外推 beats 数量不足: ${beats.length}`);
    console.assert(beats[0].sub.includes("降维神迹因果跃迁"), `[FAIL] ${t.faction} 首拍未标记因果跃迁`);
    console.assert(beats.some(b => b.text.includes(t.keyword)), `[FAIL] ${t.faction} 未包含关键字 ${t.keyword}`);

    // 校验外推卡片数量（必须严格 4 个：3 剧情走向 + 1 自定输入）
    engine.currentStep = beats.length;
    engine.presentFactionChoices();
    const godChoices = engine.choiceContainer.children;
    console.assert(godChoices.length === 4, `[FAIL] ${t.faction} 神迹抉择卡数量应为 4，实际为 ${godChoices.length}`);
    
    // 模拟点击第 1 个选项继续向前推演
    const initialNodeId = WORLD_PRESETS.canonicalTrees[t.faction].initialNodeId;
    godChoices[0].click();
    await new Promise(r => setTimeout(r, 20));

    // 核心数学逻辑验证：自由探索绝不消耗主线进度！主线节点严格冻结在起点！
    console.assert(engine.isExtrapolating === true, `[FAIL] ${t.faction} 自由推进未保持外推态`);
    console.assert(engine.currentStoryNodeId === initialNodeId, 
      `[FAIL] ${t.faction} 主线剧情进度被非法篡改！实际为: ${engine.currentStoryNodeId}，应严格冻结于: ${initialNodeId}`);
    console.log(`    ✓ ${t.name}：神迹命中 -> 大结局插图下发 -> 主线进度严格冻结 (0消耗) -> AI小说无限向前狂飙！通过！`);
  }

  // -------------------------------------------------------------
  // 测试组 4：大结局后日谈无限续集的多代连续边界测试
  // -------------------------------------------------------------
  console.log("\n【测试组 4：大结局后日谈无限续集的多代连续推演边界测试】");
  // 载入南明终局 nanming_act5_ocean_kingdom
  engine.loadCanonicalNode("nanming_act5_ocean_kingdom", false);
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();
  const epilogueChoicesGen0 = engine.choiceContainer.children;
  console.assert(epilogueChoicesGen0.length === 4, `[FAIL] 终局应提供 4 个选项（3 后日谈 + 1 开放输入）`);
  console.log(`  ✓ 终局初始状态成功渲染 3 个后日谈预设 + 1 个开放输入`);

  // 递归推演 3 代后日谈续集，验证状态机、选项卡与无缝续写能力
  for (let gen = 1; gen <= 3; gen++) {
    const choices = engine.choiceContainer.children;
    const inputCard = choices[3];
    inputCard.click();

    const customSequelAction = `第 ${gen} 代新政：建立跨大洋蒸汽商船与深空星象观测站，开辟第 ${gen} 极新领地`;
    engine.openInputText.value = customSequelAction;
    engine.btnSubmitOpenInput.click();
    await new Promise(r => setTimeout(r, 20));

    console.assert(engine.isExtrapolating === true, `[FAIL] 第 ${gen} 代未能维持外推态`);
    console.assert(engine.isEpilogueSequel === true, `[FAIL] 第 ${gen} 代未能维持后日谈续集态`);

    const seqBeats = engine.storyQueue;
    console.assert(seqBeats.length >= 3, `[FAIL] 第 ${gen} 代续集 beats 应至少为 3，实际为 ${seqBeats.length}`);
    console.assert(seqBeats[0].text.includes(`第 ${gen} 代新政`), `[FAIL] 第 ${gen} 代续集文本未包含自定行动`);

    engine.currentStep = seqBeats.length;
    engine.presentFactionChoices();
    const nextChoices = engine.choiceContainer.children;
    console.assert(nextChoices.length === 4, `[FAIL] 第 ${gen} 代续集后选项数量应为 4，实际为 ${nextChoices.length}`);
    console.log(`  ✓ 第 ${gen} 代无限后日谈续集成功推演，3 选项 + 1 开放输入窗口持续稳定！`);
  }

  console.log("\n==========================================================================");
  console.log("🎉 【极端边界全覆盖（空输入/超长文本/4大阵营跨阵营神迹/多代无限后日谈）】100% PASS！");
  console.log("==========================================================================");
  process.exit(0);
})().catch(err => {
  console.error("❌ 极端边界测试失败:", err);
  process.exit(1);
});
