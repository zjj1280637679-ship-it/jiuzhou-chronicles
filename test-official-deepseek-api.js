// test-official-deepseek-api.js
// 针对 DeepSeek 官方 API 规范的全面自动化测试套件
// 涵盖：模型参数、max_tokens 动态边界自适应、思考模式适配、JSON 模式防护、KV Cache 遥测与错误透传

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  adaptMaxTokens,
  adaptThinkingParams,
  adaptResponseFormat,
  buildOutboundPayload,
  server
} = require('./server');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

console.log("===============================================================");
console.log(">>> DeepSeek 官方技术体系 API 规范对齐自动化测试套件");
console.log("===============================================================\n");

// ============================================================================
// 模块 1: max_tokens 边界自适应测试 (预防 HTTP 400)
// ============================================================================
console.log("[1/5] 测试 max_tokens 动态边界自适应 (Legacy [1, 8192] vs V4 [1, 393216]):");

it("deepseek-chat 超限请求 (如 384000) 必须被平滑裁剪至 8192，绝不产生 HTTP 400", () => {
  const result = adaptMaxTokens("deepseek-chat", 384000, false);
  assert.strictEqual(result, 8192, "deepseek-chat 上限必须为 8192");
});

it("deepseek-reasoner 超限请求必须被平滑裁剪至 8192", () => {
  const result = adaptMaxTokens("deepseek-reasoner", 100000, true);
  assert.strictEqual(result, 8192, "deepseek-reasoner 上限必须为 8192");
});

it("deepseek-chat 合法请求 (如 4096) 应原样保留", () => {
  const result = adaptMaxTokens("deepseek-chat", 4096, false);
  assert.strictEqual(result, 4096);
});

it("deepseek-flash (V4 系列) 满血支持 384,000 tokens", () => {
  const result = adaptMaxTokens("deepseek-flash", 384000, true);
  assert.strictEqual(result, 384000, "deepseek-flash 必须支持 384000 tokens");
});

it("deepseek-v4-pro (V4 系列) 超过 393216 时必须裁剪至官方极值 393216", () => {
  const result = adaptMaxTokens("deepseek-v4-pro", 500000, true);
  assert.strictEqual(result, 393216, "必须限制在 393216 上限内");
});

it("未指定 max_tokens 时：V3 默认 8192，V4 思考模式默认 65536", () => {
  assert.strictEqual(adaptMaxTokens("deepseek-reasoner", undefined, true), 8192);
  assert.strictEqual(adaptMaxTokens("deepseek-flash", null, true), 65536);
  assert.strictEqual(adaptMaxTokens("deepseek-flash", 0, false), 8192);
});

// ============================================================================
// 模块 2: JSON Output 规范测试 (response_format 防护)
// ============================================================================
console.log("\n[2/5] 测试 JSON 模式适配与官方兼容性:");

it("deepseek-reasoner 坚决不允许传递 response_format: { type: 'json_object' }，必须自动剥除", () => {
  const rf = adaptResponseFormat("deepseek-reasoner", { type: "json_object" });
  assert.strictEqual(rf, undefined, "deepseek-reasoner 必须剥除 response_format 避免 HTTP 400");
});

it("deepseek-chat 允许使用 response_format: { type: 'json_object' }", () => {
  const rf = adaptResponseFormat("deepseek-chat", { type: "json_object" });
  assert.deepStrictEqual(rf, { type: "json_object" });
});

it("deepseek-flash 允许使用 response_format: { type: 'json_object' }", () => {
  const rf = adaptResponseFormat("deepseek-flash", { type: "json_object" });
  assert.deepStrictEqual(rf, { type: "json_object" });
});

it("deepseek-v4-pro 允许使用 response_format: { type: 'json_object' }", () => {
  const rf = adaptResponseFormat("deepseek-v4-pro", { type: "json_object" });
  assert.deepStrictEqual(rf, { type: "json_object" });
});

// ============================================================================
// 模块 3: 思考模式参数适配测试 (OpenAI 协议思考控制与 effort 映射)
// ============================================================================
console.log("\n[3/5] 测试思考模式参数适配 (Thinking Mode & Reasoning Effort):");

it("deepseek-chat 不应注入 thinking 或 reasoning_effort 参数", () => {
  const params = adaptThinkingParams("deepseek-chat", { reasoning_effort: "high" });
  assert.strictEqual(Object.keys(params).length, 0, "deepseek-chat 必须保持纯净聊天格式");
});

it("deepseek-reasoner 不应注入额外的 thinking 启闭开关", () => {
  const params = adaptThinkingParams("deepseek-reasoner", { thinking: { type: "disabled" } });
  assert.strictEqual(Object.keys(params).length, 0, "deepseek-reasoner 为固有思考模型");
});

it("deepseek-v4-pro 遵循 api-contract.md：思考始终开启，禁止 fake disabled 开关", () => {
  const params = adaptThinkingParams("deepseek-v4-pro", { thinking: { type: "disabled" }, reasoning_effort: "low" });
  assert.deepStrictEqual(params.thinking, { type: "enabled" });
  assert.strictEqual(params.reasoning_effort, "low");
});

