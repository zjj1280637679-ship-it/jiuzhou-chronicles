// api/config.js: Vercel / 云函数服务端的共享配置握手路由
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-flash";
  const endpoint = process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/chat/completions";

  return res.status(200).json({
    hasServerKey: Boolean(apiKey),
    model: model,
    endpoint: endpoint,
    maxTokens: 384000,
    cacheShareEnabled: true,
    message: apiKey ? "平台专属统一 API 已就绪，全网玩家共享故事树缓存" : "服务端尚未配置 DEEPSEEK_API_KEY 环境变量"
  });
};
