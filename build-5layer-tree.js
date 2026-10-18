// build-5layer-tree.js: 构建四大阵营 5 幕金字塔剧情树 (1 -> 3 -> 9 -> 9 -> 9 = 31 节点/阵营，总计 124 节点)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'skills-data.js'), 'utf8');
vm.runInThisContext(src);

const originalTrees = WORLD_PRESETS.canonicalTrees;

// 检查现有结构
console.log("正在重构四大阵营 5 幕金字塔剧情树...");

// 辅助函数：根据原有的 4 幕结构生成 5 幕结构
function build5LayerFaction(factionId, rawTree, act4BattleDefs, act5EndingDefs) {
  const newNodes = {};
  
  // 1. Act 1: 保持 1 个根节点不变
  const act1Node = Object.values(rawTree.nodes).find(n => n.actNumber === 1);
  newNodes[act1Node.id] = JSON.parse(JSON.stringify(act1Node));

  // 2. Act 2: 保持 3 个支脉节点不变
  const act2Nodes = Object.values(rawTree.nodes).filter(n => n.actNumber === 2);
  act2Nodes.forEach(n => {
    newNodes[n.id] = JSON.parse(JSON.stringify(n));
  });

  // 3. Act 3: 9 个中局惊变节点 (原 Act 3 节点)
  const act3Nodes = Object.values(rawTree.nodes).filter(n => n.actNumber === 3);
  act3Nodes.forEach((n, idx) => {
    const nodeCopy = JSON.parse(JSON.stringify(n));
    nodeCopy.actNumber = 3;
    // 对应 Act 4 决战节点 ID
    const battleDef = act4BattleDefs[idx];
    nodeCopy.choices = [
      {
        text: `【决战前夕 · ${battleDef.title.split('：')[1] || battleDef.title}】调集主力决一死战！`,
        tag: battleDef.tag || "死生决胜 · 决战中原",
        bias: battleDef.bias || { authority: 3, pragmatism: 3, progress: 2, cognition: 2 },
        diceBase: 12,
        isExtrapolation: false,
        targetNodeId: battleDef.id
      },
      {
        text: `【🌿 局外外推】暗行奇策，脱离朝廷节制探寻江湖与边疆暗线`,
        tag: "脱序外推 · 自由衍生",
        bias: { authority: -2, pragmatism: 4, progress: 3, cognition: 4 },
        diceBase: 10,
        isExtrapolation: true,
        targetNodeId: null
      }
    ];
    newNodes[nodeCopy.id] = nodeCopy;
  });

  // 4. Act 4: 9 个死生决胜巅峰决战节点
  act4BattleDefs.forEach((bDef, idx) => {
    const endingDef = act5EndingDefs[idx];
    newNodes[bDef.id] = {
      id: bDef.id,
      actNumber: 4,
      title: bDef.title,
      trunk: bDef.trunk,
      trunkName: bDef.trunkName,
      coords: bDef.coords,
      desc: bDef.desc,
      originalBeats: bDef.beats,
      choices: [
        {
          text: `【天命归所 · 铸就历史】进入天命终局：${endingDef.title.split('：')[1] || endingDef.title}`,
          tag: endingDef.tag || "定鼎乾坤 · 终局结算",
          bias: endingDef.bias || { authority: 4, pragmatism: 4, progress: 3, cognition: 3 },
          diceBase: 13,
          isExtrapolation: false,
          targetNodeId: endingDef.id
        },
        {
          text: `【🌿 局外外推】决战狂澜之隙，派出密使奇兵迂回侧翼`,
          tag: "脱序外推 · 自由衍生",
          bias: { authority: 0, pragmatism: 5, progress: 2, cognition: 3 },
          diceBase: 11,
          isExtrapolation: true,
          targetNodeId: null
        }
      ]
    };
  });

  // 5. Act 5: 9 个天命归所独立终局
  act5EndingDefs.forEach(eDef => {
    newNodes[eDef.id] = {
      id: eDef.id,
      actNumber: 5,
      title: eDef.title,
      trunk: eDef.trunk,
      trunkName: eDef.trunkName,
      coords: eDef.coords,
      desc: eDef.desc,
      originalBeats: eDef.beats,
      choices: [
        {
          text: "【全书结 · 翻阅历史丰碑】回望九州沉浮，封存青史档案",
          tag: "历史结算 · 丰碑长存",
          bias: { authority: 0, pragmatism: 0, progress: 0, cognition: 5 },
          diceBase: 10,
          isExtrapolation: false,
          targetNodeId: null
        }
      ]
    };
  });

  return {
    name: rawTree.name,
    initialNodeId: rawTree.initialNodeId,
    nodes: newNodes
  };
}

console.log("构建函数就绪。");
