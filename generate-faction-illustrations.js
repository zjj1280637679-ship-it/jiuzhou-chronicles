/**
 * generate-faction-illustrations.js
 * 批量生成四大阵营专属的 24 幅史诗矢量插图 (SVG)
 * 并导出到 data/illustrations/ 体系及注册文件 illustrations-data.js
 */

const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'data', 'illustrations');

// 阵营元数据
const FACTIONS = {
  qing: {
    name: "后金八旗",
    folder: "qing",
    primary: "#38bdf8",
    secondary: "#0284c7",
    accent: "#fbbf24",
    bgDark: "#08121e",
    bgLight: "#16283d"
  },
  ming: {
    name: "大明中枢",
    folder: "ming",
    primary: "#e5b95c",
    secondary: "#b45309",
    accent: "#ef4444",
    bgDark: "#1a0f0d",
    bgLight: "#331612"
  },
  mongol: {
    name: "大漠蒙古",
    folder: "mongol",
    primary: "#22c55e",
    secondary: "#15803d",
    accent: "#f59e0b",
    bgDark: "#081a10",
    bgLight: "#14301e"
  },
  nanming: {
    name: "南国海邦",
    folder: "nanming",
    primary: "#06b6d4",
    secondary: "#0891b2",
    accent: "#e11d48",
    bgDark: "#05161c",
    bgLight: "#0c2933"
  }
};

