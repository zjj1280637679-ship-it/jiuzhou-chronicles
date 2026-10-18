const fs = require('fs');
const path = require('path');

// 1. Qing
const qingMdPath = path.join(__dirname, 'data', 'qing-epic-novel.md');
const qingJsPath = path.join(__dirname, 'data', 'qing-epic-novel.js');
if (fs.existsSync(qingMdPath)) {
  const qingMdContent = fs.readFileSync(qingMdPath, 'utf8');
  const qingJsContent = `// qing-epic-novel.js: 2.8万字清朝入关史诗历史小说大纲底本
// 供浏览器环境与 Node.js 测试环境直接挂载

const QING_EPIC_NOVEL = ${JSON.stringify(qingMdContent)};

if (typeof window !== "undefined") {
  window.QING_EPIC_NOVEL = QING_EPIC_NOVEL;
  if (!window.WORLD_PRESETS) window.WORLD_PRESETS = {};
  window.WORLD_PRESETS.qingEpicNovel = QING_EPIC_NOVEL;
}

if (typeof module !== "undefined") {
  module.exports = QING_EPIC_NOVEL;
}
`;
  fs.writeFileSync(qingJsPath, qingJsContent, 'utf8');
  console.log('Successfully generated qing-epic-novel.js! File size:', fs.statSync(qingJsPath).size);
}

// 2. Ming
const mingMdPath = path.join(__dirname, 'data', 'ming-epic-novel.md');
const mingJsPath = path.join(__dirname, 'data', 'ming-epic-novel.js');
if (fs.existsSync(mingMdPath)) {
  const mingMdContent = fs.readFileSync(mingMdPath, 'utf8');
  const mingJsContent = `// ming-epic-novel.js: 2万字大明中枢史诗历史小说底本与剧情树大纲
// 供浏览器环境与 Node.js 测试环境直接挂载

const MING_EPIC_NOVEL = ${JSON.stringify(mingMdContent)};

if (typeof window !== "undefined") {
  window.MING_EPIC_NOVEL = MING_EPIC_NOVEL;
  if (!window.WORLD_PRESETS) window.WORLD_PRESETS = {};
  window.WORLD_PRESETS.mingEpicNovel = MING_EPIC_NOVEL;
}

if (typeof module !== "undefined") {
  module.exports = MING_EPIC_NOVEL;
}
`;
  fs.writeFileSync(mingJsPath, mingJsContent, 'utf8');
  console.log('Successfully generated ming-epic-novel.js! File size:', fs.statSync(mingJsPath).size);
}
