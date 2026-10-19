# 《观星纪 · 九州沉浮录》纯本地基准版本 (Pure Local Reference Baseline)

本目录为项目的**纯本地基准参照物**，完整归档并固化了在接入 Cloudflare Worker / Turnstile 远程共享网关之前的纯净双轨架构实现。

---

## 为什么设立此参照物？

在开发网页端与云端静态托管（如 GitHub Pages）的过程中，引入了 Cloudflare Worker 远程网关与 Turnstile 访问验证机制以防盗刷。但这不可避免地增加了远程网络跳数、人机验证弹窗、跨域（CORS）以及对请求上下文长度的保护性限制。

设立本 `pure-local/` 目录作为**基准参照物**，目的是：
1. **对比基准**：随时对照纯本地直连运行时的行为、API 吞吐效率与前缀缓存（KV Cache）表现。
2. **纯粹单机体验**：供本地开发者、私有部署用户或希望彻底绕过任何第三方云网关与验证码的玩家使用。
3. **架构参考**：作为后续重构或多端适配时的“干净金标准”。

---

## 核心架构对比

| 对比维度 | 纯本地基准版本 (`pure-local/`) | 主干云端/混合版本 (`/`) |
| :--- | :--- | :--- |
| **API 网关路由** | 直连本地 `server.js` (`/api/chat`, `/api/config`) | 优先/回退探测 Cloudflare Worker 远程网关 |
| **人机验证 (CAPTCHA)** | **无**（即开即用，直接发送） | Cloudflare Turnstile 人机验证弹窗 |
| **网络跨域 (CORS)** | 同源无跨域阻碍 | 依赖远程 Worker 放行与外网网络状态 |
| **消息上下文** | 100% 完整保留四层前缀架构与全量剧本历史 | 针对公网游客进行了篇幅截断以节约站长 Token |
| **思考模型适配** | 原生兼容 `deepseek-flash`, `v4-pro`, `reasoner` | 限制在 Worker 预设模型 |
| **主要定位** | 本地跑团、沉浸长篇体验、本地对照验证 | GitHub Pages 静态公开试玩演示 |

---

## 文件结构

```text
pure-local/
├── app.js        # 纯本地视觉小说引擎（握手 /api/config，直连 /api/chat，无 Turnstile）
├── server.js     # 纯本地 Node.js 网关服务（自适应 max_tokens 与 thinking 模式）
├── index.html    # 纯净前端视图（移除了 ai-gateway-config.js 外部依赖）
└── README.md     # 本参照物说明文档
```

> **注意**：本目录下的静态资源（如 `data/faction-novels.js`、`styles.css` 等）直接复用仓库根目录公共资产，避免产生重复大文件冗余。

---

## 启动与运行

确保已配置好 `config.json` 或环境变量 `DEEPSEEK_API_KEY`（亦支持自动扫描 `~/.dsh/.credentials.yaml`）：

```bash
# 方式 1: 直接启动纯本地服务 (默认监听 8088 端口)
node pure-local/server.js

# 方式 2: 指定独立端口启动 (避免与根目录已有后台冲突)
$env:PORT=8099; node pure-local/server.js  # PowerShell
# 或
PORT=8099 node pure-local/server.js        # Bash
```

启动后在浏览器打开：
`http://localhost:8088` (或指定的端口)

右上角将立刻识别为 `⚡ V4.1-Flash (共享)`，所有剧情演进与开放输入将直接发给本地后台，秒级响应，零弹窗打扰。
