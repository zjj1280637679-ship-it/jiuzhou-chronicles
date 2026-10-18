// expand-tree-5layers-full.js: 全自动将 4 阵营剧情树无损扩展为 5 幕金字塔树 (1 -> 3 -> 9 -> 9 -> 9 = 31 节点/阵营，总计 124 节点)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const skillsDataPath = path.join(__dirname, 'skills-data.js');
const rawCode = fs.readFileSync(skillsDataPath, 'utf8');

// 提取头部
const splitMarker = '  canonicalTrees: {';
const splitIdx = rawCode.indexOf(splitMarker);
if (splitIdx === -1) {
  console.error("找不到 canonicalTrees 标记！");
  process.exit(1);
}
const fileHeader = rawCode.slice(0, splitIdx);

// 加载当前对象
vm.runInThisContext(rawCode);
const origTrees = WORLD_PRESETS.canonicalTrees;

console.log("已加载原始配置，开始生成 5 幕 124 节点宏伟金字塔剧情树...");

// 阵营 4 幕决战与 5 幕终局定制数据
const FACTION_EXTRAS = {
  ming: {
    battles: [
      {
        id: "ming_act4_canal_battle",
        trunk: "A",
        trunkName: "支脉 A · 经世加派",
        coords: "jiangnan:mid",
        title: "第四幕A1：决战运河 · 铁血荡平阻饷叛军",
        desc: "清江浦运河要隘，关宁铁骑与运河盐徒在暴雨中白刃决战。漕运粮船火光冲天，二十万石救命白粮在此一搏！",
        tag: "铁血决战 · 运河定命",
        bias: { authority: 6, pragmatism: 4, progress: -1, cognition: 2 },
        beats: [
          { speaker: "旁白", sub: "淮安 · 清江浦大闸", type: "narrator", stageChar: "center", text: "暴雨倾盆，大运河水泛起腥红。上百艘满载漕粮的重船被盐帮与哗变漕丁死死锁在大闸之中，铁索横江，火把如龙！" },
          { speaker: "关宁统领", sub: "战甲浴血，提刀厉喝", type: "npc", stageChar: "left", text: "“奉中旨便宜行事！凡阻粮船过闸者，不论士绅白莲，皆以谋逆论斩！重甲铁骑，随我踏破船闸！”" },
          { speaker: "铁面直觉", sub: "【内在法统 · 铁血机能】", type: "voice-iron", stageChar: "right", text: "“此时绝不能有半点妇人之仁。粮船一过，山海关二十万将士便有救；粮船若沉，大明江山今夜便亡于此！”" }
        ]
      },
      {
        id: "ming_act4_nanjing_deal",
        trunk: "A",
        trunkName: "支脉 A · 经世加派",
        coords: "jiangnan:mid",
        title: "第四幕A2：定策金陵 · 南都三方共治大会商",
        desc: "秦淮河畔文德桥，朝廷钦差、江南复社领袖与三十六徽商巨贾齐聚御前。是建立财阀共治，还是兵戎相见？",
        tag: "利益均衡 · 官商盟约",
        bias: { authority: 2, pragmatism: 6, progress: 4, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "金陵 · 贡院明远楼", type: "narrator", stageChar: "center", text: "香君水榭之畔，刀斧手暗伏回廊。八大盐商巨贾奉上两千万两海关期票，复社名士手持改良宪政十策，齐聚于案前。" },
          { speaker: "徽商总把头", sub: "拱手长揖，目光深邃", type: "npc", stageChar: "left", text: "“钦差大人，天下之财不出东南。若朝廷准允设立【商绅议事公所】并分润关税，不仅辽饷立解，我等更可借款助朝廷北伐！”" },
          { speaker: "经世机辨", sub: "【内在算计 · 权衡利弊】", type: "voice-court", stageChar: "right", text: "“天下已非朱家一家之天下。若签下此约，虽分薄了皇权，却挽救了倾覆的大厦。”" }
        ]
      },
      {
        id: "ming_act4_capital_defense",
        trunk: "A",
        trunkName: "支脉 A · 经世加派",
        coords: "beijing:high",
        title: "第四幕A3：血沃畿南 · 临清保卫决死激战",
        desc: "运河断绝引发饥民狂潮，畿南各卫所土崩瓦解。主角亲率仅存的御林禁军背靠临清古城，誓死迎击合围大军！",
        tag: "绝境血战 · 悲壮坚守",
        bias: { authority: 4, pragmatism: 2, progress: -3, cognition: 1 },
        beats: [
          { speaker: "旁白", sub: "直隶 · 临清砖城", type: "narrator", stageChar: "center", text: "寒风猎猎，城外义军旗帜遮蔽天日。城中断粮三日，连官衙的古松树皮都已被剥光。守军将校已写好遗折，腰缠火药引线。" },
          { speaker: "巡抚副都御史", sub: "扶剑涕泣，声嘶力竭", type: "npc", stageChar: "left", text: "“粮道已断，后无援军！今日唯有死节于此城，为京师天子再争取三日整军时间！全军随我登城！”" },
          { speaker: "孤忠直觉", sub: "【内在风骨 · 社稷孤臣】", type: "voice-benevolence", stageChar: "right", text: "“历史何其残酷，加派本为筹饷，却先催生了遍地狼烟。但既然受国厚恩，唯有战至最后一矢！”" }
        ]
      },
      {
        id: "ming_act4_forbidden_night",
        trunk: "B",
        trunkName: "支脉 B · 雷霆肃贪",
        coords: "beijing:high",
        title: "第四幕B1：午门血夜 · 禁卫清洗决死之夜",
        desc: "紫禁城午门石阶前，厂卫死士与反叛勋贵决死搏杀。大雪覆满血痕，深宫烛火摇曳，这是一场你死我活的权力大清洗！",
        tag: "铁血清洗 · 特务独裁",
        bias: { authority: 7, pragmatism: 3, progress: 1, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "紫禁城 · 午门雪夜", type: "narrator", stageChar: "center", text: "子夜三更，宫门铜环被狂暴撞击。十余位勋贵外戚策动京营死士试图夜叩乾清宫，北镇抚司数百缇骑按绣春刀列阵死守阶前！" },
          { speaker: "锦衣卫指挥使", sub: "刀锋染血，目如厉鬼", type: "npc", stageChar: "left", text: "“逆贼安敢作乱！奉天子密诏，凡持兵犯阙者诛九族！缇骑冲锋，一个不留！”" },
          { speaker: "权谋嗅觉", sub: "【内在直觉 · 权力机变】", type: "voice-court", stageChar: "right", text: "“血腥虽重，但皇权至此彻底凌驾于百官与宗室之上。从今夜起，朝廷再无人敢发一言质疑中旨！”" }
        ]
      },
      {
        id: "ming_act4_court_tribunal",
        trunk: "B",
        trunkName: "支脉 B · 雷霆肃贪",
        coords: "beijing:high",
        title: "第四幕B2：奉天大公审 · 皇极殿九卿明法大断",
        desc: "皇极殿前设公审大席，九卿、三法司与平民监生并列听审。当着天下士民的面，依法斩杀贪墨亲贵，明正典刑！",
        tag: "法度重铸 · 申明律法",
        bias: { authority: 5, pragmatism: 5, progress: 5, cognition: 5 },
        beats: [
          { speaker: "旁白", sub: "紫禁城 · 皇极殿御阶", type: "narrator", stageChar: "center", text: "晨钟悠扬，丹墀之下陈列着贪官籍没的三百口银箱与万卷贪墨账簿。文武百官屏息肃立，千名太学生与顺天府耆老获准列席观审。" },
          { speaker: "大理寺正卿", sub: "捧《大明律》，声震金殿", type: "npc", stageChar: "left", text: "“王子犯法，与庶民同罪！今依法斩国丈田弘遇、抄户部郎中十八人，所没两千万银悉数犒赏边军！以正大明祖训！”" },
          { speaker: "民本直觉", sub: "【内在良知 · 万民苍生】", type: "voice-benevolence", stageChar: "right", text: "“法不阿贵，绳不挠曲。大明烂到了根子，但若能以此铁腕树立律法权威，社稷便有重生之机！”" }
        ]
      },
      {
        id: "ming_act4_capital_coup",
        trunk: "B",
        trunkName: "支脉 B · 雷霆肃贪",
        coords: "beijing:high",
        title: "第四幕B3：皇城喋血 · 夺门平乱神枢营生死斗",
        desc: "京营副将倒戈引叛军纵火正阳门，皇城硝烟弥漫。主角亲冒矢石率领神枢营平叛，于箭雨中捍卫社稷枢纽！",
        tag: "生死平叛 · 喋血京华",
        bias: { authority: 4, pragmatism: 3, progress: -2, cognition: 2 },
        beats: [
          { speaker: "旁白", sub: "北京 · 正阳门箭楼", type: "narrator", stageChar: "center", text: "城楼火光冲天，浓烟呛人。叛乱将领与贪腐巨室联手策动三营兵变，箭矢如雨般泼向城头，内城防线濒临崩溃。" },
          { speaker: "兵部主事", sub: "手挽硬弓，射杀数人", type: "npc", stageChar: "left", text: "“贼子妄图开城降敌！我等生为明臣，死为明鬼！随我冲入敌阵，夺回城门闸盘！”" },
          { speaker: "铁面直觉", sub: "【内在法统 · 铁血机能】", type: "voice-iron", stageChar: "right", text: "“百官的贪念最终酿成了弑君的毒焰。必须以最坚决的反冲锋压制叛军，哪怕整座皇城化为灰烬！”" }
        ]
      },
      {
        id: "ming_act4_taiwan_strait_battle",
        trunk: "C",
        trunkName: "支脉 C · 开海通商",
        coords: "nanming:maritime",
        title: "第四幕C1：风涛大会战 · 澎湖百舰总决胜",
        desc: "澎湖水道风暴咆哮，郑氏铁甲战船与西方侵略舰列阵对轰。大口径红衣巨炮与火船齐发，华夏大航海的宿命之战！",
        tag: "海权决胜 · 万舰齐发",
        bias: { authority: 3, pragmatism: 5, progress: 6, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "澎湖海面 · 黑水沟", type: "narrator", stageChar: "center", text: "海风撕扯着日月龙旗，海浪拍击着巨舰船舷。百余艘武装战船喷吐出耀眼的火舌，硝烟蔽日，天地变色。" },
          { speaker: "水师提督", sub: "按刀立于船头，意气风发", type: "npc", stageChar: "left", text: "“红毛番犯我海疆，安敢称霸大洋！传令诸舰，火船顺风包抄，铁甲舰迎头合围，送夷敌入海底龙宫！”" },
          { speaker: "重洋直觉", sub: "【内在眼界 · 远洋开化】", type: "voice-ocean", stageChar: "right", text: "“陆地虽失，大洋犹存！谁掌握了海疆，谁便掌握了天下无穷的财赋与天命！”" }
        ]
      },
      {
        id: "ming_act4_cannon_artillery_duel",
        trunk: "C",
        trunkName: "支脉 C · 开海通商",
        coords: "beijing:high",
        title: "第四幕C2：巨炮轰鸣 · 山海关火器大会战",
        desc: "山海关城墙上一字排开三十六门泰西定造重炮。炮火覆盖数十里，以近现代热兵器的绝对威压击溃一切强敌冲锋！",
        tag: "科技碾压 · 钢铁火器",
        bias: { authority: 4, pragmatism: 6, progress: 7, cognition: 5 },
        beats: [
          { speaker: "旁白", sub: "山海关 · 一片石城堞", type: "narrator", stageChar: "center", text: "巨炮齐射的轰鸣声震颤着燕山山脉。大地如波浪般起伏，重磅铅弹化作死神镰刀，在敌阵中犁出一道道血肉壕沟。" },
          { speaker: "钦天监铸炮使", sub: "高举火把，满脸炭黑", type: "npc", stageChar: "left", text: "“三十六位炮位校准完毕！火药充足，铁弹齐备！任凭关外铁骑千万，亦难越雷池半步！”" },
          { speaker: "鼎新直觉", sub: "【内在算计 · 格物实学】", type: "voice-court", stageChar: "right", text: "“天下大势，浩浩荡荡。旧军刀与弓箭的时代结束了，这是大明走向近代火器帝国的初啼之战！”" }
        ]
      },
      {
        id: "ming_act4_macau_sovereignty",
        trunk: "C",
        trunkName: "支脉 C · 开海通商",
        coords: "nanming:maritime",
        title: "第四幕C3：重洋立宪 · 东方城邦自卫会战",
        desc: "珠江口与东南沿海自卫公局成立华夏第一支联合市民水军。在击溃各路强盗与腐官后，正式确立海上自治法典！",
        tag: "共和自治 · 东方新宪",
        bias: { authority: -3, pragmatism: 5, progress: 8, cognition: 6 },
        beats: [
          { speaker: "旁白", sub: "伶仃洋 · 自治海堡", type: "narrator", stageChar: "center", text: "金鼓齐鸣，三十六行商、海外侨领与南迁文人共同宣读《大洋海宪》。炮舰在海面上巡弋，守护着这片初生的自由贸易城邦。" },
          { speaker: "自治公局首领", sub: "挥洒笔墨，目光如炬", type: "npc", stageChar: "left", text: "“朝廷远在九重，生民自谋多福。今日在此立宪立盟，凡入我海邦者，不论士庶，同享律法保护与商贸尊严！”" },
          { speaker: "民本直觉", sub: "【内在良知 · 万民苍生】", type: "voice-benevolence", stageChar: "right", text: "“帝制沉浮，古未有变。但这一次，华夏文明在大海之滨孕育出了一种全然崭新的可能！”" }
        ]
      }
    ]
  },
  qing: {
    battles: [
      {
        id: "qing_act4_battle_shanhai",
        trunk: "A",
        trunkName: "支脉 A · 满洲铁血",
        coords: "beijing:high",
        title: "第四幕A1：一片石大会战 · 关宁山海决战",
        desc: "一片石石河两岸，多尔衮亲率两白旗精锐如狂涛卷地，与李自成大顺主力展开决定天下归属的殊死大会战！",
        tag: "定鼎之战 · 铁骑破阵",
        bias: { authority: 7, pragmatism: 4, progress: -1, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "山海关 · 一片石古战场", type: "narrator", stageChar: "center", text: "狂风卷起漫天沙尘，吹得战旗猎猎作响。二十万大军在石河滩涂正面相撞，马刀砍在重甲上的撞击声宛若雷鸣！" },
          { speaker: "摄政王多尔衮", sub: "拔刀指天，威震全军", type: "npc", stageChar: "left", text: "“天命归大清！八旗儿郎，随我踏破敌阵！夺下山海关，紫禁城就在眼前！”" },
          { speaker: "铁面直觉", sub: "【内在武功 · 铁血征伐】", type: "voice-iron", stageChar: "right", text: "“数十年白山黑水之磨砺，尽系于今日这一场冲锋！后退者斩，唯有向前！”" }
        ]
      },
      {
        id: "qing_act4_siege_artillery",
        trunk: "A",
        trunkName: "支脉 A · 满洲铁血",
        coords: "beijing:high",
        title: "第四幕A2：雷霆破关 · 乌真巨炮轰塌九门",
        desc: "百门重炮齐射北京外城，城砖崩飞，烟柱冲天。八旗火器营与汉军重装步兵展现出近现代火力的恐怖破坏力！",
        tag: "钢铁风暴 · 炮破雄关",
        bias: { authority: 6, pragmatism: 6, progress: 5, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "北京城外 · 乌真重炮阵地", type: "narrator", stageChar: "center", text: "硝烟吞噬了日光。巨型铸铁炮弹接连轰碎广安门瓮城，守军的惨呼声被震天动地的爆炸彻底湮灭。" },
          { speaker: "汉军旗总兵", sub: "挥旗怒吼，炮班装填", type: "npc", stageChar: "left", text: "“炮手不可停歇！连续齐射三轮，为铁骑扫清进城大道！”" },
          { speaker: "权谋嗅觉", sub: "【内在算计 · 军事革新】", type: "voice-court", stageChar: "right", text: "“野蛮与精良火器的结合，让大清不仅拥有游牧骑射之利，更握住了近现代帝国的权柄。”" }
        ]
      },
      {
        id: "qing_act4_retreat_liaodong",
        trunk: "A",
        trunkName: "支脉 A · 满洲铁血",
        coords: "qing:mukden",
        title: "第四幕A3：辽东阻击战 · 白山黑水背水之阵",
        desc: "关内中原受挫，八旗主力撤回辽沈老营。主角在辽河渡口构筑最后防线，血战阻击数倍敌军！",
        tag: "背水一战 · 捍卫祖陵",
        bias: { authority: 5, pragmatism: 3, progress: -3, cognition: 2 },
        beats: [
          { speaker: "旁白", sub: "辽河 · 三岔河古渡", type: "narrator", stageChar: "center", text: "冰冷的辽河泛着浮冰。八旗亲贵家眷正艰难渡河，后方追骑马蹄声已隐隐震动地表。残兵断后，死守隘口。" },
          { speaker: "老白巴牙喇", sub: "独臂持槊，屹立如松", type: "npc", stageChar: "left", text: "“这里是老汗起兵之地！就算舍了关内天下，祖宗陵寝绝不可弃！随我死守辽河！”" },
          { speaker: "铁面直觉", sub: "【内在勇决 · 孤臣悲壮】", type: "voice-iron", stageChar: "right", text: "“虽不能定鼎中原，但只要白山黑水仍在，八旗骨血不灭，终有再次奋起之日！”" }
        ]
      },
      {
        id: "qing_act4_coronation_beijing",
        trunk: "B",
        trunkName: "支脉 B · 文治安邦",
        coords: "beijing:high",
        title: "第四幕B1：紫禁登极 · 满汉文武奉天受禅",
        desc: "紫禁城皇极殿钟鼓齐鸣，大清顺治天子御极登基。宣读《大义觉迷安民诏》，满汉群臣三呼万岁！",
        tag: "文德受禅 · 九州归一",
        bias: { authority: 6, pragmatism: 5, progress: 4, cognition: 5 },
        beats: [
          { speaker: "旁白", sub: "紫禁城 · 皇极殿大典", type: "narrator", stageChar: "center", text: "韶乐悠扬，御香缭绕。满洲诸王、蒙古执政首领与降清汉臣名儒身着朝服，齐整跪伏于御阶之下。" },
          { speaker: "内院大学士范文程", sub: "跪进表文，泪洒金砖", type: "npc", stageChar: "left", text: "“皇上圣德顺天，革除明末三饷苛政，立开科举安抚亿兆苍生！此乃万世永固之大统基石！”" },
          { speaker: "经世机辨", sub: "【内在法统 · 帝国理学】", type: "voice-court", stageChar: "right", text: "“刀剑可以夺天下，但唯有礼乐法度方能治天下。大清至此从部族掠夺者转变为华夏正统天子！”" }
        ]
      },
      {
        id: "qing_act4_righteous_march",
        trunk: "B",
        trunkName: "支脉 B · 文治安邦",
        coords: "beijing:high",
        title: "第四幕B2：大义征伐 · 挥师追剿顺逆决战",
        desc: "打起‘为崇祯天子复仇讨贼’的大义旗帜，秋毫无犯。所过州县箪食壶浆，在河南洛阳与大顺残部大会战！",
        tag: "大义讨逆 · 荡平群雄",
        bias: { authority: 5, pragmatism: 6, progress: 3, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "中原 · 洛阳白马寺外", type: "narrator", stageChar: "center", text: "大军扎营整肃，兵不入民宅，市不易肆。百姓伏道焚香，惊呼‘此乃真仁义之师’。决战前锋已将流寇合围于峡谷之中。" },
          { speaker: "汉臣降将", sub: "勒马辕门，传令三军", type: "npc", stageChar: "left", text: "“大义在我！天道在清！凡弃械受降者，朝廷一体宽免录用，抗拒王师者，诛！”" },
          { speaker: "民本直觉", sub: "【内在安民 · 大义抚民】", type: "voice-benevolence", stageChar: "right", text: "“攻心为上，攻城为下。借大义名分收服中原民心，天下定矣！”" }
        ]
      },
      {
        id: "qing_act4_palace_duel",
        trunk: "B",
        trunkName: "支脉 B · 文治安邦",
        coords: "qing:mukden",
        title: "第四幕B3：盛京殿斗 · 汗位决死喋血夺门",
        desc: "满汉文治引发满洲保守宗王激烈政变。摄政王多尔衮与豪格旧部在盛京崇政殿拔刀相向，汗廷血染青石！",
        tag: "宫廷喋血 · 夺权政变",
        bias: { authority: 7, pragmatism: 2, progress: -2, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "盛京 · 崇政殿月台", type: "narrator", stageChar: "center", text: "狂风卷着雪片扑进殿门。两位手握重兵的亲王怒目圆睁，殿外两黄旗与两白旗侍卫已经拔出腰刀对峙，生死一线。" },
          { speaker: "满洲宿将", sub: "按刀怒斥，杀气腾腾", type: "npc", stageChar: "left", text: "“祖宗靠弓马打天下！若由得尔等汉儒摆布，我八旗子弟岂不沦为犬羊！今日必须血洗殿堂！”" },
          { speaker: "权谋嗅觉", sub: "【内在直觉 · 权力机变】", type: "voice-court", stageChar: "right", text: "“内耗将大军生生撕裂成两半。今日无论谁胜谁负，大清入关鼎盛的势头都将遭受到致命的重创！”" }
        ]
      },
      {
        id: "qing_act4_steppe_cavalry_clash",
        trunk: "C",
        trunkName: "支脉 C · 草原盟约",
        coords: "mongol:steppe",
        title: "第四幕C1：阴山大会战 · 草原铁骑横扫中原",
        desc: "满洲八旗与蒙古科尔沁、察哈尔三十万轻重骑兵合流。翻越阴山，以遮天蔽日的草原铁流横扫幽燕大地！",
        tag: "三十万骑 · 席卷天下",
        bias: { authority: 6, pragmatism: 4, progress: 2, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "阴山南麓 · 塞外草场", type: "narrator", stageChar: "center", text: "牛角号声响彻天际。三十万骑兵列阵十数里，刀光耀日，马蹄践踏大地如隆隆滚雷，北国山河在铁蹄下颤栗。" },
          { speaker: "蒙古科尔沁台吉", sub: "高举神矛，策马呼啸", type: "npc", stageChar: "left", text: "“满蒙姻盟，永结为好！长生天护佑勇士，随大清皇帝夺取锦绣江山！”" },
          { speaker: "草原直觉", sub: "【内在野性 · 瀚海豪情】", type: "voice-steppe", stageChar: "right", text: "“这是自成吉思汗以来，东亚大陆上集结的最庞大骑兵军团！任何城墙防线都将被踏为平地！”" }
        ]
      },
      {
        id: "qing_act4_lama_coronation",
        trunk: "C",
        trunkName: "支脉 C · 草原盟约",
        coords: "mongol:steppe",
        title: "第四幕C2：承德法会 · 漠北漠南万佛归宗",
        desc: "热河草原筑金顶坛城，迎奉西藏达赖五世使者。敕封大清皇帝为‘转轮圣王文殊菩萨化身’，八部蒙古长跪皈依！",
        tag: "神权加冕 · 万佛朝宗",
        bias: { authority: 5, pragmatism: 5, progress: 4, cognition: 6 },
        beats: [
          { speaker: "旁白", sub: "避暑山庄 · 普陀宗乘之庙", type: "narrator", stageChar: "center", text: "法号长鸣，梵音缭绕。金冠红袍的活佛将纯金法轮与七宝冠冕奉于皇帝御前，漠北喀尔喀三部汗王共同亲吻御靴。" },
          { speaker: "达赖活佛使者", sub: "合十念诵，声如洪钟", type: "npc", stageChar: "left", text: "“大皇帝乃文殊师利菩萨应化人间！以佛法绥靖北荒，从今大漠无刀兵，兆民永享极乐和平！”" },
          { speaker: "经世机辨", sub: "【内在神圣 · 政治宗教】", type: "voice-court", stageChar: "right", text: "“一座喇嘛庙，胜抵十万兵。不用一兵一卒，整个青藏高原与蒙古瀚海已尽入帝国囊中！”" }
        ]
      },
      {
        id: "qing_act4_nomad_subjugation",
        trunk: "C",
        trunkName: "支脉 C · 草原盟约",
        coords: "mongol:steppe",
        title: "第四幕C3：乌兰布统 · 彻底荡平漠北叛旗",
        desc: "科尔沁叛王撕毁盟约倒戈，八旗火器营与满洲劲旅在乌兰布统大摆骆驼炮阵，以密集霰弹与铁骑合围决战！",
        tag: "扫除叛盟 · 决死合围",
        bias: { authority: 7, pragmatism: 3, progress: 1, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "乌兰布统 · 桦木沟血原", type: "narrator", stageChar: "center", text: "万匹战马围成的驼城之后，火药烟雾如毒雾弥漫。叛军骑兵发起决死冲锋，被大清红衣巨炮接连轰穿阵线，残肢遍野。" },
          { speaker: "领侍卫内大臣", sub: "血染征袍，拔剑立斩", type: "npc", stageChar: "left", text: "“背盟犯上者，天不容之！八旗前锋压上去，彻底踏碎他们的驼城大阵！”" },
          { speaker: "铁面直觉", sub: "【内在法统 · 铁血机能】", type: "voice-iron", stageChar: "right", text: "“背叛必须付出血的代价。此战之后，漠南再无敢反抗大清威权的部落！”" }
        ]
      }
    ]
  },
  mongol: {
    battles: [
      {
        id: "mongol_act4_juyong_breakthrough",
        trunk: "A",
        trunkName: "支脉 A · 察哈尔血战",
        coords: "beijing:high",
        title: "第四幕A1：决战长城 · 铁骑破关震撼幽蓟",
        desc: "察哈尔仅存的八千黄金家族骑兵在长城脚下绝死冲撞关口。弓开满月，长矛破甲，重演成吉思汗昔日的壮丽奇迹！",
        tag: "铁骑破关 · 黄金家族",
        bias: { authority: 6, pragmatism: 3, progress: -2, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "长城 · 居庸关北口", type: "narrator", stageChar: "center", text: "落日如血，残阳将长城的烽火台染得猩红。察哈尔勇士撕扯着狼皮战袍，不顾城头如雨的滚石檑木，飞索登城！" },
          { speaker: "林丹汗嫡子", sub: "挥舞弯刀，怒吼震天", type: "npc", stageChar: "left", text: "“长生天见证！我们是苍狼白鹿的子孙！长城挡不住雄鹰，随我杀进关去！”" },
          { speaker: "草原直觉", sub: "【内在野性 · 瀚海豪情】", type: "voice-steppe", stageChar: "right", text: "“哪怕注定是历史的绝唱，也要让整个中原大地再次因黄金家族的马蹄而战栗！”" }
        ]
      },
      {
        id: "mongol_act4_fire_mukden",
        trunk: "A",
        trunkName: "支脉 A · 察哈尔血战",
        coords: "qing:mukden",
        title: "第四幕A2：焚城之怒 · 盛京血火决死冲击",
        desc: "敢死骑兵奇袭后金盛京汗廷，以桐油纵火焚烧清皇宫大清门。在满洲禁军的重重围攻下力战殉国！",
        tag: "焚城死斗 · 绝唱烈焰",
        bias: { authority: 5, pragmatism: 2, progress: -3, cognition: 2 },
        beats: [
          { speaker: "旁白", sub: "盛京城内 · 崇政殿外墙", type: "narrator", stageChar: "center", text: "烈焰腾空，照亮了满洲老营的夜空。数百名蒙古死士身披重甲，背靠火海，面对四面合围的八旗巴牙喇毫不退缩。" },
          { speaker: "察哈尔千户长", sub: "身中数箭，放声大笑", type: "npc", stageChar: "left", text: "“建虏可夺我草原，但夺不走成吉思汗的骨气！火光所及，便是尔等的丧钟！”" },
          { speaker: "铁面直觉", sub: "【内在勇决 · 虽死犹生】", type: "voice-iron", stageChar: "right", text: "“壮烈的牺牲化作不灭的传说，整个大漠都将世代传唱今夜的烈火与勇气！”" }
        ]
      },
      {
        id: "mongol_act4_redmount_clash",
        trunk: "A",
        trunkName: "支脉 A · 察哈尔血战",
        coords: "mongol:steppe",
        title: "第四幕A3：归化城死守 · 察哈尔末代悲歌",
        desc: "归化城白塔之下，部族老弱妇孺已被八旗四面包围。最后的三百苏勒德神矛勇士誓死断后，血沃草原！",
        tag: "末代悲歌 · 誓死断后",
        bias: { authority: 4, pragmatism: 1, progress: -4, cognition: 2 },
        beats: [
          { speaker: "旁白", sub: "归化城 · 白塔荒原", type: "narrator", stageChar: "center", text: "枯草在严寒中结着白霜。折断的苏勒德神矛深深插在冻土中，寒风卷着尘土，吹散了最后一批守护者的呐喊。" },
          { speaker: "苍老萨满", sub: "敲响神鼓，仰天呼号", type: "npc", stageChar: "left", text: "“九斿白纛落下了……长生天啊，请宽恕你的子孙，我们将最后的心血洒在圣山脚下……”" },
          { speaker: "孤忠直觉", sub: "【内在哀歌 · 文明残阳】", type: "voice-benevolence", stageChar: "right", text: "“一个伟大的时代落幕了。游牧文明的黄昏在冰雪中沉寂，化为无言的碑铭。”" }
        ]
      },
      {
        id: "mongol_act4_joint_coronation",
        trunk: "B",
        trunkName: "支脉 B · 盛京结盟",
        coords: "qing:mukden",
        title: "第四幕B1：太庙会盟 · 满蒙并尊双皇登基",
        desc: "盛京太庙共同祭天，满洲大汗与察哈尔蒙古大汗平起平坐，签署《满蒙双元共治万世誓书》！",
        tag: "双元君主 · 平分天下",
        bias: { authority: 6, pragmatism: 6, progress: 3, cognition: 5 },
        beats: [
          { speaker: "旁白", sub: "盛京太庙 · 祭天金鼎", type: "narrator", stageChar: "center", text: "羊血滴入金碗，黄袍与蟒袍交相辉映。满洲亲贵与蒙古各旗王公歃血为盟，共同拜受长生天与太庙列祖列宗见证。" },
          { speaker: "后金大汗", sub: "手持玉玺，郑重宣告", type: "npc", stageChar: "left", text: "“满蒙一家，不分彼此！入关所得城池财赋，两家永世中分；草原牧场，永归大汗自理！”" },
          { speaker: "权谋嗅觉", sub: "【内在算计 · 双元权力】", type: "voice-court", stageChar: "right", text: "“以传国玉玺换来平起平坐的共主地位，黄金家族不仅保全了尊荣，更成为未来帝国的半壁主人！”" }
        ]
      },
      {
        id: "mongol_act4_neutral_treaty",
        trunk: "B",
        trunkName: "支脉 B · 盛京结盟",
        coords: "mongol:steppe",
        title: "第四幕B2：大漠止戈 · 关内关外和平条约",
        desc: "张家口大境门外设立中立贸易区。大漠部族作为大明与后金的中介，尽享两方岁币与茶马通商红利！",
        tag: "中立止戈 · 贸易繁盛",
        bias: { authority: 2, pragmatism: 7, progress: 4, cognition: 5 },
        beats: [
          { speaker: "旁白", sub: "张家口 · 大境门互市广场", type: "narrator", stageChar: "center", text: "驼铃悠扬，商贾如云。明朝的丝绸茶叶、后金的皮毛人参在此疯狂交易，蒙古骑兵作为两方认可的中立护卫收取重税。" },
          { speaker: "商道长者", sub: "手捻玛瑙念珠，怡然自得", type: "npc", stageChar: "left", text: "“打打杀杀有什么意思？他们在中原流血，我们在这里数银子。只要两家不罢手，我们的大漠便永是金山！”" },
          { speaker: "经世机辨", sub: "【内在算计 · 贸易霸权】", type: "voice-court", stageChar: "right", text: "“以中立谋生存，以商业铸繁荣。游牧民族由此找到了在火器帝国夹缝中的全新生路！”" }
        ]
      },
      {
        id: "mongol_act4_banner_shackles",
        trunk: "B",
        trunkName: "支脉 B · 盛京结盟",
        coords: "mongol:steppe",
        title: "第四幕B3：八旗断腕 · 草原宗王最后反扑",
        desc: "后金强行推行‘编旗析产’消解部落，蒙古年轻台吉在盟旗誓师大会上拔刀搏杀，试图夺回部族独立权！",
        tag: "反抗囚笼 · 誓死一击",
        bias: { authority: 5, pragmatism: 2, progress: -1, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "察哈尔 · 盟旗大营", type: "narrator", stageChar: "center", text: "金顶帐篷内血腥弥漫。满洲派驻的佐领官员尸横案头，年轻的蒙古勇士高擎染血战刀，向着四周的八旗监军发出绝望咆哮。" },
          { speaker: "反叛台吉", sub: "目眦欲裂，嘶吼破音", type: "npc", stageChar: "left", text: "“编旗！编旗！编到最后连放牧的草场都要听盛京号令！草原的雄鹰决不戴奴才的锁链！”" },
          { speaker: "铁面直觉", sub: "【内在法统 · 制度重锁】", type: "voice-iron", stageChar: "right", text: "“封建盟旗制度的重锁一旦合拢，游牧社会便再难组织起席卷天下的军团。这是雄鹰最后的抗争！”" }
        ]
      },
      {
        id: "mongol_act4_lhasa_campaign",
        trunk: "C",
        trunkName: "支脉 C · 西行弘法",
        coords: "mongol:steppe",
        title: "第四幕C1：拉萨护法 · 迎请达赖平定藏乱",
        desc: "固始汗亲率蒙古和硕特重骑跨越唐古拉山口，平定青藏叛乱，在布达拉宫前被尊奉为全藏护法法王！",
        tag: "雪域护法 · 和硕特汗",
        bias: { authority: 6, pragmatism: 5, progress: 3, cognition: 6 },
        beats: [
          { speaker: "旁白", sub: "拉萨 · 大昭寺前广场", type: "narrator", stageChar: "center", text: "雪山皑皑，经幡随风起伏。数万喇嘛与藏民向身披红铜锁子甲的蒙古汗王跪拜献哈达，桑烟与法号弥漫在圣城日光之下。" },
          { speaker: "和硕特固始汗", sub: "单膝跪受金刚杵，庄严宣誓", type: "npc", stageChar: "left", text: "“我以长生天与格鲁教法立誓，和硕特铁骑永为黄教金刚护法！凡敢犯雪域圣境者，人神共诛！”" },
          { speaker: "草原直觉", sub: "【内在神圣 · 草原神权】", type: "voice-steppe", stageChar: "right", text: "“放弃了中原角逐，却在青藏雪域开辟出了一个延续数百年的政教合一神圣汗国！”" }
        ]
      },
      {
        id: "mongol_act4_silkroad_charge",
        trunk: "C",
        trunkName: "支脉 C · 西行弘法",
        coords: "mongol:steppe",
        title: "第四幕C2：伊犁会战 · 荡平中亚四方臣服",
        desc: "察哈尔与准噶尔大军在伊犁河畔会师，横扫叶尔羌与中亚诸汗国。重开丝绸之路，威震中亚极境！",
        tag: "中亚横扫 · 丝路荣光",
        bias: { authority: 7, pragmatism: 4, progress: 4, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "伊犁河谷 · 果子沟要隘", type: "narrator", stageChar: "center", text: "天山雪峰下，十万控弦之士列阵肃杀。中亚各绿洲苏丹派来的使臣战战兢兢地献上黄金地图与臣服降书。" },
          { speaker: "准噶尔大台吉", sub: "策马扬鞭，豪气干云", type: "npc", stageChar: "left", text: "“东方已入建虏与南蛮之手，这广袤的西域天山与葱岭，便是我黄金家族重新崛起的帝国龙兴之地！”" },
          { speaker: "草原直觉", sub: "【内在野性 · 瀚海豪情】", type: "voice-steppe", stageChar: "right", text: "“拔都与帖木儿的荣光在这一刻复苏！大漠骑士在此重掌了沟通欧亚大陆的心脏命脉！”" }
        ]
      },
      {
        id: "mongol_act4_winter_dispersion",
        trunk: "C",
        trunkName: "支脉 C · 西行弘法",
        coords: "mongol:steppe",
        title: "第四幕C3：瀚海求生 · 绝地穿越塔克拉玛干",
        desc: "严冬白灾与天花疫情突袭流亡部族。主角率领最后的幸存者穿越浩瀚沙海，在生死极限中守护火种！",
        tag: "绝地求生 · 守护火种",
        bias: { authority: 3, pragmatism: 5, progress: -2, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "塔克拉玛干沙漠边缘 · 胡杨枯林", type: "narrator", stageChar: "center", text: "狂风卷着黄沙与雪沫。骆驼倒毙在沙丘之上，牧民们紧紧裹着破烂的羊皮袄，将仅存的婴儿藏在胸口，步履维艰。" },
          { speaker: "部族遗孀", sub: "怀抱襁褓，泪眼模糊", type: "npc", stageChar: "left", text: "“前面……有胡杨！有水眼！长生天没有抛弃我们！孩子们，快跟上首领的脚步！”" },
          { speaker: "民本直觉", sub: "【内在坚韧 · 生命意志】", type: "voice-benevolence", stageChar: "right", text: "“征服与称霸早已成过眼云烟。此时此刻，让这最后的部族血脉在人世间活下去，便是最伟大的胜利！”" }
        ]
      }
    ]
  },
  nanming: {
    battles: [
      {
        id: "nanming_act4_provintia_siege",
        trunk: "A",
        trunkName: "支脉 A · 海上定海",
        coords: "nanming:maritime",
        title: "第四幕A1：攻克普罗民遮 · 逐出荷兰收复台湾",
        desc: "国姓爷亲冒矢石督战，铁甲水师架云梯强攻普罗民遮城与热兰遮堡。荷兰东印度公司总督被迫降旗受降！",
        tag: "开辟荆榛 · 驱逐红毛",
        bias: { authority: 6, pragmatism: 5, progress: 6, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "台南 · 赤崁楼前海湾", type: "narrator", stageChar: "center", text: "战鼓喧天，百门红夷大炮接连轰塌荷兰堡垒的外墙。郑家军藤牌兵与火铳手顶着铅弹冲锋，刀光闪烁，红毛溃退。" },
          { speaker: "招讨大将军国姓爷", sub: "按剑立于帅旗之下，威仪万方", type: "npc", stageChar: "left", text: "“台湾者，中国之土地也，久为贵国所踞，今余既来索，则地当归我！全军登城，迎天命承天府！”" },
          { speaker: "重洋直觉", sub: "【内在眼界 · 远洋开化】", type: "voice-ocean", stageChar: "right", text: "“这是华夏文明首次在大洋彼岸击溃西方殖民帝国，拓土开疆，承天立邦，功在千秋！”" }
        ]
      },
      {
        id: "nanming_act4_yangtze_ironclad",
        trunk: "A",
        trunkName: "支脉 A · 海上定海",
        coords: "jiangnan:mid",
        title: "第四幕A2：南京大会战 · 铁人军披甲登城决战",
        desc: "郑成功率数十万水陆大军逆长江直捣南京。重装铁人军刀枪不入，在江东门与清军八旗精锐展开登城决胜大对决！",
        tag: "北伐中原 · 铁人决战",
        bias: { authority: 7, pragmatism: 4, progress: 5, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "南京 · 仪凤门城下", type: "narrator", stageChar: "center", text: "长江上艨艟连绵数十里，烟焰蔽江。重铠铁人军身披百斤铁甲，手持斩马长刀，如钢铁移动长城般硬顶着清军炮火碾过壕沟！" },
          { speaker: "铁人军统领", sub: "铁盔遮面，刀锋滴血", type: "npc", stageChar: "left", text: "“后退半步者斩！光复旧都就在今日！随国姓爷杀入南京城，还我大明江山！”" },
          { speaker: "铁面直觉", sub: "【内在武功 · 铁血征伐】", type: "voice-iron", stageChar: "right", text: "“血战至此，大明南方的最后反击意志爆发出了最耀眼的光芒！天下人心，在此一战！”" }
        ]
      },
      {
        id: "nanming_act4_spice_fleet_war",
        trunk: "A",
        trunkName: "支脉 A · 海上定海",
        coords: "nanming:maritime",
        title: "第四幕A3：马六甲海战 · 击沉西洋舰队定海权",
        desc: "在马六甲海峡入口处阻击欧洲联合武装舰队。大明快桨火船与千吨重炮福船配合，彻底封锁远东香料海路！",
        tag: "重洋霸权 · 远东主权",
        bias: { authority: 5, pragmatism: 7, progress: 7, cognition: 5 },
        beats: [
          { speaker: "旁白", sub: "马六甲海峡 · 新加坡海口", type: "narrator", stageChar: "center", text: "风高浪急，火船在夜色中如火龙般撞向西洋战列舰。桅杆断裂，帆布熊熊燃烧，落水的西洋水手在火海中凄厉呼救。" },
          { speaker: "华商武装总督", sub: "手持单筒千里镜，冷峻下令", type: "npc", stageChar: "left", text: "“凡未纳我明朝市舶银旗者，一律禁止通航马六甲！大东亚海疆，由华夏商盟作主！”" },
          { speaker: "重洋直觉", sub: "【内在眼界 · 远洋开化】", type: "voice-ocean", stageChar: "right", text: "“用贸易与坚船利炮构筑属于东方的全球海上秩序，这一步迈向了近代世界的巅峰！”" }
        ]
      },
      {
        id: "nanming_act4_plum_mount_defense",
        trunk: "B",
        trunkName: "支脉 B · 留都正气",
        coords: "jiangnan:mid",
        title: "第四幕B1：扬州保卫战 · 孤军血战至最后一矢",
        desc: "清军十万大军围攻扬州城，红衣大炮轰塌西北城堞。督师史可法身穿缟素，率孤忠将士巷战肉搏至最后一人！",
        tag: "忠烈千秋 · 孤城血战",
        bias: { authority: 6, pragmatism: 1, progress: -3, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "扬州城 · 梅花岭城堞", type: "narrator", stageChar: "center", text: "城垣倒塌，硝烟刺鼻。史阁部满面血污，佩剑已砍缺数十口。四周忠义将士倒卧在血泊之中，至死手中仍紧握着断裂的明军战旗。" },
          { speaker: "督师史可法", sub: "仰天大呼，以佩剑自刎", type: "npc", stageChar: "left", text: "“城亡与亡，我史可法绝不降清！扬州百万生民，天日昭昭，大明孤忠在此！”" },
          { speaker: "孤忠直觉", sub: "【内在风骨 · 浩然正气】", type: "voice-benevolence", stageChar: "right", text: "“肉体虽死，气节长存。这股天地浩然正气，将化作百世不熄的民族脊梁！”" }
        ]
      },
      {
        id: "nanming_act4_river_fortress",
        trunk: "B",
        trunkName: "支脉 B · 留都正气",
        coords: "jiangnan:mid",
        title: "第四幕B2：镇江大反攻 · 炮轰清军浮桥斩帅",
        desc: "利用长江天堑与焦山炮台，痛击强渡南侵的清军前锋。击沉敌船数百，斩杀清廷降将，迫使清廷划江言和！",
        tag: "划江御敌 · 偏安中兴",
        bias: { authority: 5, pragmatism: 5, progress: 3, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "长江 · 焦山炮台要塞", type: "narrator", stageChar: "center", text: "水流湍急，铁索横江。焦山炮台数十门红衣巨炮居高临下倾泻弹药，清军浮桥被拦腰炸断，数千骑兵尽数落水沉没。" },
          { speaker: "江防总兵", sub: "拔刀擂鼓，江风鼓荡", type: "npc", stageChar: "left", text: "“长江乃天堑也！虏骑虽凶，不能飞渡！全军水师出击，截断敌退路！”" },
          { speaker: "经世机辨", sub: "【内在算计 · 权衡利弊】", type: "voice-court", stageChar: "right", text: "“南宋偏安之局已定。只要扼守长江门户，江南三百年文华财赋便可得以保全！”" }
        ]
      },
      {
        id: "nanming_act4_warlord_purge",
        trunk: "B",
        trunkName: "支脉 B · 留都正气",
        coords: "jiangnan:mid",
        title: "第四幕B3：金陵定乱 · 诛除阉党权奸夺门",
        desc: "清军压境之时，留都权奸马士英阮大铖仍图谋夺权。主角联络南京太学生与忠义禁卫发起宫廷政变，清洗奸党！",
        tag: "清洗权奸 · 留都兵变",
        bias: { authority: 5, pragmatism: 4, progress: 2, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "南京 · 朝天宫外御街", type: "narrator", stageChar: "center", text: "火把连绵，哭喊声震荡秦淮。义民百姓手持竹枪将相府团团围住，痛斥阉党误国，大理寺狱吏倒戈开门迎入忠良。" },
          { speaker: "复社文人领袖", sub: "手持讨贼檄文，慷慨激昂", type: "npc", stageChar: "left", text: "“大敌当前，奸佞犹在谋逆！诛马阮，迎天子，肃清朝纲，誓死保卫留都！”" },
          { speaker: "民本直觉", sub: "【内在良知 · 万民苍生】", type: "voice-benevolence", stageChar: "right", text: "“虽除了内贼，但大局已千疮百孔。留都若不能同心戮力，倾覆只在瞬息之间。”" }
        ]
      },
      {
        id: "nanming_act4_hengzhou_duel",
        trunk: "C",
        trunkName: "支脉 C · 西南血战",
        coords: "jiangnan:mid",
        title: "第四幕C1：两蹶名王 · 阵斩尼堪收复两广",
        desc: "衡阳古道伏兵四起，晋王李定国挥舞大刀，统帅战象与铁骑冲破清军中军大帐，阵斩敬谨亲王尼堪！天下震动！",
        tag: "两蹶名王 · 威震天下",
        bias: { authority: 8, pragmatism: 4, progress: 4, cognition: 4 },
        beats: [
          { speaker: "旁白", sub: "湖南衡州 · 演武坡古战场", type: "narrator", stageChar: "center", text: "战象长嘶，地动山摇。李定国亲帅铁骑如天降神兵，战刀划破长空，清军敬谨亲王的人头滚落马下，八旗军阵全面溃崩！" },
          { speaker: "晋王李定国", sub: "横刀立马，声如奔雷", type: "npc", stageChar: "left", text: "“逆胡休走！我李定国在此！孔有德自焚，尼堪授首，今日定教尔等八旗无一生还！”" },
          { speaker: "铁面直觉", sub: "【内在勇决 · 奇迹反攻】", type: "voice-iron", stageChar: "right", text: "“一人之力扭转乾坤！南明抗争二十载，唯此一战打出了华夏军人的盖世豪情！”" }
        ]
      },
      {
        id: "nanming_act4_guilin_counter",
        trunk: "C",
        trunkName: "支脉 C · 西南血战",
        coords: "jiangnan:mid",
        title: "第四幕C2：昆明大会战 · 击溃清廷降将平西王",
        desc: "吴三桂率关宁降军三路入滇，妄图合围昆明行在。李定国与各路义军在磨盘山伏击，以死相搏重创降敌！",
        tag: "磨盘血战 · 殊死伏击",
        bias: { authority: 6, pragmatism: 3, progress: 1, cognition: 3 },
        beats: [
          { speaker: "旁白", sub: "滇南 · 磨盘山峡谷", type: "narrator", stageChar: "center", text: "峡谷逼仄，草木皆兵。伏兵齐发，滚木礌石将吴三桂先锋斩为数段，双方在深草丛中进行极度惨烈的贴身肉搏。" },
          { speaker: "大明义勇将士", sub: "血战咽气，至死不放敌刃", type: "npc", stageChar: "left", text: "“吴三桂汉奸逆贼！死也要拉你垫背！大明万岁！”" },
          { speaker: "孤忠直觉", sub: "【内在哀歌 · 壮烈扼腕】", type: "voice-benevolence", stageChar: "right", text: "“降臣引狼入室，义士喋血荒山。这一战耗尽了西南最后的元气，壮烈而苍凉。”" }
        ]
      },
      {
        id: "nanming_act4_burma_laststand",
        trunk: "C",
        trunkName: "支脉 C · 西南血战",
        coords: "jiangnan:mid",
        title: "第四幕C3：萨尔温江决死战 · 皇家近卫铁血突围",
        desc: "阿瓦城外咒水河畔，缅兵倒戈逼迫天子。大明最后数十名皇家侍卫拔刀死战，浴血护送皇室突围奔向群山！",
        tag: "咒水突围 · 皇陵挽歌",
        bias: { authority: 4, pragmatism: 2, progress: -3, cognition: 2 },
        beats: [
          { speaker: "旁白", sub: "缅甸 · 萨尔温江渡口", type: "narrator", stageChar: "center", text: "异域风狂，江水泛黄。缅兵伏兵四起，箭如飞蝗。大明最后的近卫侍卫以身躯遮挡箭雨，护卫着天子向密林绝境突围。" },
          { speaker: "锦衣卫掌印千户", sub: "断臂横剑，泣血高呼", type: "npc", stageChar: "left", text: "“陛下快走！臣等已无颜回中原，今日唯有以死报国！皇室血脉不可绝！”" },
          { speaker: "孤忠直觉", sub: "【内在风骨 · 终极绝唱】", type: "voice-benevolence", stageChar: "right", text: "“三百年大明王朝在热带异邦密林中流尽了最后一滴血。悲壮落幕，青史有泪。”" }
        ]
      }
    ]
  }
};

