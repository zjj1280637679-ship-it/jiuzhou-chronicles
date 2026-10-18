// assemble-all-novels-into-trees.js: 将分身小说家精心雕琢的 48 个 Act 2 & Act 3 剧本卡全量合流融入 1,456 节点大树
const fs = require('fs');
const path = require('path');

console.log("=============================================================================");
console.log("🔄 开始执行全四大阵营 48 个 Act 2 & Act 3 史诗剧本卡合流与大树重装工程");
console.log("=============================================================================\n");

const dataDir = path.join(__dirname, 'data');
const skillsDataPath = path.join(__dirname, 'skills-data.js');

// 直接 require skills-data.js
const WORLD_PRESETS = require('./skills-data.js');
const trees = WORLD_PRESETS.canonicalTrees;
const factions = ['qing', 'ming', 'mongol', 'nanming'];

// 清朝专属语义 ID 映射到数学坐标
const qingAct3Map = {
  'qing_act3_iron_slaughter': { trunk: 'a', sub: '1' },
  'qing_act3_iron_cannon': { trunk: 'a', sub: '2' },
  'qing_act3_iron_exhaustion': { trunk: 'a', sub: '3' },
  'qing_act3_civil_exam': { trunk: 'b', sub: '1' },
  'qing_act3_civil_mourn': { trunk: 'b', sub: '2' },
  'qing_act3_civil_backlash': { trunk: 'b', sub: '3' },
  'qing_act3_steppe_charge': { trunk: 'c', sub: '1' },
  'qing_act3_steppe_lama': { trunk: 'c', sub: '2' },
  'qing_act3_steppe_fracture': { trunk: 'c', sub: '3' }
};

let totalUpdatedNodes = 0;

factions.forEach(factionKey => {
  const tree = trees[factionKey];
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith(`${factionKey}-act`) && f.endsWith('.json'));
  console.log(`\n📦 正在合流阵营 [${factionKey}] ... 找到 ${files.length} 个深度分身剧本文件`);

  files.forEach(file => {
    const fullPath = path.join(dataDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(content);
    const nodeId = json.id;

    if (!tree.nodes[nodeId]) {
      console.warn(`⚠️ 节点 ${nodeId} 在大树中未找到！`);
      return;
    }

    const node = tree.nodes[nodeId];

    // 更新高精文学字段
    node.title = json.title;
    node.desc = json.desc;
    node.originalBeats = json.originalBeats || json.beats;
    node.beats = json.beats || json.originalBeats;
    if (json.coords) node.coords = json.coords;
    if (json.sutureHints) node.sutureHints = json.sutureHints;

    // 保留或更新 choices
    if (Array.isArray(json.choices) && json.choices.length > 0) {
      const openEndedChoice = node.choices ? node.choices.find(c => c.isOpenEndedInput) : null;
      
      const newChoices = json.choices.map((c, idx) => {
        let targetId = c.targetNodeId;

        // 验证 targetId 是否存在
        if (!targetId || !tree.nodes[targetId]) {
          // 若清朝语义映射存在
          if (qingAct3Map[nodeId]) {
            const m = qingAct3Map[nodeId];
            const candidate = `qing_act4_${m.trunk}${m.sub}_${idx + 1}`;
            if (tree.nodes[candidate]) targetId = candidate;
          } else if (node.actNumber === 3) {
            // 通用规则：尝试从 nodeId 解析 (如 ming_act3_a1)
            const match = nodeId.match(/act3_([abc])([123])/i);
            if (match) {
              const t = match[1].toLowerCase();
              const s = match[2];
              const candidate = `${factionKey}_act4_${t}${s}_${idx + 1}`;
              if (tree.nodes[candidate]) targetId = candidate;
            }
          }
        }

        // 如果依然没有，保留原 choices 的 targetNodeId
        if (!targetId && node.choices && node.choices[idx]) {
          targetId = node.choices[idx].targetNodeId;
        }

        return {
          text: c.text,
          tag: c.tag,
          bias: c.bias || { authority: 0, pragmatism: 0, progress: 0, cognition: 0 },
          diceBase: c.diceBase || 10,
          isExtrapolation: false,
          targetNodeId: targetId
        };
      });

      // 追加开放式外推选项
      if (openEndedChoice) {
        newChoices.push(openEndedChoice);
      } else {
        newChoices.push({
          text: "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
          tag: "自由行动 · AI接戏",
          bias: { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
          diceBase: 10,
          isExtrapolation: true,
          isOpenEndedInput: true,
          targetNodeId: null,
          convergenceTargetId: newChoices[0] ? newChoices[0].targetNodeId : null
        });
      }
      node.choices = newChoices;
    }

    totalUpdatedNodes++;
  });

  // 更新独立备份 JSON
  const backupPath = path.join(dataDir, `${factionKey}-363-tree.json`);
  fs.writeFileSync(backupPath, JSON.stringify(tree, null, 2), 'utf8');
  console.log(`✓ [${factionKey}] 独立备份写入成功: ${backupPath} (节点数: ${Object.keys(tree.nodes).length})`);
});

// 写回 skills-data.js
console.log(`\n💾 正在将全量更新写回 skills-data.js ...`);

const updatedContent = `// skills-data.js: 动态技能检定、宏观地缘时相、四大阵营剧情树与世界观设定
const _WORLD_PRESETS = ${JSON.stringify(WORLD_PRESETS, null, 2)};
if (typeof window !== 'undefined') window.WORLD_PRESETS = _WORLD_PRESETS;
if (typeof global !== 'undefined') global.WORLD_PRESETS = _WORLD_PRESETS;
if (typeof module !== 'undefined' && module.exports) module.exports = _WORLD_PRESETS;
`;

fs.writeFileSync(skillsDataPath, updatedContent, 'utf8');
console.log(`🎉 skills-data.js 更新成功！共计升级 ${totalUpdatedNodes} 个核心剧情节点为高密度文学白描！\n`);
