# 九州沉浮录 · Chronicles of Nine Provinces

东方历史题材文字冒险：预置四阵营剧情、可选个人 API 推演、场景插画与手机阅读界面。

**[在线游戏](https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/)**

## 开始游玩

- 默认使用浏览器本地剧情，无需账号或 API Key。
- 要使用 AI，在“设置 → 连接来源”选择 DeepSeek、Google Gemini 或自定义／本机 API，填写该服务的 Key，先“测试请求”，再保存。Google 卡预填官方兼容接口与 `gemini-flash-lite-latest`；具体底层版本以服务响应为准。
- 自定义接口支持不需要 Key 的服务。API 请求直接发往所选服务，不依赖站长共享网关、Cloudflare 后台或另一套密钥服务；服务商需要允许浏览器跨域访问。
- API 设置保存在当前浏览器，不随游戏进度备份导出。连接测试使用未保存的表单，测试成功不等于已保存设置，也不证明所有网络都能连接该服务。

## 游戏与演出

本地剧情和 AI 推演使用现有游戏引擎；失败或取消后保留原行动供玩家重试，也可明确改用本地剧情。程序不自动重发收费请求。

舞台背景持续显示，图片互动使用独立弹窗，抉择只在剧情需要时弹出。背景与图片弹窗是不同的工具与状态，关闭图片不跳页、不改背景。旧插画句柄继续兼容；新增资源见 [插画接口](docs/ILLUSTRATIONS.md)。

首页“藏画入卷（画库）”或游戏菜单“画库”提供常用精选、三级分类和关键词搜索。目录先显示文字，点击“展卷预览”才取图；可复制“后金·骑军突击”这样的调用短语。AI 同样使用精选、分类和搜索，提示词只露出最多 6 幅当前精选，其他图片按需检索。搜索支持空格分隔的多个关键词与分页；图库当前仍是静态文件，无需额外后端。

AI 常用接口已收敛为 8 个工具：图片弹窗统一用 `show_illustration({token})`，剧情可用 `deliver_story({story})` 一次交付；旧工具与 ID 留在执行层兼容。最小调用及回执见 [AI 工具接口](docs/AI-TOOL-API.md)。

篇幅按钮保持 500／2000／5000，仅在模型提示词中分别要求 1000／2500／5500 字正文。程序不统计或验收字数，不因正文较短拒交或强制补写。游戏和设置不显示运行日志、Token、耗时、缓存或工具次数等诊断指标。

## 本地运行

需要 Node.js；没有第三方 npm 生产依赖：

```powershell
npm start
```

打开 [http://localhost:8088](http://localhost:8088)。本地服务只负责静态文件；无需配置文件或服务端 Key。浏览器插件工具使用 Web Worker，建议通过 HTTP 打开，而不是双击 `file://`。

`npm run build` 将公开游戏资源复制到 `dist/`，可用静态 HTTP 服务托管该目录；Vercel 也仅发布此目录。旧 `api/` 代理、自动寻找本机密钥的逻辑及 `pure-local/` 副本已删除。遗留本机配置不再读取，也不会被本地服务或构建发布。

## 开发与验证

```powershell
npm test
npm run test:unit
npm run test:content
npm run build
node test-personal-ai-browser.mjs
node test-mobile-layout.mjs
node test-exploration-ui.mjs
```

`test:unit` 使用本地夹具，覆盖个人来源、插件、演出、恢复及静态发布；`test:content` 检查预置剧情字段、指针和清阵营树结构。浏览器脚本会启动隔离的本地 HTTP 服务，需要可用的 Playwright 与 Chromium；可用 `JIUZHOU_BROWSER_EXECUTABLE` 指定浏览器路径，其他选项见各脚本。离线模拟、真实 API、生产网页和实体手机验证分别记录；模拟通过不等于真实模型或所有网络已通过。

`Jiuzhou real Gemini smoke test` 是单独的真实 API 验收。使用仓库 Actions Secret `GEMINI_API_KEY`，默认模型为 `gemini-flash-lite-latest`；通过正式请求适配器、实际提示词、隔离 Node Worker 和按需文字分片验证图库工具。它不加入日常单元测试，密钥和测试脚本也不会进入公开静态资源。验收专用的短篇偏好、请求预算及分钟额度等待重试不修改游戏设置；此测试不验证浏览器跨域或实体手机网络。

## 文档与目录

| 入口 | 用途 |
| --- | --- |
| [当前状态与决策](docs/CURRENT-STATE-AND-DECISIONS.md) | 当前规则与证据边界 |
| [个人 API 与 Google](docs/API-SOURCES.md) | 来源选择、配置及请求适配 |
| [插件工具循环](harness/README.md) | 浏览器 Web Worker 插件与工具契约 |
| [程序结构检查](docs/ARCHITECTURE-AUDIT.md) | 状态组合、参数约束、交付边界和分阶段拆分 |
| [场景插画](docs/ILLUSTRATIONS.md) | 图库、兼容 ID、背景与图片弹窗工具 |
| [手机界面](docs/MOBILE-THEATER.md) | 阅读、抉择与弹窗布局 |
| [设置、恢复与备份](docs/EXPLORATION-RECOVERY-AND-SETTINGS.md) | 设置收纳、失败恢复、存档与收藏 |
| [历史档案](docs/history/README.md) | 旧共享网关、早期方案和当时测试记录 |

`index.html`、`app.js` 和样式文件组成静态游戏；`harness/` 是模型适配与浏览器插件；`data/` 存放剧情和本地素材；`scripts/build-illustration-catalog.cjs` 构建正式图库。

本项目采用 [MIT 许可证](LICENSE)。
