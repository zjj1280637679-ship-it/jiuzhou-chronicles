// generate-5layers.js: 为四大阵营生成完整的五幕金字塔剧情树 (1 -> 3 -> 9 -> 9 -> 9 = 31 节点/阵营，总计 124 节点)
const fs = require('fs');
const path = require('path');

const skillsDataPath = path.join(__dirname, 'skills-data.js');
const rawCode = fs.readFileSync(skillsDataPath, 'utf8');

// 提取前面的配置 (factions, thinMaps, vectors, historicalFigures, swarm, initialTokens)
const splitMarker = '  canonicalTrees: {';
const splitIndex = rawCode.indexOf(splitMarker);
if (splitIndex === -1) {
  console.error("无法找到 canonicalTrees 分割标记！");
  process.exit(1);
}

const headerPart = rawCode.slice(0, splitIndex + splitMarker.length);

console.log("找到 header 长度:", headerPart.length);
