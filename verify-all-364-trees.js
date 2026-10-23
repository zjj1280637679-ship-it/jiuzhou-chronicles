// Static field and choice-target checks; does not detect cycles or runtime deadlocks.
const data = require('./skills-data.js');
const trees = data.canonicalTrees;

console.log("=== 正在检查四阵营剧情节点字段与选项目标 ===");

let totalNodesChecked = 0;
let totalChoicesChecked = 0;
const errors = [];

for (const [factionKey, tree] of Object.entries(trees)) {
  console.log(`\n正在审计阵营 [${factionKey}]...`);
  const nodes = tree.nodes;
  const initialNodeId = tree.initialNodeId;
  const previousErrorCount = errors.length;

  if (!nodes[initialNodeId]) {
    errors.push(`[${factionKey}] 初始节点不存在: ${initialNodeId}`);
  }

  const nodeCount = Object.keys(nodes).length;
  if (nodeCount !== 364) {
    errors.push(`[${factionKey}] 节点数不等于 364: 实际为 ${nodeCount}`);
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    totalNodesChecked++;

    // 检查基本字段
    if (!node.title || !node.desc) {
      errors.push(`[${factionKey}][${nodeId}] 缺少 title 或 desc`);
    }
    if (!node.originalBeats || node.originalBeats.length === 0) {
      errors.push(`[${factionKey}][${nodeId}] 缺少 originalBeats`);
    }

    // 检查选项指向
    if (!node.choices || node.choices.length === 0) {
      errors.push(`[${factionKey}][${nodeId}] choices 为空`);
      continue;
    }

    node.choices.forEach((choice, cIdx) => {
      totalChoicesChecked++;
      if (!choice.isExtrapolation && !node.isEnding && !choice.targetNodeId) {
        errors.push(`[${factionKey}][${nodeId}] 主线选项 ${cIdx} 缺少目标节点`);
      }
      if (!choice.isExtrapolation && choice.targetNodeId) {
        if (!nodes[choice.targetNodeId]) {
          errors.push(`[${factionKey}][${nodeId}] 选项 ${cIdx} 指向未知节点: ${choice.targetNodeId}`);
        }
      }
    });
  }
  if (errors.length === previousErrorCount) {
    console.log(`✓ [${factionKey}] ${nodeCount} 个节点的字段和已声明选项目标静态检查通过`);
  } else {
    console.error(`[${factionKey}] 发现 ${errors.length - previousErrorCount} 项静态检查错误`);
  }
}

console.log(`\n=============================================================`);
console.log(`总计审计节点数: ${totalNodesChecked}`);
console.log(`总计审计选项指针数: ${totalChoicesChecked}`);
console.log(`错误总数: ${errors.length}`);
if (errors.length > 0) {
  console.error("❌ 发现字段或选项目标错误:", errors);
  process.exit(1);
} else {
  console.log(`✓ ${totalNodesChecked} 个节点静态检查通过，未发现本脚本检查范围内的缺失字段或悬挂指针；未检测循环、运行时死锁或实际游玩。`);
}
