# 后金第一幕：逐页画面试验

范围只含 `qing_act1` 的四个实际阅读页，不等同于四个剧情节点。原剧情、选择、存档格式和其他幕均不变。

| 页 | 文本情境 | GIF |
|---|---|---|
| 1 | 崇政殿风雪、侍卫与案头急报 | `qing_act1-page-1-action-v1.gif` |
| 2 | 多尔衮按刀主张南下 | `qing_act1-page-2-action-v1.gif` |
| 3 | 范文程叩首劝谏 | `qing_act1-page-3-action-v1.gif` |
| 4 | 三条道路的内心权衡 | `qing_act1-page-4-action-v1.gif` |

素材位置：`data/illustrations/qing/animated/`。每个 GIF 配同名 `-first-frame.png`，从最终 GIF 精确提取，而非旧图或另画的替代图。

## 接线与边界

- `displayDialogue` 先设置实际显示的正文，再刷新媒体。按原文精确匹配本次已制作的四页，不按数字页码推断剧情；回翻/读档对应同一画面。
- AI 改写、自由探索、其他正文未命中时，仍使用原场景图，不将不相干的第一幕页面强配给新文本。
- 换幕不提前按旧页状态刷新，避免新幕加载过程中额外请求上一页。
- 桌面与手机读取同一媒体选择结果，只请求当前页；不预先下载其他页或分支。
- 加载中与加载失败保留当前 GIF 的真实首帧，并展示角落状态；手动重试不会推进剧情。
- 系统减少动态偏好显示对应页首帧，不请求 GIF。显式背景覆盖继续优先。
- 原场景 GIF 和静态资产保留，方便对比或回退。本试验不改变历史画库句柄。

## 可复验命令

```
npm run test:unit
npm test
npm run test:content
npm run build
python scripts/check-gif-posters.py
node test-first-act-pages-browser.mjs
node test-scene-media-browser.mjs
node test-scene-media-status-browser.mjs
```

浏览器脚本要求 Playwright 和 Chromium。逐页脚本用实际方向键/返回按钮覆盖四页前进、选项返回、回翻、存档恢复；也含延迟请求和 HTTP 404 注入。测试截图需人工逐图审查，脚本通过并不代表文学质量、历史准确性或真机 iPhone 已验收。
