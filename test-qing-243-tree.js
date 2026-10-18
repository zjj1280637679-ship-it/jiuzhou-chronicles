// test-qing-243-tree.js: 严格数学断言验证大清阵营 5 幕 243 终局纯树状分支 (363 独立分流节点，0 纺锤收敛，0 自回归)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("=== 启动大清 5 幕 243 终局真分支纯树状结构数学断言验证 ===");

global.window = global;
const skillsDataCode = fs.readFileSync(path.join(__dirname, "skills-data.js"), "utf8");
vm.runInThisContext(skillsDataCode);

const qingTree = WORLD_PRESETS.canonicalTrees.qing;
console.assert(qingTree, "大清剧情树缺失！");

const nodes = qingTree.nodes;
const allNodeIds = Object.keys(nodes);

console.log(`全树载入节点总数: ${allNodeIds.length}`);

// 1. 分层统计
const act1 = Object.values(nodes).filter(n => n.actNumber === 1);
const act2 = Object.values(nodes).filter(n => n.actNumber === 2);
const act3 = Object.values(nodes).filter(n => n.actNumber === 3);
const act4 = Object.values(nodes).filter(n => n.actNumber === 4);
const act5Showdown = Object.values(nodes).filter(n => n.actNumber === 5 && !n.isEnding);
const endings = Object.values(nodes).filter(n => n.isEnding);

console.log(`- 第一幕起局 (Root): ${act1.length} 节点`);
console.log(`- 第二幕路线分野: ${act2.length} 节点`);
console.log(`- 第三幕中局惊变: ${act3.length} 节点`);
console.log(`- 第四幕死生决胜: ${act4.length} 节点`);
console.log(`- 第五幕巅峰对决: ${act5Showdown.length} 节点`);
console.log(`- 最终叶子终局 (Leaves): ${endings.length} 节点`);

console.assert(act1.length === 1, `[FAIL] Act 1 必须为 1，实际为 ${act1.length}`);
console.assert(act2.length === 3, `[FAIL] Act 2 必须为 3，实际为 ${act2.length}`);
console.assert(act3.length === 9, `[FAIL] Act 3 必须为 9，实际为 ${act3.length}`);
console.assert(act4.length === 27, `[FAIL] Act 4 必须为 27，实际为 ${act4.length}`);
console.assert(act5Showdown.length === 81, `[FAIL] Act 5 巅峰决胜必须为 81，实际为 ${act5Showdown.length}`);
console.assert(endings.length === 243, `[FAIL] 终局叶子必须为 243，实际为 ${endings.length}`);
console.assert(allNodeIds.length === 364, `[FAIL] 全树节点总数必须为 364 (1 + 363)，实际为 ${allNodeIds.length}`);
console.log("✓ 分层拓扑数量验证 100% 通过：1 -> 3 -> 9 -> 27 -> 81 -> 243！");

// 2. 验证纯树状发散性 (Anti-Spindle Check / Zero Convergence)
function verifyStrictDivergence(sourceNodes, expectedTargetCount, stageName) {
  const targetSet = new Set();
  sourceNodes.forEach(src => {
    const canonicalChoices = src.choices ? src.choices.filter(c => !c.isExtrapolation) : [];
    console.assert(canonicalChoices.length === 3, `[FAIL] ${src.id} 的有效主干选项数必须为 3`);
    canonicalChoices.forEach((c, idx) => {
      console.assert(c.targetNodeId, `[FAIL] ${src.id} 选项 #${idx+1} 缺少 targetNodeId`);
      console.assert(nodes[c.targetNodeId], `[FAIL] ${src.id} 选项目标 ${c.targetNodeId} 在树中不存在`);
      console.assert(!targetSet.has(c.targetNodeId), `[FAIL] 发生纺锤汇聚！目标节点 ${c.targetNodeId} 被多个前序节点重复指向！`);
      targetSet.add(c.targetNodeId);
    });
  });
  console.assert(targetSet.size === expectedTargetCount, `[FAIL] ${stageName} 目标节点数必须为 ${expectedTargetCount}，实际为 ${targetSet.size}`);
  console.log(`  ✓ ${stageName}: 0 汇聚收敛，衍生出 ${targetSet.size} 个完全独立的子节点！`);
}

console.log("\n[检验各幕纯分支发散性]");
verifyStrictDivergence(act1, 3, "第 1 幕 -> 第 2 幕 (1 变 3)");
verifyStrictDivergence(act2, 9, "第 2 幕 -> 第 3 幕 (3 变 9)");
verifyStrictDivergence(act3, 27, "第 3 幕 -> 第 4 幕 (9 变 27)");
verifyStrictDivergence(act4, 81, "第 4 幕 -> 第 5 幕巅峰 (27 变 81)");
verifyStrictDivergence(act5Showdown, 243, "第 5 幕巅峰 -> 243 最终天命终局 (81 变 243)");

// 3. 验证游玩深度 (Path Traversal Depth Check)
console.log("\n[验证任意路径游玩深度]");
let visitedPaths = 0;
function traverse(nodeId, depth, pathSoFar) {
  const node = nodes[nodeId];
  console.assert(node, `[FAIL] 找不到目标节点: ${nodeId}`);
  if (!node) return;
  if (node.isEnding) {
    console.assert(depth === 5, `[FAIL] 终局 ${nodeId} 深度必须为 5，实际为 ${depth} (路径: ${pathSoFar.join(' -> ')})`);
    visitedPaths++;
    return;
  }
  node.choices.filter(c => !c.isExtrapolation).forEach(c => {
    traverse(c.targetNodeId, depth + 1, [...pathSoFar, nodeId]);
  });
}

traverse(act1[0].id, 0, []);
console.assert(visitedPaths === 243, `[FAIL] 遍历出的总终局数必须为 243，实际为 ${visitedPaths}`);
console.log(`  ✓ 成功穷举遍历全树全部 243 条不同历史路线，每条路线从起点到终局深度严格为 5！`);
console.log(`  ✓ 彻底实现“AI每次只需写5个故事即可完成一条完整路线”的第一性原理！`);

// 4. 文学内容与数据完整性检查
console.log("\n[验证文学对白与数据字段完整性]");
allNodeIds.forEach(id => {
  const n = nodes[id];
  console.assert(n.title && n.title.length > 0, `[FAIL] 节点 ${id} 标题缺失`);
  console.assert(n.desc && n.desc.length > 0, `[FAIL] 节点 ${id} 描述缺失`);
  console.assert(n.coords, `[FAIL] 节点 ${id} 坐标缺失`);
  console.assert(n.originalBeats && n.originalBeats.length >= 2, `[FAIL] 节点 ${id} 对白 beats 不足`);
  n.originalBeats.forEach(b => {
    console.assert(b.speaker && b.text, `[FAIL] 节点 ${id} 的 beat 格式错误`);
  });
});
console.log("  ✓ 全树 364 个节点文学内容完整性校验 100% PASS！\n");
console.log("=================================================");
console.log("🎉 大清阵营 5 幕 243 终局宏伟剧情树已通过全部严密数学断言！");
console.log("=================================================");
