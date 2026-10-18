// build-qing-363-tree.js: 构建大清阵营 5 幕真分支 363 节点宏伟剧情树 (1 -> 3 -> 9 -> 27 -> 81 -> 243 终局)
global.window = global;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("=== 正在启动大清阵营 5 幕 243 终局真分支纯树状生成引擎 ===");

// 1. 读取 skills-data.js 基础骨架
const skillsDataPath = path.join(__dirname, 'skills-data.js');
const rawCode = fs.readFileSync(skillsDataPath, 'utf8');
vm.runInThisContext(rawCode);

const originalTrees = WORLD_PRESETS.canonicalTrees;
const existingQing = originalTrees.qing;

// 2. 加载已经写好的 Act 2 (3个) 与 Act 3 (9个) JSON 文件
const dataDir = path.join(__dirname, 'data');
const act2Files = ['qing-act2-a.json', 'qing-act2-b.json', 'qing-act2-c.json'];
const act3Files = [
  'qing-act3-a1.json', 'qing-act3-a2.json', 'qing-act3-a3.json',
  'qing-act3-b1.json', 'qing-act3-b2.json', 'qing-act3-b3.json',
  'qing-act3-c1.json', 'qing-act3-c2.json', 'qing-act3-c3.json'
];

const act2Data = act2Files.map(f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')));
const act3Data = act3Files.map(f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')));

console.log(`已成功载入 Act 2 (${act2Data.length} 节点) 与 Act 3 (${act3Data.length} 节点) 高密度文学底稿`);

// 构建所有节点容器
const allNodes = {};

// 1. 第一幕：保持原有盛京定策根节点 (1 节点)
const act1Node = Object.values(existingQing.nodes).find(n => n.actNumber === 1);
const act1Copy = JSON.parse(JSON.stringify(act1Node));
act1Copy.choices = [
  {
    text: "【支脉 A · 满洲铁血】赞同多尔衮之谋，八旗主力倾巢南下，以狂暴骑射摧毁九边防御！",
    tag: "铁血征伐 · 霸道犁庭",
    bias: { authority: 6, pragmatism: 4, progress: -2, cognition: 1 },
    diceBase: 11,
    isExtrapolation: false,
    targetNodeId: "qing_act2_iron"
  },
  {
    text: "【支脉 B · 汉化文治】采纳范文程之策，开科取士、礼遇降臣，以华夏正统受命于天！",
    tag: "王道受命 · 华夏定鼎",
    bias: { authority: 4, pragmatism: 5, progress: 5, cognition: 5 },
    diceBase: 10,
    isExtrapolation: false,
    targetNodeId: "qing_act2_civil"
  },
  {
    text: "【支脉 C · 草原盟约】结盟漠南蒙古察哈尔残部，祭长生天与尊奉达赖喇嘛，以神权合流南下！",
    tag: "神权合流 · 满蒙金顶",
    bias: { authority: 5, pragmatism: 3, progress: 2, cognition: 6 },
    diceBase: 10,
    isExtrapolation: false,
    targetNodeId: "qing_act2_steppe"
  },
  {
    text: "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
    tag: "自由行动 · AI接戏",
    bias: { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
    diceBase: 10,
    isExtrapolation: true,
    isOpenEndedInput: true,
    targetNodeId: null,
    convergenceTargetId: "qing_act2_iron"
  }
];
allNodes[act1Copy.id] = act1Copy;

// 2. 第二幕：3 个支脉节点 (指向对应的 Act 3 节点)
const act3IdMapping = {
  iron: ['qing_act3_iron_slaughter', 'qing_act3_iron_cannon', 'qing_act3_iron_exhaustion'],
  civil: ['qing_act3_civil_exam', 'qing_act3_civil_mourn', 'qing_act3_civil_backlash'],
  steppe: ['qing_act3_steppe_charge', 'qing_act3_steppe_lama', 'qing_act3_steppe_fracture']
};

act2Data.forEach((d, idx) => {
  const trunkKey = idx === 0 ? 'iron' : (idx === 1 ? 'civil' : 'steppe');
  const targets = act3IdMapping[trunkKey];
  d.choices = d.choices.filter(c => !c.isExtrapolation).slice(0, 3);
  d.choices.forEach((c, cIdx) => {
    c.targetNodeId = targets[cIdx];
    c.isExtrapolation = false;
  });
  d.choices.push({
    text: "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
    tag: "自由行动 · AI接戏",
    bias: { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
    diceBase: 10,
    isExtrapolation: true,
    isOpenEndedInput: true,
    targetNodeId: null,
    convergenceTargetId: targets[0]
  });
  allNodes[d.id] = d;
});

// 3. 第三幕：9 个节点 (指向 27 个独立的 Act 4 节点)
// 为 9 个 Act 3 节点构建 27 个独特的 Act 4 目标 ID
const act4Specs = [];

const act3Keys = [
  { id: 'qing_act3_iron_slaughter', prefix: 'a1', trunk: 'A', trunkName: '支脉 A · 满洲铁血', name: '血浸维扬' },
  { id: 'qing_act3_iron_cannon',    prefix: 'a2', trunk: 'A', trunkName: '支脉 A · 满洲铁血', name: '乌真超哈' },
  { id: 'qing_act3_iron_exhaustion',prefix: 'a3', trunk: 'A', trunkName: '支脉 A · 满洲铁血', name: '绝境围城' },
  { id: 'qing_act3_civil_exam',      prefix: 'b1', trunk: 'B', trunkName: '支脉 B · 汉化文治', name: '燕京定鼎' },
  { id: 'qing_act3_civil_mourn',     prefix: 'b2', trunk: 'B', trunkName: '支脉 B · 汉化文治', name: '缟素哭临' },
  { id: 'qing_act3_civil_backlash',  prefix: 'b3', trunk: 'B', trunkName: '支脉 B · 汉化文治', name: '惊弦反噬' },
  { id: 'qing_act3_steppe_charge',   prefix: 'c1', trunk: 'C', trunkName: '支脉 C · 草原盟约', name: '满蒙合流' },
  { id: 'qing_act3_steppe_lama',     prefix: 'c2', trunk: 'C', trunkName: '支脉 C · 草原盟约', name: '黄教封圣' },
  { id: 'qing_act3_steppe_fracture', prefix: 'c3', trunk: 'C', trunkName: '支脉 C · 草原盟约', name: '瀚海惊变' }
];

// Act 4 剧本原型库 (27 个独一无二的死生决战)
const act4Templates = {
  // A1: 扬州十日分支
  a1_1: {
    title: "第四幕A1-1：飞渡天堑 · 铁骑夜渡长江踏碎南明行在",
    desc: "十万八旗劲旅携江南降船自镇江夜袭渡江。长江天堑火光蔽月，多铎亲率白巴牙喇精骑直插金陵，南明君臣在风雨摇曳中仓皇出逃。",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "镇江要塞 · 焦山夜渡", type: "narrator", stageChar: "center", text: "暴风撕扯着水师帅旗，江潮如雷鸣般撞击着岩壁。八旗白巴牙喇重甲死士横刀立于船头，数百艘战舰踏浪破水，直扑长江南岸！" },
      { speaker: "豫亲王多铎", sub: "拔刀指江，杀气冲霄", type: "npc", stageChar: "left", text: "“江南文弱，南明昏愦！长江非朱家不可逾越之天堑！天命在八旗重矢，今夜饮马秦淮，踏平金陵阙！”" },
      { speaker: "降明降将", sub: "俯首听令，眼神阴鸷", type: "npc", stageChar: "right", text: "“王爷神机妙算！南都各门防务图已尽在末将手中，江防总兵皆愿开门迎王师，江南半壁尽归大清！”" },
      { speaker: "铁血直觉", sub: "【内在法统 · 铁骑犁庭】", type: "voice-iron", stageChar: "center", text: "“长江一破，南明立作釜底游魂。但江表士民士气虽散，私愤未消，是速战速决直捣金陵、是清野分兵围猎各州府，抑或抚降以定民心，决定江南百年命脉。”" }
    ],
    choiceTags: ["直扑金陵", "分兵屠剿", "受降安民"]
  },
  a1_2: {
    title: "第四幕A1-2：血战孤城 · 江阴八十日决死困兽斗",
    desc: "阎应元率十万江阴士民闭门死守，连斩清军三位贝勒统领。红衣大炮轰塌城垣，巷战白刃见红，江南最烈反抗爆发。",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "江阴县城 · 巷战废墟", type: "narrator", stageChar: "center", text: "烈火染红了澄江夜空。江阴城墙寸寸化为瓦砾，十万遗民手持竹枪农具与满洲重甲铁骑在狭窄街巷中殊死肉搏，血流漂橹。" },
      { speaker: "阎应元", sub: "披发浴血，仗剑立于残堞", type: "npc", stageChar: "left", text: "“八十日带发效忠，表太祖十七朝人物；十万人同心死义，留大明三百里江山！清贼安敢使我汉儿屈膝剃发！”" },
      { speaker: "贝勒博洛", sub: "督军怒吼，额角青筋暴起", type: "npc", stageChar: "right", text: "“弹丸小邑，竟敢抗我王师三月！传令全军：大炮齐发，破城之日寸草不留，令天下胆寒知我大清军威！”" },
      { speaker: "杀伐断决", sub: "【内在直觉 · 威权震慑】", type: "voice-iron", stageChar: "center", text: "“狂暴的反抗已经动摇了全军威名。是彻底焦土以震天下、是阵前招降解构人心，抑或回师围困孤立待毙？”" }
    ],
    choiceTags: ["焦土震慑", "阵前招抚", "绝水围困"]
  },
  a1_3: {
    title: "第四幕A1-3：裂土三藩 · 降将封王与南国军事自治",
    desc: "为荡平两广闽浙，多尔衮力排众议，封吴三桂为平西王、尚可喜为平南王、耿仲明为靖南王，引汉制汉拉开三藩大幕。",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "杭州行宫 · 册封大典", type: "narrator", stageChar: "center", text: "金殿之上，三副世袭罔替的亲王金册赫然陈列。吴三桂、尚可喜、耿仲明跪伏阶下，身后是二十万百战精锐关宁军。" },
      { speaker: "摄政王信使", sub: "高捧诏书，神色凛然", type: "npc", stageChar: "left", text: "“大清皇帝诏曰：三位将军深明大义，代朝廷征伐闽粤残逆。自今日起，裂土封王，钱粮军政一体便宜独断！”" },
      { speaker: "平西王吴三桂", sub: "蟒袍加身，目光鹰视狼顾", type: "npc", stageChar: "right", text: "“臣吴三桂叩谢皇恩！臣定提关宁铁骑踏破云贵残明行在，生擒永历献捷燕京，誓死屏藩大清！”" },
      { speaker: "权谋嗅觉", sub: "【内在机变 · 驭臣之道】", type: "voice-court", stageChar: "center", text: "“驱虎吞狼乃权宜之计，今日封王之日，便是来日三藩大患之始。是安插满洲都统暗中制约、是放权深剿待平定后再削藩，抑或联姻通好长治久安？”" }
    ],
    choiceTags: ["密布眼线", "极权裂土", "宗室联姻"]
  },

  // A2: 乌真超哈分支
  a2_1: {
    title: "第四幕A2-1：重炮摧关 · 乌真超哈轰裂中原九门要塞",
    desc: "三百门仿造西洋巨炮一字排开，重磅铅弹化作死神镰刀轰击中原第一关隘。火药风暴撕碎明军残部，近现代战争初啼。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "中原要隘 · 关前阵地", type: "narrator", stageChar: "center", text: "大地如雷暴般轰鸣颤抖。赤红的炮火连缀成火海，千斤生铁炮弹呼啸着撕碎城墙垛口，青砖巨石化作碎屑漫天飞舞。" },
      { speaker: "佟国纲", sub: "八旗汉军都统，黑甲染灰，拔剑怒喝", type: "npc", stageChar: "left", text: "“三十步校准！装填高爆开花弹！让关内的汉人瞧瞧，八旗乌真超哈的烈火神威，任何城防皆是土鸡瓦狗！”" },
      { speaker: "西洋铸炮师", sub: "神父装束，手持望远镜疾呼", type: "npc", stageChar: "right", text: "“大人！膛温过高，铜管已有微裂，若再连发恐有炸膛之虞！是否暂停半刻以待冷却？”" },
      { speaker: "钢铁意志", sub: "【内在算计 · 火力霸权】", type: "voice-iron", stageChar: "center", text: "“近代火器的威能彻底改写了战争法则。是继续不计代价连续覆盖击溃残敌、是徐图推进步炮协同，抑或转运火炮封锁中原粮道？”" }
    ],
    choiceTags: ["极致轰鸣", "步炮协同", "封锁粮道"]
  },
  a2_2: {
    title: "第四幕A2-2：战舰封江 · 铁索锁江截断运河二十万石漕运",
    desc: "八旗装甲水师联合投降红夷炮船横锁长江入海口与运河大闸。江南财富无法北输，崇祯与南明经济彻底窒息瘫痪。",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "江阴大闸 · 运河水道", type: "narrator", stageChar: "center", text: "数十根合抱粗的铁索横贯江面，重型排船与炮舰如水上长城死死堵住水道。上千艘漕运白粮船被困江中，进退维谷。" },
      { speaker: "水师都统", sub: "手按重剑立于旗舰甲板", type: "npc", stageChar: "left", text: "“传令各舰：封锁江面，一颗米、一匹布也不得运往南都！江南商帮若敢抗命，连船带货立予击沉！”" },
      { speaker: "江南漕商代表", sub: "乘小艇乞降，颤抖捧上期票", type: "npc", stageChar: "right", text: "“军门息怒！两淮盐商与徽帮愿纳饷银三百万两，求军门开闸放粮，救两浙百万百姓一命！”" },
      { speaker: "经世机辨", sub: "【内在利益 · 经济咽喉】", type: "voice-court", stageChar: "center", text: "“卡死经济便等于夺取天下半壁。是纳银分肥换取商帮归心、是尽数没收充实八旗军饷，抑或设立税关长久征敛？”" }
    ],
    choiceTags: ["纳银通关", "尽数籍没", "设关永征"]
  },
  a2_3: {
    title: "第四幕A2-3：军械惊变 · 汤若望火药大营反扑与洋匠夺铳",
    desc: "西洋传教士与降清明工匠因待遇与信仰爆发血腥内讧，前明死士夜袭火药局，千箱火药危在旦夕，火器大军面临瘫痪危机。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "北京城外 · 乌真超哈火药总厂", type: "narrator", stageChar: "center", text: "暴雨黑夜，暗器破空。数十名潜伏的前明神机营死士点燃信香突袭火药库，守库旗兵与西洋工匠乱作一团，火把将黑夜照如白昼。" },
      { speaker: "汤若望", sub: "钦天监监正，急促胸画十字", type: "npc", stageChar: "left", text: "“主啊！绝不能引爆库房！那里存放着三十万磅西洋提纯定装火药，一旦殉爆，半座京城都将化为火海！”" },
      { speaker: "前明死士首领", sub: "身缠火药引线，狂笑扑向引信", type: "npc", stageChar: "right", text: "“满狗汉奸，安敢借夷人邪术毁我大明社稷！今日我等与这十万斤火药同归于尽，断尔等入关逆谋！”" },
      { speaker: "惊雷抉择", sub: "【内在机敏 · 绝地排险】", type: "voice-iron", stageChar: "center", text: "“火药厂是大清横扫天下的底牌。是亲自引死士围堵斩尽杀绝、是引水灌库舍弃火药保全大局，抑或逼迫西洋匠人反制夺回控制权？”" }
    ],
    choiceTags: ["雷霆斩杀", "引水灭火", "洋匠反制"]
  },

  // A3: 绝境围城分支
  a3_1: {
    title: "第四幕A3-1：雪夜誓师 · 赫图阿拉白山黑水十三甲再起",
    desc: "顿兵山海关下遭遇断粮，八旗撤回白山故地。多尔衮与诸王于太祖努尔哈赤遗陵前拔刀割臂起誓，唤醒女真最狂暴野性。",
    coords: "qing:mukden",
    beats: [
      { speaker: "旁白", sub: "赫图阿拉 · 太祖汗陵风雪深山", type: "narrator", stageChar: "center", text: "零下三十度严寒，朔风咆哮如野兽。八旗将士满面霜雪，簇拥在十三副黑色铁甲周围。战败的耻辱化作胸中汹涌的烈火。" },
      { speaker: "多尔衮", sub: "割臂歃血，仰天狂吼", type: "npc", stageChar: "left", text: "“八旗儿郎！太祖当年仅凭十三副遗甲便克定辽东！今日虽顿兵一时，但白山黑水仍在！喝下烈酒，随我再出林海，杀穿山海关！”" },
      { speaker: "老索伦猎户首领", sub: "披熊皮，手握骨矛厉喝", type: "npc", stageChar: "right", text: "“黑龙江野人女真三千射手愿遵大汗号令！我们能徒手搏杀棕熊，中原明军不过是羊圈里的肥羊，随大汗南下取马粮！”" },
      { speaker: "狂野野性", sub: "【内在图腾 · 白山狼道】", type: "voice-steppe", stageChar: "center", text: "“退守关外并非末路，而是养精蓄锐的蛰伏。是征召极北野人部落组建死士大军、是改组骑射为重甲步战，抑或利用极寒诱明军出关决战？”" }
    ],
    choiceTags: ["征召索伦", "重步死阵", "诱敌出关"]
  },
  a3_2: {
    title: "第四幕A3-2：松锦设伏 · 关东平原诱敌深入大合围",
    desc: "吴三桂与洪承畴率明军主力冒雪追击出关。后金假意溃退诱敌进入松山冰谷，十面埋伏绝杀之网骤然收紧。",
    coords: "qing:mukden",
    beats: [
      { speaker: "旁白", sub: "锦州城南 · 松山绝壁雪谷", type: "narrator", stageChar: "center", text: "漫天鹅毛大雪覆盖了战马蹄印。明军追兵号角声由远及近，以为大清全军败亡，不知两侧雪峰密林间早已埋伏了十万待发重矢。" },
      { speaker: "阿济格", sub: "按伏马颈，冷笑森然", type: "npc", stageChar: "left", text: "“鱼儿咬钩了！明军贪功冒进，后勤粮道已拉长两百里！传令四面角号齐鸣，落石封谷，将明军精锐全歼在雪谷之中！”" },
      { speaker: "关宁前锋统领", sub: "勒马四顾，惊恐变色", type: "npc", stageChar: "right", text: "“中计了！左右两侧皆是鞑子旌旗！后路被巨木滚石截断！快突围！快向总兵大人求援！”" },
      { speaker: "绝杀直觉", sub: "【内在兵机 · 十面埋伏】", type: "voice-iron", stageChar: "center", text: "“伏击战是扭转乾坤的绝命胜负手。是全军压上尽灭明军主力、是围三阙一伏击其援军，抑或生擒敌将逼降其残部？”" }
    ],
    choiceTags: ["尽歼主力", "围三阙一", "生擒诱降"]
  },
  a3_3: {
    title: "第四幕A3-3：破釜沉舟 · 杀马饮血夜袭山海关一片石",
    desc: "军粮断绝最后一刻，八旗将士尽杀战马，将所有火药与粮食捆于背上，在暴风雪之夜对山海关发动了不归路的夜袭狂潮。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "山海关 · 一片石隘口暴雪夜", type: "narrator", stageChar: "center", text: "天昏地暗，风雪呼啸。八旗勇士无一人出声，马革裹足踏雪无声。战马皆已倒伏在雪原中，战士们紧握短刀铁骨朵，向长城投下孤注一掷的死影。" },
      { speaker: "鳌拜", sub: "白巴牙喇第一勇士，身中三矢拔出怒吼", type: "npc", stageChar: "left", text: "“马已杀尽，粮已吃光！生路在关内，死路在关外！满洲巴图鲁，跟我爬上城堞，夺下关门！”" },
      { speaker: "守关明军哨长", sub: "刚撕开火折子，喉间已中短箭", type: "npc", stageChar: "right", text: "“敌袭……敌袭！鞑子徒步爬上垛口了！快点烽火……呃啊！”" },
      { speaker: "背水狂潮", sub: "【内在绝死 · 破釜沉舟】", type: "voice-iron", stageChar: "center", text: "“绝境之下的死斗爆发出了毁灭一切的力量。是直取关楼门闸放火为号、是占领箭楼以重弓压制关内，抑或刺杀守关总兵群龙无首？”" }
    ],
    choiceTags: ["直夺闸盘", "占领箭楼", "斩首敌将"]
  },

  // B1: 燕京定鼎分支
  b1_1: {
    title: "第四幕B1-1：金銮受禅 · 皇极殿满汉双轨制帝国诞生",
    desc: "顺治帝御太和殿，首开满汉并列六部双尚书、科举分榜定额之制。盛京旧俗与华夏官僚制在此完成旷古未有的制度合流。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "紫禁城 · 皇极殿大朝会", type: "narrator", stageChar: "center", text: "香炉烟云缭绕，丹墀阶下千官拜伏。身披黄袍的年轻天子正襟危坐，左班满洲八旗勋贵，右班汉臣士大夫文官，首度同殿称臣。" },
      { speaker: "范文程", sub: "内三院大学士，手捧《大统历典》高呼", type: "npc", stageChar: "left", text: "“臣等奏请：凡六部都察院，皆设满汉双尚书、满汉双侍郎！政务共参，文簿互押！使满汉一体，万世基业固若金汤！”" },
      { speaker: "索尼", sub: "正黄旗都统，冷眼扫视群臣", type: "npc", stageChar: "right", text: "“汉官制度虽善，但八旗乃国家根本！若汉官揽权欺罔幼主，老臣手中太祖所赐宝刀，定不轻饶！”" },
      { speaker: "天下定盘", sub: "【内在正统 · 华夷一家】", type: "voice-court", stageChar: "center", text: "“双轨体制虽平衡了满汉两极，但也埋下了冗官与内耗的祸根。是进一步推进彻底汉化、是巩固满洲特权防范反噬，抑或建立御前会议集中皇权？”" }
    ],
    choiceTags: ["彻底汉化", "强化旗权", "御前极权"]
  },
  b1_2: {
    title: "第四幕B1-2：文衡重塑 · 顺天乡试南北卷与江南文心收抚",
    desc: "为瓦解东林党与江南复社的文坛垄断，朝廷力排众议确立南北分卷取士，破格拔擢北方与关东寒门举子，天下士林大震。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "北京 · 顺天贡院至公堂", type: "narrator", stageChar: "center", text: "锁院数十日，朱墨灿然。万卷江南名士策论与北方寒士答卷并列案头，主考官手执朱笔悬而未落，这一笔定下的是天下士大夫的脊梁。" },
      { speaker: "主考汉臣大学士", sub: "躬身向摄政王密陈", type: "npc", stageChar: "left", text: "“王爷，江南文风甲天下，若全凭文章，北士恐十无一二得中！仿前朝南北卷之法，定额分榜，方能抚定天下士心！”" },
      { speaker: "东林遗宿", sub: "阶下长叹，眼神复杂", type: "npc", stageChar: "right", text: "“新朝开科，名义为网罗遗贤，实为折服天下名节。江南士子若赴清廷科举，大明道统由谁守？若不赴考，阖家生计何以托？”" },
      { speaker: "文脉嗅觉", sub: "【内在机变 · 思想羁縻】", type: "voice-benevolence", stageChar: "center", text: "“科举是控制天下士子最好的缰绳。是严格南北分榜招抚北方寒庶、是对江南名士网开一面破格加录，抑或以程朱理学立为考据钦定国策？”" }
    ],
    choiceTags: ["均分南北", "优抚江南", "程朱考据"]
  },
  b1_3: {
    title: "第四幕B1-3：深文周纳 · 庄氏明史案与江表文网大清查",
    desc: "湖州庄氏私修《明史》讥讪新朝案发，江南名士数百人被捕入狱。是借题发挥兴文字狱震慑文坛，还是宽大为怀收揽人心？",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "杭州府衙 · 诏狱大堂", type: "narrator", stageChar: "center", text: "案卷堆积如山，朱笔勾决处尽是血光。七十余位江南鸿儒被刑枷锁拿，堂下供桌上赫然翻开着被指为谋逆悖谬的《明史辑略》。" },
      { speaker: "鳌拜", sub: "议政大臣，厉声斥责", type: "npc", stageChar: "left", text: "“这帮江南酸儒，口含天宪吃我大清俸禄，笔下却仍尊明帝为正朔，视我八旗为犬戎！若不严加惩办灭其九族，天下谁敬天子威仪！”" },
      { speaker: "被囚硕儒", sub: "须发皆白，宁死不跪", type: "npc", stageChar: "right", text: "“古今治乱，自有公论！直笔存史，虽诛九族亦不可夺志！尔等能绝万千文人之喉，能绝青史万代之公议乎？！”" },
      { speaker: "权衡算计", sub: "【内在法统 · 思想禁锢】", type: "voice-court", stageChar: "center", text: "“文人笔墨乃最难测的暗流。是兴大狱一网打尽江南反骨、是首恶必办余者宽宥免激民变，抑或官修大清正史化解恩怨？”" }
    ],
    choiceTags: ["从严株连", "宽宥羁縻", "官修国史"]
  },

  // B2: 缟素哭临分支
  b2_1: {
    title: "第四幕B2-1：孝陵三跪 · 顺治南巡亲奠朱元璋奠定法统",
    desc: "天子轻车简从南抵金陵，不顾八旗勋贵非议，率满汉百官亲赴明孝陵行三跪九叩大礼，题写‘治隆唐宋’碑，江南民心彻底归宗。",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "南京钟山 · 明孝陵享殿前", type: "narrator", stageChar: "center", text: "细雨微濛，紫金山下松柏凝翠。年轻的大清皇帝脱去天子衮服，素衣步行十里至明太祖陵寝前，当着十万金陵遗民的面，恭肃下跪！" },
      { speaker: "顺治帝", sub: "眼含热泪，亲宣御制祭文", type: "npc", stageChar: "left", text: "“太祖开国之圣，治隆唐宋！大清奉天入关，乃为烈皇复仇除暴！承大统于危乱，保赤子于狂澜！朕今日敬拜先帝，必体念苍生安危！”" },
      { speaker: "金陵父老", sub: "万众感泣，伏地叩首", type: "npc", stageChar: "right", text: "“新皇竟以天子之尊祭拜前朝太祖……仁义至此，大明社稷虽亡，但华夏衣冠不绝也！万岁，万万岁！”" },
      { speaker: "大义昭彰", sub: "【内在良知 · 王道盛世】", type: "voice-benevolence", stageChar: "center", text: "“政治的最高境界是诛心而非杀戮。是借祭陵彻底收归东南民心、是趁势颁布均田免粮宽政，抑或以太祖后裔加封延圣公确立新统？”" }
    ],
    choiceTags: ["盛世宽政", "礼封前明", "整饬军纪"]
  },
  b2_2: {
    title: "第四幕B2-2：潼关总决 · 奉天讨逆旗号歼灭李自成大顺主力",
    desc: "打出‘代明复仇’正义大旗，后金大军与陕甘明军旧将合流，在天险潼关与大顺百万军团展开神州命运大决战。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "潼关天堑 · 黄河岸边旷野", type: "narrator", stageChar: "center", text: "黄河咆哮，关隘如天墉屏障。阿济格与多铎统领的十万八旗与关宁联军，高举‘为崇祯先帝复仇’白幡，与大顺主力百万战骑在黄土高原上撞击出震天血花！" },
      { speaker: "大顺闯王部将", sub: "满面烟尘，舞刀厉喝", type: "npc", stageChar: "left", text: "“杀鞑子！夺潼关！这大明江山本就是我们闯王打下的，关外胡骑休想坐收渔翁之利！”" },
      { speaker: "吴三桂", sub: "白盔白甲，箭无虚发", type: "npc", stageChar: "right", text: "“逆贼弑君夺京，天地不容！今日关宁铁骑奉大清正朔，誓为烈皇雪恨！全军冲锋，踏碎闯逆阵脚！”" },
      { speaker: "乾坤决算", sub: "【内在兵机 · 大义伐罪】", type: "voice-iron", stageChar: "center", text: "“决战潼关是消灭大顺最后的战役。是正面强攻突破潼关天堑、是迂回陕北断其退路生擒闯王，抑或招抚大顺残部为己所用？”" }
    ],
    choiceTags: ["铁骑强攻", "迂回断后", "招降残逆"]
  },
  b2_3: {
    title: "第四幕B2-3：金陵伪储 · 南明弘光正统之辩与秦淮惊变",
    desc: "南都迎立福王称弘光，伪太子与假皇子案引发天下哗然。清廷派出重臣携带先帝遗物赴金陵文辩，不战而屈人之兵解构南明法统。",
    coords: "jiangnan:mid",
    beats: [
      { speaker: "旁白", sub: "南京城外 · 雨花台使节大营", type: "narrator", stageChar: "center", text: "两军壁垒森严，刀枪如雪。朝廷使节携带崇祯帝亲笔血书与玉玺拓本出示阵前，南都诸臣在法统真伪面前阵脚大乱，文武百官面面相觑。" },
      { speaker: "洪承畴", sub: "招抚大员，三寸不烂之舌声震长空", type: "npc", stageChar: "left", text: "“诸位皆大明柱石，何苦拥立昏聩福王偏安江南！先帝血诏犹在，大清皇帝抚育太子优待宗室，代明复仇！谁为华夏正统，天地共鉴！”" },
      { speaker: "史可法", sub: "督师按剑，神色悲怆", type: "npc", stageChar: "right", text: "“大义当前，岂可言降！纵弘光皇帝庸懦，亦是大明宗亲！我史可法头可断，法统不可乱！”" },
      { speaker: "诛心算计", sub: "【内在机变 · 攻心为上】", type: "voice-court", stageChar: "center", text: "“攻心往往胜过百万之师。是借伪储案彻底离间南明君臣、是暗通南都武将反戈逼宫，抑或大军压境以武促和？”" }
    ],
    choiceTags: ["离间攻心", "策反降将", "兵临城下"]
  },

  // B3: 惊弦反噬分支
  b3_1: {
    title: "第四幕B3-1：雷霆乾纲 · 皇极殿廷杖圈禁八旗守旧宗室",
    desc: "为推行均田满汉平权，顺治与范文程联手，在皇极殿御前强硬逮捕谋反的宗室亲王，以大清律严惩八旗特权，奠定皇权至上基石。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "紫禁城 · 乾清门御前听政", type: "narrator", stageChar: "center", text: "御林侍卫按刀肃立，殿内杀气弥漫。三位正白旗固山贝子身被重枷，宗人府文卷掷满金阶，顺治帝面色森冷如冰。" },
      { speaker: "顺治帝", sub: "猛击御案，声震梁栋", type: "npc", stageChar: "left", text: "“圈占民田、杀戮无辜、密谋逼宫！你们真当大清是八王议政的部落汗廷吗？！自今日起，大清唯有天子至尊，再无凌驾国法之旗王！”" },
      { speaker: "守旧亲贵", sub: "挣扎怒吼，须发倒竖", type: "npc", stageChar: "right", text: "“忘本之君！当年没有我们八旗刀枪，你如何坐得上这金銮宝殿！你重用汉奴削夺同族，太祖太宗在天之灵绝不容你！”" },
      { speaker: "集权直觉", sub: "【内在法统 · 铁腕皇权】", type: "voice-court", stageChar: "center", text: "“打破部落贵族体制是走向中央集权的必由之路。是彻底剥夺宗室兵权收归禁旅、是斩首首恶宽宥旁支，抑或建立宗室议政院妥协分权？”" }
    ],
    choiceTags: ["尽收兵权", "诛除首恶", "有限妥协"]
  },
  b3_2: {
    title: "第四幕B3-2：退田安民 · 废止跑马圈地归还江南畿辅流民",
    desc: "一道《禁圈田令》震动天下，强令八旗将士归还强占的畿辅数百万亩民田，招抚流民垦荒，北方荒原重现袅袅炊烟。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "直隶大城县 · 官道麦田之畔", type: "narrator", stageChar: "center", text: "新插的界桩被户部差役一一拔除，数万破衣烂衫的流民跪倒在刚刚收回的麦田边涕泣欢呼。八旗圈地旗丁按刀怒视，却不敢抗旨。" },
      { speaker: "户部巡抚钦差", sub: "高悬尚方宝剑，向万民宣谕", type: "npc", stageChar: "left", text: "“朝廷明谕：凡圈占民田尽数退还原主！三年不征租赋，官给耕牛种籽！若有再敢跑马射箭圈地者，以谋逆论斩！”" },
      { speaker: "畿辅老农", sub: "手捧泥土，泪流满面", type: "npc", stageChar: "right", text: "“祖坟保住了……我们的地终于回来了！新皇帝给咱们穷人做主了！青天大老爷，大清是好朝廷啊！”" },
      { speaker: "生民民本", sub: "【内在良知 · 苍生社稷】", type: "voice-benevolence", stageChar: "center", text: "“得民心者得天下。但退田触动了数十万八旗旗丁的生计。是给八旗旗丁发放铁杆庄稼俸银、是将八旗调往边疆屯田，抑或允许旗人经商谋生？”" }
    ],
    choiceTags: ["永定旗饷", "移驻边塞", "准其经商"]
  },
  b3_3: {
    title: "第四幕B3-3：绿营定畿 · 引汉军三营驻守京畿弹压宗室内乱",
    desc: "在八旗内讧濒临兵变边缘，朝廷破格调吴六奇与孔有德绿营精锐进驻德胜门与安定门，以汉军火枪兵屏卫皇城，化解兵变危局。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "北京城北 · 德胜门箭楼夜巡", type: "narrator", stageChar: "center", text: "雪夜更鼓敲过四更，五千名手持神机三眼铳的绿营精锐悄无声息进驻内城各门。城中蠢蠢欲动的谋反旗主骤然发现去路已绝。" },
      { speaker: "绿营提督", sub: "按刀登楼，甲叶铮鸣", type: "npc", stageChar: "left", text: "“奉密旨护卫九门！不论满汉亲贵，凡无勘合调兵出营者，神机铳齐射，立格杀勿论！”" },
      { speaker: "满洲内大臣", sub: "策马而止，面如土色", type: "npc", stageChar: "right", text: "“大胆绿营奴才，竟敢在天子脚下阻拦我正黄旗兵马！你们……你们想造反不成？！”" },
      { speaker: "平衡算计", sub: "【内在兵机 · 以汉制满】", type: "voice-iron", stageChar: "center", text: "“借汉军兵权弹压满洲宿将是一剂猛药，稍有不慎便会两面失控。是彻底整编绿营为近卫禁军、是兵权分散使两派相互牵制，抑或趁机削弱双方集中于皇帝？”" }
    ],
    choiceTags: ["整编近卫", "两派制衡", "皇帝亲统"]
  },

  // C1: 满蒙合流分支
  c1_1: {
    title: "第四幕C1-1：大漠铁流 · 三十万满蒙铁骑踏冰横渡黄河",
    desc: "长冬极寒，黄河封冻。满蒙联军三十万重甲骑兵以迅雷不及掩耳之势踏冰飞渡，席卷中原豫鲁腹地，明军与大顺军闻风披靡。",
    coords: "mongol:steppe",
    beats: [
      { speaker: "旁白", sub: "黄河风陵渡 · 冰封河面万马奔腾", type: "narrator", stageChar: "center", text: "厚达三尺的黄河坚冰在无数沉重马蹄践踏下发出雷鸣般的闷响。三十万满蒙大军铺天盖地，宛如黑色的潮水将两岸古老城池瞬间吞没。" },
      { speaker: "科尔沁奥巴台吉", sub: "手舞弯刀，战马狂嘶", type: "npc", stageChar: "left", text: "“苍狼白鹿的子孙！长生天将神州膏腴之地赐予我们！踏平黄河，南下中原！谁先冲进洛阳开封，金帛女子任尔取用！”" },
      { speaker: "多尔衮", sub: "勒马河心，目光阴冷", type: "npc", stageChar: "right", text: "“蒙古骑兵勇猛，但若任由其劫掠，我们便永远无法入主中原！传令八旗督战队：凡擅离战阵入村劫杀者，以狼筅乱箭攒射！”" },
      { speaker: "天命博弈", sub: "【内在图腾 · 游牧扩张】", type: "voice-steppe", stageChar: "center", text: "“三十万铁骑是席卷天下的利器，也是失控的狂飙。是纵容狼道狂潮摧毁一切抵抗、是严行军法以王者之师入驻中原，抑或分兵直扑南京彻底打碎偏安？”" }
    ],
    choiceTags: ["纵马掠野", "严肃军纪", "飞扑南都"]
  },
  c1_2: {
    title: "第四幕C1-2：定塞划疆 · 承德长城内外游牧军事封邑确立",
    desc: "为长期笼络蒙古王公，多尔衮于燕山长城要隘建立四十九旗世袭领地，允许其直接分润关税岁布，长城由防御屏障转为帝国枢纽。",
    coords: "mongol:steppe",
    beats: [
      { speaker: "旁白", sub: "古北口要隘 · 长城关楼", type: "narrator", stageChar: "center", text: "古老的长城砖墙上同时插上了八旗龙旗与九游白纛。蒙古各部王公手捧诏书在关前宰牛杀马歃血，长城内外自秦汉以来首次化为一家。" },
      { speaker: "土谢图汗", sub: "手抚长城垛口，放声大笑", type: "npc", stageChar: "left", text: "“三百年了，汉人的长城从来只防备我们。今日大清皇帝把这道雄关交到我们手里，草原儿郎从此也是神州的主人！”" },
      { speaker: "内三院儒臣", sub: "手持界图，面色凝重", type: "npc", stageChar: "right", text: "“王爷，自古塞外游牧长驱直入无不酿成边患。今日大肆封赏蒙古领地，来日若其势大，岂非又出一个元朝？”" },
      { speaker: "边疆权衡", sub: "【内在机变 · 塞外治理】", type: "voice-court", stageChar: "center", text: "“边疆定则帝国安。是建立长城联防驻军常态化、是深化互市经济捆绑利益，抑或设立理藩院全面掌控人事？”" }
    ],
    choiceTags: ["长城联防", "深绑互市", "理藩集权"]
  },
  c1_3: {
    title: "第四幕C1-3：幽燕劫火 · 游牧掠夺激起北方坞堡人民战争",
    desc: "部分蒙古旗主违抗军令洗劫直隶村寨，激起河北山东百万乡民筑堡自卫，地道伏击连斩清军将校，大军陷入泥潭危机。",
    coords: "beijing:high",
    beats: [
      { speaker: "旁白", sub: "河北任丘 · 坞堡农田废墟", type: "narrator", stageChar: "center", text: "村庄化作焦炭，哭声震天。然而四周高耸的青砖坞堡上箭矢如雨，地下暗道纵横交错，愤怒的北方乡民手持红缨枪与抬枪，将失控的掠夺骑兵层层围困。" },
      { speaker: "河北义兵首领", sub: "身背大刀，血红双目", type: "npc", stageChar: "left", text: "“鞑子烧我房屋、掠我妻女！父老乡亲们，退一步是死，拼到底也是死！人在堡在，叫这群塞外野狼有来无回！”" },
      { speaker: "违令蒙古旗主", sub: "马中多箭，狼狈求援", type: "npc", stageChar: "right", text: "“救命！这帮汉人平民钻地道、放毒烟，根本找不到他们主力！我们折损了上千骑兵了！”" },
      { speaker: "止损弹压", sub: "【内在直觉 · 抚叛止暴】", type: "voice-iron", stageChar: "center", text: "“失去民心的征伐最终必被怒海吞没。是立即立斩犯令旗主向乡民谢罪、是调集红衣大炮彻底拔除所有坞堡，抑或派出使节招降自治？”" }
    ],
    choiceTags: ["严斩乱将", "大炮拔堡", "招降自治"]
  },

  // C2: 黄教封圣分支
  c2_1: {
    title: "第四幕C2-1：外八庙敕 · 避暑山庄迎奉班禅达赖受封圣王",
    desc: "热河草原拔地而起巍峨金顶寺院，五世达赖法使奉上“文殊大皇帝”金册，清帝兼任藏蒙最高世俗与神权保护者，北疆神权定于一尊。",
    coords: "mongol:steppe",
    beats: [
      { speaker: "旁白", sub: "热河 · 普陀宗乘之庙金顶法台", type: "narrator", stageChar: "center", text: "铜钟法螺齐鸣，紫烟漫卷坛城。藏传佛教各大活佛、蒙古四十九旗札萨克齐聚金阶，将象征转轮圣王的千辐金轮高高献给大清皇帝。" },
      { speaker: "五世达赖法使", sub: "手持金刚杵，合十长诵", type: "npc", stageChar: "left", text: "“嗡嘛呢叭咪吽！长生天下，文殊菩萨化身至尊大皇帝陛下！统御雪域高原与浩瀚瀚海，万佛庇佑，国祚万年永无疆！”" },
      { speaker: "大清皇帝", sub: "身披黄呢法袍，手受金轮", type: "npc", stageChar: "right", text: "“佛法广大，善抚塞外！大清永奉黄教为国教护法，敕封喇嘛俸银世袭罔替！蒙藏儿郎，皆朕之赤子骨肉！”" },
      { speaker: "神权加冕", sub: "【内在图腾 · 文殊圣王】", type: "voice-steppe", stageChar: "center", text: "“神权是征服塞外最柔软也是最坚固的锁链。是借神权征发蒙藏十万僧兵入关参战、是以佛法度化游牧消解其尚武反叛基因，抑或确立金瓶掣签掌控大活佛转世？”" }
    ],
    choiceTags: ["征发僧兵", "佛法度化", "金瓶掣签"]
  },
  c2_2: {
    title: "第四幕C2-2：寺庙网络 · 以庙控塞四十九旗喇嘛驻防体系建立",
    desc: "大清在漠南、青海、康藏各要道兴修上千座巨型黄教寺院，一旗一庙，以僧官兼理旗政，昔日茹毛饮血的游牧铁骑尽化为念经僧民。",
    coords: "mongol:steppe",
    beats: [
      { speaker: "旁白", sub: "归化城 · 大召寺经堂前", type: "narrator", stageChar: "center", text: "转经筒转动声昼夜不息。昔日策马弯弓的蒙古青年纷纷披上红色袈裟剃发出家，整座塞外草原在佛乐香火中渐渐安静下来。" },
      { speaker: "理藩院侍郎", sub: "展阅户籍册，面露喜色", type: "npc", stageChar: "left", text: "“皇上神机！一家生三子，二子必出家为僧！不出三十年，草原控弦之士将减半，再无游牧南下叩关之虞！一座庙宇胜十万大军啊！”" },
      { speaker: "蒙古老札萨克", sub: "独坐马背，垂泪叹息", type: "npc", stageChar: "right", text: "“苏勒德神矛生锈了，战马都换成了酥油灯。大清皇帝用佛经夺走了草原儿郎的弯刀，我们再也回不去成吉思汗的荣光了……”" },
      { speaker: "文明规训", sub: "【内在算计 · 移风易俗】", type: "voice-court", stageChar: "center", text: "“消弭边患的最高境界是不战而屈其战意。是彻底推行崇释削兵国策、是保留部分精锐世袭骑兵以备入关勤王，抑或允许汉民出塞开荒与蒙民共融？”" }
    ],
    choiceTags: ["彻底削兵", "保留精骑", "蒙汉共融"]
  },
  c2_3: {
    title: "第四幕C2-3：萨满之血 · 盛京清宁宫老萨满与黄教法师喋血",
    desc: "满洲满族老贵族不甘见萨满教被藏传佛教取代，于盛京皇宫祭祖夜刺杀大喇嘛法使，满洲传统派与蒙藏佛教派爆发信仰血战。",
    coords: "qing:mukden",
    beats: [
      { speaker: "旁白", sub: "盛京皇宫 · 清宁宫萨满祭神殿", type: "narrator", stageChar: "center", text: "神鸦盘旋，神鼓咚咚。火盆中跳跃着血色烈焰，满洲巫师头戴鹿角面具挥舞腰铃，与手持金刚杵的藏僧法卫在宗庙神案前拔刀相向！" },
      { speaker: "满洲老萨满祭司", sub: "手举骨刀，厉声诅咒", type: "npc", stageChar: "left", text: "“背弃白山黑水神鸦祖灵的人必遭天谴！八旗是萨满的神鹰，安能跪拜西天喇嘛！诛杀妖僧，还我大清满洲根本！”" },
      { speaker: "哲布尊丹巴法使", sub: "跌坐血泊，法杖顿地", type: "npc", stageChar: "right", text: "“佛门广大，降伏外道！若无黄教神权，大清如何驾驭蒙藏千百部落！尔等鼠目寸光，欲断大清帝国命脉！”" },
      { speaker: "信仰决断", sub: "【内在图腾 · 精神撕裂】", type: "voice-steppe", stageChar: "center", text: "“传统信仰与帝国霸业发生了最剧烈的碰撞。是铁腕血洗萨满顽固彻底推行黄教、是折中调和将萨满祭仪纳入皇家内廷秘祭，抑或尊重各部信仰满萨蒙佛？”" }
    ],
    choiceTags: ["血洗萨满", "宫廷合流", "分流并立"]
  },

  // C3: 瀚海惊变分支
  c3_1: {
    title: "第四幕C3-1：编旗定界 · 斩杀违令首领确立扎萨克行省铁律",
    desc: "为防止塞外尾大不掉，朝廷强行废除察哈尔与科尔沁世袭大汗位，按八旗编制设立扎萨克旗，以铁腕法度终结游牧游移旧习。",
    coords: "mongol:steppe",
    beats: [
      { speaker: "旁白", sub: "锡林郭勒草原 · 诸部会盟法场", type: "narrator", stageChar: "center", text: "风卷枯草，三把镔铁断头刀矗立台前。两位擅自引兵越界抢夺草场的蒙古王公被当场斩首示众，四十九旗札萨克战栗跪拜在界石前。" },
      { speaker: "理藩院尚书", sub: "手持天子金符，冷眼传旨", type: "npc", stageChar: "left", text: "“自今日起，各旗划界而牧，私越界山一丈者斩！擅立大汗者族诛！大清皇帝旨意即长生天法度，违者视同谋逆！”" },
      { speaker: "科尔沁年轻台吉", sub: "跪伏在地，指甲深掐入土", type: "npc", stageChar: "right", text: "“我们祖祖辈辈随水草迁徙的草原，如今被石碑一道道割裂……大清这是把雄鹰的翅膀剪断，圈养在栅栏里啊！”" },
      { speaker: "法纪重铸", sub: "【内在法统 · 帝国秩序】", type: "voice-iron", stageChar: "center", text: "“铁的法纪是帝国长治久安的根基。是继续以高压铁腕推行界碑定界、是给予各旗经济互市特权抚平不满，抑或设立八旗驻军大营随时弹压？”" }
    ],
    choiceTags: ["高压定界", "特权抚恤", "驻军弹压"]
  },
  c3_2: {
    title: "第四幕C3-2：乌兰布通 · 康熙御驾亲征迎战准噶尔驼城火器",
    desc: "噶尔丹率准噶尔铁骑引罗刹重火器进逼直隶，大清天子御驾亲征乌兰布通。万门火炮齐射轰碎骆驼阵，神州版图命运决战爆发。",
    coords: "mongol:steppe",
    beats: [
      { speaker: "旁白", sub: "乌兰布通古战场 · 漫山硝烟", type: "narrator", stageChar: "center", text: "上万峰骆驼缚倒于泥地结成森严‘驼城’，准噶尔鸟枪手于驼背射击如雨。大清八旗重炮营与乌真超哈在暴风雪中推炮前出，展开旷世炮战！" },
      { speaker: "噶尔丹汗", sub: "身披重鳞甲，挥舞苏勒德神矛", type: "npc", stageChar: "left", text: "“满洲皇帝欺我蒙古太甚！今日借罗刹重炮踏平燕京，恢复大元帝国！长生天护佑苍狼之子冲锋！”" },
      { speaker: "康熙帝（年轻统帅）", sub: "按剑立于大纛之下，目光如电", type: "npc", stageChar: "right", text: "“朕御驾亲征，寸土不让！红衣大炮集中轰击敌军驼城中央！骑兵两翼包抄，今日务全歼准逆于乌兰布通之野！”" },
      { speaker: "千古一战", sub: "【内在兵机 · 疆土天定】", type: "voice-iron", stageChar: "center", text: "“乌兰布通决定神州西北万世疆界。是集中火力一举撕裂驼城全歼敌酋、是利用骑兵机动切断其回疆退路，抑或重兵围困迫其屈膝求和？”" }
    ],
    choiceTags: ["集中轰击", "骑兵断后", "重围逼和"]
  },
  c3_3: {
    title: "第四幕C3-3：辽西惊雷 · 布尔尼引火器叛乱与关外走廊阻击战",
    desc: "察哈尔首领布尔尼乘清军三藩决战南下之际，联络沙俄火枪队突袭山海关后方，辽西走廊粮道断绝，朝廷面临腹背受敌空前浩劫。",
    coords: "qing:mukden",
    beats: [
      { speaker: "旁白", sub: "辽西走廊 · 十三山驿火光冲天", type: "narrator", stageChar: "center", text: "狼烟四起，罗刹火枪队与察哈尔反叛骑兵突袭大清运粮栈道。前方江南三藩苦战，后方老巢盛京与京师联络几乎切断，朝野震恐。" },
      { speaker: "布尔尼", sub: "察哈尔亲王，纵马狂笑", type: "npc", stageChar: "left", text: "“多尔衮夺我黄金家族察哈尔汗印！今日清军主力陷在江南，京城不过空壳！杀入山海关，夺回大元玉玺，恢复蒙古江山！”" },
      { speaker: "图海", sub: "大学士统领，率八旗家奴死士列阵", type: "npc", stageChar: "right", text: "“国家大难在此一举！满洲家中奴仆家丁皆已披甲上阵！随老夫杀出齐化门，截击逆贼，保卫社稷中枢！”" },
      { speaker: "绝地御危", sub: "【内在机变 · 腹背破局】", type: "voice-court", stageChar: "center", text: "“后方危机甚至大于前线。是动员京畿所有满汉民丁拼死反击、是调回江南八旗精锐主力回防，抑或离间察哈尔与沙俄联盟分而破之？”" }
    ],
    choiceTags: ["全民死战", "回师勤王", "离间外援"]
  }
};

