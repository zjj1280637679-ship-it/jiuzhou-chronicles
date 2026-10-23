# 探索恢复、场景收藏与设置收纳

当前规则沿用掌上剧场布局和浏览器 Web Worker 工具循环；早期实现及共享 AI 实测仅作为 [历史记录](history/EXPLORATION-RECOVERY-AND-SETTINGS.md) 保留。

## 玩家可见行为

- **设置**：单一表单收纳连接来源、生成偏好、连接测试、进度与备份。兼容与输出参数可折叠，测试与保存固定在底栏。DeepSeek、Google Gemini、自定义／本机 API 使用显式来源；空 Key 不会切换来源。无运行日志或诊断面板。
- **连接测试**：使用当前未保存的配置，只请求短回复；不保存设置、不推进剧情、不伪造生成结果。通过后仍需保存才能应用，详见 [API 来源](API-SOURCES.md)。
- **失败恢复**：自由探索报错或取消后，保留原行动与原判定结果，回到已完成世界。玩家可以按原行动重试、明确改用本地剧情或放弃。恢复卡可收起，从更多菜单重开；刷新后不自动发起模型请求。
- **进度与备份**：写入失败显示必要提示并保留上次成功存档，不静默裁正文。备份可导出、选文件预览并明确恢复，不导出或覆盖 API 配置；恢复写入失败不替换当前世界。
- **收藏**：保存已交付段落与本地图像引用，支持回看、复制和取消收藏。同段落去重；收藏失败不影响游戏。
- **输入**：VisualViewport 适配只在当前输入弹窗和明显可见高度变化时生效，提交、取消和收起区保持可用；关闭或失焦后清理。
- **阅读连续性**：打开抉择不消耗已交付选择。返回阅读、续玩和放弃失败尝试后保留对应选择；回溯恢复当时的选择，不把未来选择带入旧场景。
- **叙事**：提示词要求正文呈现已发生行动与眼前悬念，下一步建议放在 `choices`。不以关键词修改玩家正文，也不程序计数、补字或按篇幅拒交。

## 模块边界

| 模块 | 职责 |
| --- | --- |
| `game-recovery.js` | 进度白名单、事务快照、原行动与判定结果、备份格式 |
| `recovery-ui.js/css` | 恢复卡、保存结果、备份预览与明确恢复 |
| `scene-favorites.js` | 场景身份和收藏存储，只收玩家可见字段 |
| `favorites-ui.js`、`favorites.css` | 可选只读收藏界面，不调用模型、不推进世界 |
| `settings-ui.js`、`settings.css` | 表单折叠、底栏与测试结果定位，不承担 API 路由 |
| `input-viewport.js/css` | 输入弹窗的临时视口适配与清理 |

这些界面模块不增加模型工具或收费链路。人物星盘是内置设计参考分布，不是实时玩家采样。

## 验证入口

```powershell
node --unhandled-rejections=strict --test test-ai-connection-probe.cjs test-free-exploration-edges.cjs test-plugin-harness.cjs test-providers.cjs test-ai-provider-routing.cjs test-game-recovery.cjs test-scene-favorites.cjs test-input-viewport.cjs test-personal-api-migration.cjs test-google-provider.cjs
npm test
node test-personal-ai-browser.mjs
node test-mobile-layout.mjs
node test-input-viewport-browser.mjs
node test-exploration-ui.mjs
```

浏览器回归使用隔离测试上下文和模拟模型，不使用玩家登录会话或 API 额度。手机视口覆盖不等于实体键盘实测；生产部署、真实模型和实际缓存命中单独验收。
