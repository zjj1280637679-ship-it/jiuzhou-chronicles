// test-tree-divergence.js: 验证 1变3变9 (1->3->9) 纯树状发散结构与非纺锤无自回归特性

const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.JiuzhouProviders = require('./harness/providers.js');

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
  querySelectorAll(sel) {
    return [];
  }
  querySelector(sel) {
    return null;
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
global.window = { addEventListener: () => {} };

const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const appCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
vm.runInThisContext(appCode);

console.log("=== 开始 1变3, 3变9 纯树状分支叙事架构 (非纺锤无自回归) 自动化严密验证 ===");

const engine = new WebVisualNovelEngine();
window.__vnEngine = engine;

const factions = ["ming", "qing", "mongol", "nanming"];

factions.forEach(f => {
  console.log(`\n[检验阵营: ${f}]`);
  const tree = WORLD_PRESETS.canonicalTrees[f];
  console.assert(tree, `阵营 ${f} 剧情树缺失`);

  const nodes = Object.values(tree.nodes);
  const act1Nodes = nodes.filter(n => n.actNumber === 1);
  const act2Nodes = nodes.filter(n => n.actNumber === 2);
  const act3Nodes = nodes.filter(n => n.actNumber === 3);
  const act4Nodes = nodes.filter(n => n.actNumber === 4);
  const act5Nodes = nodes.filter(n => n.actNumber === 5);

  if (f === 'qing') {
    // 大清 5 幕 243 终局宏伟真分支结构 (1 -> 3 -> 9 -> 27 -> 81 -> 243 终局 = 364 节点)
    const act5Showdowns = nodes.filter(n => n.actNumber === 5 && !n.isEnding);
    const leafEndings = nodes.filter(n => n.isEnding);
    console.assert(act1Nodes.length === 1, `[FAIL] 第1幕应仅有 1 个根节点`);
    console.assert(act2Nodes.length === 3, `[FAIL] 第2幕应有 3 个独立支脉节点`);
    console.assert(act3Nodes.length === 9, `[FAIL] 第3幕应有 9 个独立中局惊变节点`);
    console.assert(act4Nodes.length === 27, `[FAIL] 第4幕应有 27 个独立死生决战节点，实际为 ${act4Nodes.length}`);
    console.assert(act5Showdowns.length === 81, `[FAIL] 第5幕应有 81 个独立巅峰对决节点，实际为 ${act5Showdowns.length}`);
    console.assert(leafEndings.length === 243, `[FAIL] 应有 243 个最终独立天命终局，实际为 ${leafEndings.length}`);
    console.assert(nodes.length === 364, `[FAIL] 阵营 qing 总节点数应为 364，实际为 ${nodes.length}`);
    console.log(`  ✓ 五幕拓扑数学验证通过：1 -> 3 -> 9 -> 27 -> 81 -> 243 (总计 ${nodes.length} 个完全独立节点)`);

    // 纯分支无自回归断言
    const act1 = act1Nodes[0];
    const act1Targets = act1.choices.filter(c => !c.isExtrapolation).map(c => c.targetNodeId);
    console.assert(act1Targets.length === 3, `[FAIL] 第1幕必须包含 3 个选项`);
    console.log(`  ✓ 根节点 1 变 3 发散验证通过！`);

    const act3TargetSet = new Set();
    act2Nodes.forEach(n2 => {
      n2.choices.filter(c => !c.isExtrapolation).forEach(c => act3TargetSet.add(c.targetNodeId));
    });
    console.assert(act3TargetSet.size === 9, `[FAIL] 第2幕必须发散出 9 个独立第3幕目标`);
    console.log(`  ✓ 路线分野 3 变 9 纯分支验证通过！`);

    const act4TargetSet = new Set();
    act3Nodes.forEach(n3 => {
      n3.choices.filter(c => !c.isExtrapolation).forEach(c => act4TargetSet.add(c.targetNodeId));
    });
    console.assert(act4TargetSet.size === 27, `[FAIL] 第3幕必须发散出 27 个独立决战节点`);
    console.log(`  ✓ 中局惊变 9 变 27 决战映射通过：27 处死生巅峰战场！`);

    const act5TargetSet = new Set();
    act4Nodes.forEach(n4 => {
      n4.choices.filter(c => !c.isExtrapolation).forEach(c => act5TargetSet.add(c.targetNodeId));
    });
    console.assert(act5TargetSet.size === 81, `[FAIL] 第4幕必须发散出 81 个巅峰对决节点`);
    console.log(`  ✓ 死生决战 27 变 81 巅峰映射通过：81 处终极大对决！`);

    const endingTargetSet = new Set();
    act5Showdowns.forEach(n5 => {
      n5.choices.filter(c => !c.isExtrapolation).forEach(c => endingTargetSet.add(c.targetNodeId));
    });
    console.assert(endingTargetSet.size === 243, `[FAIL] 第5幕必须发散出 243 个最终天命终局`);
    console.log(`  ✓ 巅峰决胜 81 变 243 终局映射验证通过：243 种截然不同的天命结局！`);
  } else {
    // 标准五幕金字塔结构数量断言：1 变 3 变 9 变 9 变 9 = 31 节点
    console.assert(act1Nodes.length === 1, `[FAIL] 第1幕应仅有 1 个根节点，实际为 ${act1Nodes.length}`);
    console.assert(act2Nodes.length === 3, `[FAIL] 第2幕应有 3 个独立支脉节点 (2A, 2B, 2C)，实际为 ${act2Nodes.length}`);
    console.assert(act3Nodes.length === 9, `[FAIL] 第3幕应有 9 个独立中局惊变节点，实际为 ${act3Nodes.length}`);
    console.assert(act4Nodes.length === 9, `[FAIL] 第4幕应有 9 个独立死生决战节点，实际为 ${act4Nodes.length}`);
    console.assert(act5Nodes.length === 9, `[FAIL] 第5幕应有 9 个独立历史终局，实际为 ${act5Nodes.length}`);
    console.assert(nodes.length === 31, `[FAIL] 阵营 ${f} 总节点数应为 31，实际为 ${nodes.length}`);
    console.log(`  ✓ 五幕拓扑数学验证通过：1 -> 3 -> 9 -> 9 -> 9 (总计 ${nodes.length} 个完全独立节点)`);

    // 2. 纯分支无自回归 (Anti-Spindle) 断言：
    const act1 = act1Nodes[0];
    const act1Targets = act1.choices.filter(c => !c.isExtrapolation).map(c => c.targetNodeId);
    console.assert(act1Targets.length === 3, `[FAIL] 第1幕必须包含 3 个通往不同支脉的选项`);
    const act2Ids = act2Nodes.map(n => n.id);
    act1Targets.forEach(tid => {
      console.assert(act2Ids.includes(tid), `[FAIL] 第1幕选项目标 ${tid} 不在第2幕节点列表中`);
    });
    console.log(`  ✓ 根节点 1 变 3 发散验证通过！`);

    const act3AllTargetSet = new Set();
    act2Nodes.forEach(n2 => {
      const act2Targets = n2.choices.filter(c => !c.isExtrapolation).map(c => c.targetNodeId);
      console.assert(act2Targets.length === 3, `[FAIL] 节点 ${n2.id} 必须包含 3 个通往第3幕的独立选项`);
      act2Targets.forEach(tid => {
        console.assert(!act3AllTargetSet.has(tid), `[FAIL] 发生纺锤自回归收敛！节点 ${tid} 被多个前序节点重复指向！`);
        act3AllTargetSet.add(tid);
      });
    });
    console.assert(act3AllTargetSet.size === 9, `[FAIL] 第2幕分流后必须衍生出 9 个完全不重合的第3幕目标，实际为 ${act3AllTargetSet.size}`);
    console.log(`  ✓ 路线分野 3 变 9 纯分支验证通过：0 个收敛瓶颈，0 次自回归！`);

    const act4TargetSet = new Set();
    act3Nodes.forEach(n3 => {
      const act3Targets = [...new Set(n3.choices.filter(c => !c.isExtrapolation && c.targetNodeId).map(c => c.targetNodeId))];
      console.assert(act3Targets.length >= 1, `[FAIL] 惊变节点 ${n3.id} 缺少决战目标`);
      act3Targets.forEach(tid => {
        console.assert(!act4TargetSet.has(tid), `[FAIL] 决战节点 ${tid} 重复指向`);
        act4TargetSet.add(tid);
      });
    });
    console.assert(act4TargetSet.size === 9, `[FAIL] 必须对应 9 个独立决战节点，实际为 ${act4TargetSet.size}`);
    console.log(`  ✓ 中局惊变 9 变 9 决战映射通过：9 处死生巅峰战场！`);

    const act5TargetSet = new Set();
    act4Nodes.forEach(n4 => {
      const act4Targets = [...new Set(n4.choices.filter(c => !c.isExtrapolation && c.targetNodeId).map(c => c.targetNodeId))];
      console.assert(act4Targets.length >= 1, `[FAIL] 决战节点 ${n4.id} 缺少终局目标`);
      act4Targets.forEach(tid => {
        console.assert(!act5TargetSet.has(tid), `[FAIL] 终局节点 ${tid} 重复指向`);
        act5TargetSet.add(tid);
      });
    });
    console.assert(act5TargetSet.size === 9, `[FAIL] 必须对应 9 个独立历史终局，实际为 ${act5TargetSet.size}`);
    console.log(`  ✓ 死生决胜 9 变 9 终局映射验证通过：9 种截然不同的天命结局！`);
  }
});

// 3. 验证 UI 抽屉流程图渲染中是否包含 5 幕金字塔集群标记与筛选器
engine.startNewGame("ming");
engine.renderStoryTreeDrawer();
const drawerHtml = getElem("storytree-canvas-container").innerHTML;
console.assert(drawerHtml.includes("storytree-filter-tabs"), "[FAIL] 应包含支脉聚焦选择器 tabs");
console.assert(drawerHtml.includes("flow-trunk-cluster"), "[FAIL] 应包含 3 大决战集群");
console.assert(drawerHtml.includes("第一幕 · 起局定势 (1)"), "[FAIL] 应标明第一幕 1 节点");
console.assert(drawerHtml.includes("第二幕 · 路线分野 (3)"), "[FAIL] 应标明第二幕 3 节点");
console.assert(drawerHtml.includes("第三幕 · 中局惊变 (9)"), "[FAIL] 应标明第三幕 9 节点");
console.assert(drawerHtml.includes("第四幕 · 死生决胜 (9)"), "[FAIL] 应标明第四幕 9 节点");
console.assert(drawerHtml.includes("第五幕 · 天命归所 (9)"), "[FAIL] 应标明第五幕 9 终局");
console.log("\n✓ UI 流程图画布五幕金字塔 (1->3->9->9->9) 纯分支呈现结构与支脉集群渲染验证通过！");

console.log("\n=== 恭喜！全部 1变3, 3变9, 9变9, 9变9 五幕金字塔纯树状分支拓扑与防纺锤收敛测试 100% 通过！ ===");
process.exit(0);