// 6 类主题元数据
const CATEGORIES = [
  {
    key: "captive",
    nameZh: "俘虏",
    titleMap: {
      qing: "【俘虏】败将就缚 · 铁索加身",
      ming: "【俘虏】诏狱严鞫 · 暗桩现形",
      mongol: "【俘虏】瀚海俘敌 · 毡帐按问",
      nanming: "【俘虏】登舰受缚 · 夷长缴械"
    },
    descMap: {
      qing: "盛京大殿雪泥之上，降明总兵铁索束身伏首称臣。八旗侍卫横刀逼视，杀气与劝降之意森然交织。",
      ming: "北镇抚司诏狱铁门深锁，火盆余烬照亮刑架。锦衣卫缇骑手按绣春刀，案头密信直指朝中私通大乱之通敌暗桩。",
      mongol: "金顶大帐外朔风呼啸，俘获的越界哨骑与敌酋卸弓下跪。苏勒德神矛影子投在雪地，生死只在可汗一瞬决断。",
      nanming: "闽海万吨福船甲板之上，被俘之红毛夷舰长与走私巨室低头呈上航海图与火器图式，大明水师虎视眈眈。"
    },
    symbol: "⛓️"
  },
  {
    key: "battle",
    nameZh: "战斗",
    titleMap: {
      qing: "【战斗】白刃肉搏 · 踏雪夺锋",
      ming: "【战斗】禁军斩逆 · 殿角鏖战",
      mongol: "【战斗】骑射奔袭 · 苍狼猎杀",
      nanming: "【战斗】接舷跳帮 · 惊涛斩浪"
    },
    descMap: {
      qing: "辽沈密林积雪齐膝，白刃交锋溅起刺目赤血。重甲步兵挺枪突刺，刀光在寒月下撕裂呼啸风雪。",
      ming: "午门回廊飞檐积雪，刺客死士踏碎青砖。锦衣卫飞鱼服翻卷如火，绣春刀连斩七人，鲜血染透御道雕龙。",
      mongol: "大漠落日如血，奔马回身挽拉铁胎硬弓。雕翎重箭撕破朔风呼啸贯穿追兵咽喉，马蹄踏碎漫天黄沙。",
      nanming: "巨浪掀起滔天狂澜，两船舷板撞击剧颤！水师健儿手持藤牌鸟铳，飞索跃登敌船甲板，刀铳齐发火光照海。"
    },
    symbol: "⚔️"
  },
  {
    key: "war",
    nameZh: "战争",
    titleMap: {
      qing: "【战争】一片石狂飚 · 万骑冲阵",
      ming: "【战争】宁远坚城 · 炮火连天",
      mongol: "【战争】长生天誓 · 千军席卷",
      nanming: "【战争】巨舰横江 · 铁甲水师"
    },
    descMap: {
      qing: "一片石黄沙蔽日狂风骤起，两白旗万骑重铠铁骑自石河两翼惊雷般突入！数十万大军生死决战，天翻地覆！",
      ming: "山海雄关城堞耸峙，百门红夷大炮火舌齐吐，震天巨响中城外敌潮化为齑粉，血肉城垣固若金汤！",
      mongol: "长生天苍穹如穹庐倒扣，九游白纛迎风呼啸招展！数十万苍狼铁骑如黑色巨浪淹没地平线，旌旗蔽日！",
      nanming: "长江入海口帆樯如云遮断江面，三层千料战舰舷侧火炮齐轰，惊涛激荡烈焰焚天，江海为之倒悬！"
    },
    symbol: "🛡️"
  },
  {
    key: "romance",
    nameZh: "爱情",
    titleMap: {
      qing: "【风月/羁绊】塞外私誓 · 同袍深情",
      ming: "【风月/羁绊】深宫密约 · 孤忠相许",
      mongol: "【风月/羁绊】穹庐同衾 · 草原长盟",
      nanming: "【风月/羁绊】风涛同舟 · 碧海誓言"
    },
    descMap: {
      qing: "盛京风雪深宵，营帐篝火温酒。两位身披铁甲的同袍眷侣相拥卸下佩刀，在生死难料的入关夜许下一生之诺（含同袍深情羁绊）。",
      ming: "文渊阁摇红残烛之下，内阁重臣与执剑缇骑并肩而立，执手相看。天下板荡生死与共，断袖同心胜似海誓山盟。",
      mongol: "长生天繁星垂落茫茫草原，毡帐内烈酒甘醇。两名挽弓御敌的巴特尔勇士在苏勒德矛下结发缔盟，白头相守。",
      nanming: "远洋巨舰舱房夜灯如豆，窗外波涛汹涌。两位浪涛里并肩掌舵的水手知己紧密依偎，在狂风骇浪中誓作彼此港湾。"
    },
    symbol: "❤️"
  },
  {
    key: "victory",
    nameZh: "胜利",
    titleMap: {
      qing: "【胜利】问鼎燕京 · 九重登极",
      ming: "【胜利】日月重光 · 奉天朝贺",
      mongol: "【胜利】黄金再起 · 汗位加冕",
      nanming: "【胜利】龙旗耀海 · 帝国初安"
    },
    descMap: {
      qing: "摄政王万骑簇拥进驻紫禁城武英殿！金瓦日光炫目，文武百官降表如雪，八旗铁骑定鼎中原两百六十年大一统！",
      ming: "奉天殿九重天门轰然洞开，万国衣冠朝冕旒！勤王大军金甲耀日，日月旗迎风长啸，三百年礼乐江山重沐荣光！",
      mongol: "斡难河源千顶金帐齐聚，忽里勒台大会响彻九霄！万众俯首高呼可汗万岁，黄金家族重新君临大漠南北！",
      nanming: "热兰遮城投降降旗，大明龙旗猎猎插上海外海疆要冲！四海航路畅通无阻，万邦来朝，海上日不落霸业已成！"
    },
    symbol: "👑"
  },
  {
    key: "wealth",
    nameZh: "财富",
    titleMap: {
      qing: "【财富】盛京府库 · 珍宝锦帛",
      ming: "【财富】太仓银库 · 关税充盈",
      mongol: "【财富】万顷牛羊 · 驼道金珠",
      nanming: "【财富】万国宝船 · 香料银山"
    },
    descMap: {
      qing: "八旗内库金铁成山，抄没勋贵府邸所得万箱金银玉器与辽东貂参鹿茸盈库，大军军饷赏赐堆积如山。",
      ming: "户部太仓万库充盈，东南市舶司海贸抽分雪花银锭整齐罗列。国库回春，辽饷三饷尽除，天下民生大定。",
      mongol: "水草丰美牛羊塞道，万峰驼队自茶马古道满载茶砖、苏木与西域玛瑙黄金归来，黄金家族富甲瀚海。",
      nanming: "闽海万料宝船底舱层层码满吕宋鹰洋白银、泰西自鸣钟与南洋肉豆蔻香料，海贸富可敌国，金山照海。"
    },
    symbol: "💰"
  }
];

