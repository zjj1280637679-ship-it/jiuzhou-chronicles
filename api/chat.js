// api/chat.js: Vercel / 云函数服务端的统一代理网关
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const activeKey = process.env.DEEPSEEK_API_KEY || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : "");
  if (!activeKey) {
    return res.status(401).json({
      error: {
        message: "服务端与客户端均未配置有效 DeepSeek API Key。可在设置中配置并保存为个人 Key！",
        type: "authentication_error",
        code: "NO_API_KEY"
      }
    });
  }

  try {
    let clientBody = req.body;
    if (typeof clientBody === 'string') {
      try {
        clientBody = JSON.parse(clientBody);
      } catch (_) {}
    }

    const targetEndpoint = process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/chat/completions";
    let targetModel = (clientBody && clientBody.model) || process.env.DEEPSEEK_MODEL || "deepseek-flash";

    const isReasoner = /reasoner|r1/i.test(targetModel) && !/v4|flash|pro/i.test(targetModel);
    const isV4Family = /v4|flash|pro/i.test(targetModel);

    const outbound = {
      model: targetModel,
      messages: (clientBody && clientBody.messages) || [],
      stream: false,
      max_tokens: Math.min(Math.max(1, (clientBody && clientBody.max_tokens) || 4096), isReasoner ? 8192 : 393216)
    };

    if (!isReasoner && clientBody && clientBody.response_format && clientBody.response_format.type === "json_object") {
      outbound.response_format = { type: "json_object" };
    }
    if (isV4Family) {
      outbound.thinking = { type: "enabled" };
      outbound.reasoning_effort = "high";
    }

    const upstreamRes = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${activeKey}`
      },
      body: JSON.stringify(outbound)
    });

    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