// 4. 将 9 个 Act 3 节点与 27 个 Act 4 节点进行强绑定
act3Data.forEach(node => {
  const meta = act3Keys.find(k => k.id === node.id);
  if (!meta) return;

  const choice1Target = `qing_act4_${meta.prefix}_1`;
  const choice2Target = `qing_act4_${meta.prefix}_2`;
  const choice3Target = `qing_act4_${meta.prefix}_3`;

  // 确保 options 3 变 27
  node.choices = [
    {
      text: `【决战分歧 1】${act4Templates[meta.prefix + '_1'].title.split('：')[1]}`,
      tag: act4Templates[meta.prefix + '_1'].choiceTags[0],
      bias: { authority: 5, pragmatism: 4, progress: 2, cognition: 3 },
      diceBase: 11,
      isExtrapolation: false,
      targetNodeId: choice1Target
    },
    {
      text: `【决战分歧 2】${act4Templates[meta.prefix + '_2'].title.split('：')[1]}`,
      tag: act4Templates[meta.prefix + '_2'].choiceTags[0],
      bias: { authority: 4, pragmatism: 5, progress: 4, cognition: 5 },
      diceBase: 10,
      isExtrapolation: false,
      targetNodeId: choice2Target
    },
    {
      text: `【决战分歧 3】${act4Templates[meta.prefix + '_3'].title.split('：')[1]}`,
      tag: act4Templates[meta.prefix + '_3'].choiceTags[0],
      bias: { authority: 6, pragmatism: 3, progress: -1, cognition: 2 },
      diceBase: 12,
      isExtrapolation: false,
      targetNodeId: choice3Target
    },
    {
      text: "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
      tag: "自由行动 · AI接戏",
      bias: { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
      diceBase: 10,
      isExtrapolation: true,
      isOpenEndedInput: true,
      targetNodeId: null,
      convergenceTargetId: choice1Target
    }
  ];

  allNodes[node.id] = node;
});

console.log("已完成 Act 3 (9 节点) 的 1变3 选项指针改造，全部直指 27 个独立 Act 4 目标！");

// 5. 生成 27 个 Act 4 节点 (每个节点均包含 4 beats，并生成 3 个选项通往 81 个 Act 5 节点)
const act5Specs = [];

Object.keys(act4Templates).forEach((tKey, act4Idx) => {
  const tpl = act4Templates[tKey];
  const act4NodeId = `qing_act4_${tKey}`;
  const trunkLetter = tKey[0].toUpperCase();
  const trunkName = trunkLetter === 'A' ? '支脉 A · 满洲铁血' : (trunkLetter === 'B' ? '支脉 B · 汉化文治' : '支脉 C · 草原盟约');

  const act5_1_Id = `qing_act5_${tKey}_1`;
  const act5_2_Id = `qing_act5_${tKey}_2`;
  const act5_3_Id = `qing_act5_${tKey}_3`;

  const node = {
    id: act4NodeId,
    faction: "qing",
    actNumber: 4,
    trunk: trunkLetter,
    trunkName: trunkName,
    title: tpl.title,
    coords: tpl.coords,
    desc: tpl.desc,
    originalBeats: tpl.beats,
    beats: tpl.beats,
    choices: [
      {
        text: `【巅峰抉择 1】强化铁血控制与绝对威权，直面终极决战！`,
        tag: tpl.choiceTags[0] + " · 巅峰决战",
        bias: { authority: 6, pragmatism: 4, progress: 2, cognition: 3 },
        diceBase: 11,
        isExtrapolation: false,
        targetNodeId: act5_1_Id
      },
      {
        text: `【巅峰抉择 2】采取制度调和与务实共存，构筑长治久安！`,
        tag: tpl.choiceTags[1] + " · 稳健拓疆",
        bias: { authority: 4, pragmatism: 6, progress: 5, cognition: 5 },
        diceBase: 10,
        isExtrapolation: false,
        targetNodeId: act5_2_Id
      },
      {
        text: `【巅峰抉择 3】行险侥幸发动绝死逆击，彻底重置神州地缘！`,
        tag: tpl.choiceTags[2] + " · 险策重塑",
        bias: { authority: 5, pragmatism: 3, progress: -2, cognition: 6 },
        diceBase: 12,
        isExtrapolation: false,
        targetNodeId: act5_3_Id
      },
      {
        text: "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
        tag: "自由行动 · AI接戏",
        bias: { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
        diceBase: 10,
        isExtrapolation: true,
        isOpenEndedInput: true,
        targetNodeId: null,
        convergenceTargetId: act5_1_Id
      }
    ]
  };

  allNodes[act4NodeId] = node;

  // 记录下 Act 5 节点的创建需求
  act5Specs.push({ id: act5_1_Id, parentKey: tKey, branchIdx: 1, trunk: trunkLetter, trunkName, parentTitle: tpl.title, tag: tpl.choiceTags[0] });
  act5Specs.push({ id: act5_2_Id, parentKey: tKey, branchIdx: 2, trunk: trunkLetter, trunkName, parentTitle: tpl.title, tag: tpl.choiceTags[1] });
  act5Specs.push({ id: act5_3_Id, parentKey: tKey, branchIdx: 3, trunk: trunkLetter, trunkName, parentTitle: tpl.title, tag: tpl.choiceTags[2] });
});

console.log(`已成功生成 Act 4 (27 节点)，并已规划 Act 5 (共计 ${act5Specs.length} 个节点)！`);

// 6. 生成 81 个 Act 5 节点 (每个节点包含 4 beats，并生成 3 个选项通往 243 个终局)
const endingSpecs = [];

act5Specs.forEach((spec, specIdx) => {
  const ending1Id = `qing_end_${specIdx * 3 + 1}`;
  const ending2Id = `qing_end_${specIdx * 3 + 2}`;
  const ending3Id = `qing_end_${specIdx * 3 + 3}`;

  const coords = spec.trunk === 'A' ? 'jiangnan:mid' : (spec.trunk === 'B' ? 'beijing:high' : 'mongol:steppe');

  const act5Node = {
    id: spec.id,
    faction: "qing",
    actNumber: 5,
    trunk: spec.trunk,
    trunkName: spec.trunkName,
    title: `第五幕【巅峰决胜 #${specIdx+1}】：${spec.tag} · 天命归所大终局前夕`,
    coords: coords,
    desc: `承接${spec.parentTitle}。战局在此进入不可逆的最终定鼎时刻，各方势力的生死、国运的终极走向，全在此最后一念决断。`,
    originalBeats: [
      {
        speaker: "青史巨眼",
        sub: "神州乾坤交汇之所",
        type: "narrator",
        stageChar: "center",
        text: `风云咆哮，山河倒悬。数百年的血与火、满汉蒙藏数千万生民的期盼与仇恨，在这最后的决战舞台上凝聚成实质。九洲神鼎之重，正待最后的铸型！`
      },
      {
        speaker: spec.trunk === 'A' ? "八旗统帅" : (spec.trunk === 'B' ? "内阁首辅" : "草原大汗"),
        sub: "目光沉凝如渊，按刀而立",
        type: "npc",
        stageChar: "left",
        text: `“天命从来不是垂青懦夫！我们付出了十万孤魂、三十年血雨腥风，才走到这金銮太和殿前！今日哪怕天崩地裂，也要为大清定下万古不移之规！”`
      },
      {
        speaker: "天下遗民",
        sub: "千古公论所聚之声",
        type: "npc",
        stageChar: "right",
        text: `“成王败寇，青史有公。若行仁政，四海皆臣民；若施暴虐，烽烟代代生！天下是天下人之天下，非一家一姓之私物！”`
      },
      {
        speaker: "定盘天平",
        sub: "【内在终局 · 历史终审】",
        type: "voice-court",
        stageChar: "center",
        text: `“路已经走到了尽头。三条大道通向三种截然不同的历史结局——是极盛之治、是分裂割据，还是走向世界大变局的前沿？历史正屏息等待你的最终抉择。”`
      }
    ],
    beats: [
      {
        speaker: "青史巨眼",
        sub: "神州乾坤交汇之所",
        type: "narrator",
        stageChar: "center",
        text: `风云咆哮，山河倒悬。数百年的血与火、满汉蒙藏数千万生民的期盼与仇恨，在这最后的决战舞台上凝聚成实质。九洲神鼎之重，正待最后的铸型！`
      },
      {
        speaker: spec.trunk === 'A' ? "八旗统帅" : (spec.trunk === 'B' ? "内阁首辅" : "草原大汗"),
        sub: "目光沉凝如渊，按刀而立",
        type: "npc",
        stageChar: "left",
        text: `“天命从来不是垂青懦夫！我们付出了十万孤魂、三十年血雨腥风，才走到这金銮太和殿前！今日哪怕天崩地裂，也要为大清定下万古不移之规！”`
      },
      {
        speaker: "天下遗民",
        sub: "千古公论所聚之声",
        type: "npc",
        stageChar: "right",
        text: `“成王败寇，青史有公。若行仁政，四海皆臣民；若施暴虐，烽烟代代生！天下是天下人之天下，非一家一姓之私物！”`
      },
      {
        speaker: "定盘天平",
        sub: "【内在终局 · 历史终审】",
        type: "voice-court",
        stageChar: "center",
        text: `“路已经走到了尽头。三条大道通向三种截然不同的历史结局——是极盛之治、是分裂割据，还是走向世界大变局的前沿？历史正屏息等待你的最终抉择。”`
      }
    ],
    choices: [
      {
        text: `【天命终局 A】执极权雷霆之柄，铸就钢铁秩序之盛世宏图！`,
        tag: `终局 #${specIdx * 3 + 1} · 极盛帝国`,
        bias: { authority: 7, pragmatism: 3, progress: 2, cognition: 3 },
        diceBase: 12,
        isExtrapolation: false,
        targetNodeId: ending1Id
      },
      {
        text: `【天命终局 B】以多元制度宽容并蓄，开启满汉蒙文明融合新篇！`,
        tag: `终局 #${specIdx * 3 + 2} · 文明共治`,
        bias: { authority: 4, pragmatism: 6, progress: 6, cognition: 6 },
        diceBase: 10,
        isExtrapolation: false,
        targetNodeId: ending2Id
      },
      {
        text: `【天命终局 C】旧传统不可撼动，偏安自守或遭遇历史狂飙之反噬！`,
        tag: `终局 #${specIdx * 3 + 3} · 宿命裂变`,
        bias: { authority: 5, pragmatism: 2, progress: -3, cognition: 4 },
        diceBase: 11,
        isExtrapolation: false,
        targetNodeId: ending3Id
      },
      {
        text: "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
        tag: "自由行动 · AI接戏",
        bias: { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
        diceBase: 10,
        isExtrapolation: true,
        isOpenEndedInput: true,
        targetNodeId: null,
        convergenceTargetId: ending1Id
      }
    ]
  };

  allNodes[spec.id] = act5Node;

  // 记录终局信息
  endingSpecs.push({
    id: ending1Id,
    num: specIdx * 3 + 1,
    trunk: spec.trunk,
    trunkName: spec.trunkName,
    parentTag: spec.tag,
    flavor: "极权秩序",
    title: `【终局 #${specIdx * 3 + 1}】大清极盛天朝 · 铁壁江山万古定鼎`,
    summary: `在${spec.tag}的最后关头，朝廷以雷霆手段压制了一切内讧与外敌，建立了无与伦比的高压中央集权。八旗与绿营驻防全国要害，天下虽有文士私议，但盗贼不起、边患肃清，开创了森严冷峻的钢铁王朝盛世。`
  });

  endingSpecs.push({
    id: ending2Id,
    num: specIdx * 3 + 2,
    trunk: spec.trunk,
    trunkName: spec.trunkName,
    parentTag: spec.tag,
    flavor: "共治交融",
    title: `【终局 #${specIdx * 3 + 2}】华夏四海一体 · 满汉蒙藏文明大融合`,
    summary: `在${spec.tag}的关口，你选择了包容、均权与制度创新。满汉双轨制与蒙藏大盟约完美运转，科举大开、免赋休养、佛法润物无声。神州大地破除了狭隘夷夏之防，迎来了幅员万里、文治武功兼备的黄金时代。`
  });

  endingSpecs.push({
    id: ending3Id,
    num: specIdx * 3 + 3,
    trunk: spec.trunk,
    trunkName: spec.trunkName,
    parentTag: spec.tag,
    flavor: "宿命裂变",
    title: `【终局 #${specIdx * 3 + 3}】历史惊弦余波 · 边塞偏安与地缘大断层`,
    summary: `在${spec.tag}的激战之后，旧习惯与剧烈的反噬撕裂了帝国肌体。八旗退守要塞，地方军阀与海外势力割据一隅。天下进入了漫长的对峙与重组，古老的大陆在阵痛中等待着新的天命归宿。`
  });
});

console.log(`已成功生成 Act 5 (81 节点)，并已生成 243 个最终天命终局数据！`);

// 7. 生成 243 个叶子终局节点 (Ending Nodes: actNumber: 5, choices 封顶)
endingSpecs.forEach(es => {
  const coords = es.trunk === 'A' ? 'jiangnan:mid' : (es.trunk === 'B' ? 'beijing:high' : 'mongol:steppe');

  const endingNode = {
    id: es.id,
    faction: "qing",
    actNumber: 5,
    isEnding: true,
    trunk: es.trunk,
    trunkName: es.trunkName,
    title: es.title,
    coords: coords,
    desc: es.summary,
    originalBeats: [
      {
        speaker: "天命青史",
        sub: `【终局 #${es.num} · 历史长卷收轴】`,
        type: "narrator",
        stageChar: "center",
        text: `【历史终评】${es.summary}\n\n青铜铭文已冷，万里山河犹在。站在紫禁皇城的重檐之下，回望来时路上的风雪关山、战马悲嘶与千古智辨，这部独属于大清的五幕真分支史诗，在此划上永恒的句号。`
      },
      {
        speaker: "后世史家",
        sub: "千载春秋笔录",
        type: "npc",
        stageChar: "center",
        text: `“读史者莫问前朝得失，但看今日江山谁定。${es.title}——这一条你亲手踏出的分歧之路，已将历史推向了绝然不同的彼岸！”`
      }
    ],
    beats: [
      {
        speaker: "天命青史",
        sub: `【终局 #${es.num} · 历史长卷收轴】`,
        type: "narrator",
        stageChar: "center",
        text: `【历史终评】${es.summary}\n\n青铜铭文已冷，万里山河犹在。站在紫禁皇城的重檐之下，回望来时路上的风雪关山、战马悲嘶与千古智辨，这部独属于大清的五幕真分支史诗，在此划上永恒的句号。`
      },
      {
        speaker: "后世史家",
        sub: "千载春秋笔录",
        type: "npc",
        stageChar: "center",
        text: `“读史者莫问前朝得失，但看今日江山谁定。${es.title}——这一条你亲手踏出的分歧之路，已将历史推向了绝然不同的彼岸！”`
      }
    ],
    choices: [
      {
        text: `【全剧终 · 阖卷回望】保存天命结算，封存大清青史档案 #${es.num}`,
        tag: "天命结算 · 永载青史",
        bias: { authority: 0, pragmatism: 0, progress: 0, cognition: 5 },
        diceBase: 10,
        isExtrapolation: false,
        targetNodeId: null
      }
    ]
  };

  allNodes[es.id] = endingNode;
});

console.log(`\n=== 节点生成总数审计 ===`);
const countsByAct = {};
Object.values(allNodes).forEach(n => {
  const k = n.isEnding ? 'Ending(243)' : `Act ${n.actNumber}`;
  countsByAct[k] = (countsByAct[k] || 0) + 1;
});
console.log(countsByAct);
console.log(`全树节点总数: ${Object.keys(allNodes).length} (1 根节点 + 3 支脉 + 9 惊变 + 27 决战 + 81 巅峰 + 243 终局 = 364 节点)`);

// 8. 写入 data/qing-363-tree.json 备份
const fullTreeOutput = {
  id: "qing",
  name: "后金八旗 · 盛京汗殿 主剧情树",
  tagline: "关外铁骑，兼收汉化逐中原（五幕真分支 243 终局完整版）",
  initialNodeId: "qing_act1",
  nodes: allNodes
};

fs.writeFileSync(path.join(dataDir, 'qing-363-tree.json'), JSON.stringify(fullTreeOutput, null, 2), 'utf8');
console.log(`已将完整 364 节点剧情树导出至: ${path.join(dataDir, 'qing-363-tree.json')}`);

// 9. 更新 skills-data.js 中的 canonicalTrees.qing
console.log("正在将大清 364 节点宏伟真分支树同步写入 skills-data.js...");

WORLD_PRESETS.canonicalTrees.qing = fullTreeOutput;

const newJsCode = `// skills-data.js: 动态技能检定、宏观地缘时相、四大阵营剧情树与世界观设定
const _WORLD_PRESETS = ${JSON.stringify(WORLD_PRESETS, null, 2)};
if (typeof window !== 'undefined') window.WORLD_PRESETS = _WORLD_PRESETS;
if (typeof global !== 'undefined') global.WORLD_PRESETS = _WORLD_PRESETS;
if (typeof module !== 'undefined' && module.exports) module.exports = _WORLD_PRESETS;
`;

fs.writeFileSync(skillsDataPath, newJsCode, 'utf8');
console.log("✓ skills-data.js 写入完毕！");
