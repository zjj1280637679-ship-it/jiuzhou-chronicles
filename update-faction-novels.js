const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const qing = fs.readFileSync(path.join(dataDir, 'qing-epic-novel.md'), 'utf8');
const ming = fs.readFileSync(path.join(dataDir, 'ming-epic-novel.md'), 'utf8');
const mongol = fs.readFileSync(path.join(dataDir, 'mongol-epic-novel.md'), 'utf8');
const nanming = fs.readFileSync(path.join(dataDir, 'nanming-epic-novel.md'), 'utf8');

const output = `// faction-novels.js: 聚合四大阵营全部长篇史诗历史大纲与背景圣经
const FACTION_EPIC_NOVELS = ${JSON.stringify({ qing, ming, mongol, nanming }, null, 2)};

if (typeof window !== 'undefined') window.FACTION_EPIC_NOVELS = FACTION_EPIC_NOVELS;
if (typeof global !== 'undefined') global.FACTION_EPIC_NOVELS = FACTION_EPIC_NOVELS;
if (typeof module !== 'undefined' && module.exports) module.exports = FACTION_EPIC_NOVELS;
`;

const targetPath = path.join(dataDir, 'faction-novels.js');
fs.writeFileSync(targetPath, output, 'utf8');
console.log('✓ Successfully updated data/faction-novels.js! File size:', fs.statSync(targetPath).size, 'bytes');
