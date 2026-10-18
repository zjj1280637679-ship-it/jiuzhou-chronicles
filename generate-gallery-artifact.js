const fs = require('fs');
const path = require('path');

const artifactDir = "C:\\Users\\Administrator.DESKTOP-RNK78NE\\.gemini\\antigravity\\brain\\d2c02ead-b0db-46eb-94d9-0652ae6e91f7";
const dataJsonPath = path.join(__dirname, 'data', 'illustrations', 'illustrations-data.json');
const rawData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));

const factions = [
  { id: 'all', name: '全阵营图谱', icon: '🏛️' },
  { id: 'qing', name: '后金八旗 · 清', icon: '🦅', color: '#38bdf8' },
  { id: 'ming', name: '大明中枢 · 明', icon: '🏛️', color: '#e5b95c' },
  { id: 'mongol', name: '大漠蒙古 · 蒙', icon: '🐎', color: '#22c55e' },
  { id: 'nanming', name: '南国海邦 · 闽', icon: '🌊', color: '#06b6d4' }
];

const categories = [
  { id: 'all', name: '全部主题', icon: '✨' },
  { id: 'captive', name: '俘虏/审问', icon: '⛓️' },
  { id: 'battle', name: '肉搏/死斗', icon: '⚔️' },
  { id: 'war', name: '大军/围城', icon: '🛡️' },
  { id: 'romance', name: '风月/羁绊(含同袍)', icon: '❤️' },
  { id: 'victory', name: '凯旋/加冕', icon: '👑' },
  { id: 'wealth', name: '国库/商贸', icon: '💰' }
];

const allCards = [];

for (const [fKey, fObj] of Object.entries(rawData)) {
  for (const [cKey, item] of Object.entries(fObj)) {
    const filePath = path.join(__dirname, item.relativePath);
    let visualContent = "";
    if (fs.existsSync(filePath)) {
      if (item.relativePath.endsWith('.jpg') || item.relativePath.endsWith('.png')) {
        const b64 = fs.readFileSync(filePath).toString('base64');
        visualContent = `<img src="data:image/jpeg;base64,${b64}" class="w-full h-full object-cover" alt="${item.title}" />`;
      } else {
        visualContent = fs.readFileSync(filePath, 'utf8');
      }
    }
    allCards.push({
      ...item,
      svg: visualContent
    });
  }
}

