// pure-local/server.js: 纯本地基准参照物专用的轻量级全功能服务端
// 1. 提供静态文件托管 (优先读取 pure-local/ 下的前端，缺失资源自动回退至上层仓库目录)
// 2. 提供统一后端网关 (/api/chat, /api/config)，集中注入开发者 API Key，实现 100% 共享故事树 KV Cache！
// 3. 零外部依赖，使用 Node.js 原生 http / fs / path / https 模块，绝无 Cloudflare Worker / Turnstile 人机验证干扰。

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = process.env.PORT || 8088;
const CONFIG_FILE = fs.existsSync(path.join(__dirname, 'config.json'))
  ? path.join(__dirname, 'config.json')
  : path.join(__dirname, '..', 'config.json');

// 读取或初始化服务端统一配置
function loadServerConfig() {
  let cfg = {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: "deepseek-flash",
    endpoint: "https://api.deepseek.com/chat/completions",
    maxTokens: 384000
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      cfg = { ...cfg, ...saved };
    } catch (e) {
      console.warn("[Server] 读取 config.json 失败:", e.message);
    }
  }

  // 深度凭证自动发现：若未配置 API Key，自动回退扫描 ~/.dsh/.credentials.yaml (DeepSeek Harness 官方凭证)
  if (!cfg.apiKey || cfg.apiKey.trim() === "") {
    try {
      const dshCredPath = path.join(os.homedir(), '.dsh', '.credentials.yaml');
      if (fs.existsSync(dshCredPath)) {
        const content = fs.readFileSync(dshCredPath, 'utf8');
        const match = content.match(/DEEPSEEK_API_KEY:\s*(sk-[a-zA-Z0-9_-]+)/i);
        if (match && match[1]) {
          cfg.apiKey = match[1].trim();
          console.log("[Server] 成功从 ~/.dsh/.credentials.yaml 自动探测并挂载官方 DEEPSEEK_API_KEY！");
        }
      }
    } catch (e) {
      console.warn("[Server] 扫描 ~/.dsh/.credentials.yaml 出错:", e.message);
    }
  }

  return cfg;
}

function saveServerConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error("[Server] 写入 config.json 失败:", e.message);
    return false;
  }
}

/**
 * 依据 DeepSeek 官方规范自适应计算 max_tokens，避免超出模型上限引发 HTTP 400
 */
function adaptMaxTokens(modelName, requestedMaxTokens, isThinking) {
  const model = (modelName || "").toLowerCase();
  const isV4Family = /v4|flash|pro/i.test(model);
  const maxLimit = isV4Family ? 393216 : 8192;

  let val = Number(requestedMaxTokens);
  if (!val || isNaN(val) || val <= 0) {
    if (isV4Family) {
      val = isThinking ? 65536 : 8192;
    } else {
      val = 8192;
    }
  }

  return Math.min(Math.max(1, Math.floor(val)), maxLimit);
}

/**
 * 依据 DeepSeek 官方规范配置思考参数
 */
function adaptThinkingParams(modelName, clientBody) {
  const model = (modelName || "").toLowerCase();
  const isV4Pro = /v4-pro/i.test(model);
  const isFlash = /flash/i.test(model);
  const isReasoner = /reasoner|r1/i.test(model) && !isV4Pro && !isFlash;
  const isChat = /chat/i.test(model) && !isV4Pro && !isFlash;

  const result = {};

  if (isChat || isReasoner) {
    return result;
  }

  if (isV4Pro) {
    let effort = (clientBody && clientBody.reasoning_effort) || "high";
    if (effort === "minimal") effort = "low";
    if (effort === "medium" || effort === "xhigh") effort = "high";
    if (effort === "ultra") effort = "max";
    if (!["low", "high", "max"].includes(effort)) effort = "high";

    result.thinking = { type: "enabled" };
    result.reasoning_effort = effort;
    return result;
  }

  let thinkingEnabled = true;
  if (clientBody && clientBody.thinking && clientBody.thinking.type === "disabled") {
    thinkingEnabled = false;
  } else if (clientBody && clientBody.reasoning_effort === "none") {
    thinkingEnabled = false;
  }

  if (!thinkingEnabled) {
    result.thinking = { type: "disabled" };
    result.reasoning_effort = "none";
  } else {
    result.thinking = { type: "enabled" };
    let effort = (clientBody && clientBody.reasoning_effort) || "high";
    if (effort === "minimal") effort = "low";
    if (effort === "medium" || effort === "xhigh") effort = "high";
    if (effort === "ultra") effort = "max";
    if (!["low", "high", "max"].includes(effort)) effort = "high";
    result.reasoning_effort = effort;
  }

  return result;
}

/**
 * 依据 DeepSeek 官方规范配置 response_format
 */
function adaptResponseFormat(modelName, clientResponseFormat) {
  if (!clientResponseFormat) return undefined;
  const model = (modelName || "").toLowerCase();
  const isReasoner = /reasoner|r1/i.test(model) && !/v4|flash|pro/i.test(model);
  if (isReasoner) {
    return undefined;
  }
  if (clientResponseFormat.type === "json_object") {
    return { type: "json_object" };
  }
  return clientResponseFormat;
}

/**
 * 统一构建完全对齐官方规范的上行载荷
 */