it("deepseek-v4-pro 缺省 reasoning_effort 默认为 high，支持 effort 映射", () => {
  const paramsDefault = adaptThinkingParams("deepseek-v4-pro", {});
  assert.strictEqual(paramsDefault.reasoning_effort, "high");

  const paramsMinimal = adaptThinkingParams("deepseek-v4-pro", { reasoning_effort: "minimal" });
  assert.strictEqual(paramsMinimal.reasoning_effort, "low");

  const paramsUltra = adaptThinkingParams("deepseek-v4-pro", { reasoning_effort: "ultra" });
  assert.strictEqual(paramsUltra.reasoning_effort, "max");
});

it("deepseek-flash 支持思考开关开启与关闭", () => {
  const enabled = adaptThinkingParams("deepseek-flash", { thinking: { type: "enabled" }, reasoning_effort: "max" });
  assert.deepStrictEqual(enabled.thinking, { type: "enabled" });
  assert.strictEqual(enabled.reasoning_effort, "max");

  const disabled = adaptThinkingParams("deepseek-flash", { thinking: { type: "disabled" } });
  assert.deepStrictEqual(disabled.thinking, { type: "disabled" });
  assert.strictEqual(disabled.reasoning_effort, "none");
});

// ============================================================================
// 模块 4: buildOutboundPayload 综合载荷构造测试
// ============================================================================
console.log("\n[4/5] 测试 buildOutboundPayload 综合上行载荷生成:");

it("deepseek-reasoner 载荷：max_tokens 安全限制 8192，无 response_format，无冗余 thinking", () => {
  const payload = buildOutboundPayload({
    model: "deepseek-reasoner",
    messages: [{ role: "user", content: "请推演燕京局势" }],
    max_tokens: 384000,
    response_format: { type: "json_object" }
  }, { model: "deepseek-reasoner", maxTokens: 384000 });

  assert.strictEqual(payload.model, "deepseek-reasoner");
  assert.strictEqual(payload.max_tokens, 8192);
  assert.strictEqual(payload.response_format, undefined);
  assert.strictEqual(payload.thinking, undefined);
  assert.strictEqual(payload.stream, false);
});

it("deepseek-v4-pro 载荷：max_tokens 支持大容量，response_format 保留，思考开启", () => {
  const payload = buildOutboundPayload({
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "请返回 JSON" }],
    max_tokens: 150000,
    response_format: { type: "json_object" },
    reasoning_effort: "max"
  }, {});

  assert.strictEqual(payload.model, "deepseek-v4-pro");
  assert.strictEqual(payload.max_tokens, 150000);
  assert.deepStrictEqual(payload.response_format, { type: "json_object" });
  assert.deepStrictEqual(payload.thinking, { type: "enabled" });
  assert.strictEqual(payload.reasoning_effort, "max");
});

// ============================================================================
// 模块 5: 端到端网关代理、KV Cache 遥测与错误码透传测试
// ============================================================================
console.log("\n[5/5] 测试端到端 HTTP 网关代理、KV Cache 遥测指标与错误透传:");