// SVG 艺术生成器函数
function buildIllustrationSVG(factionKey, categoryKey) {
  const f = FACTIONS[factionKey];
  const cat = CATEGORIES.find(c => c.key === categoryKey);
  const title = cat.titleMap[factionKey];
  const desc = cat.descMap[factionKey];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="100%" height="100%">
  <defs>
    <!-- 专属阵营背景渐变 -->
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="${f.bgLight}" />
      <stop offset="65%" stop-color="${f.bgDark}" />
      <stop offset="100%" stop-color="#020408" />
    </radialGradient>

    <!-- 电影感金色光斑渐变 -->
    <radialGradient id="sunGlow" cx="50%" cy="30%" r="45%">
      <stop offset="0%" stop-color="${f.accent}" stop-opacity="0.35" />
      <stop offset="50%" stop-color="${f.primary}" stop-opacity="0.12" />
      <stop offset="100%" stop-color="transparent" stop-opacity="0" />
    </radialGradient>

    <!-- 主题流光渐变 -->
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${f.primary}" />
      <stop offset="50%" stop-color="${f.secondary}" />
      <stop offset="100%" stop-color="${f.accent}" />
    </linearGradient>

    <!-- 投影与光晕滤镜 -->
    <filter id="epicGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.8" />
    </filter>
  </defs>

  <!-- 1. 画卷黑金底色 -->
  <rect width="960" height="540" fill="url(#bgGrad)" />

  <!-- 2. 电影环境光晕层 -->
  <circle cx="480" cy="200" r="380" fill="url(#sunGlow)" />

  <!-- 3. 背景剪影装饰 (根据阵营变化建筑/山水/海潮) -->
  ${renderBackgroundSilhouette(factionKey)}

  <!-- 4. 核心主题视觉剪影构图 -->
  ${renderCategoryArt(factionKey, categoryKey, f)}

  <!-- 5. 边框典雅暗金纹饰 -->
  <rect x="20" y="20" width="920" height="500" rx="12" fill="none" stroke="${f.primary}" stroke-width="1.5" stroke-opacity="0.4" />
  <rect x="26" y="26" width="908" height="488" rx="8" fill="none" stroke="${f.accent}" stroke-width="0.8" stroke-opacity="0.25" stroke-dasharray="6,4" />

  <!-- 四角祥云/回纹雕花 -->
  <g stroke="${f.accent}" stroke-width="1.5" fill="none" opacity="0.75">
    <path d="M 30 50 L 30 30 L 50 30 M 35 35 L 45 35 M 35 45 L 35 35" />
    <path d="M 930 50 L 930 30 L 910 30 M 925 35 L 915 35 M 925 45 L 925 35" />
    <path d="M 30 490 L 30 510 L 50 510 M 35 505 L 45 505 M 35 495 L 35 505" />
    <path d="M 930 490 L 930 510 L 910 510 M 925 505 L 915 505 M 925 495 L 925 505" />
  </g>

  <!-- 6. 阵营标识与主题徽章 (顶部悬浮) -->
  <g transform="translate(480, 56)" text-anchor="middle">
    <rect x="-140" y="-18" width="280" height="34" rx="17" fill="rgba(8, 14, 22, 0.85)" stroke="${f.primary}" stroke-width="1" />
    <text y="5" font-family="'Noto Serif SC', 'Songti SC', serif" font-size="14" fill="${f.accent}" font-weight="700" letter-spacing="3">
      ${f.name} · ${cat.nameZh}画卷
    </text>
  </g>

  <!-- 7. 画面底部剧场文学说明标牌 (黑金半透遮罩) -->
  <g transform="translate(48, 420)">
    <rect width="864" height="84" rx="8" fill="rgba(6, 10, 16, 0.85)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" filter="url(#softShadow)" />
    <!-- 标牌左侧主题图标 -->
    <text x="32" y="52" font-size="32" filter="url(#epicGlow)">${cat.symbol}</text>
    <!-- 标题 -->
    <text x="80" y="34" font-family="'Noto Serif SC', serif" font-size="18" font-weight="900" fill="${f.accent}" letter-spacing="1">
      ${title}
    </text>
    <!-- 意境散文白描 -->
    <text x="80" y="60" font-family="'Noto Serif SC', serif" font-size="12" fill="#cbd5e1" opacity="0.9" letter-spacing="0.5">
      ${desc}
    </text>
  </g>
</svg>`;
}

// 渲染阵营特色远景剪影
function renderBackgroundSilhouette(factionKey) {
  switch (factionKey) {
    case "qing":
      // 盛京崇政殿重檐、飞雪、辽东崇山长城
      return `<g fill="#0c1824" opacity="0.75">
        <path d="M 0 380 Q 240 320 480 340 T 960 330 L 960 540 L 0 540 Z" />
        <path d="M 120 330 L 140 280 L 160 330 Z M 200 340 L 220 270 L 240 340 Z M 780 320 L 800 260 L 820 320 Z" fill="#081018" />
        <!-- 满洲大殿斗拱剪影 -->
        <path d="M 360 340 L 380 260 L 480 230 L 580 260 L 600 340 Z" fill="#0a1420" />
        <path d="M 330 265 L 480 220 L 630 265 L 610 275 L 480 235 L 350 275 Z" fill="#0f1f30" />
      </g>`;
    case "ming":
      // 紫禁城角楼、奉天殿连绵金顶雕栏
      return `<g fill="#1a0c0a" opacity="0.8">
        <path d="M 0 360 L 180 320 L 320 350 L 540 300 L 760 340 L 960 320 L 960 540 L 0 540 Z" />
        <!-- 殿宇庑殿顶 -->
        <path d="M 280 330 L 320 240 L 480 210 L 640 240 L 680 330 Z" fill="#140807" />
        <path d="M 240 250 L 480 200 L 720 250 L 690 262 L 480 215 L 270 262 Z" fill="#240f0c" />
        <!-- 角楼攒尖顶 -->
        <path d="M 120 340 L 150 260 L 180 340 Z M 780 340 L 810 260 L 840 340 Z" fill="#1c0b09" />
      </g>`;
    case "mongol":
      // 瀚海连绵沙丘、金顶毡帐、苏勒德长矛
      return `<g fill="#0a180f" opacity="0.75">
        <path d="M 0 360 Q 200 310 440 350 T 960 330 L 960 540 L 0 540 Z" />
        <!-- 毡帐圆形穹顶 -->
        <path d="M 380 350 Q 480 240 580 350 Z" fill="#06120b" />
        <path d="M 475 220 L 485 220 L 485 270 L 475 270 Z" fill="#f59e0b" />
        <circle cx="480" cy="216" r="6" fill="#f59e0b" />
        <!-- 远景飞鹰 -->
        <path d="M 220 150 Q 240 140 260 152 Q 275 142 290 150 Q 260 162 220 150 Z" fill="#22c55e" opacity="0.4" />
      </g>`;
    case "nanming":
      // 闽海巨浪、重叠山礁、远洋千帆桅樯
      return `<g fill="#061820" opacity="0.8">
        <path d="M 0 350 Q 180 390 360 340 T 720 360 T 960 330 L 960 540 L 0 540 Z" />
        <!-- 巨舰桅杆与帆影 -->
        <path d="M 450 330 L 450 180 L 455 180 L 455 330 Z" fill="#08222c" />
        <path d="M 455 200 L 540 220 L 535 290 L 455 280 Z" fill="#0b2c39" opacity="0.8" />
        <path d="M 280 340 L 280 220 L 284 220 L 284 340 Z M 284 230 L 330 245 L 325 300 L 284 290 Z" fill="#08222c" opacity="0.7" />
        <path d="M 680 340 L 680 210 L 684 210 L 684 340 Z M 684 220 L 735 238 L 730 295 L 684 285 Z" fill="#08222c" opacity="0.7" />
      </g>`;
  }
}

// 渲染各类别代表性高精度中景与前景构图
function renderCategoryArt(factionKey, categoryKey, f) {
  switch (categoryKey) {
    case "captive":
      // 跪缚受审画面：单膝着地被捕者，身后持戈/按刀守卫
      return `<g transform="translate(480, 290)" text-anchor="middle" filter="url(#softShadow)">
        <!-- 跪地俘虏 -->
        <ellipse cx="-40" cy="50" rx="35" ry="10" fill="#000" opacity="0.5" />
        <path d="M -55 50 L -45 10 L -30 20 L -35 50 Z" fill="${f.secondary}" opacity="0.85" />
        <circle cx="-38" cy="2" r="14" fill="${f.primary}" />
        <!-- 锁链 -->
        <path d="M -30 20 L -10 25 L 0 15 M -45 25 L -20 35" stroke="${f.accent}" stroke-width="2.5" stroke-dasharray="3,3" fill="none" />
        
        <!-- 昂立威严守卫/审讯官 -->
        <ellipse cx="60" cy="55" rx="40" ry="12" fill="#000" opacity="0.6" />
        <path d="M 40 55 L 48 -25 L 75 -25 L 85 55 Z" fill="${f.primary}" />
        <circle cx="62" cy="-40" r="16" fill="${f.accent}" />
        <!-- 佩剑/长戈 -->
        <line x1="30" y1="50" x2="30" y2="-65" stroke="${f.accent}" stroke-width="3.5" />
        <polygon points="26,-65 34,-65 30,-85" fill="${f.accent}" />
      </g>`;

    case "battle":
      // 双刃交击激斗：两道相向劈砍的身影，中央爆发出夺目刀光火星
      return `<g transform="translate(480, 270)" filter="url(#epicGlow)">
        <!-- 左侧突刺冲锋武将 -->
        <path d="M -90 60 L -40 0 L -10 15 L -60 65 Z" fill="${f.primary}" />
        <circle cx="-35" cy="-12" r="15" fill="${f.accent}" />
        <line x1="-30" y1="5" x2="20" y2="-20" stroke="#fff" stroke-width="4" />

        <!-- 右侧迎头劈砍对手 -->
        <path d="M 90 60 L 40 0 L 10 15 L 60 65 Z" fill="${f.secondary}" />
        <circle cx="35" cy="-12" r="15" fill="${f.primary}" />
        <line x1="30" y1="5" x2="-20" y2="-20" stroke="${f.accent}" stroke-width="4" />

        <!-- 刀兵碰撞中心十字爆闪 -->
        <circle cx="0" cy="-20" r="18" fill="#fff" opacity="0.95" />
        <line x1="-40" y1="-20" x2="40" y2="-20" stroke="#fff" stroke-width="3" />
        <line x1="0" y1="-60" x2="0" y2="20" stroke="#fff" stroke-width="3" />
        <line x1="-25" y1="-45" x2="25" y2="5" stroke="${f.accent}" stroke-width="2" />
      </g>`;

    case "war":
      // 千军万马军旗冲锋：阵列长矛与冲天烽火狼烟
      return `<g transform="translate(480, 280)" filter="url(#softShadow)">
        <!-- 滚滚狼烟 -->
        <path d="M -180 50 Q -150 -50 -100 -120 Q -60 -180 0 -220 Q 60 -170 120 -110 Q 180 -40 200 50 Z" fill="${f.secondary}" opacity="0.25" />
        <!-- 军旗招展 -->
        <line x1="-60" y1="60" x2="-60" y2="-90" stroke="${f.accent}" stroke-width="4" />
        <polygon points="-60,-90 20,-60 -60,-30" fill="${f.primary}" opacity="0.9" />
        <text x="-40" y="-55" font-size="18" font-weight="900" fill="#000">${f.name.substring(0, 1)}</text>

        <!-- 密密麻麻长矛阵列 -->
        <g stroke="${f.primary}" stroke-width="2.5" opacity="0.85">
          <line x1="-160" y1="50" x2="-110" y2="-50" />
          <line x1="-130" y1="50" x2="-80" y2="-60" />
          <line x1="-90" y1="50" x2="-40" y2="-70" />
          <line x1="60" y1="50" x2="110" y2="-55" />
          <line x1="100" y1="50" x2="140" y2="-65" />
          <line x1="130" y1="50" x2="170" y2="-45" />
        </g>
      </g>`;

    case "romance":
      // 深情依偎眷侣（特别支持生死同袍与断袖同心相伴）：双人剪影额头相抵、执手并立
      return `<g transform="translate(480, 265)" filter="url(#softShadow)">
        <!-- 漫天柔和烛光/星辰微粒 -->
        <circle cx="-50" cy="-60" r="2.5" fill="${f.accent}" opacity="0.8" />
        <circle cx="60" cy="-70" r="3" fill="#fff" opacity="0.9" />
        <circle cx="0" cy="-90" r="2" fill="${f.accent}" opacity="0.7" />

        <!-- 两人相依身影 (同袍深情) -->
        <path d="M -50 70 L -30 0 L 0 10 L -15 70 Z" fill="${f.primary}" opacity="0.9" />
        <circle cx="-25" cy="-18" r="16" fill="${f.accent}" />

        <path d="M 50 70 L 30 0 L 0 10 L 15 70 Z" fill="${f.secondary}" opacity="0.9" />
        <circle cx="25" cy="-18" r="16" fill="${f.primary}" />

        <!-- 两人执手相挽核心光晕 -->
        <circle cx="0" cy="18" r="12" fill="${f.accent}" opacity="0.85" filter="url(#epicGlow)" />
        <path d="M -5 18 Q 0 10 5 18 Q 0 26 -5 18 Z" fill="#fff" />
      </g>`;

    case "victory":
      // 胜利问鼎与加冕：高台宝座、高举金樽/神剑、万民跪拜华盖
      return `<g transform="translate(480, 260)" filter="url(#epicGlow)">
        <!-- 冲天胜利光芒 -->
        <polygon points="0,-120 -80,80 80,80" fill="url(#sunGlow)" opacity="0.6" />
        
        <!-- 登极领袖高举宝剑/宝印 -->
        <ellipse cx="0" cy="75" rx="55" ry="15" fill="#000" opacity="0.6" />
        <path d="M -25 70 L -15 -10 L 15 -10 L 25 70 Z" fill="${f.accent}" />
        <circle cx="0" cy="-26" r="16" fill="${f.primary}" />
        
        <!-- 擎剑向天 -->
        <line x1="0" y1="-20" x2="0" y2="-90" stroke="#fff" stroke-width="4" />
        <line x1="-14" y1="-65" x2="14" y2="-65" stroke="${f.accent}" stroke-width="3" />
        <polygon points="0,-95 -5,-88 5,-88" fill="#fff" />

        <!-- 皇冠/战盔翎羽 -->
        <path d="M -8 -40 L 0 -58 L 8 -40 Z" fill="${f.accent}" />
      </g>`;

    case "wealth":
      // 宝藏如山银库金山：层层金银元宝、丝绸宝箱、光芒四射
      return `<g transform="translate(480, 275)" filter="url(#softShadow)">
        <!-- 珍宝箱 -->
        <rect x="-70" y="0" width="140" height="70" rx="6" fill="#2d1d0f" stroke="${f.accent}" stroke-width="3" />
        <path d="M -70 24 L 70 24" stroke="${f.accent}" stroke-width="2" />
        <!-- 宝箱铜锁 -->
        <circle cx="0" cy="24" r="9" fill="${f.accent}" />
        <circle cx="0" cy="24" r="4" fill="#000" />

        <!-- 箱中满溢金锭与珍珠 -->
        <g fill="${f.accent}" filter="url(#epicGlow)">
          <ellipse cx="-30" cy="-5" rx="16" ry="9" />
          <ellipse cx="0" cy="-12" rx="18" ry="10" />
          <ellipse cx="30" cy="-5" rx="16" ry="9" />
          <ellipse cx="-15" cy="-22" rx="14" ry="8" fill="#fff" />
          <ellipse cx="15" cy="-22" rx="14" ry="8" />
        </g>
        <!-- 宝光四射闪星 -->
        <polygon points="-40,-35 -37,-25 -27,-22 -37,-19 -40,-9 -43,-19 -53,-22 -43,-25" fill="#fff" />
        <polygon points="45,-45 48,-35 58,-32 48,-29 45,-19 42,-29 32,-32 42,-35" fill="${f.accent}" />
      </g>`;
  }
}

// 主执行流程
function main() {
  console.log("===============================================================");
  console.log(">>> 开始全量生成四大阵营专属万金油插图套件 (24 幅)...");
  console.log("===============================================================\n");

  const registry = {};

  for (const [fKey, fData] of Object.entries(FACTIONS)) {
    registry[fKey] = {};
    const fDir = path.join(baseDir, fKey);
    if (!fs.existsSync(fDir)) fs.mkdirSync(fDir, { recursive: true });

    console.log(`[阵营: ${fData.name} (${fKey})]`);
    for (const cat of CATEGORIES) {
      const artId = `${fKey}_${cat.key}`;
      const svgFileName = `${cat.key}.svg`;
      const svgPath = path.join(fDir, svgFileName);
      const svgContent = buildIllustrationSVG(fKey, cat.key);

      fs.writeFileSync(svgPath, svgContent, 'utf8');

      registry[fKey][artId] = {
        id: artId,
        faction: fKey,
        factionName: fData.name,
        category: cat.key,
        categoryName: cat.nameZh,
        title: cat.titleMap[fKey],
        description: cat.descMap[fKey],
        symbol: cat.symbol,
        relativePath: `data/illustrations/${fKey}/${svgFileName}`
      };

      console.log(`  ✓ 生成插图: [${artId}] -> ${cat.titleMap[fKey]}`);
    }
    console.log("");
  }

  // 写入 JSON 清单
  const jsonPath = path.join(baseDir, 'illustrations-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`[1/2] 写入索引清单: ${jsonPath}`);

  // 写入前端 JS 运行时文件 (包含内联 SVG 快速渲染)
  const jsPath = path.join(baseDir, 'illustrations-data.js');
  const jsContent = `// =============================================================================
// 《观星纪 · 九州沉浮录》四大阵营专属独立展示套图库 (illustrations-data.js)
// 阵营隔离铁律：每个阵营的 AI 仅可调用本阵营套图，绝不可跨阵营窥探调用！
// =============================================================================

const FACTION_ILLUSTRATION_VAULT = ${JSON.stringify(registry, null, 2)};

if (typeof window !== "undefined") {
  window.FACTION_ILLUSTRATION_VAULT = FACTION_ILLUSTRATION_VAULT;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FACTION_ILLUSTRATION_VAULT };
}
`;
  fs.writeFileSync(jsPath, jsContent, 'utf8');
  console.log(`[2/2] 写入客户端运行时: ${jsPath}`);

  console.log("\n🎉 四大阵营专属 24 幅史诗插图套件全部生成完毕！");
}

main();
