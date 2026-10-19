# 南明电影插画安装入口

在此目录上传文件 `nanming-cinematic-six.zip` 即可触发自动安装。

GitHub Actions 将核验并解包其中六张 JPG，写入 `data/illustrations/nanming/`，同时更新 `illustrations-data.json` 和 `illustrations-data.js` 中六个 `nanming_*` 工具槽位的图片地址。现有 SVG 作为后备文件保留，其余阵营和 API 不受影响。

安装提交由 `github-actions[bot]` 执行；如果 GitHub Pages 没有因机器人提交自动构建，进行一次普通网页提交即可触发部署。请勿在安装包中包含密钥。
