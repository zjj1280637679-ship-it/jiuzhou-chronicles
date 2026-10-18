const fs = require('fs');
const path = require('path');

const factions = [
  { id: 'qing', varName: 'QING_EPIC_NOVEL', mdFile: 'qing-epic-novel.md', jsFile: 'qing-epic-novel.js' },
  { id: 'ming', varName: 'MING_EPIC_NOVEL', mdFile: 'ming-epic-novel.md', jsFile: 'ming-epic-novel.js' },
  { id: 'mongol', varName: 'MONGOL_EPIC_NOVEL', mdFile: 'mongol-epic-novel.md', jsFile: 'mongol-epic-novel.js' },
  { id: 'nanming', varName: 'NANMING_EPIC_NOVEL', mdFile: 'nanming-epic-novel.md', jsFile: 'nanming-epic-novel.js' }
];

const bundleEntries = [];

factions.forEach(f => {
  const mdPath = path.join(__dirname, 'data', f.mdFile);
  const jsPath = path.join(__dirname, 'data', f.jsFile);
  
  if (!fs.existsSync(mdPath)) {
    console.error(`Missing markdown file: ${mdPath}`);
    return;
  }

  const content = fs.readFileSync(mdPath, 'utf8');
  console.log(`Loaded ${f.id}: ${content.length} characters`);

  // Individual js file
  const jsCode = `// ${f.jsFile}: ${f.id} 阵营长篇史诗历史小说大纲底本
const ${f.varName} = ${JSON.stringify(content)};

if (typeof window !== "undefined") {
  window.${f.varName} = ${f.varName};
  if (!window.WORLD_PRESETS) window.WORLD_PRESETS = {};
  window.WORLD_PRESETS["${f.id}EpicNovel"] = ${f.varName};
}

if (typeof module !== "undefined") {
  module.exports = ${f.varName};
}
`;
  fs.writeFileSync(jsPath, jsCode, 'utf8');
  console.log(`Wrote ${jsPath} (${fs.statSync(jsPath).size} bytes)`);

  bundleEntries.push(`  "${f.id}": ${JSON.stringify(content)}`);
});

// Unified bundle
const unifiedBundleCode = `// faction-novels.js: 聚合四大阵营全部长篇史诗历史大纲与背景圣经
const FACTION_EPIC_NOVELS = {
${bundleEntries.join(',\n')}
};

if (typeof window !== "undefined") {
  window.FACTION_EPIC_NOVELS = FACTION_EPIC_NOVELS;
  window.QING_EPIC_NOVEL = FACTION_EPIC_NOVELS.qing;
  window.MING_EPIC_NOVEL = FACTION_EPIC_NOVELS.ming;
  window.MONGOL_EPIC_NOVEL = FACTION_EPIC_NOVELS.mongol;
  window.NANMING_EPIC_NOVEL = FACTION_EPIC_NOVELS.nanming;
  if (!window.WORLD_PRESETS) window.WORLD_PRESETS = {};
  window.WORLD_PRESETS.qingEpicNovel = FACTION_EPIC_NOVELS.qing;
  window.WORLD_PRESETS.mingEpicNovel = FACTION_EPIC_NOVELS.ming;
  window.WORLD_PRESETS.mongolEpicNovel = FACTION_EPIC_NOVELS.mongol;
  window.WORLD_PRESETS.nanmingEpicNovel = FACTION_EPIC_NOVELS.nanming;
}

if (typeof module !== "undefined") {
  module.exports = FACTION_EPIC_NOVELS;
}
`;

const unifiedPath = path.join(__dirname, 'data', 'faction-novels.js');
fs.writeFileSync(unifiedPath, unifiedBundleCode, 'utf8');
console.log(`Successfully generated unified bundle: ${unifiedPath} (${fs.statSync(unifiedPath).size} bytes)`);
