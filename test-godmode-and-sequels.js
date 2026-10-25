// test-godmode-and-sequels.js: 测试奥特曼神光棒直接跳跃至君临天下大结局 + 3选项与开放窗口一致性 + 大结局后无限续集推演
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

const engine = new WebVisualNovelEngine();
engine.apiConfig.enabled = false; // This fixture exercises explicit offline play, without remote requests.
window.__vnEngine = engine;

console.log("=== 启动【神光棒变身奥特曼直跳大结局 + 3选项与开放窗口 + 结局后无限续集】全流程测试 ===");

(async () => {
  // 1. 启动大清阵营
  engine.startNewGame("qing");
  console.log("✓ 成功进入大清第一幕:", engine.currentStoryNodeId);

  // 第一幕走完，弹出选项
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();

  const choiceCardsAct1 = engine.choiceContainer.children;
  console.log(`✓ 第一幕渲染选项数量: ${choiceCardsAct1.length} (期望 4 个：3 主干 + 1 开放外推)`);
  if (choiceCardsAct1.length !== 4) {
    throw new Error(`第一幕选项数量不等于 4，实际为 ${choiceCardsAct1.length}`);
  }

  // 2. 模拟玩家点击第 4 项【✍️ 输入文字开放式外推】
  const openInputCard = choiceCardsAct1[3];
  openInputCard.click();
  console.log("✓ 成功唤起【输入文字开放式外推】输入窗口");

  // 3. 玩家输入：“我掏出神光棒变身奥特曼”
  engine.openInputText.value = "我掏出神光棒变身奥特曼";
  engine.btnSubmitOpenInput.click();
  console.log("✓ 成功提交自定行动: '我掏出神光棒变身奥特曼'");

  // 校验此时状态
  if (!engine.isExtrapolating) throw new Error("未能成功进入外推模式！");
  console.log("✓ 外推目标汇聚节点 (convergenceTargetId):", engine.convergenceTargetId);
  if (engine.convergenceTargetId !== "qing_end_1") {
    throw new Error(`奥特曼神级操作未能直接将收敛目标设为大清终局 qing_end_1，实际为: ${engine.convergenceTargetId}`);
  }

  // 检查 AI 生成的支线场景卡
  const beats = engine.storyQueue;
  console.log(`✓ AI 生成神级外推场景卡，共 ${beats.length} 拍:`);
  beats.forEach((b, i) => {
    console.log(`  拍 ${i+1} [${b.speaker}] (${b.sub}) -> ${b.text.substring(0, 45)}...`);
  });

  const deliberationBeat = beats.find(b => b.sub.includes("降维神迹"));
  if (!deliberationBeat) throw new Error("缺少降维神迹推演拍！");
  console.log("✓ 成功识别并推演降维神迹，因果律击穿！");

  // 4. 外推场景卡对白放完，检查呈现的选项
  engine.currentStep = engine.storyQueue.length;
  engine.presentFactionChoices();

  const choicesAfterUltraman = engine.choiceContainer.children;
  console.log(`✓ 神迹外推后渲染选项数量: ${choicesAfterUltraman.length} (期望恰好 4 个：3 分支 + 1 开放输入窗口)`);
  if (choicesAfterUltraman.length !== 4) {
    throw new Error(`选项数量不等于 4，实际为 ${choicesAfterUltraman.length}`);
  }

  // 检查选项 1 是否直通大结局 qing_end_1
  const choice1Text = choicesAfterUltraman[0].innerHTML;
  console.log("  选项 1 文本摘要:", choice1Text.substring(0, 60));
  if (!choice1Text.includes("君临天下") && !choice1Text.includes("终极定鼎")) {
    throw new Error("选项 1 未包含君临天下大结局导向！");
  }

  // 5. 点击选项 1【君临天下 · 天命定鼎】，进入 AI 自由小说下一轮推进 (单向不可逆且主线严格冻结)
  console.log("➔ 点击选项 1【君临天下 · 天命定鼎】，开启 AI 自由小说下一轮推演...");
  choicesAfterUltraman[0].click();

  await new Promise(r => setTimeout(r, 50));
  console.log("✓ 当前所在剧情节点 (应严格冻结在起点 qing_act1，0消耗):", engine.currentStoryNodeId);
  if (engine.currentStoryNodeId !== "qing_act1") {
    throw new Error(`主线节点发生未授权偏移，应为 qing_act1，实际为: ${engine.currentStoryNodeId}`);
  }
  if (!engine.isExtrapolating) {
    throw new Error("未能保持 AI 自由外推小说模式！");
  }

  const round2Beats = engine.storyQueue;
  console.log(`✓ 成功生成第 2 轮 AI 自由小说场景卡（${round2Beats.length} 拍），首拍: [${round2Beats[0].speaker}] ${round2Beats[0].text.substring(0, 50)}...`);

  // 6. 第 2 轮对白播放完毕，检验呈现的选项：严格保持 3 个故事走向 + 1 个开放输入窗口
  engine.currentStep = round2Beats.length;
  engine.presentFactionChoices();

  const round2Choices = engine.choiceContainer.children;
  console.log(`✓ 第 2 轮后渲染选项数量: ${round2Choices.length} (期望恰好 4 个：3 个小说走向 + 1 个开放输入窗口)`);
  if (round2Choices.length !== 4) {
    throw new Error(`选项数量不等于 4，实际为 ${round2Choices.length}`);
  }

  console.log("  轮次 2 选项 1:", round2Choices[0].innerHTML.substring(0, 50));
  console.log("  轮次 2 选项 2:", round2Choices[1].innerHTML.substring(0, 50));
  console.log("  轮次 2 选项 3:", round2Choices[2].innerHTML.substring(0, 50));
  console.log("  轮次 2 选项 4 (开放输入):", round2Choices[3].innerHTML.substring(0, 50));

  // 7. 点击轮次 2 选项 1，推进至第 3 轮！
  console.log("➔ 点击选项 1，推进至第 3 轮 AI 自由小说...");
  round2Choices[0].click();
  await new Promise(r => setTimeout(r, 50));

  if (!engine.isExtrapolating) {
    throw new Error("未能保持 AI 自由小说模式！");
  }

  const round3Beats = engine.storyQueue;
  console.log(`✓ 成功生成第 3 轮场景卡（${round3Beats.length} 拍），首拍: [${round3Beats[0].speaker}] ${round3Beats[0].text.substring(0, 50)}...`);

  engine.currentStep = round3Beats.length;
  engine.presentFactionChoices();

  const round3Choices = engine.choiceContainer.children;
  console.log(`✓ 第 3 轮后选项数量: ${round3Choices.length} (仍保持 3 选项 + 1 开放输入)`);
  if (round3Choices.length !== 4) {
    throw new Error(`选项数量不等于 4，实际为 ${round3Choices.length}`);
  }

  // 8. 在第 3 轮下点击第 4 项【输入文字开放式外推】，测试无限自定义输入续写
  console.log("➔ 在第 3 轮状态下再次点击第 4 项输入文字，测试自填无限续写...");
  round3Choices[3].click();
  engine.openInputText.value = "派遣蒸汽铁甲战舰驶往大西洋，建立新大陆经略使署";
  engine.btnSubmitOpenInput.click();
  await new Promise(r => setTimeout(r, 50));

  const round4Beats = engine.storyQueue;
  console.log(`✓ 成功生成自填输入场景卡（${round4Beats.length} 拍），首拍: [${round4Beats[0].speaker}] ${round4Beats[0].text.substring(0, 50)}...`);

  engine.currentStep = round4Beats.length;
  engine.presentFactionChoices();
  const round4Choices = engine.choiceContainer.children;
  console.log(`✓ 自填推进后选项数量: ${round4Choices.length} (依然完美提供 3 选项 + 1 开放输入窗口)`);
  if (round4Choices.length !== 4) {
    throw new Error(`自填推进后选项数量不等于 4，实际为 ${round4Choices.length}`);
  }

  // 核心断言：主线节点始终冻结在初始节点，未曾消耗一分一毫
  if (engine.currentStoryNodeId !== "qing_act1") {
    throw new Error(`核心逻辑违背：自由探索推进消耗了主线进度，当前为: ${engine.currentStoryNodeId}`);
  }
  console.log(`✓ 终极数学逻辑断言通过：经历 4 轮 AI 自由推演，主线节点始终严格冻结在 [${engine.currentStoryNodeId}] (0消耗)！`);

  console.log("\n==========================================================================");
  console.log("🎉 【降维神迹因果击穿 + 解耦双轨无限AI小说 + 3选项与开放窗口一致性】100% PASS！");
  console.log("==========================================================================");
  process.exit(0);
})().catch(err => {
  console.error("❌ 测试失败:", err);
  process.exit(1);
});