async function runGatewayTests() {
  const configPath = path.join(__dirname, 'config.json');
  let originalConfig = null;
  if (fs.existsSync(configPath)) {
    originalConfig = fs.readFileSync(configPath, 'utf8');
  }

  // 1. 创建本地 Mock DeepSeek Upstream Server
  let mockReceivedRequest = null;
  let mockStatusCode = 200;
  let mockResponseBody = {};
  let mockResponseHeaders = { 'Content-Type': 'application/json', 'x-request-id': 'mock-ds-req-9988' };

  const mockUpstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      mockReceivedRequest = {
        method: req.method,
        headers: req.headers,
        body: body ? JSON.parse(body) : {}
      };
      res.writeHead(mockStatusCode, mockResponseHeaders);
      res.end(JSON.stringify(mockResponseBody));
    });
  });

  await new Promise(resolve => mockUpstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = mockUpstream.address().port;
  const mockEndpoint = `http://127.0.0.1:${upstreamPort}/chat/completions`;

  // 2. 启动测试网关
  const gatewayPort = 18088;
  await new Promise(resolve => server.listen(gatewayPort, '127.0.0.1', resolve));

  function makePostRequest(urlStr, headers, bodyObj) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = http.request(u, {
        method: 'POST',
        headers: headers
      }, (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(resData); } catch (e) { parsed = resData; }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });
      req.on('error', reject);
      if (bodyObj !== undefined) {
        req.write(typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj));
      }
      req.end();
    });
  }

  try {
    // A. 未配置 API Key 时的 401 报错
    await itAsync("未配置 API Key 访问网关时，返回 401 与规范化错误结构", async () => {
      // 临时清空当前服务端配置中的 apiKey
      const configRes = await makePostRequest(`http://127.0.0.1:${gatewayPort}/api/config`, { 'Content-Type': 'application/json' }, {
        apiKey: "",
        endpoint: mockEndpoint
      });
      assert.strictEqual(configRes.status, 200);

      const chatRes = await makePostRequest(`http://127.0.0.1:${gatewayPort}/api/chat`, { 'Content-Type': 'application/json' }, {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }]
      });
      assert.strictEqual(chatRes.status, 401);
      assert.strictEqual(chatRes.body.error.code, "NO_API_KEY");
    });

    // B. 设置有效 Key 并进行正常代理转发
    await itAsync("配置 Key 后，网关完整注入 Bearer 鉴权、自适应参数并透传 x-request-id", async () => {
      await makePostRequest(`http://127.0.0.1:${gatewayPort}/api/config`, { 'Content-Type': 'application/json' }, {
        apiKey: "sk-test-deepseek-official-key",
        endpoint: mockEndpoint,
        model: "deepseek-flash"
      });

      mockStatusCode = 200;
      mockResponseBody = {
        id: "chatcmpl-test-001",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: '{"beats": [{"speaker": "范文程", "text": "臣叩请王上定鼎燕京。"}]}',
              reasoning_content: "推演天下大势：顺治元年入关势在必行。"
            },
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 350,
          total_tokens: 1550,
          prompt_cache_hit_tokens: 1000,
          prompt_cache_miss_tokens: 200,
          completion_tokens_details: {
            reasoning_tokens: 180
          }
        }
      };

      const chatRes = await makePostRequest(`http://127.0.0.1:${gatewayPort}/api/chat`, {
        'Content-Type': 'application/json',
        'x-request-id': 'client-trace-7788'
      }, {
        model: "deepseek-reasoner",
        messages: [{ role: "user", content: "请分析关内形势" }],
        max_tokens: 384000, // 故意传一个超限的大值
        response_format: { type: "json_object" } // 故意传 reasoner 不支持的 json_object
      });

      assert.strictEqual(chatRes.status, 200);
      assert.strictEqual(chatRes.headers['x-request-id'], 'mock-ds-req-9988');

      // 验证上游实际接收到的载荷已完全合规清洗：
      assert.strictEqual(mockReceivedRequest.headers.authorization, "Bearer sk-test-deepseek-official-key");
      assert.strictEqual(mockReceivedRequest.headers['x-request-id'], "client-trace-7788");
      assert.strictEqual(mockReceivedRequest.body.model, "deepseek-reasoner");
      assert.strictEqual(mockReceivedRequest.body.max_tokens, 8192, "上游收到的 max_tokens 必须被清洗至 8192");
      assert.strictEqual(mockReceivedRequest.body.response_format, undefined, "上游收到的 response_format 必须被剥除");

      // 验证返回的 usage 字段包含官方 Prompt Cache 遥测数据
      assert.strictEqual(chatRes.body.usage.prompt_cache_hit_tokens, 1000);
      assert.strictEqual(chatRes.body.usage.prompt_cache_miss_tokens, 200);
      assert.strictEqual(chatRes.body.usage.completion_tokens_details.reasoning_tokens, 180);
      assert.strictEqual(chatRes.body.choices[0].message.reasoning_content, "推演天下大势：顺治元年入关势在必行。");
    });

    // C. 上游 HTTP 400 / 429 错误透传测试
    await itAsync("上游发生 400 格式错误时，完整保留状态码与错误信息转发给客户端", async () => {
      mockStatusCode = 400;
      mockResponseBody = {
        error: {
          message: "messages is required and must not be empty",
          type: "invalid_request_error",
          param: "messages",
          code: "invalid_param"
        }
      };

      const chatRes = await makePostRequest(`http://127.0.0.1:${gatewayPort}/api/chat`, {
        'Content-Type': 'application/json'
      }, {
        model: "deepseek-flash",
        messages: []
      });

      assert.strictEqual(chatRes.status, 400);
      assert.strictEqual(chatRes.body.error.message, "messages is required and must not be empty");
      assert.strictEqual(chatRes.body.error.code, "invalid_param");
    });

    await itAsync("上游发生 429 限速或余额耗尽时，完整透传给客户端", async () => {
      mockStatusCode = 429;
      mockResponseBody = {
        error: {
          message: "Rate limit reached for requests per minute",
          type: "requests_rate_limit_exceeded"
        }
      };

      const chatRes = await makePostRequest(`http://127.0.0.1:${gatewayPort}/api/chat`, {
        'Content-Type': 'application/json'
      }, {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "test rate limit" }]
      });

      assert.strictEqual(chatRes.status, 429);
      assert.strictEqual(chatRes.body.error.type, "requests_rate_limit_exceeded");
    });

  } finally {
    mockUpstream.close();
    server.close();
    if (originalConfig !== null) {
      try {
        fs.writeFileSync(configPath, originalConfig, 'utf8');
      } catch (e) {
        console.warn("[Test] Failed to restore config.json:", e.message);
      }
    }
  }
}

runGatewayTests().then(() => {
  console.log("\n===============================================================");
  console.log(`🎉 全部 ${totalTests} 项 DeepSeek 官方规范对齐测试 100% 顺利通过！(${passedTests}/${totalTests})`);
  console.log("===============================================================");
  process.exit(0);
}).catch(err => {
  console.error("\n❌ 测试套件执行失败:", err);
  process.exit(1);
});
