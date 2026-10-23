// Local HTTP and deployment fixtures only. No keys or model requests.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createStaticServer, parsePort, publicPathAllowed } = require('./server.js');
const { buildStatic } = require('./scripts/build-static.cjs');

let temporary, root, outside, server, port;
const privateMarker = 'fixture-private-not-a-key';
const html = '<!doctype html><link href="styles.css"><script src="app.js"></script><p>九州</p>';

async function fixture(filename, text) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, text);
}

function request(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'jiuzhou-static-')));
  root = path.join(temporary, 'root');
  outside = path.join(temporary, 'outside');
  const fixtures = {
    'index.html': html, 'app.js': '// public game', 'styles.css': 'body{color:gold}',
    'data/world.json': '{"scene":"院落"}', 'data/illustrations/院落.webp': 'fixture-image',
    'harness/runtime.js': '// public runtime', 'assets/icon.svg': '<svg></svg>',
    'server.js': '// internal server', 'README.md': 'internal source notes',
    'config.json': privateMarker, '.env': privateMarker,
    'data/config.json': privateMarker, 'data/secrets.json': privateMarker,
    'data/.credentials.yaml': privateMarker, 'data/node_modules/private.js': privateMarker,
    'harness/test-worker.cjs': '// test adapter', 'harness/README.md': 'internal docs',
    'api/chat.js': '// retired route fixture', 'node_modules/package/index.js': privateMarker,
    'private/internal.js': privateMarker
  };
  for (const [filename, text] of Object.entries(fixtures)) await fixture(path.join(root, filename), text);
  await fixture(path.join(outside, 'escaped.js'), privateMarker);
  await fs.symlink(outside, path.join(root, 'data', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.symlink(path.join(root, 'private'), path.join(root, 'data', 'private-alias'), process.platform === 'win32' ? 'junction' : 'dir');
  server = createStaticServer({ root });
  assert.equal(server.listening, false);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (temporary) {
    assert.equal(path.dirname(temporary), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('jiuzhou-static-'));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('requiring the server neither listens nor inspects local credentials', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const fs = require('node:fs'), os = require('node:os');
    let inspected = false;
    const exists = fs.existsSync;
    fs.existsSync = function(name) {
      if (/config\\.json|credentials|\\.dsh/i.test(String(name))) inspected = true;
      return exists.apply(this, arguments);
    };
    os.homedir = () => { inspected = true; return ''; };
    const server = require('./server.js');
    assert.equal(inspected, false);
    assert.deepEqual(Object.keys(server).sort(), ['PUBLIC_ROOT_FILES', 'createStaticServer', 'parsePort', 'publicPathAllowed'].sort());
  `], { cwd: __dirname, env: { ...process.env, PORT: 'invalid-not-read-on-import' }, timeout: 3000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('GET serves the game with UTF-8 HTML and query strings', async () => {
  for (const url of ['/', '/?v=fixture', '/index.html?version=fixture']) {
    const res = await request(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.headers['content-length'], String(Buffer.byteLength(html)));
    assert.equal(res.body.toString(), html);
  }
});

test('HEAD returns the same headers without a response body', async () => {
  const get = await request('/data/world.json');
  const head = await request('/data/world.json', 'HEAD');
  assert.equal(get.status, 200);
  assert.equal(head.status, get.status);
  assert.equal(head.headers['content-type'], get.headers['content-type']);
  assert.equal(head.headers['content-length'], get.headers['content-length']);
  assert.equal(head.body.length, 0);
});

test('game scripts, styles, JSON and encoded art paths have the correct MIME', async () => {
  for (const [url, mime] of [
    ['/app.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'text/css; charset=utf-8'],
    ['/data/world.json', 'application/json; charset=utf-8'],
    ['/data/illustrations/' + encodeURIComponent('院落.webp'), 'image/webp'],
    ['/harness/runtime.js', 'text/javascript; charset=utf-8'], ['/assets/icon.svg', 'image/svg+xml']
  ]) {
    const res = await request(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers['content-type'], mime, url);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  }
});

test('missing files and directories return 404 without listing or SPA fallback', async () => {
  for (const url of ['/missing', '/data', '/data/', '/harness/', '/data/missing.png']) {
    const res = await request(url);
    assert.equal(res.status, 404, url);
    assert.equal(res.body.toString(), 'Not Found');
  }
  assert.equal((await request('/missing', 'HEAD')).body.length, 0);
});

test('retired API paths are not handlers, even if old route sources remain on disk', async () => {
  for (const url of ['/api/chat', '/api/config', '/api/chat.js']) {
    assert.equal((await request(url)).status, 404, url);
    const post = await request(url, 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    assert.equal((await request('/', method)).status, 405, method);
  }
});

test('private configs, dotfiles, source notes and node_modules are never public', async () => {
  for (const url of ['/config.json', '/CONFIG.JSON', '/.env', '/%2eenv', '/.git/config',
    '/server.js', '/README.md', '/data/config.json', '/data/secrets.json',
    '/data/.credentials.yaml', '/data/node_modules/private.js', '/node_modules/package/index.js',
    '/private/internal.js', '/harness/test-worker.cjs', '/harness/README.md']) {
    const res = await request(url);
    assert.equal(res.status, 404, url);
    assert.ok(!res.body.includes(privateMarker), url);
  }
});

test('raw and encoded traversal, backslashes, NUL and malformed URLs are rejected', async () => {
  for (const url of ['/../config.json', '/data/../../config.json', '/%2e%2e/config.json',
    '/data/%2e%2e/%2e%2e/config.json', '/data/%5c..%5cconfig.json',
    '/data/world.json%00', '/app.js:config.json', '/%invalid']) {
    const res = await request(url);
    assert.ok([400, 404].includes(res.status), url);
    assert.ok(!res.body.includes(privateMarker), url);
  }
});

test('symlinks cannot expose assets outside the public root or private files inside it', async () => {
  for (const url of ['/data/escape/escaped.js', '/data/private-alias/internal.js']) {
    assert.equal((await request(url)).status, 404, url);
  }
});

test('port selection preserves 8088, accepts env or CLI, and rejects invalid values', () => {
  assert.equal(parsePort([], {}), 8088);
  assert.equal(parsePort([], { PORT: '8099' }), 8099);
  assert.equal(parsePort(['--port', '8100'], { PORT: '8099' }), 8100);
  assert.equal(parsePort(['--port=8101'], {}), 8101);
  assert.equal(parsePort(['8102'], {}), 8102);
  assert.equal(parsePort(['--port', '0'], {}), 0);
  for (const invalid of ['-1', '65536', '1.5', 'NaN', '/tmp/socket', '']) {
    assert.throws(() => parsePort(['--port', invalid], {}), /PORT/);
  }
  assert.throws(() => parsePort(['--unknown'], {}), /Usage/);
});

test('a static deployment copies only public assets and never follows symlinks', async () => {
  const result = await buildStatic({ root });
  assert.equal(result.output, path.join(root, 'dist'));
  assert.deepEqual(result.files, ['app.js', 'assets/icon.svg', 'data/illustrations/院落.webp',
    'data/world.json', 'harness/runtime.js', 'index.html', 'styles.css']);
  for (const file of result.files) assert.equal(publicPathAllowed(file), true);
  assert.equal(await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8'), html);
  await assert.rejects(fs.stat(path.join(root, 'dist', 'config.json')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(root, 'dist', 'api')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'config.json'), 'utf8'), privateMarker);
});

test('a replaced output symlink is rejected without deleting its target', async () => {
  const alternate = path.join(temporary, 'alternate-root');
  await fixture(path.join(alternate, 'index.html'), html);
  await fs.symlink(outside, path.join(alternate, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildStatic({ root: alternate }), /symbolic link/);
  assert.equal(await fs.readFile(path.join(outside, 'escaped.js'), 'utf8'), privateMarker);
});

test('current page references and Worker scripts are included in the deployment policy', async () => {
  const index = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
  for (const match of index.matchAll(/\b(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    assert.equal(publicPathAllowed(match[1]), true, match[1]);
  }
  for (const file of ['harness/worker-entry.js', 'harness/protocol.js', 'harness/plugins/world.js',
    'harness/plugins/story.js', 'harness/plugins/illustrations.js', 'harness/provider-google.js']) {
    assert.equal(publicPathAllowed(file), true, file);
  }
});