function buildOutboundPayload(clientBody, currentConfig) {
  let targetModel = (clientBody && clientBody.model) || currentConfig.model || "deepseek-flash";
  const lower = (targetModel || "").toLowerCase();
  if (lower.includes("v4.1") || lower.includes("v41") || lower.includes("flash")) {
    targetModel = "deepseek-flash";
  } else if (lower.includes("v4-pro") || lower.includes("v4pro")) {
    targetModel = "deepseek-v4-pro";
  }

  const isThinkingModel = /reasoner|r1|flash|pro/i.test(targetModel);
  const isV4Family = /v4|flash|pro/i.test(targetModel);
  const configuredMax = currentConfig.maxTokens || (isV4Family ? 384000 : 8192);
  const requestedMax = (clientBody && clientBody.max_tokens !== undefined) ? clientBody.max_tokens : configuredMax;

  const finalMaxTokens = adaptMaxTokens(targetModel, requestedMax, isThinkingModel);

  const outbound = {
    model: targetModel,
    messages: (clientBody && clientBody.messages) || [],
    stream: false,
    max_tokens: finalMaxTokens
  };

  const rf = adaptResponseFormat(targetModel, clientBody && clientBody.response_format);
  if (rf) {
    outbound.response_format = rf;
  }

  const thinkingParams = adaptThinkingParams(targetModel, clientBody);
  if (thinkingParams.thinking) outbound.thinking = thinkingParams.thinking;
  if (thinkingParams.reasoning_effort) outbound.reasoning_effort = thinkingParams.reasoning_effort;

  return outbound;
}

let currentConfig = loadServerConfig();

// MIME 映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. CORS 跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 2. API 路由: 获取服务端共享配置状态
  if (pathname === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasServerKey: !!currentConfig.apiKey,
      model: currentConfig.model || "deepseek-flash",
      endpoint: currentConfig.endpoint || "https://api.deepseek.com/chat/completions",
      maxTokens: currentConfig.maxTokens || 384000,
      cacheShareEnabled: true,
      mode: "pure-local",
      message: currentConfig.apiKey ? "纯本地基准 API 已就绪，全网共享故事树 KV Cache" : "服务端尚未配置 DEEPSEEK_API_KEY"
    }));
    return;
  }

  // 3. API 路由: 更新服务端共享配置
  if (pathname === '/api/config' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(bodyStr);
        if (payload.apiKey !== undefined) currentConfig.apiKey = payload.apiKey.trim();
        if (payload.model) currentConfig.model = payload.model.trim();
        if (payload.endpoint) currentConfig.endpoint = payload.endpoint.trim();
        if (payload.maxTokens !== undefined) {
          const parsed = parseInt(payload.maxTokens, 10);
          if (!isNaN(parsed) && parsed > 0) currentConfig.maxTokens = Math.min(parsed, 393216);
        }
        saveServerConfig(currentConfig);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          hasServerKey: !!currentConfig.apiKey,
          model: currentConfig.model,
          endpoint: currentConfig.endpoint,
          maxTokens: currentConfig.maxTokens,
          message: "纯本地服务端配置已保存。"
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid JSON", message: err.message }));
      }
    });
    return;
  }

  // 4. API 路由: 集中网关转发 (/api/chat)
  if (pathname === '/api/chat' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk);
    req.on('end', async () => {
      const activeKey = currentConfig.apiKey || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : "");
      
      if (!activeKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: "纯本地服务端与客户端均未配置有效 DeepSeek API Key。",
            type: "authentication_error",
            code: "NO_API_KEY"
          }
        }));
        return;
      }

      try {
        const clientBody = JSON.parse(bodyStr);
        const targetEndpoint = currentConfig.endpoint || "https://api.deepseek.com/chat/completions";
        const outboundPayload = buildOutboundPayload(clientBody, currentConfig);

        const targetUrl = new URL(targetEndpoint);
        const transport = targetUrl.protocol === 'http:' ? http : https;

        const proxyHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeKey}`
        };

        if (req.headers['x-request-id']) {
          proxyHeaders['x-request-id'] = req.headers['x-request-id'];
        }

        const proxyReq = transport.request(targetUrl, {
          method: 'POST',
          headers: proxyHeaders
        }, (proxyRes) => {
          const chunks = [];
          proxyRes.on('data', chunk => chunks.push(chunk));
          proxyRes.on('end', () => {
            const responseBuffer = Buffer.concat(chunks);
            const forwardHeaders = {
              'Content-Type': proxyRes.headers['content-type'] || 'application/json'
            };
            if (proxyRes.headers['x-request-id']) {
              forwardHeaders['x-request-id'] = proxyRes.headers['x-request-id'];
            }
            res.writeHead(proxyRes.statusCode, forwardHeaders);
            res.end(responseBuffer);
          });
        });

        proxyReq.on('error', (err) => {
          console.error("[Server Proxy Error]:", err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              message: `网关向上游转发请求失败: ${err.message}`,
              type: "gateway_error",
              code: "GATEWAY_ERROR"
            }
          }));
        });

        proxyReq.write(JSON.stringify(outboundPayload));
        proxyReq.end();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: `请求体解析或构造失败: ${err.message}`,
            type: "invalid_request_error",
            code: "BAD_REQUEST"
          }
        }));
      }
    });
    return;
  }

  // 5. 静态文件托管：优先读取本目录，缺失时回退到上层根目录
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    const parentPath = path.join(__dirname, '..', pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(parentPath)) {
      filePath = parentPath;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🎮 《观星纪 · 九州沉浮录》【纯本地参照物基准服务端】已启动！`);
    console.log(`📡 监听地址: http://localhost:${PORT}`);
    console.log(`⚡ 专属模型: ${currentConfig.model}`);
    console.log(`🔑 共享 API Key 状态: ${currentConfig.apiKey ? "已就绪" : "未配置"}`);
    console.log(`🛡️ 架构模式: 纯净单机双轨直连 (零 Cloudflare Worker / 零 Turnstile 验证码)`);
    console.log(`=======================================================`);
  });
}

module.exports = { server, loadServerConfig, buildOutboundPayload };
