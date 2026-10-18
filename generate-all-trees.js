// generate-all-trees.js: 生成 4 大阵营完整 1->3->9 纯树状分支叙事大纲并更新 skills-data.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createBeat(speaker, sub, type, stageChar, text) {
  return { speaker, sub, type, stageChar, text };
}

function createChoice(text, tag, bias, diceBase, isExtrapolation, targetNodeId, convergenceTargetId = null) {
  const c = { text, tag, bias, diceBase, isExtrapolation, targetNodeId };
  if (convergenceTargetId) c.convergenceTargetId = convergenceTargetId;
  return c;
}

// 1. 大明
const mingNodes = {
  // Stage 1
  "ming_act1": {
    id: "ming_act1",
    actNumber: 1,
    title: "第一幕：紫禁廷议 · 借饷危局",
    coords: "beijing:high",
    desc: "大雪封禁紫禁城，国库见底，边军二十万待饷，而江南士绅联名抗税。内阁与六部在文渊阁彻夜廷议。",
    originalBeats: [
      createBeat("旁白", "紫禁城 · 文渊阁廷议", "narrator", "center", 
        "崇祯十七年冬，鹅毛大雪封锁紫禁城。文渊阁中炭火渐熄，案头横陈着两道滴血文书——辽东八百里加急军报，与江南三十六商帮抗粮血书。"),
      createBeat("户部尚书", "手持亏空账簿，面如土色", "npc", "left", 
        "“首辅大人！太仓银库仅余银三万两，而山海关边军待饷二十万，已杀战马裹腹！若再无粮饷出关，边军哗变只在旦夕之间啊！”"),
      createBeat("东林侍郎", "按剑冷笑，目光如刀", "npc", "right", 
        "“户部休要信口开河！江南今岁水旱并至，士民早已食不果腹！若再发厂卫缇骑加派搜刮，东南必揭竿而起，祖宗社稷立成焦土！”"),
      createBeat("权谋嗅觉", "【内在直觉 · 权力机变】", "voice-court", "right", 
        "“两派各执一词，深宫天子正隔帘垂听。案头盖有朱批的中旨密诏就在你袖中——是严督加派、籍没百官，还是开洋通商，天下一念存亡。”")
    ],
    choices: [
      createChoice("【支脉 A · 经世加派】加派三饷，派遣厂卫缇骑下江南严督税粮，违者以谋逆论处！", "霸道法统 · 威权集权", 
        { authority: +5, pragmatism: +3, progress: -2, cognition: +1 }, 11, false, "ming_act2_tax"),
      createChoice("【支脉 B · 雷霆肃贪】彻查京官私库与外戚勋贵，抄没通敌附逆巨室以充实辽饷！", "雷霆肃贪 · 铁血法纪", 
        { authority: +4, pragmatism: +4, progress: +3, cognition: +2 }, 12, false, "ming_act2_purge"),
      createChoice("【支脉 C · 开海通商】破除两百年海禁祖制，准东南市舶司开海通商，以关税质押筹饷！", "经世更张 · 破除祖制", 
        { authority: -2, pragmatism: +5, progress: +6, cognition: +4 }, 10, false, "ming_act2_sea"),
      createChoice("【🌿 AI局外外推】夜出阜成门，私会暗抵京师的泰西夷商与晋商巨贾，借法外暗盘筹饷！", "法外博弈 · 自由外推", 
        { authority: -2, pragmatism: +6, progress: +5, cognition: +4 }, 10, true, null, "ming_act2_tax")
    ],
    sutureHints: "若此前有过外推，重点提及外推中筹措的银两、结怨的势力对廷议朝臣立场的直接冲击。"
  },

  // Stage 2
  "ming_act2_tax": {
    id: "ming_act2_tax",
    actNumber: 2,
    trunk: "A",
    trunkName: "支脉 A · 运河加派线",
    title: "第二幕A：运河风暴 · 东南抗租惊雷",
    coords: "jiangnan:mid",
    desc: "加派令下达，江南抗税风暴蔓延。枫桥水驿帆樯林立，商帮联合阻断漕运，局势一触即发。",
    originalBeats: [
      createBeat("旁白", "江南要冲 · 枫桥水驿", "narrator", "center", 
        "连绵阴雨笼罩江南运河。数百艘漕船首尾相衔堵塞水道，岸上成千上万丝织工役与商帮家丁高擎白旗，与官军水师隔河对峙。"),
      createBeat("丝帮魁首", "锦袍湿透，振臂高呼", "npc", "left", 
        "“我等缴纳国课何曾短缺分毫！今中枢权奸不治边患，专事搜刮江南脂膏！今日若退一步，明日江南便尽为饥殍！”"),
      createBeat("漕运总督", "按刀立于官舫，神色凝重", "npc", "right", 
        "“钦差大人，水闸外已聚集数万暴民。若强行开炮清河，恐激起东南全境民变；若不开道，北上漕粮断绝，京师旬日内便要断粮！”"),
      createBeat("经世机变", "【内在直觉 · 利益罗盘】", "voice-court", "center", 
        "“商帮求的是利与垄断，朝廷要的是银子与面子。铁腕镇压、官商媾和，还是逼至民变反噬，历史在此分流。”")
    ],
    choices: [
      createChoice("【分歧 3A-1 · 铁血镇压】调集水师发弗朗机巨炮轰开水闸，逮捕首恶，强行恢复漕运！", "铁腕荡平 · 强权极化", 
        { authority: +6, pragmatism: +2, progress: -3, cognition: -1 }, 12, false, "ming_act3_tax_iron"),
      createChoice("【分歧 3A-2 · 官商媾和】私下召集三十六商帮魁首，以盐引与茶马专卖权抵押换取现银！", "利益权衡 · 财阀同盟", 
        { authority: -1, pragmatism: +6, progress: +3, cognition: +3 }, 10, false, "ming_act3_tax_compromise"),
      createChoice("【分歧 3A-3 · 逼反民意】强推十户连坐追征历年欠粮，激起东南巨浪锁断大运河！", "极化绝境 · 民怨沸腾", 
        { authority: +5, pragmatism: -4, progress: -5, cognition: -2 }, 13, false, "ming_act3_tax_revolt"),
      createChoice("【🌿 AI局外外推】亲身单舟潜入枫桥水榭，挑拨三大商帮利益龃龉，从内部瓦解抗税联盟！", "潜行连横 · 自由外推", 
        { authority: +1, pragmatism: +6, progress: +2, cognition: +5 }, 11, true, null, "ming_act3_tax_iron")
    ],
    sutureHints: "若此前在外推中接触过晋商或夷商，丝帮会对其手中持有的外来银票与军火产生剧烈反应。"
  },
  "ming_act2_purge": {
    id: "ming_act2_purge",
    actNumber: 2,
    trunk: "B",
    trunkName: "支脉 B · 京华肃贪线",
    title: "第二幕B：京华籍没 · 厂卫百官夜哭",
    coords: "beijing:high",
    desc: "查抄令下，厂卫缇骑四出。京师勋贵私宅被破，金银器物堆积如山，但百官怨气冲天，暗流涌动。",
    originalBeats: [
      createBeat("旁白", "京师官邸 · 崇文门私宅", "narrator", "center", 
        "夜风呼啸，火把如蛇。东厂与锦衣卫砸开勋戚朱门，箱笼翻倒，珠宝银锭滚落雪地。宅院内外哭号之声震动九城。"),
      createBeat("锦衣卫指挥使", "浑身血迹，手捧黄册密簿", "npc", "left", 
        "“大人！从国戚府库起出白银八十万两！但册中赫然记有半数内阁大臣与后金通商走私的往来铁证，若公之于众，朝堂立空！”"),
      createBeat("兵部侍郎", "跪伏雪地，哀声痛哭", "npc", "right", 
        "“大人三思！百官同气连枝，逼之太甚，明日早朝必有死士伏阙死谏！京师不战自乱啊！”"),
      createBeat("法纪断喝", "【内在直觉 · 霜雪清明】", "voice-court", "center", 
        "“雪地上的银光刺痛双目，这本通敌密簿既是治罪的断头台，也是操控百官生死效命的最强锁链。”")
    ],
    choices: [
      createChoice("【分歧 3B-1 · 缇骑特务】扩大诏狱株连，设立北镇抚司特别法庭，以恐怖政治压制全城百官！", "特务极权 · 罗织经世", 
        { authority: +7, pragmatism: +3, progress: -2, cognition: +1 }, 12, false, "ming_act3_purge_terror"),
      createChoice("【分歧 3B-2 · 铁面正法】按大明律明正典刑，仅诛首恶，所得脏银尽数公开展览并解送山海关！", "海瑞烈骨 · 霜雪清吏", 
        { authority: +3, pragmatism: -3, progress: +4, cognition: +3 }, 11, false, "ming_act3_purge_law"),
      createChoice("【分歧 3B-3 · 诱发叛变】高压籍没激起百官绝望，勋贵暗中联络京营将领准备倒戈开关！", "绝境反噬 · 宫变危机", 
        { authority: +4, pragmatism: -5, progress: -4, cognition: -1 }, 13, false, "ming_act3_purge_rebellion"),
      createChoice("【🌿 AI局外外推】暗中将密簿复本交由心腹秘密出城，试探关外后金谍网的真实部署！", "谍海弄潮 · 自由外推", 
        { authority: +1, pragmatism: +5, progress: +3, cognition: +6 }, 11, true, null, "ming_act3_purge_law")
    ],
    sutureHints: "若此前在外推中发生了暗杀或暗盘交易，百官的态度将从哀求转为惊骇与决死一搏。"
  },
  "ming_act2_sea": {
    id: "ming_act2_sea",
    actNumber: 2,
    trunk: "C",
    trunkName: "支脉 C · 闽海通商线",
    title: "第二幕C：闽海开洋 · 市舶招抚与重洋借力",
    coords: "nanming:maritime",
    desc: "破除祖制开海通商，福建巡抚与安平郑氏在泉州港会晤。西洋巨舰破浪而来，白银火器源源不断。",
    originalBeats: [
      createBeat("旁白", "泉州海门 · 市舶司督府", "narrator", "center", 
        "潮平两岸阔，数千艘大明福船与泰西盖伦重舰云集泉州港。桅杆如林，弗朗机水手与闽南水师并肩巡弋。"),
      createBeat("闽海船王", "手持西洋海图，按剑长笑", "npc", "left", 
        "“朝廷两百年海禁，不过是画地为牢！今若允我郑氏合法行商，某愿出万艘战舰、千万关税，逆长江而上直捣幽燕！”"),
      createBeat("西洋传教士", "手捧自鸣钟与神铳图谱", "npc", "right", 
        "“尊敬的阁下，濠镜澳红夷大炮二十门已备齐。只需朝廷颁布通商恩诏，罗马教廷亦可助大明御敌！”"),
      createBeat("重洋雄心", "【内在直觉 · 蓝色边疆】", "voice-court", "center", 
        "“走出内陆深宫，海洋的腥风激荡肺腑。借闽海之师北上勤王、引泰西火器革新，或是让东南士商自治，乾坤在此改写。”")
    ],
    choices: [
      createChoice("【分歧 3C-1 · 借师勤王】与郑氏签订安平盟约，招抚闽海水师万舰北上，由海上直插辽东敌后！", "海洋铁骑 · 借师还魂", 
        { authority: +3, pragmatism: +6, progress: +5, cognition: +4 }, 11, false, "ming_act3_sea_fleet"),
      createChoice("【分歧 3C-2 · 火器革新】耗费市舶巨税向泰西购置重炮两百门，召集传教士入京打造神机火器营！", "器物鼎新 · 火器强军", 
        { authority: +4, pragmatism: +5, progress: +7, cognition: +5 }, 10, false, "ming_act3_sea_trade"),
      createChoice("【分歧 3C-3 · 东南自治】顺水推舟许东南士商自治特许，以关税全额包办边防，帝国重心南移！", "虚君实利 · 商业自治", 
        { authority: -3, pragmatism: +7, progress: +6, cognition: +6 }, 12, false, "ming_act3_sea_confederation"),
      createChoice("【🌿 AI局外外推】登上一艘泰西武装商船，出海巡阅南洋航线并截击走私舰队！", "大洋冒险 · 自由外推", 
        { authority: -1, pragmatism: +6, progress: +6, cognition: +5 }, 11, true, null, "ming_act3_sea_fleet")
    ],
    sutureHints: "若此前在外推中获取了西洋火器或海图，泉州水师将直接装备最先进的重炮。"
  },

  // Stage 3 (9 Nodes)
  "ming_act3_tax_iron": {
    id: "ming_act3_tax_iron",
    actNumber: 3,
    trunk: "A",
    title: "第三幕A1：血洗枫桥 · 强运巨饷震京畿",
    coords: "jiangnan:mid",
    desc: "弗朗机巨炮轰开枫桥水闸，数十万石漕粮在血水与烈火中强行起运北上。山海关边军终得饱饷，但东南士林视中枢如仇寇。",
    originalBeats: [
      createBeat("旁白", "枫桥焦土 · 漕运中流", "narrator", "center", "火光映红了运河之夜，水闸残骸在烈焰中坍塌。首批三十万石漕粮在官军严密押解下顺流疾驰北上。"),
      createBeat("山海关督饷官", "飞骑驰抵，热泪盈眶", "npc", "left", "“粮饷到了！关宁铁骑分食饱饭，人人发誓以死报国！大明江山有救了！”"),
      createBeat("江南名士", "立于岸边冷眼唾骂", "npc", "right", "“残民以肥兵，得边关而失天下！这染血的粮草，必成大明灭亡的奠仪！”")
    ],
    choices: [
      createChoice("【终章推进】率重饷大军出山海关决战，以铁血铸就帝国中兴！", "铁血中兴", { authority: +5, pragmatism: +3, progress: 0, cognition: 0 }, 10, false, "ming_act4_iron_restoration"),
      createChoice("【🌿 AI局外外推】亲随粮船急行军，沿途设伏截杀后金派遣的烧粮死士！", "粮道鏖战", { authority: +2, pragmatism: +5, progress: +2, cognition: +3 }, 10, true, null, "ming_act4_iron_restoration")
    ]
  },
  "ming_act3_tax_compromise": {
    id: "ming_act3_tax_compromise",
    actNumber: 3,
    trunk: "A",
    title: "第三幕A2：官商媾和 · 东南财阀操盘朝纲",
    coords: "jiangnan:mid",
    desc: "朝廷与商帮达成密约，以两淮盐引抵押换取现银二百万两。边患虽暂缓，但朝廷政令从此受制于江南商阀财团。",
    originalBeats: [
      createBeat("旁白", "苏州水榭 · 密约签押", "narrator", "center", "金银交割声不绝于耳，内阁与商帮代表在红木案前画押。白银滚滚北上，而帝国的经济命脉已悄然易手。"),
      createBeat("东林领袖", "手捻须髯，含笑举杯", "npc", "left", "“不损百姓分毫而饷银足备，此乃万全之策！今后朝中廷议，当多听士商之声。”"),
      createBeat("户部主事", "暗中嗟叹", "npc", "right", "“国家神器，今沦为商贾市井之私产矣……”")
    ],
    choices: [
      createChoice("【终章推进】携商帮巨资重构边关防线，开启官绅共治的新时代！", "官商共治", { authority: -2, pragmatism: +6, progress: +3, cognition: +3 }, 10, false, "ming_act4_bureaucratic_peace"),
      createChoice("【🌿 AI局外外推】利用商帮密网，反向截获北方降官运往江南的洗钱暗账！", "金融暗战", { authority: +1, pragmatism: +6, progress: +4, cognition: +5 }, 10, true, null, "ming_act4_bureaucratic_peace")
    ]
  },
  "ming_act3_tax_revolt": {
    id: "ming_act3_tax_revolt",
    actNumber: 3,
    trunk: "A",
    title: "第三幕A3：民变锁江 · 两京绝粮江山裂解",
    coords: "jiangnan:mid",
    desc: "强征激起全境民变，白莲教与抗税义民凿沉漕船数千艘封锁长江。北上粮道断绝，京畿陷入大饥荒，关隘动摇。",
    originalBeats: [
      createBeat("旁白", "扬子江口 · 沉船锁江", "narrator", "center", "浓烟遮天蔽日，千里运河沦为泽国死地。饥民揭竿而起，中枢威信荡然无存。"),
      createBeat("急报飞骑", "滚落马下，嘶声大呼", "npc", "left", "“京师断粮三日！九门禁军杀马为食，闯军前锋已过居庸关！”"),
      createBeat("内在警钟", "【绝命警觉】", "voice-instinct", "center", "“民心如水，既能载舟，亦能覆舟。大明的三百年气数，正在滔滔江水中化为乌有。”")
    ],
    choices: [
      createChoice("【终章推进】仓促应战，在滔天民怨与内忧外患中接受历史审判！", "大劫沉沦", { authority: -4, pragmatism: -3, progress: -4, cognition: -2 }, 10, false, "ming_act4_river_collapse"),
      createChoice("【🌿 AI局外外推】单骑突入义军大营，以三寸不烂之舌劝说义首改旗易帜！", "绝地辩才", { authority: +1, pragmatism: +5, progress: +2, cognition: +6 }, 11, true, null, "ming_act4_river_collapse")
    ]
  },
  "ming_act3_purge_terror": {
    id: "ming_act3_purge_terror",
    actNumber: 3,
    trunk: "B",
    title: "第三幕B1：缇骑横行 · 诏狱血海特务独裁",
    coords: "beijing:high",
    desc: "北镇抚司全面接管京师防务，百官人人自危，道路以目。搜括出白银三百万两，然朝堂群臣噤若寒蝉，离心离德。",
    originalBeats: [
      createBeat("旁白", "北镇抚司 · 诏狱深夜", "narrator", "center", "地牢深处皮鞭与烙铁之声彻夜不绝。血水渗出狱门，整座紫禁城笼罩在无边的肃杀与死寂之中。"),
      createBeat("东厂督公", "满面阴鸷，躬身进呈", "npc", "left", "“圣上，通敌逆党三千余人已尽数伏法，籍没金银已发往山海关！如今京师已无一人敢生异心！”"),
      createBeat("大学士遗孀", "素服当街长哭", "npc", "right", "“冤狱遍地，忠良尽戮！如此暴政，天理难容！”")
    ],
    choices: [
      createChoice("【终章推进】依托特务血腕独断专行，迎来孤注一掷的历史清算！", "铁血独裁", { authority: +7, pragmatism: +2, progress: -2, cognition: 0 }, 10, false, "ming_act4_terror_reign"),
      createChoice("【🌿 AI局外外推】夜审诏狱深处的敌国核心谍首，逼问多尔衮的终极入关密码！", "深夜严审", { authority: +4, pragmatism: +6, progress: +1, cognition: +5 }, 11, true, null, "ming_act4_terror_reign")
    ]
  },
  "ming_act3_purge_law": {
    id: "ming_act3_purge_law",
    actNumber: 3,
    trunk: "B",
    title: "第三幕B2：铁面正法 · 肃贪申法海瑞之烈",
    coords: "beijing:high",
    desc: "依大明律当众斩杀通敌国戚巨贪，赃银分文不私，全城百姓夹道称颂。士气大振，忠烈之士誓死效忠中枢。",
    originalBeats: [
      createBeat("旁白", "午门刑场 · 万民瞩目", "narrator", "center", "秋风萧瑟，贪官人头落地。刑场外数十万京师军民齐声山呼万岁，久违的浩然正气充塞天地。"),
      createBeat("清流主考", "昂然抱拳，泪洒朝堂", "npc", "left", "“朝廷法度重光，海内忠臣义士岂有惜死之理！老臣愿领家丁五百，出关死守！”"),
      createBeat("守城将士", "拔刀呐喊", "npc", "right", "“愿为严正王法而战！誓保京师！”")
    ],
    choices: [
      createChoice("【终章推进】借天下清明士气，御驾亲征迎击强敌，重塑华夏乾坤！", "清流救世", { authority: +4, pragmatism: -1, progress: +4, cognition: +3 }, 10, false, "ming_act4_clean_governance"),
      createChoice("【🌿 AI局外外推】组织京师义民设立保甲防线，巡查各门防范死士破坏城防！", "京畿防谍", { authority: +3, pragmatism: +4, progress: +3, cognition: +4 }, 10, true, null, "ming_act4_clean_governance")
    ]
  },
  "ming_act3_purge_rebellion": {
    id: "ming_act3_purge_rebellion",
    actNumber: 3,
    trunk: "B",
    title: "第三幕B3：百官反噬 · 勋贵内变九门失守",
    coords: "beijing:high",
    desc: "过度籍没引爆勋贵哗变，三大营将领暗中联络李自成大顺军。深夜城门大开，敌骑长驱直入，天子被困煤山。",
    originalBeats: [
      createBeat("旁白", "正阳门外 · 战火裂空", "narrator", "center", "火光撕裂夜空，守关将领倒戈砍断门栓。大顺军铁骑如潮水般涌入九门，内宫大火冲天。"),
      createBeat("叛变勋贵", "率兵持刀，狞笑逼宫", "npc", "left", "“昏君无道，抄我祖产杀我宗族！今日便请圣上退位，恭迎闯王坐龙椅！”"),
      createBeat("大明孤忠", "浑身是血，挡在殿前", "npc", "right", "“臣等死战，请陛下速由后山密道撤往南京留都！”")
    ],
    choices: [
      createChoice("【终章推进】登临煤山极目天下，写下血书遗诏，坦然走向千古宿命！", "壮烈殉国", { authority: -5, pragmatism: -4, progress: -3, cognition: +2 }, 10, false, "ming_act4_capital_fall"),
      createChoice("【🌿 AI局外外推】带贴身侍卫潜行突围，在紫禁城暗道中展开殊死游击！", "暗道突围", { authority: +1, pragmatism: +6, progress: +2, cognition: +5 }, 12, true, null, "ming_act4_capital_fall")
    ]
  },
  "ming_act3_sea_fleet": {
    id: "ming_act3_sea_fleet",
    actNumber: 3,
    trunk: "C",
    title: "第三幕C1：闽海铁师 · 郑氏龙旗逆江北上",
    coords: "nanming:maritime",
    desc: "数百艘安平镇铁甲战舰悬挂大明龙旗入长江，西洋重炮轰击沿江营垒。海陆夹击之下，天下震动，清军退避三舍。",
    originalBeats: [
      createBeat("旁白", "南京下关 · 长江江面", "narrator", "center", "江涛如雪，巨大的盖伦龙旗巨舰横亘江心。数十门重炮齐射，敌军沿江要塞瞬间灰飞烟灭。"),
      createBeat("郑成功", "手拔西洋配剑，威严下令", "npc", "left", "“三军将士听令！我大明水师自海上归来，今日定要扫荡腥膻，复我旧邦！”"),
      createBeat("金陵遗老", "望江痛哭，跪拜如林", "npc", "right", "“海上神兵降临！大明有救矣！”")
    ],
    choices: [
      createChoice("【终章推进】水师大军横扫中原，建立以大洋霸权为骨架的大明重洋帝国！", "重洋帝国", { authority: +4, pragmatism: +5, progress: +6, cognition: +5 }, 10, false, "ming_act4_maritime_empire"),
      createChoice("【🌿 AI局外外推】率小型快艇突袭崇明岛水师基地，俘获敌军全部运粮快船！", "断敌水路", { authority: +2, pragmatism: +6, progress: +4, cognition: +5 }, 10, true, null, "ming_act4_maritime_empire")
    ]
  },
  "ming_act3_sea_trade": {
    id: "ming_act3_sea_trade",
    actNumber: 3,
    trunk: "C",
    title: "第三幕C2：泰西大炮 · 市舶银税火器强邦",
    coords: "beijing:high",
    desc: "关税白银换来泰西红衣重炮两百门，传教士汤若望督造神机军团。九边要塞全面火器化，后金骑射在钢铁弹雨前碰壁溃退。",
    originalBeats: [
      createBeat("旁白", "山海雄关 · 火炮城台", "narrator", "center", "排炮齐鸣，地动山摇。关墙上数百门西洋加农重炮喷吐火舌，狂暴的霰弹瞬间将敌军冲锋骑兵撕裂。"),
      createBeat("神机营总督", "按住滚烫炮管，放声长笑", "npc", "left", "“任尔八旗骑射天下无双，在西洋万钧火药面前，皆不过齑粉耳！”"),
      createBeat("汤若望", "胸画十字，庄严祈祷", "npc", "right", "“上帝与东方的大明同在，文明的科学终将战胜野蛮。”")
    ],
    choices: [
      createChoice("【终章推进】全面拥抱泰西科技与全球贸易，迈向欧亚同盟的世界帝国！", "火器复兴", { authority: +3, pragmatism: +5, progress: +7, cognition: +6 }, 10, false, "ming_act4_western_alliance"),
      createChoice("【🌿 AI局外外推】截获走私进入关外的西洋火药配方，彻底断绝敌军炮械供应！", "科技谍战", { authority: +2, pragmatism: +6, progress: +5, cognition: +6 }, 11, true, null, "ming_act4_western_alliance")
    ]
  },
  "ming_act3_sea_confederation": {
    id: "ming_act3_sea_confederation",
    actNumber: 3,
    trunk: "C",
    title: "第三幕C3：重洋自立 · 东南华夏联邦自治",
    coords: "nanming:maritime",
    desc: "中原沦陷之际，东南士绅、商帮与闽海龙旗共同建立海邦同盟。以银本位与议事堂共治天下，开创东方海洋文明新纪元。",
    originalBeats: [
      createBeat("旁白", "留都公署 · 议事堂大会", "narrator", "center", "文人、海商、水师统领共聚一堂。不再有跪拜三呼，唯有契约与投票，东方第一个海洋联邦在炮声中奠基。"),
      createBeat("海商同盟主席", "高举联邦宪章", "npc", "left", "“自今日始，不以一家一姓为天下，而以天下万民之商贸自由为天下！”"),
      createBeat("前朝大儒", "热泪纵横，感慨万千", "npc", "right", "“黄宗羲《明夷待访录》之理想，竟在重洋海波之上得以实现……”")
    ],
    choices: [
      createChoice("【终章推进】签署《东南海邦宪章》，开创独立自强的华夏海洋新邦！", "东南新邦", { authority: -4, pragmatism: +7, progress: +8, cognition: +7 }, 10, false, "ming_act4_south_republic"),
      createChoice("【🌿 AI局外外推】派遣远洋特使扬帆马六甲与欧洲，建立全球通商大使馆！", "远洋外交", { authority: -1, pragmatism: +7, progress: +8, cognition: +8 }, 10, true, null, "ming_act4_south_republic")
    ]
  },

  // Stage 4 (9 Endings)
  "ming_act4_iron_restoration": {
    id: "ming_act4_iron_restoration",
    actNumber: 4,
    trunk: "A",
    title: "第四幕：【终局】大明中兴 · 铁血威权定鼎",
    coords: "beijing:high",
    desc: "山海关大胜，八旗溃退塞外，流寇尽灭。中枢威权达到极盛，然而江南民怨深埋，帝国的复兴伴随着沉重的代价。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "崇祯中兴，天下重归一统。太庙香烟缭绕，群臣匍匐。你以钢铁与鲜血重塑了乾坤，后人称你为挽狂澜于既倒的千古铁相。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_bureaucratic_peace": {
    id: "ming_act4_bureaucratic_peace",
    actNumber: 4,
    trunk: "A",
    title: "第四幕：【终局】官商共治 · 东南财阀操盘天下",
    coords: "jiangnan:mid",
    desc: "边患渐平，然而太仓税赋全由东南商阀代持。朝堂六部皆为商帮代言人，大明进入了金权与皇权奇妙共生的富庶时代。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "白银统治了一切。没有激烈的杀戮，只有精密的算计。大明帝国蜕变为一个庞大的商业托拉斯，天下士民在安逸中富甲一方。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_river_collapse": {
    id: "ming_act4_river_collapse",
    actNumber: 4,
    trunk: "A",
    title: "第四幕：【终局】运河断绝 · 帝国经济命脉彻底崩溃",
    coords: "jiangnan:mid",
    desc: "民变大火烧尽了江南漕运，京师大饥失守，南北彻底割裂。三百年大明王朝在饥饿与绝望的狂澜中轰然坍塌。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "千里运河白骨露野。过度的搜刮终于将帝国逼上了不归路。你见证了这头庞然巨兽在民怨烈焰中的最后悲鸣。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_terror_reign": {
    id: "ming_act4_terror_reign",
    actNumber: 4,
    trunk: "B",
    title: "第四幕：【终局】孤绝独夫 · 厂卫密织血色残阳",
    coords: "beijing:high",
    desc: "百官皆被剪除，东厂与锦衣卫监视天下万方。强敌虽不敢近，但朝野内外已无一人敢言真话，煤山之上唯余残阳如血。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "皇座之下，皆是枯骨。你建立了空前绝后的特务集权，维系了帝国的残躯，却也让所有人陷入了无尽的梦魇。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_clean_governance": {
    id: "ming_act4_clean_governance",
    actNumber: 4,
    trunk: "B",
    title: "第四幕：【终局】天下清明 · 肃贪重铸大明乾坤",
    coords: "beijing:high",
    desc: "法度森严，吏治澄清。海瑞式的浩然正气充斥朝堂，贪墨匿迹，百姓安居乐业。大明迎来了一次道德与制度的双重清明盛世。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "青天在目，白发公卿无愧于祖宗。你以雷霆正道肃清宇内，后人称赞你的刚正与廉洁，犹如高山仰止。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_capital_fall": {
    id: "ming_act4_capital_fall",
    actNumber: 4,
    trunk: "B",
    title: "第四幕：【终局】九门失守 · 甲申国难天子殉国",
    coords: "beijing:high",
    desc: "高压反噬，百官开城降敌。崇祯皇帝披发自缢于寿皇亭，天子死社稷。悲壮的挽歌回荡在紫禁城的红墙碧瓦之间。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "“任贼分裂朕尸，勿伤百姓一人。”最后的君主以最决绝的姿态谢幕。历史在此断代，留下千古长叹。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_maritime_empire": {
    id: "ming_act4_maritime_empire",
    actNumber: 4,
    trunk: "C",
    title: "第四幕：【终局】龙旗重洋 · 华夏大航海帝国",
    coords: "nanming:maritime",
    desc: "迁都留都南京，大明水师万舰纵横太平洋与印度洋。海洋贸易带来无尽财富，西方列强退避三舍，东方海洋帝国雄踞世界。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "华夏文明从大陆走向重洋。龙旗在大洋之上猎猎作响，世界航海史上最耀眼的一页，由你亲手书写。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_western_alliance": {
    id: "ming_act4_western_alliance",
    actNumber: 4,
    trunk: "C",
    title: "第四幕：【终局】欧亚连横 · 泰西火器科技复兴",
    coords: "beijing:high",
    desc: "全面吸收西方天文、历法、铸炮与机械科技。大明神机营成为全球最强大的火器军团，开启了东西方文明深度交融的文艺复兴盛世。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "科学与哲学的火种在古老的东方大陆燃烧。你打破了千年的傲慢与偏见，引进了文明的星火，再造盛世天朝。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  },
  "ming_act4_south_republic": {
    id: "ming_act4_south_republic",
    actNumber: 4,
    trunk: "C",
    title: "第四幕：【终局】东南新邦 · 华夏海邦共和初啼",
    coords: "nanming:maritime",
    desc: "抛弃旧式皇权，东南士绅与海商建立议会共和新邦。商贸自由、百家争鸣，东方诞生了第一座璀璨的海洋民主灯塔。",
    originalBeats: [
      createBeat("史官铁笔", "【青史定盘】", "narrator", "center", "一个旧帝国死去了，一个崭新的现代文明在浪涛中诞生。你的选择开启了人类历史的一段未曾设想的壮丽新篇。")
    ],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0, pragmatism:0, progress:0, cognition:0 }, 2, false, null)]
  }
};