// 1. 生成 gallery.html (Generative UI)
const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>《九州沉浮录》四大阵营专属独立套图画卷全鉴</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    .svg-container svg {
      width: 100%;
      height: 100%;
      display: block;
      border-radius: 0.5rem;
    }
    .modal-svg-wrap svg {
      width: 100%;
      max-height: 520px;
      display: block;
      border-radius: 0.75rem;
      box-shadow: 0 20px 40px rgba(0,0,0,0.8);
    }
    .hide-scrollbar::-webkit-scrollbar {
      display: none;
    }
    .hide-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-4">

  <div class="max-w-7xl mx-auto bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-6 shadow-xl backdrop-blur-md">
    
    <!-- 头部栏 -->
    <div class="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[var(--border)] gap-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-2xl">🎨</span>
          <h1 class="text-xl md:text-2xl font-bold tracking-tight text-[var(--foreground)]">
            《观星纪 · 九州沉浮录》四大阵营专属独立套图全景鉴赏
          </h1>
        </div>
        <p class="text-xs md:text-sm text-[var(--muted-foreground)] mt-1.5 leading-relaxed">
          4 大独立阵营 × 6 大核心场景（俘虏 / 战斗 / 战争 / 爱情羁绊 / 胜利 / 财富）共 24 幅史诗级矢量画卷 · 100% 阵营绝对隔离
        </p>
      </div>

      <!-- 搜索栏 -->
      <div class="relative w-full md:w-72">
        <input 
          id="search-input" 
          type="text" 
          placeholder="搜索画卷标题、情景、关键词..." 
          class="w-full px-3.5 py-2 pl-9 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-[var(--foreground)]"
          oninput="renderCards()"
        />
        <span class="absolute left-3 top-2.5 text-xs text-[var(--muted-foreground)]">🔍</span>
      </div>
    </div>

    <!-- 过滤器 1: 阵营选择 -->
    <div class="mt-5">
      <div class="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">阵营筛选 (严格隔离架构)</div>
      <div class="flex flex-wrap gap-2">
        ${factions.map(f => `
          <button 
            class="faction-btn px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center gap-1.5 border-[var(--border)] bg-[var(--background)] hover:border-amber-500/50" 
            data-faction="${f.id}" 
            onclick="setFaction('${f.id}')">
            <span>${f.icon}</span>
            <span>${f.name}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <!-- 过滤器 2: 主题场景 -->
    <div class="mt-4">
      <div class="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">情境分类</div>
      <div class="flex flex-wrap gap-2">
        ${categories.map(c => `
          <button 
            class="category-btn px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center gap-1 border-[var(--border)] bg-[var(--background)] hover:border-amber-500/50" 
            data-category="${c.id}" 
            onclick="setCategory('${c.id}')">
            <span>${c.icon}</span>
            <span>${c.name}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <!-- 统计徽章 -->
    <div class="mt-5 flex items-center justify-between text-xs text-[var(--muted-foreground)] px-1">
      <div>当前显示: <span id="count-display" class="font-bold text-amber-500">24</span> / 24 张画卷</div>
      <div class="text-[11px]">💡 点击任意卡片可唤起全屏高清视窗品鉴</div>
    </div>

    <!-- 图片展示网格 -->
    <div id="cards-grid" class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"></div>

  </div>

  <!-- 全屏细赏模态窗 -->
  <div id="modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-300" onclick="closeModal()">
    <div class="bg-[var(--card)] border border-amber-500/40 rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative transition-transform transform scale-95" onclick="event.stopPropagation()">
      <button class="absolute top-4 right-4 text-gray-400 hover:text-white text-lg p-2 rounded-lg bg-black/40 border border-white/10" onclick="closeModal()">✕</button>
      
      <div class="flex items-center gap-2 mb-3">
        <span id="modal-badge" class="px-2.5 py-1 text-xs font-bold rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400"></span>
        <span id="modal-faction" class="text-xs text-[var(--muted-foreground)]"></span>
      </div>

      <h2 id="modal-title" class="text-xl font-bold text-white mb-2 font-serif"></h2>
      
      <div id="modal-svg" class="modal-svg-wrap w-full bg-slate-950 rounded-xl overflow-hidden border border-white/10 my-4 flex items-center justify-center min-h-[300px]"></div>

      <div class="p-3.5 bg-[var(--background)] rounded-xl border border-[var(--border)] text-sm text-slate-300 leading-relaxed font-serif" id="modal-desc"></div>
    </div>
  </div>

  <script>
    const CARDS = ${JSON.stringify(allCards)};
    let selectedFaction = 'all';
    let selectedCategory = 'all';

    function setFaction(fId) {
      selectedFaction = fId;
      document.querySelectorAll('.faction-btn').forEach(b => {
        if (b.dataset.faction === fId) {
          b.className = 'faction-btn px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200 flex items-center gap-1.5 border-amber-500 bg-amber-500/20 text-amber-300 shadow-sm';
        } else {
          b.className = 'faction-btn px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center gap-1.5 border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-amber-500/50';
        }
      });
      renderCards();
    }

    function setCategory(cId) {
      selectedCategory = cId;
      document.querySelectorAll('.category-btn').forEach(b => {
        if (b.dataset.category === cId) {
          b.className = 'category-btn px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200 flex items-center gap-1 border-amber-500 bg-amber-500/20 text-amber-300 shadow-sm';
        } else {
          b.className = 'category-btn px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center gap-1 border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-amber-500/50';
        }
      });
      renderCards();
    }

    function renderCards() {
      const q = (document.getElementById('search-input').value || '').trim().toLowerCase();
      const filtered = CARDS.filter(c => {
        if (selectedFaction !== 'all' && c.faction !== selectedFaction) return false;
        if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
        if (q) {
          const hay = (c.title + ' ' + c.description + ' ' + c.factionName + ' ' + c.categoryName).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      document.getElementById('count-display').innerText = filtered.length;
      const grid = document.getElementById('cards-grid');

      if (filtered.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-sm text-[var(--muted-foreground)]">未找到匹配的画卷条目</div>';
        return;
      }

      grid.innerHTML = filtered.map((c, idx) => {
        const factionColors = {
          qing: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
          ming: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
          mongol: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          nanming: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
        };
        const colorClass = factionColors[c.faction] || 'text-amber-400 border-amber-500/30 bg-amber-500/10';

        return \`
          <div 
            class="group bg-[var(--background)] border border-[var(--border)] hover:border-amber-500/60 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col"
            onclick="openModal(\${idx})">
            
            <!-- 矢量图预览窗口 -->
            <div class="svg-container w-full h-44 bg-slate-950 overflow-hidden relative border-b border-[var(--border)] flex items-center justify-center">
              \${c.svg}
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                <span class="text-xs text-amber-300 bg-black/70 px-2 py-0.5 rounded border border-amber-500/30 font-medium">🔍 点击高清品鉴</span>
              </div>
            </div>

            <!-- 卡片信息区 -->
            <div class="p-4 flex-1 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded border \${colorClass}">
                    \${c.symbol} \${c.categoryName}
                  </span>
                  <span class="text-[11px] text-[var(--muted-foreground)] font-medium">\${c.factionName}</span>
                </div>
                <h3 class="text-sm font-bold text-[var(--foreground)] group-hover:text-amber-400 transition-colors font-serif leading-snug">
                  \${c.title}
                </h3>
                <p class="text-xs text-[var(--muted-foreground)] mt-2 line-clamp-2 leading-relaxed">
                  \${c.description}
                </p>
              </div>

              <div class="mt-3 pt-2.5 border-t border-[var(--border)]/60 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>路径: <code class="text-[10px] bg-black/20 px-1 py-0.5 rounded">\${c.relativePath.split('/').pop()}</code></span>
                <span class="text-amber-500 font-semibold group-hover:translate-x-0.5 transition-transform">展开 ➔</span>
              </div>
            </div>

          </div>
        \`;
      }).join('');
    }

    let currentModalItem = null;
    function openModal(cardIndex) {
      const q = (document.getElementById('search-input').value || '').trim().toLowerCase();
      const filtered = CARDS.filter(c => {
        if (selectedFaction !== 'all' && c.faction !== selectedFaction) return false;
        if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
        if (q) {
          const hay = (c.title + ' ' + c.description + ' ' + c.factionName + ' ' + c.categoryName).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const item = filtered[cardIndex];
      if (!item) return;

      currentModalItem = item;
      document.getElementById('modal-title').innerText = item.title;
      document.getElementById('modal-badge').innerText = item.symbol + ' ' + item.categoryName;
      document.getElementById('modal-faction').innerText = item.factionName + ' 专属插图 (' + item.id + ')';
      document.getElementById('modal-desc').innerText = item.description;
      document.getElementById('modal-svg').innerHTML = item.svg;

      const m = document.getElementById('modal');
      m.classList.remove('opacity-0', 'pointer-events-none');
      m.children[0].classList.remove('scale-95');
      m.children[0].classList.add('scale-100');
    }

    function closeModal() {
      const m = document.getElementById('modal');
      m.classList.add('opacity-0', 'pointer-events-none');
      m.children[0].classList.remove('scale-100');
      m.children[0].classList.add('scale-95');
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    // 初始化
    setFaction('all');
    setCategory('all');
  </script>
</body>
</html>
`;

const htmlOutPath = path.join(artifactDir, 'gallery.html');
fs.writeFileSync(htmlOutPath, htmlContent, 'utf8');
console.log(`Generated HTML Gallery: ${htmlOutPath} (${fs.statSync(htmlOutPath).size} bytes)`);
