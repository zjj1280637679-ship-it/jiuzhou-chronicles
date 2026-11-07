# 第五批重绘背景验收（2026-11-07）

## 本次范围

基线 cdd6bac2a8777318264334e41b7e0137bb0983ea。2张全新图接入55节点：皇极殿内1节点，太和殿前A/C线54节点。全286旧资产文件与metadata保持原样；B线27节点及其他阵营不变。批1–4清单保持历史快照。详见 scene-background-batch-5.json。

## 已执行通过

- 两张完整WebP独立人工式视觉审校：无人、无可读文字、无现代物件、无预定结局；构图明显区别旧图，1672×941，无裁切拉伸。此审校不是考古复原认证。
- npm test：四阵营完整通过（协调任务补跑）。
- npm run test:unit：230/230通过。
- npm run test:content：四阵营树及后金243路线验证通过。
- npm run build：288句柄、282默认展示、442公开资源。其 `dist/` 不包含原PNG制作包；当前 Pages 仍以仓库根目录发布，不能据此声称线上已排除原PNG。
- git diff --check：通过。
- 新审计反向恢复完整批4catalog SHA；旧批4审计仍反向恢复原catalog与272项剧情字段。旧资产metadata及字节、旧manifest、剧情和关键生成器哈希全部验证。

## 浏览器验收未完成

已运行原有 test-scene-backgrounds-browser.mjs。默认Playwright浏览器路径不存在；指定现有 /usr/bin/chromium 后，启动遇到 process_singleton socket() failed: Operation not permitted，SIGABRT。未绕过限制，浏览器测试没有进入场景，不能声称通过。

脚本已准备：1440×900与390×844，两张新图纳入124张生成图全尺寸decode；1456绑定检查；55新节点及27保留B线通过真实loadCanonicalNode加载；桌面和手机图片表面断言及代表截图。需要在允许启动浏览器的环境重新执行：

JIUZHOU_SCENE_SCREENSHOTS=/tmp/jiuzhou-batch5 node test-scene-backgrounds-browser.mjs

可通过 JIUZHOU_BROWSER_EXECUTABLE 指定已有浏览器。手机视口皇极殿偏右御座的可见性尚未取得截图证据；实体手机、生产发布与真实API调用均未由本次本地验收验证。