// 2. 清朝 1 -> 3 -> 9
const qingNodes = {
  // Stage 1
  "qing_act1": {
    id: "qing_act1",
    actNumber: 1,
    title: "第一幕：盛京定策 · 崇政殿密议与汉儒受降",
    coords: "qing:mukden",
    desc: "大雪封锁盛京汗宫，明帝自缢与李闯入京急报送抵。多尔衮主张抢掠而退，范文程伏地泣血力劝以仁义收抚中原天命。",
    originalBeats: [
      createBeat("旁白", "盛京皇宫 · 崇政殿风雪密议", "narrator", "center", "塞外冰封千里，崇政殿外两黄旗与两白旗侍卫甲胄森冷如铁。崇祯殉节密报与李闯入京急报横陈案头。"),
      createBeat("多尔衮", "两白旗统帅，按刀厉声", "npc", "left", "“明帝既死，天赐良机！发八旗重兵南下劫掠人口金帛，回师关外坐山观虎斗！”"),
      createBeat("范文程", "文胆降臣，泣血叩首", "npc", "right", "“王爷差矣！昔日抢掠乃部落所为，今日中原无主，正当代天申讨，以仁义收抚海内人心！”"),
      createBeat("天命玄机", "【内在直觉 · 霸业天平】", "voice-court", "center", "“是行部落掠夺之实、效汉化定鼎之治，抑或联合漠南蒙古，三条大道在此分晓。”")
    ],
    choices: [
      createChoice("【支脉 A · 铁骑犁庭】赞同多尔衮之谋，八旗主力倾巢南下，以狂暴骑射摧毁九边防御！", "铁骑犁庭 · 掠夺征伐", { authority: +6, pragmatism: +4, progress: -2, cognition: +1 }, 11, false, "qing_act2_iron"),
      createChoice("【支脉 B · 汉化文治】采纳范文程之策，严禁杀掠，颁布安民恩诏，开科取士收抚中原！", "尊孔汉化 · 定鼎法统", { authority: +4, pragmatism: +5, progress: +4, cognition: +5 }, 10, false, "qing_act2_civil"),
      createChoice("【支脉 C · 漠南会盟】遣使联络察哈尔与科尔沁草原诸部，以满蒙联姻组建五十万塞外铁骑！", "满蒙同盟 · 塞外雄鹰", { authority: +5, pragmatism: +4, progress: +2, cognition: +4 }, 11, false, "qing_act2_steppe"),
      createChoice("【🌿 AI局外外推】雪夜单骑秘会山海关吴三桂密使，商议开关复仇暗约！", "秘谍策反 · 自由外推", { authority: +2, pragmatism: +6, progress: +3, cognition: +6 }, 10, true, null, "qing_act2_civil")
    ],
    sutureHints: "若此前在外推中接触过关宁将领或截获锦衣卫密信，范文程与多尔衮的进言将以该密约条陈为核心争辩支点。"
  },

  // Stage 2
  "qing_act2_iron": {
    id: "qing_act2_iron",
    actNumber: 2, trunk: "A", trunkName: "支脉 A · 铁骑犁庭线",
    title: "第二幕A：风雪围城 · 白巴牙喇与重矢破阵",
    coords: "qing:mukden",
    desc: "山海险关雪落如盖，八旗精锐白巴牙喇大弓齐射，红衣大将军炮轰击冰峰，血肉长城在狂澜中战栗。",
    originalBeats: [
      createBeat("旁白", "山海险隘 · 关前阵地", "narrator", "center", "狂风呼啸，重箭破空。八旗骑兵重重包围关城，降明降将请命劝降，杀声震天。")
    ],
    choices: [
      createChoice("【分歧 3A-1 · 屠城震慑】攻破关塞后纵兵屠戮，以雷霆恐怖震慑江南九郡！", "修罗血海", { authority: +7, pragmatism: +2, progress: -3, cognition: 0 }, 12, false, "qing_act3_iron_slaughter"),
      createChoice("【分歧 3A-2 · 乌真超哈】调集汉军重炮营抵近狂轰，以绝对火力粉碎一切抵抗！", "红衣重炮", { authority: +5, pragmatism: +5, progress: +3, cognition: +3 }, 10, false, "qing_act3_iron_cannon"),
      createChoice("【分歧 3A-3 · 顿兵绝境】久攻坚城不下，关外后路遭朝鲜与义军截击，粮草告罄！", "进退失据", { authority: +2, pragmatism: -4, progress: -3, cognition: -2 }, 13, false, "qing_act3_iron_exhaustion"),
      createChoice("【🌿 AI局外外推】亲率巴牙喇突入守军粮仓暗杀守将！", "斩首行动", { authority: +4, pragmatism: +6, progress: +2, cognition: +4 }, 11, true, null, "qing_act3_iron_slaughter")
    ]
  },
  "qing_act2_civil": {
    id: "qing_act2_civil",
    actNumber: 2, trunk: "B", trunkName: "支脉 B · 汉化文治线",
    title: "第二幕B：三田降表 · 文德绥服与降臣文辩",
    coords: "qing:mukden",
    desc: "黄幔行营外秋毫无犯。白发苍苍的前朝学道官与缙绅父老手捧户籍金册跪伏于雪地，降臣范文程肃立阶前，代天宣读定鼎德音。",
    originalBeats: [
      createBeat("旁白", "畿辅行营 · 德音宣播", "narrator", "center", "士绅耆老进呈户籍图册，范文程力陈满汉一家，文武并重。")
    ],
    choices: [
      createChoice("【分歧 3B-1 · 开科取士】立即定都北京，开恩科延揽海内士子，尊孔重道！", "尊孔正统", { authority: +4, pragmatism: +5, progress: +5, cognition: +6 }, 10, false, "qing_act3_civil_exam"),
      createChoice("【分歧 3B-2 · 为帝发丧】全军缟素，以讨逆除暴之名诛灭流寇，收揽民心！", "大义讨贼", { authority: +5, pragmatism: +6, progress: +3, cognition: +5 }, 10, false, "qing_act3_civil_mourn"),
      createChoice("【分歧 3B-3 · 宗室反噬】八旗老贝勒因不满汉化权势被削，密谋盛京政变废黜大汗！", "汗廷内讧", { authority: +3, pragmatism: -4, progress: -2, cognition: +2 }, 12, false, "qing_act3_civil_backlash"),
      createChoice("【🌿 AI局外外推】密访隐居江南的顾炎武、黄宗羲等遗民大儒，探寻治世心学！", "求访大贤", { authority: +1, pragmatism: +5, progress: +5, cognition: +7 }, 10, true, null, "qing_act3_civil_exam")
    ]
  },
  "qing_act2_steppe": {
    id: "qing_act2_steppe",
    actNumber: 2, trunk: "C", trunkName: "支脉 C · 漠南联盟线",
    title: "第二幕C：漠南会盟 · 满蒙姻盟与神矛指日",
    coords: "mongol:steppe",
    desc: "察哈尔与科尔沁汗王云集，金帐外烤全羊与马奶酒飘香。皇太极与诸部汗王刺血为盟，共同誓师入主中原。",
    originalBeats: [
      createBeat("旁白", "漠南金帐 · 盟誓大会", "narrator", "center", "九斿白纛与八旗龙旗迎风招展，战马长嘶，数十万草原雄师整装待发。")
    ],
    choices: [
      createChoice("【分歧 3C-1 · 铁骑入关】满蒙弓骑合流，从喜峰口与居庸关多路突袭，席卷华北平原！", "横扫幽燕", { authority: +6, pragmatism: +4, progress: +2, cognition: +3 }, 11, false, "qing_act3_steppe_charge"),
      createChoice("【分歧 3C-2 · 黄教封圣】延请西藏五世达赖喇嘛喇嘛金印加持，以转轮圣王名义号令北疆！", "政教合一", { authority: +4, pragmatism: +6, progress: +4, cognition: +6 }, 10, false, "qing_act3_steppe_lama"),
      createChoice("【分歧 3C-3 · 草原叛盟】科尔沁因分赃不均与后金交恶，夜袭盛京粮道大反目！", "后路起火", { authority: +2, pragmatism: -5, progress: -3, cognition: +1 }, 13, false, "qing_act3_steppe_fracture"),
      createChoice("【🌿 AI局外外推】单骑出猎塞外追索传国玉玺真实下落！", "玉玺寻踪", { authority: +3, pragmatism: +6, progress: +3, cognition: +6 }, 11, true, null, "qing_act3_steppe_lama")
    ]
  },

  // Stage 3 (9 Nodes)
  "qing_act3_iron_slaughter": {
    id: "qing_act3_iron_slaughter", actNumber: 3, trunk: "A",
    title: "第三幕A1：扬州十日 · 铁血杀戮与江南泣血",
    coords: "jiangnan:mid",
    desc: "铁蹄踏碎繁华古城，血染运河。江南士林在雷霆屠戮下颤栗低头，但深仇大恨亦深植于地脉。",
    originalBeats: [createBeat("旁白", "焦土古城", "narrator", "center", "残垣断壁，杀气冲霄。八旗铁甲以无情兵锋荡平抵抗。")],
    choices: [createChoice("【终章推进】以绝对杀伐奠定威权，建立铁血大清！", "铁血定鼎", { authority: +7 }, 10, false, "qing_act4_iron_empire")]
  },
  "qing_act3_iron_cannon": {
    id: "qing_act3_iron_cannon", actNumber: 3, trunk: "A",
    title: "第三幕A2：乌真超哈 · 红衣巨炮猛轰山河",
    coords: "beijing:high",
    desc: "汉军八旗重炮营成为战场主宰，百门巨炮昼夜狂轰，城垣化为平地。八旗完成了从纯弓骑向近代重火力的跃迁。",
    originalBeats: [createBeat("旁白", "炮火前线", "narrator", "center", "硝烟蔽日，钢铁巨炮震塌千丈关墙。敌军在惊恐中瓦解。")],
    choices: [createChoice("【终章推进】以重装火炮军团横扫九洲，定鼎新朝！", "火器定鼎", { authority: +5 }, 10, false, "qing_act4_heavy_artillery")]
  },
  "qing_act3_iron_exhaustion": {
    id: "qing_act3_iron_exhaustion", actNumber: 3, trunk: "A",
    title: "第三幕A3：关外空虚 · 辽东失守退守白山",
    coords: "qing:mukden",
    desc: "主力顿兵关内坚城，朝鲜与明廷义军断绝粮道。盛京告急，八旗精锐只得仓皇撤回关外。",
    originalBeats: [createBeat("旁白", "风雪归途", "narrator", "center", "粮尽援绝，战旗凋零。雄心勃勃的入关大计在寒风中折翼。")],
    choices: [createChoice("【终章推进】接受现实，退守关外辽东固守白山黑水。", "退守塞外", { authority: -4 }, 10, false, "qing_act4_collapse_north")]
  },
  "qing_act3_civil_exam": {
    id: "qing_act3_civil_exam", actNumber: 3, trunk: "B",
    title: "第三幕B1：开科取士 · 顺治即位尊孔安民",
    coords: "beijing:high",
    desc: "文渊阁重开恩科，万名汉人士子入京应试。顺治帝亲临孔庙行三跪九叩礼，华夏文运与新朝法统融为一体。",
    originalBeats: [createBeat("旁白", "文庙祭孔", "narrator", "center", "钟鼓齐鸣，儒生咸服。天下士林终于认可新君为受命于天之圣天子。")],
    choices: [createChoice("【终章推进】满汉一家，开创文治隆盛的康乾盛世基业！", "儒圣盛世", { authority: +4 }, 10, false, "qing_act4_confucian_peace")]
  },
  "qing_act3_civil_mourn": {
    id: "qing_act3_civil_mourn", actNumber: 3, trunk: "B",
    title: "第三幕B2：为帝发丧 · 讨逆之师天下归心",
    coords: "beijing:high",
    desc: "全军白甲白旗，公开为崇祯帝举办国葬，痛斥李闯弑君逆伦。四方缙绅望风归顺，大顺军如土崩瓦解。",
    originalBeats: [createBeat("旁白", "帝陵哀思", "narrator", "center", "哭临三日，大义凛然。新朝赢得了无可辩驳的道德正统制高点。")],
    choices: [createChoice("【终章推进】以正统讨逆之师定鼎九州，天下四海皆宾服！", "法统大成", { authority: +6 }, 10, false, "qing_act4_righteous_dynasty")]
  },
  "qing_act3_civil_backlash": {
    id: "qing_act3_civil_backlash", actNumber: 3, trunk: "B",
    title: "第三幕B3：贵族政变 · 八旗争衡汗廷裂变",
    coords: "qing:mukden",
    desc: "八旗老贵族在盛京斩杀汉官谋士，拒绝汉化剃发政策。关内先锋与关外汗廷彻底分裂，政局动荡。",
    originalBeats: [createBeat("旁白", "汗宫刀光", "narrator", "center", "部族传统与中央集权的对撞酿成惨剧，权力在中枢撕裂。")],
    choices: [createChoice("【终章推进】接受二汗分立，王朝陷入漫长的内耗重组。", "双重割据", { authority: -3 }, 10, false, "qing_act4_noble_divide")]
  },
  "qing_act3_steppe_charge": {
    id: "qing_act3_steppe_charge", actNumber: 3, trunk: "C",
    title: "第三幕C1：满蒙合流 · 三十万骑席卷幽燕",
    coords: "qing:mukden",
    desc: "大漠长风与八旗重骑合而为一，狂暴的骑兵风暴突破长城诸关，以摧枯拉朽之势席卷中原腹地。",
    originalBeats: [createBeat("旁白", "塞外铁流", "narrator", "center", "尘土遮天，万马奔腾。欧亚大陆最庞大的游牧集群在此展现毁灭性战力。")],
    choices: [createChoice("【终章推进】建立横跨草原与中原的超级欧亚大帝国！", "长生天大国", { authority: +6 }, 10, false, "qing_act4_steppe_superpower")]
  },
  "qing_act3_steppe_lama": {
    id: "qing_act3_steppe_lama", actNumber: 3, trunk: "C",
    title: "第三幕C2：黄教封圣 · 达赖金印共奉转轮",
    coords: "qing:mukden",
    desc: "西藏法王亲临汗庭，奉大清皇帝为转轮圣王文殊菩萨化身。漠南、漠北与青藏各部一体臣服，边疆固若金汤。",
    originalBeats: [createBeat("旁白", "法号悠扬", "narrator", "center", "金册玉印，梵钟长鸣。政教合一的权威让北方游牧部族永世归心。")],
    choices: [createChoice("【终章推进】以佛化圣王之尊，统御万邦无疆版图！", "转轮佛统", { authority: +5 }, 10, false, "qing_act4_buddhist_realm")]
  },
  "qing_act3_steppe_fracture": {
    id: "qing_act3_steppe_fracture", actNumber: 3, trunk: "C",
    title: "第三幕C3：草原反目 · 科尔沁私通背盟突袭",
    coords: "mongol:steppe",
    desc: "蒙古部族突然倒戈反扑，八旗北翼受重创。草原各部再次陷入混战，塞外局势陷入僵局。",
    originalBeats: [createBeat("旁白", "草原狼烟", "narrator", "center", "白纛折断，盟约化为飞灰。北疆烽火重新燃起。")],
    choices: [createChoice("【终章推进】困于塞外旷日持久的平叛战火之中。", "边疆泥潭", { authority: -2 }, 10, false, "qing_act4_steppe_war")]
  },

  // Stage 4 (9 Endings)
  "qing_act4_iron_empire": {
    id: "qing_act4_iron_empire", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】铁血修罗 · 高压军管定鼎中原", coords: "beijing:high",
    desc: "以铁腕荡平江南抗清势力，建立了严酷完备的八旗驻防体系，以血火维系着天下统治。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "你以雷霆手段夺取了天下，留下了不可磨灭的铁血威名与千古争论。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_heavy_artillery": {
    id: "qing_act4_heavy_artillery", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】钢铁洪流 · 火炮八旗近代帝国", coords: "beijing:high",
    desc: "依靠重炮营与火器化陆军横扫东亚，大清帝国成为东亚最庞大的火器热兵器强国。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "钢铁与火药改写了历史，新朝的炮声宣告了一个火器帝国的崛起。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_collapse_north": {
    id: "qing_act4_collapse_north", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】顿兵绝境 · 偏安辽东白山黑水", coords: "qing:mukden",
    desc: "入关受挫，八旗退守辽东。中原陷入明清流寇长期拉锯的三国杀混战局面。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "白山黑水依旧凛冽，盛京汗庭未能越过那座天下第一关。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_confucian_peace": {
    id: "qing_act4_confucian_peace", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】儒圣盛世 · 满汉一体仁政大统", coords: "beijing:high",
    desc: "开科取士，轻徭薄赋。满汉士大夫同心协力，天下迅速迎来了一场文化繁荣的大一统治世。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "礼乐教化重归神州，你成为华夏士林由衷敬仰的千古仁君。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_righteous_dynasty": {
    id: "qing_act4_righteous_dynasty", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】正统归一 · 大义讨贼定鼎华夏", coords: "beijing:high",
    desc: "以崇祯殉国复仇之名抚定天下，法统无可挑剔，前朝文臣武将尽数忠心归附。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "名正言顺，天命所归。你以无懈可击的大义完成了华夏定鼎。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_noble_divide": {
    id: "qing_act4_noble_divide", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】二汗分裂 · 关内关外割据并峙", coords: "qing:mukden",
    desc: "汉化与保旧两派彻底撕裂，关外八旗保守汗廷与北京中央朝廷陷入长期分立与对立。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "政见之分终于演化为山河之裂，权力之争永远没有终点。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_steppe_superpower": {
    id: "qing_act4_steppe_superpower", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】长生天汗国 · 欧亚游牧超级帝国", coords: "qing:mukden",
    desc: "满蒙一体，弓骑无敌。版图横跨贝加尔湖至南海之滨，再现蒙元极盛疆域。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "大漠的长风吹拂着辽阔的帝国，一个前所未有的庞然大物屹立于欧亚大陆。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_buddhist_realm": {
    id: "qing_act4_buddhist_realm", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】转轮圣王 · 佛光普照北疆极境", coords: "qing:mukden",
    desc: "以藏传佛教统摄蒙古与西藏各部，建立起稳如泰山的雪域与大漠政教同盟。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "梵音长诵，边患永息。你以慈悲与威仪并济的手段，换来了数百年的北疆安宁。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "qing_act4_steppe_war": {
    id: "qing_act4_steppe_war", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】北疆狼烟 · 满蒙互噬消耗战乱", coords: "mongol:steppe",
    desc: "同盟破裂后，北疆深陷残酷的互噬内战，南方明军与义军借此获得喘息重生良机。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "大漠飞沙掩埋了雄图霸业，草原再次成为喋血的修罗场。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  }
};

// 3. 蒙古大漠 1 -> 3 -> 9
const mongolNodes = {
  "mongol_act1": {
    id: "mongol_act1", actNumber: 1,
    title: "第一幕：大漠白纛 · 传国玉玺与北元绝局", coords: "mongol:steppe",
    desc: "天苍苍野茫茫，斡难河上风声萧萧。林丹汗的大金帐中，九斿白纛苏勒德神矛猎猎作响。来自盛京的金印逼婚使者与北京的户部赏银密使同时抵达帐外。",
    originalBeats: [
      createBeat("旁白", "漠南大金帐 · 朔风白纛", "narrator", "center", "朔风如刀，九斿白纛在阴沉的长生天下飘扬。案头锦盒中横陈着两道书信与传国玉玺的下落线索。"),
      createBeat("察哈尔万户", "拔刀怒视盛京使节", "npc", "left", "“大汗！满洲建州奴子算甚么东西，竟敢逼索我成吉思汗黄金家族玉玺！唯死战而已！”"),
      createBeat("科尔沁使臣", "冷笑按剑", "npc", "right", "“大汗三思！八旗铁骑所向无敌，明廷岁币不过空文！若与后金联姻会盟，草原方能免遭生灵涂炭！”")
    ],
    choices: [
      createChoice("【支脉 A · 瀚海死战】拔刀誓师，号令察哈尔八万铁骑与后金八旗血战到底，绝不交出玉玺！", "铁血尊严 · 黄金血脉", { authority: +6, pragmatism: -3, progress: +1, cognition: +2 }, 12, false, "mongol_act2_war"),
      createChoice("【支脉 B · 满蒙姻盟】虚与委蛇接受满洲联姻，以交出玉玺为诱饵索要关外亲王世袭特权！", "权衡媾和 · 盟旗同盟", { authority: +3, pragmatism: +6, progress: +3, cognition: +5 }, 10, false, "mongol_act2_peace"),
      createChoice("【支脉 C · 西奔青海】避实就虚，率察哈尔精锐西奔青海西藏，开辟和硕特汗国新天地！", "远遁西陲 · 避锐蓄势", { authority: +2, pragmatism: +5, progress: +5, cognition: +6 }, 11, false, "mongol_act2_west"),
      createChoice("【🌿 AI局外外推】亲率巴特尔死士潜入阿尔泰山秘境，探寻窝阔台隐藏的黄金宝藏！", "绝域探险 · 自由外推", { authority: +1, pragmatism: +6, progress: +4, cognition: +6 }, 10, true, null, "mongol_act2_peace")
    ],
    sutureHints: "若此前在外推中获取了蒙古秘史古卷或汗印碎片，三大阵营使节的态度将剧烈转变。"
  },
  "mongol_act2_war": {
    id: "mongol_act2_war", actNumber: 2, trunk: "A", trunkName: "支脉 A · 瀚海决战线",
    title: "第二幕A：瀚海长枪 · 察哈尔铁骑决死战", coords: "mongol:steppe",
    desc: "拒降之后，后金两翼大军兵临大漠。察哈尔勇士引弓搭箭，在呼伦贝尔大草原展开血战。",
    originalBeats: [createBeat("旁白", "草原血战", "narrator", "center", "万骑奔腾，马刀互砍，长生天下满是战死勇士的悲声。")],
    choices: [
      createChoice("【分歧 3A-1 · 突袭居庸】孤注一掷突袭长城居庸关，直逼北京城下逼迫明帝发饷！", "突击幽燕", { authority: +6 }, 11, false, "mongol_act3_war_beijing"),
      createChoice("【分歧 3A-2 · 奇袭辽阳】利用骑兵机动反插辽西，焚烧后金老巢粮仓同归于尽！", "焚敌粮仓", { authority: +5 }, 11, false, "mongol_act3_war_mukden"),
      createChoice("【分歧 3A-3 · 大红山绝境】八旗合围大红山，察哈尔主力陷入重围弹尽粮绝！", "绝地悲歌", { authority: -2 }, 13, false, "mongol_act3_war_laststand"),
      createChoice("【🌿 AI局外外推】雪夜潜入满军大营刺杀先锋固山额真！", "敌后刺杀", { authority: +3 }, 11, true, null, "mongol_act3_war_beijing")
    ]
  },
  "mongol_act2_peace": {
    id: "mongol_act2_peace", actNumber: 2, trunk: "B", trunkName: "支脉 B · 满蒙姻盟线",
    title: "第二幕B：金印归汗 · 盛京盟约与八旗兼并",
    coords: "mongol:steppe",
    desc: "传国玉玺送抵盛京，皇太极尊林丹汗遗孀为后妃。草原与八旗开启共融，但部族独立性正被悄然侵蚀。",
    originalBeats: [createBeat("旁白", "盛京联姻", "narrator", "center", "金帐送入沈阳，长生天的子孙在富丽的宫阙中领受亲王冠服。")],
    choices: [
      createChoice("【分歧 3B-1 · 满蒙共治】在汗廷建立蒙古议事院，确立满蒙天子共尊制度！", "共主天下", { authority: +5 }, 10, false, "mongol_act3_peace_joint"),
      createChoice("【分歧 3B-2 · 索要岁币】游走于明清之间大索岁币，坐收渔人之利！", "渔翁得利", { authority: +3 }, 10, false, "mongol_act3_peace_tribute"),
      createChoice("【分歧 3B-3 · 编旗析产】后金强推盟旗制度，察哈尔诸部被拆解为四十九旗！", "丧失自治", { authority: -3 }, 12, false, "mongol_act3_peace_absorbed"),
      createChoice("【🌿 AI局外外推】暗中扶植蒙古亲王在关内的商业据点！", "经商筑底", { authority: +2 }, 10, true, null, "mongol_act3_peace_joint")
    ]
  },
  "mongol_act2_west": {
    id: "mongol_act2_west", actNumber: 2, trunk: "C", trunkName: "支脉 C · 西奔青海线",
    title: "第二幕C：远遁西陲 · 祁连风雪与入藏弘法",
    coords: "mongol:steppe",
    desc: "翻越祁连山，察哈尔残部抵达青海湖畔。黄教高僧持哈达相迎，西域广袤天地在大汗眼前展开。",
    originalBeats: [createBeat("旁白", "高原圣湖", "narrator", "center", "蓝天如洗，经幡飘动。黄金家族在雪域高原找到了复兴的火种。")],
    choices: [
      createChoice("【分歧 3C-1 · 护法格鲁】率军平定西藏反抗势力，确立格鲁派政权建立和硕特汗国！", "雪域法王", { authority: +6 }, 10, false, "mongol_act3_west_tibet"),
      createChoice("【分歧 3C-2 · 称霸中亚】联合准噶尔部截断丝绸之路，向西建立中亚帝国！", "雄霸中亚", { authority: +5 }, 10, false, "mongol_act3_west_silk"),
      createChoice("【分歧 3C-3 · 风雪离散】高原严寒与瘟疫肆虐，部族牛羊大批冻死陷入困境！", "高原大劫", { authority: -4 }, 13, false, "mongol_act3_west_plague"),
      createChoice("【🌿 AI局外外推】拜会布达拉宫活佛获取密宗护法秘法！", "藏地秘行", { authority: +3 }, 11, true, null, "mongol_act3_west_tibet")
    ]
  },
  // Stage 3 (9 Nodes)
  "mongol_act3_war_beijing": {
    id: "mongol_act3_war_beijing", actNumber: 3, trunk: "A",
    title: "第三幕A1：突袭居庸 · 蒙古铁骑勒马紫禁", coords: "beijing:high",
    desc: "数万精骑越过居庸关，大明京师九门紧闭。草原雄鹰再次傲立于紫禁城外，改写了明亡格局。",
    originalBeats: [createBeat("旁白", "长城烽烟", "narrator", "center", "马蹄踏破关山，长生天的战歌回荡在幽燕大地上。")],
    choices: [createChoice("【终章推进】再现北元雄风，逼和天下！", "北元中兴", { authority: +6 }, 10, false, "mongol_act4_yuan_restoration")]
  },
  "mongol_act3_war_mukden": {
    id: "mongol_act3_war_mukden", actNumber: 3, trunk: "A",
    title: "第三幕A2：焚烧辽阳 · 与八旗同归于尽", coords: "qing:mukden",
    desc: "深入敌后焚毁后金三座大粮仓，彻底迟滞了清军入关的时间表，黄金家族虽死犹荣。",
    originalBeats: [createBeat("旁白", "烈火辽阳", "narrator", "center", "火光吞噬了粮草，草原勇士以生命捍卫了尊严。")],
    choices: [createChoice("【终章推进】以壮烈之躯铸就草原不朽传说！", "虽败犹荣", { authority: +4 }, 10, false, "mongol_act4_heroic_sacrifice")]
  },
  "mongol_act3_war_laststand": {
    id: "mongol_act3_war_laststand", actNumber: 3, trunk: "A",
    title: "第三幕A3：大红山绝战 · 白纛折戟绝命哀歌", coords: "mongol:steppe",
    desc: "大红山血流成河，察哈尔主力全军覆没，林丹汗病殁草莽，北元最后一丝火种熄灭。",
    originalBeats: [createBeat("旁白", "绝岭斜阳", "narrator", "center", "苏勒德神矛折断，大漠英雄的时代走向终结。")],
    choices: [createChoice("【终章推进】接受大漠的无情审判，归于尘土。", "大漠残阳", { authority: -5 }, 10, false, "mongol_act4_desert_ruin")]
  },
  "mongol_act3_peace_joint": {
    id: "mongol_act3_peace_joint", actNumber: 3, trunk: "B",
    title: "第三幕B1：满蒙共治 · 龙凤双尊共治乾坤", coords: "qing:mukden",
    desc: "清帝兼任蒙古大汗博格达汗，蒙古王公在中央参预大政，形成了独特的双元帝国结构。",
    originalBeats: [createBeat("旁白", "双尊盛典", "narrator", "center", "金座并列，草原与中原达成空前的政治互信。")],
    choices: [createChoice("【终章推进】共创满蒙联合王权的辉煌历史！", "联合帝国", { authority: +5 }, 10, false, "mongol_act4_co_emperors")]
  },
  "mongol_act3_peace_tribute": {
    id: "mongol_act3_peace_tribute", actNumber: 3, trunk: "B",
    title: "第三幕B2：左右逢源 · 大漠中立安享岁币", coords: "mongol:steppe",
    desc: "巧妙在大明与大清之间保持中立，双方争相结好送上金银绢帛，大漠部族安居乐业。",
    originalBeats: [createBeat("旁白", "驼队盈门", "narrator", "center", "两京财物汇聚草原，游牧文明在和平中繁衍兴盛。")],
    choices: [createChoice("【终章推进】缔造草原中立乐土，笑看风云！", "大漠中立", { authority: +3 }, 10, false, "mongol_act4_steppe_broker")]
  },
  "mongol_act3_peace_absorbed": {
    id: "mongol_act3_peace_absorbed", actNumber: 3, trunk: "B",
    title: "第三幕B3：编旗析产 · 雄鹰落网化为臣仆", coords: "mongol:steppe",
    desc: "盟旗细分，互不相属。昔日纵横天下的雄鹰被牢牢锁死在划定的草场之内，再无争雄可能。",
    originalBeats: [createBeat("旁白", "界石深立", "narrator", "center", "草场划分界线，铁血弓骑终究被官僚文书消磨了棱角。")],
    choices: [createChoice("【终章推进】接受划疆编旗的宿命归宿。", "盟旗枷锁", { authority: -3 }, 10, false, "mongol_act4_banner_feudalism")]
  },
  "mongol_act3_west_tibet": {
    id: "mongol_act3_west_tibet", actNumber: 3, trunk: "C",
    title: "第三幕C1：入藏护法 · 固始汗开创雪域神邦", coords: "mongol:steppe",
    desc: "进军拉萨，拥戴五世达赖喇嘛，建立和硕特汗国。草原健儿成为青藏雪域的最高武装统治者。",
    originalBeats: [createBeat("旁白", "布达拉宫", "narrator", "center", "法号震天，黄金家族在世界屋脊建立起永恒的法王王朝。")],
    choices: [createChoice("【终章推进】登基和硕特汗国最高统治者！", "雪域法王", { authority: +6 }, 10, false, "mongol_act4_tibet_guardian")]
  },
  "mongol_act3_west_silk": {
    id: "mongol_act3_west_silk", actNumber: 3, trunk: "C",
    title: "第三幕C2：雄霸丝路 · 准察联手威震中亚", coords: "mongol:steppe",
    desc: "控制河西走廊与西域三十六国，恢复成吉思汗西征商道，成为中亚最强大的军事力量。",
    originalBeats: [createBeat("旁白", "大漠绿洲", "narrator", "center", "驼铃清脆，战刀森严。古老的丝绸之路重新臣服于黄金家族。")],
    choices: [createChoice("【终章推进】加冕中亚大汗，重写欧亚历史！", "中亚霸王", { authority: +5 }, 10, false, "mongol_act4_central_asia_khan")]
  },
  "mongol_act3_west_plague": {
    id: "mongol_act3_west_plague", actNumber: 3, trunk: "C",
    title: "第三幕C3：风雪离散 · 高原酷寒部族崩解", coords: "mongol:steppe",
    desc: "暴风雪与罕见瘟疫袭击青海大营，牛羊倒毙，诸部争夺水源四散逃亡，西征大计彻底破灭。",
    originalBeats: [createBeat("旁白", "冰封长夜", "narrator", "center", "大自然展现了残酷的威力，部族的哀歌消失在漫天风雪中。")],
    choices: [createChoice("【终章推进】无奈看着曾经的辉煌在大风中消散。", "绝域长逝", { authority: -5 }, 10, false, "mongol_act4_lost_nomads")]
  },
  // Stage 4 (9 Endings)
  "mongol_act4_yuan_restoration": {
    id: "mongol_act4_yuan_restoration", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】北元中兴 · 黄金家族重振雄风", coords: "mongol:steppe",
    desc: "勒马长城，威震九洲。成吉思汗的血脉在至暗时刻完成奇迹复苏，再续三百年国祚。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "长生天的雄鹰重新翱翔于华夏苍穹，你谱写了一曲跌宕起伏的英雄壮歌。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_heroic_sacrifice": {
    id: "mongol_act4_heroic_sacrifice", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】虽败犹荣 · 大漠骑士绝唱千古", coords: "mongol:steppe",
    desc: "察哈尔八万健儿死战无一降，虽死国灭，但蒙古民族的刚烈风骨在青史中熠熠生辉。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "浩气长存，马革裹尸。草原儿女在篝火旁永远传唱着你们的英名。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_desert_ruin": {
    id: "mongol_act4_desert_ruin", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】大漠残阳 · 黄金家族血脉凋零", coords: "mongol:steppe",
    desc: "汗统终结，察哈尔部族被兼并。大漠深处唯余风沙长叹，成吉思汗直系绝嗣。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "黄沙掩埋了金冠，一个伟大的游牧帝国在此落下了最后的帷幕。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_co_emperors": {
    id: "mongol_act4_co_emperors", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】满蒙共主 · 草原亲王世袭双元", coords: "qing:mukden",
    desc: "满蒙血脉彻底融为一体，蒙古亲王世守北疆，分享天下一统的无上权势与尊荣。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "权力与姻盟交织出新的帝国基石，你为草原赢得了最体面的历史地位。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_steppe_broker": {
    id: "mongol_act4_steppe_broker", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】大漠中立 · 避世繁盛贸易乐土", coords: "mongol:steppe",
    desc: "大漠成为各方势力的中立缓冲带，游牧与商贸繁盛，避免了卷入残酷的中原战火。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "不争即是大争。你在乱世中保全了草原的生机，造就了一方乐土。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_banner_feudalism": {
    id: "mongol_act4_banner_feudalism", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】盟旗禁锢 · 游牧雄鹰失却羽翼", coords: "mongol:steppe",
    desc: "四十九旗编定，部族被文书与界桩分割禁锢，曾经威震欧亚的铁骑彻底驯服。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "制度消解了野性，英雄的狂澜最终平息在整齐的户册档案之中。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_tibet_guardian": {
    id: "mongol_act4_tibet_guardian", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】雪域法王 · 和硕特汗国永镇青藏", coords: "mongol:steppe",
    desc: "移师青藏，开创政教合一的和硕特汗国，成为藏传佛教至高无上的守护者。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "雪山与经幡见证了你的新生，黄金家族在高原圣域写下了璀璨篇章。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_central_asia_khan": {
    id: "mongol_act4_central_asia_khan", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】中亚雄霸 · 丝路帝国重现荣光", coords: "mongol:steppe",
    desc: "向西打通中亚走廊，重组察合台与伊利汗国旧地，建立了雄踞内陆的商贸军事大国。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "西征的战旗重新唤醒了古老的大陆，你在西方重建了蒙古帝国的威权。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "mongol_act4_lost_nomads": {
    id: "mongol_act4_lost_nomads", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】风雪长逝 · 部族融于大漠风沙", coords: "mongol:steppe",
    desc: "严酷的自然与无休止的争夺让部族四散离析，黄金家族的最后一抹光彩融入历史黄沙。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "风沙吹过空旷的营地，那些曾经震撼世界的呐喊，终于归于沉寂。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  }
};

// 4. 南国海邦 1 -> 3 -> 9
const nanmingNodes = {
  "nanming_act1": {
    id: "nanming_act1", actNumber: 1,
    title: "第一幕：秦淮残照 · 弘光草创与水太冷之辩", coords: "nanming:maritime",
    desc: "崇祯殉节急报传至金陵，留都朝野大震。马士英拥立福王弘光登基，秦淮水榭欢歌未歇，而清军铁骑已渡黄河。钱谦益临水长叹‘水太冷不能下’，柳如是愤然欲投水殉国。",
    originalBeats: [
      createBeat("旁白", "秦淮水榭 · 金陵留都", "narrator", "center", "画舫笙歌，残阳染血。案头横陈着弘光帝登基即位诏书与史可法请兵北伐血疏。"),
      createBeat("礼部尚书 · 钱谦益", "手抚冰冷河水，颤声长叹", "npc", "left", "“柳夫人……非我不欲殉国，实是……此水太冷，不能下啊！”"),
      createBeat("柳如是", "素衣如雪，拔簪怒斥", "npc", "right", "“朝廷养士三百年，临难竟无一人是男儿！大明江山，皆断送于尔等清流口舌之辈！”"),
      createBeat("国运抉择", "【内在直觉 · 存亡罗盘】", "voice-court", "center", "“江北四镇拥兵自重，郑氏水师坐拥海疆。是渡海拓辟台湾、血守扬州江防，抑或联络大西军李定国西南反攻？”")
    ],
    choices: [
      createChoice("【支脉 A · 东渡拓台】支持郑成功开辟台湾承天府，以大洋战舰与海外白银经营不败基地！", "海洋霸权 · 开辟新天", { authority: +3, pragmatism: +6, progress: +7, cognition: +5 }, 11, false, "nanming_act2_taiwan"),
      createChoice("【支脉 B · 誓死守江】支持史可法进驻扬州督师，调集江北四镇死守长江天险，誓死不降！", "孤忠死节 · 正统守国", { authority: +5, pragmatism: -2, progress: +2, cognition: +3 }, 12, false, "nanming_act2_nanjing"),
      createChoice("【支脉 C · 西南合流】派遣密使奔赴云贵，联合大西军余部李定国、刘文秀，以象兵与火器两蹶名王！", "联寇抗清 · 孤注一掷", { authority: +4, pragmatism: +5, progress: +5, cognition: +6 }, 10, false, "nanming_act2_warlord"),
      createChoice("【🌿 AI局外外推】单舟夜渡长江，秘会西洋耶稣会传教士毕方济，求取澳门葡萄牙雇佣铳队！", "泰西借师 · 自由外推", { authority: +1, pragmatism: +6, progress: +6, cognition: +6 }, 10, true, null, "nanming_act2_taiwan")
    ],
    sutureHints: "若此前在外推中获取了泰西重铳或雇佣军契约，史可法或郑成功开局军备将直接拥有近代炮队。"
  },
  "nanming_act2_taiwan": {
    id: "nanming_act2_taiwan", actNumber: 2, trunk: "A", trunkName: "支脉 A · 东渡拓台线",
    title: "第二幕A：东渡大洋 · 郑氏战舰驱逐红毛", coords: "nanming:maritime",
    desc: "四百艘战船扬帆大洋，攻打台湾热兰遮城。荷兰总督在巨炮轰击下签署降书，东方第一座海外抗清基地宣告诞生。",
    originalBeats: [createBeat("旁白", "热兰遮前线", "narrator", "center", "铁甲水师登陆鹿耳门，万炮轰鸣，红毛夷人狼狈退败。")],
    choices: [
      createChoice("【分歧 3A-1 · 安平筑城】全面营建安平城与承天府，打造东方最大海上自由城邦！", "海上筑基", { authority: +4 }, 10, false, "nanming_act3_taiwan_fort"),
      createChoice("【分歧 3A-2 · 铁人反攻】调集台湾铁人甲军两万精锐，战舰直插长江口反攻南京！", "大举北伐", { authority: +6 }, 11, false, "nanming_act3_taiwan_ironman"),
      createChoice("【分歧 3A-3 · 南洋垄断】与荷兰西班牙签约垄断南洋贸易，建立庞大远东商业托拉斯！", "远东商阀", { authority: +3 }, 10, false, "nanming_act3_taiwan_trade"),
      createChoice("【🌿 AI局外外推】派遣快船勘测菲律宾马尼拉航道建立暗哨！", "大洋谍影", { authority: +2 }, 11, true, null, "nanming_act3_taiwan_fort")
    ]
  },
  "nanming_act2_nanjing": {
    id: "nanming_act2_nanjing", actNumber: 2, trunk: "B", trunkName: "支脉 B · 誓死守江线",
    title: "第二幕B：金陵正气 · 史可法扬州誓师死守", coords: "jiangnan:mid",
    desc: "多铎铁骑兵临城下，史可法血书劝降信断然拒绝。扬州城军民同仇敌忾，誓与长城共存亡。",
    originalBeats: [createBeat("旁白", "扬州城头", "narrator", "center", "白衣督师，刀出鞘弓上弦。滔滔江水见证了气节的巅峰。")],
    choices: [
      createChoice("【分歧 3B-1 · 扬州殉节】率残军在梅花岭死战至最后一刻，以碧血映照千秋正气！", "千秋正气", { authority: +6 }, 12, false, "nanming_act3_nanjing_blood"),
      createChoice("【分歧 3B-2 · 划江坚守】集中水师火炮锁死镇江瓜洲，逼退清军骑兵划江而治！", "隔江抗衡", { authority: +5 }, 10, false, "nanming_act3_nanjing_cross"),
      createChoice("【分歧 3B-3 · 军阀内讧】江北四镇拥兵自重争夺粮草，发生惨烈火并导致防线崩溃！", "自相残杀", { authority: -3 }, 13, false, "nanming_act3_nanjing_faction"),
      createChoice("【🌿 AI局外外推】亲入四镇大营调解将领矛盾！", "力挽狂澜", { authority: +3 }, 11, true, null, "nanming_act3_nanjing_cross")
    ]
  },
  "nanming_act2_warlord": {
    id: "nanming_act2_warlord", actNumber: 2, trunk: "C", trunkName: "支脉 C · 西南合流线",
    title: "第二幕C：西南合流 · 李定国象兵两蹶名王", coords: "nanming:maritime",
    desc: "大西军余部与永历帝合流，李定国统帅滇黔精兵，在桂林与衡州大破清军，阵斩定南王孔有德与敬谨亲王尼堪。",
    originalBeats: [createBeat("旁白", "衡州古战场", "narrator", "center", "象阵冲锋，地裂山崩。清军满洲精锐第一次在南方遭遇毁灭性大败。")],
    choices: [
      createChoice("【分歧 3C-1 · 两蹶名王】乘胜收复两广与湖南，天下抗清局势瞬间逆转！", "名王喋血", { authority: +6 }, 10, false, "nanming_act3_warlord_victory"),
      createChoice("【分歧 3C-2 · 同袍猜忌】孙可望嫉妒大捷同室操戈，暗中降清引狼入室！", "后方背刺", { authority: -4 }, 13, false, "nanming_act3_warlord_betray"),
      createChoice("【分歧 3C-3 · 撤入缅甸】清军多路围剿，永历帝在混乱中退守缅北丛林！", "落难热带", { authority: -3 }, 12, false, "nanming_act3_warlord_burma"),
      createChoice("【🌿 AI局外外推】组织特种游击队深入十万大山截击清军运粮队！", "丛林袭扰", { authority: +3 }, 11, true, null, "nanming_act3_warlord_victory")
    ]
  },
  // Stage 3 (9 Nodes)
  "nanming_act3_taiwan_fort": {
    id: "nanming_act3_taiwan_fort", actNumber: 3, trunk: "A",
    title: "第三幕A1：安平筑城 · 东方海上承天明邦", coords: "nanming:maritime",
    desc: "以台湾为枢纽，兴水利开良田，接纳数十万大陆难民。大明衣冠制度在宝岛蓬勃繁衍。",
    originalBeats: [createBeat("旁白", "承天府外", "narrator", "center", "稻浪翻滚，龙旗飘扬。华夏文明在海上扎下了不灭的根基。")],
    choices: [createChoice("【终章推进】建立繁荣富庶的东方海上独立王邦！", "海上明邦", { authority: +5 }, 10, false, "nanming_act4_ocean_kingdom")]
  },
  "nanming_act3_taiwan_ironman": {
    id: "nanming_act3_taiwan_ironman", actNumber: 3, trunk: "A",
    title: "第三幕A2：铁人反攻 · 艨艟万舰直捣金陵", coords: "jiangnan:mid",
    desc: "铁人披甲，刀枪不入。郑成功率水师逆长江而上直薄南京城下，东南半壁震动响应。",
    originalBeats: [createBeat("旁白", "金陵城下", "narrator", "center", "江涛轰鸣，铁人军攻城拔寨，大明光复指日可待。")],
    choices: [createChoice("【终章推进】以海制陆，一举收复江南半壁！", "海上光复", { authority: +6 }, 10, false, "nanming_act4_maritime_reconquest")]
  },
  "nanming_act3_taiwan_trade": {
    id: "nanming_act3_taiwan_trade", actNumber: 3, trunk: "A",
    title: "第三幕A3：南洋独霸 · 远东香料银贸商阀", coords: "nanming:maritime",
    desc: "掌控吕宋、马六甲与长崎贸易，垄断全球白银流入，蜕变为无与伦比的超级海商财阀。",
    originalBeats: [createBeat("旁白", "海关钱库", "narrator", "center", "万国珍宝汇聚，金银堆积如山，商人的契约胜过朝廷的金印。")],
    choices: [createChoice("【终章推进】成为远东重洋商贸无冕之王！", "重洋商皇", { authority: +4 }, 10, false, "nanming_act4_merchant_prince")]
  },
  "nanming_act3_nanjing_blood": {
    id: "nanming_act3_nanjing_blood", actNumber: 3, trunk: "B",
    title: "第三幕B1：扬州殉节 · 梅花岭下浩气长存", coords: "jiangnan:mid",
    desc: "弹尽粮绝，史可法自刎殉国。梅花岭下立衣冠冢，满城忠烈以不屈的血肉昭示了民族气节。",
    originalBeats: [createBeat("旁白", "梅花古岭", "narrator", "center", "寒梅傲雪，碧血化碧。中华民族的脊梁在浩劫中巍然挺立。")],
    choices: [createChoice("【终章推进】以浩然正气铸就千古不朽的史诗豐碑！", "浩气长存", { authority: +5 }, 10, false, "nanming_act4_heroic_monument")]
  },
  "nanming_act3_nanjing_cross": {
    id: "nanming_act3_nanjing_cross", actNumber: 3, trunk: "B",
    title: "第三幕B2：划江坚守 · 偏安临安复刻南宋", coords: "jiangnan:mid",
    desc: "以长江天堑遏制敌军骑兵，双方形成南北对峙之势。南明政权在江南获得数十年偏安之局。",
    originalBeats: [createBeat("旁白", "大江横陈", "narrator", "center", "水师巡弋江面，烽烟暂熄，江南水乡重现小康繁盛。")],
    choices: [createChoice("【终章推进】开启南北朝长期对峙的崭新历史！", "南宋偏安", { authority: +4 }, 10, false, "nanming_act4_south_song_peace")]
  },
  "nanming_act3_nanjing_faction": {
    id: "nanming_act3_nanjing_faction", actNumber: 3, trunk: "B",
    title: "第三幕B3：军阀自焚 · 江北四镇内耗尽丧", coords: "jiangnan:mid",
    desc: "四镇军阀为争夺地盘拔刀相向，清军乘虚而入一战全歼，南明防线彻底崩溃瓦解。",
    originalBeats: [createBeat("旁白", "军阀残营", "narrator", "center", "自相残杀的悲剧重演，大好江山毁于私心内讧之中。")],
    choices: [createChoice("【终章推进】吞下内耗亡国的苦涩宿命。", "党争自焚", { authority: -5 }, 10, false, "nanming_act4_faction_ruin")]
  },
  "nanming_act3_warlord_victory": {
    id: "nanming_act3_warlord_victory", actNumber: 3, trunk: "C",
    title: "第三幕C1：两蹶名王 · 李定国威震天下", coords: "nanming:maritime",
    desc: "衡州大捷击毙尼堪，黄宗羲赞曰‘微管仲，吾其被发左衽矣’。清廷一度动摇欲割地求和。",
    originalBeats: [createBeat("旁白", "凯旋大旗", "narrator", "center", "名王陨落，神州震动。大明中兴之火在西南十万大山熊熊燃起。")],
    choices: [createChoice("【终章推进】趁胜北伐收复失地，光复大明社稷！", "西南狂澜", { authority: +7 }, 10, false, "nanming_act4_warlord_recovery")]
  },
  "nanming_act3_warlord_betray": {
    id: "nanming_act3_warlord_betray", actNumber: 3, trunk: "C",
    title: "第三幕C2：西南背刺 · 孙可望降清大溃败", coords: "nanming:maritime",
    desc: "内部争权导致叛将出卖了全部山川防务图，吴三桂大军长驱直入，西南基业毁于一旦。",
    originalBeats: [createBeat("旁白", "叛军带路", "narrator", "center", "堡垒终究从内部被攻破，最忠勇的将士倒在了同胞的背叛之下。")],
    choices: [createChoice("【终章推进】在孤军奋战中饮恨败退。", "悲情背刺", { authority: -4 }, 10, false, "nanming_act4_southwest_collapse")]
  },
  "nanming_act3_warlord_burma": {
    id: "nanming_act3_warlord_burma", actNumber: 3, trunk: "C",
    title: "第三幕C3：落难异域 · 咒水之难永历蒙尘", coords: "nanming:maritime",
    desc: "追随者在异国丛林被残忍屠戮，永历帝被俘押回昆明，大明最后的天子走向终曲。",
    originalBeats: [createBeat("旁白", "咒水残滩", "narrator", "center", "异国丛林中血雨纷飞，大明皇统走到了最后的悲凉句点。")],
    choices: [createChoice("【终章推进】伴随这抹血色残阳，送大明最后一程。", "异邦绝唱", { authority: -5 }, 10, false, "nanming_act4_cursed_water")]
  },
  // Stage 4 (9 Endings)
  "nanming_act4_ocean_kingdom": {
    id: "nanming_act4_ocean_kingdom", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】海上明邦 · 承天府东方新世界", coords: "nanming:maritime",
    desc: "台湾生根，龙旗猎猎。东方海洋民主与商贸之花在重洋绽放，开启了华夏海权盛世。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "离开大陆的重负，你在大海之中为华夏文明开辟了一片永恒的伊甸园。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_maritime_reconquest": {
    id: "nanming_act4_maritime_reconquest", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】海上光复 · 铁人重整大明社稷", coords: "jiangnan:mid",
    desc: "逆江反攻大获全胜，光复旧都南京，清廷退回山海关外，大明实现了不可思议的海上中兴奇迹。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "千古未有之壮举！你依靠大洋的力量完成了大陆的光复，名垂青史。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_merchant_prince": {
    id: "nanming_act4_merchant_prince", actNumber: 4, trunk: "A",
    title: "第四幕：【终局】重洋商皇 · 远东香料贸易霸权", coords: "nanming:maritime",
    desc: "摆脱大陆地缘泥潭，专注于海洋财富，构建了横跨日本、南洋与欧亚的远东贸易垄断帝国。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "金银滚滚而来，商船胜过甲兵。你以商人的智慧让华夏之名响彻大洋。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_heroic_monument": {
    id: "nanming_act4_heroic_monument", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】浩气长存 · 梅花冷月忠烈千秋", coords: "jiangnan:mid",
    desc: "扬州虽破，江山虽失，但史可法与扬州军民的不屈骨气，成为支撑华夏精神万代不灭的道德丰碑。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "天地有正气，杂然赋流形。有些失败比胜利更伟大，你们赢得了永恒的灵魂。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_south_song_peace": {
    id: "nanming_act4_south_song_peace", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】南宋偏安 · 划江而治南北并峙", coords: "jiangnan:mid",
    desc: "守住长江防线，与北朝清廷达成均势。天下再度进入长达数十年乃至百年的南北分立格局。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "江水泱泱，南北各安。你以钢铁意志为东南军民撑起了一片遮风避雨的青天。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_faction_ruin": {
    id: "nanming_act4_faction_ruin", actNumber: 4, trunk: "B",
    title: "第四幕：【终局】党争自焚 · 留都倾覆万劫不复", coords: "jiangnan:mid",
    desc: "四镇火并，清流内讧。大明最后的半壁江山在荒唐的内部仇杀中拱手送人，令人扼腕长叹。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "后人哀之而不鉴之，亦使后人而复哀后人也。历史在此留下最沉痛的教训。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_warlord_recovery": {
    id: "nanming_act4_warlord_recovery", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】西南狂澜 · 定国名王反击中兴", coords: "nanming:maritime",
    desc: "两蹶名王扭转乾坤，李定国统帅抗清联军席卷两广湖南，大明社稷在西南奇迹般实现光复。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "只手补天裂！在绝望的深渊中，你们用无可匹敌的勇气斩断了宿命的锁链。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_southwest_collapse": {
    id: "nanming_act4_southwest_collapse", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】悲情背刺 · 西南陷落英雄泪尽", coords: "nanming:maritime",
    desc: "叛将投敌致使防线全毁，李定国孤掌难鸣呕血而死，大明最后一支主力陆军悲壮谢幕。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "出师未捷身先死，长使英雄泪满襟。西南名将的最后一滴热血，洒在了故土山川。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  },
  "nanming_act4_cursed_water": {
    id: "nanming_act4_cursed_water", actNumber: 4, trunk: "C",
    title: "第四幕：【终局】异邦绝唱 · 咒水血痕大明终曲", coords: "nanming:maritime",
    desc: "永历蒙尘，朱明皇室血脉在异国丛林凋零。三百年大明王朝在此画下了最后的悲凉叹号。",
    originalBeats: [createBeat("青史定盘", "【千古青史】", "narrator", "center", "斜阳残照，雨林寂寥。一个伟大朝代的最后背影，永远定格在遥远的异域。")],
    choices: [createChoice("【重整山河】回望九洲，审视此生铸就的天命青史照影。", "天命结算", { authority:0 }, 2, false, null)]
  }
};

const fullCanonicalTrees = {
  ming: {
    name: "大明中枢 · 紫禁文渊 主剧情树",
    initialNodeId: "ming_act1",
    nodes: mingNodes
  },
  qing: {
    name: "后金八旗 · 盛京汗殿 主剧情树",
    initialNodeId: "qing_act1",
    nodes: qingNodes
  },
  mongol: {
    name: "大漠漠北 · 黄金汗帐 主剧情树",
    initialNodeId: "mongol_act1",
    nodes: mongolNodes
  },
  nanming: {
    name: "南国海邦 · 闽海龙旗 主剧情树",
    initialNodeId: "nanming_act1",
    nodes: nanmingNodes
  }
};

for (const k in fullCanonicalTrees) {
  const tree = fullCanonicalTrees[k];
  const nodeCount = Object.keys(tree.nodes).length;
  console.log(`阵营 ${k}: 共计 ${nodeCount} 个节点 (1 变 3, 3 变 9 纯树状架构已确立)`);
}

// 读取旧 skills-data.js 并安全替换 canonicalTrees 段落
const skillsPath = path.join(__dirname, 'skills-data.js');
const rawCode = fs.readFileSync(skillsPath, 'utf8');

const startMarker = "  canonicalTrees: {";
const endMarker = "};\n\nif (typeof module !== 'undefined'";

const startIndex = rawCode.indexOf(startMarker);
const endIndex = rawCode.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("找不到 canonicalTrees 起始或结束标记！");
  process.exit(1);
}

// 格式化 canonicalTrees JS
const newTreesContent = "  canonicalTrees: " + JSON.stringify(fullCanonicalTrees, null, 2);

const updatedSkillsCode = rawCode.slice(0, startIndex) + newTreesContent + "\n" + rawCode.slice(endIndex);

fs.writeFileSync(skillsPath, updatedSkillsCode, 'utf8');
console.log("✓ 成功将 4 大阵营 1->3->9 纯树状结构写入 skills-data.js！");

// 语法自检
try {
  vm.runInThisContext(updatedSkillsCode);
  console.log("✓ skills-data.js 语法检测 100% 正常，WORLD_PRESETS 载入无误！");
} catch (e) {
  console.error("语法错误：", e);
  process.exit(1);
}