// 遍历四大阵营，生成 5 幕树
const newCanonicalTrees = {};

for (const fId of ['ming', 'qing', 'mongol', 'nanming']) {
  console.log(`正在处理阵营: ${fId}...`);
  const rawTree = origTrees[fId];
  const newNodes = {};

  // 1. Act 1: 1 节点
  const act1Node = Object.values(rawTree.nodes).find(n => n.actNumber === 1);
  newNodes[act1Node.id] = JSON.parse(JSON.stringify(act1Node));

  // 2. Act 2: 3 节点
  const act2Nodes = Object.values(rawTree.nodes).filter(n => n.actNumber === 2);
  act2Nodes.forEach(n => {
    newNodes[n.id] = JSON.parse(JSON.stringify(n));
  });

  // 3. Act 3: 9 节点 (中局惊变)
  const act3Nodes = Object.values(rawTree.nodes).filter(n => n.actNumber === 3);
  const extraBattles = FACTION_EXTRAS[fId].battles;

  // 原 Act 4 节点转为 Act 5 终局节点
  const act4Nodes = Object.values(rawTree.nodes).filter(n => n.actNumber === 4);
  const act5Nodes = act4Nodes.map((n, idx) => {
    const copy = JSON.parse(JSON.stringify(n));
    copy.actNumber = 5;
    // 替换 ID 中的 act4 为 act5
    copy.id = copy.id.replace('_act4_', '_act5_');
    copy.title = copy.title.replace('第四幕：', '第五幕：');
    copy.choices = [
      {
        text: "【全书结 · 翻阅历史丰碑】回望九州沉浮，封存青史档案",
        tag: "历史结算 · 丰碑长存",
        bias: { authority: 0, pragmatism: 0, progress: 0, cognition: 5 },
        diceBase: 10,
        isExtrapolation: false,
        targetNodeId: null
      }
    ];
    return copy;
  });

  // 更新 Act 3 节点指向 Act 4
  act3Nodes.forEach((n, idx) => {
    const copy = JSON.parse(JSON.stringify(n));
    copy.actNumber = 3;
    const battle = extraBattles[idx];
    copy.choices = [
      {
        text: `【决战前夕 · ${battle.title.split('：')[1] || battle.title}】调集主力决一死战！`,
        tag: battle.tag || "死生决胜 · 决战中原",
        bias: battle.bias || { authority: 4, pragmatism: 4, progress: 2, cognition: 2 },
        diceBase: 12,
        isExtrapolation: false,
        targetNodeId: battle.id
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
    newNodes[copy.id] = copy;
  });

  // 创建 Act 4 节点指向 Act 5
  extraBattles.forEach((battle, idx) => {
    const ending = act5Nodes[idx];
    newNodes[battle.id] = {
      id: battle.id,
      actNumber: 4,
      title: battle.title,
      trunk: battle.trunk,
      trunkName: battle.trunkName,
      coords: battle.coords,
      desc: battle.desc,
      originalBeats: battle.beats,
      choices: [
        {
          text: `【天命归所 · 铸就历史】进入天命终局：${ending.title.split('：')[1] || ending.title}`,
          tag: ending.title.split('·')[1] || "定鼎乾坤 · 终局结算",
          bias: battle.bias,
          diceBase: 13,
          isExtrapolation: false,
          targetNodeId: ending.id
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

  // 添加 Act 5 节点
  act5Nodes.forEach(ending => {
    newNodes[ending.id] = ending;
  });

  newCanonicalTrees[fId] = {
    name: rawTree.name,
    initialNodeId: rawTree.initialNodeId,
    nodes: newNodes
  };

  const nodeCount = Object.keys(newNodes).length;
  console.log(`阵营 ${fId} 构建完成，节点总数: ${nodeCount} (1+3+9+9+9 = 31)`);
}

// 格式化输出为 JavaScript
const newCode = fileHeader + '  canonicalTrees: ' + JSON.stringify(newCanonicalTrees, null, 2) + '\n};\n\nif (typeof module !== \'undefined\' && module.exports) {\n  module.exports = WORLD_PRESETS;\n}\n';

fs.writeFileSync(skillsDataPath, newCode, 'utf8');
console.log("成功重写 skills-data.js！总长度:", newCode.length);
