const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testProbe() {
  const tmpDir = path.join(os.tmpdir(), 'chrome_cdp_probe_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('[Probe] Launching Chrome...');
  const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tmpDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:8088'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      if (res.ok) {
        targets = await res.json();
        break;
      }
    } catch (_) {}
  }

  console.log('[Probe] Targets found:', targets?.length);
  const pageTarget = targets?.find(t => t.type === 'page');
  console.log('[Probe] Page target:', pageTarget?.url, pageTarget?.webSocketDebuggerUrl);

  if (pageTarget && pageTarget.webSocketDebuggerUrl) {
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    console.log('[Probe] WebSocket connected successfully!');
    ws.close();
  }

  chromeProc.kill();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
  console.log('[Probe] Done.');
}

testProbe().catch(e => {
  console.error('[Probe] Error:', e);
  process.exit(1);
});
