// Local static preview only. Personal API requests run directly in the browser.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4'
};

// Publish the game assets, rather than the repository or any local credentials.
// The same rule is used by the static deployment build.
const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'favicon.ico', 'app.js', 'illustration-system.js', 'skills-data.js',
  'game-recovery.js', 'scene-favorites.js', 'recovery-ui.js', 'favorites-ui.js',
  'mobile-ui.js', 'settings-ui.js', 'input-viewport.js', 'styles.css', 'mobile.css',
  'settings.css', 'favorites.css', 'recovery-ui.css', 'input-viewport.css',
  'gallery-ui.js', 'gallery.css'
]);

function publicPathAllowed(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some(segment => !segment || segment.startsWith('.') ||
      /[\\\0:]/.test(segment) || /^(?:config(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|node_modules|private)$/i.test(segment))) return false;
  if (segments.length === 1) return PUBLIC_ROOT_FILES.has(relativePath);
  return ['data', 'harness', 'assets'].includes(segments[0]) &&
    Object.hasOwn(MIME_TYPES, path.posix.extname(relativePath).toLowerCase()) &&
    path.posix.extname(relativePath).toLowerCase() !== '.html';
}

function isWithin(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function sendText(req, res, status, message, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(req.method === 'HEAD' ? undefined : message);
}

function createStaticServer({ root = __dirname } = {}) {
  const publicRoot = fs.realpathSync.native(root);
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(req, res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let pathname;
    try {
      // Decode the original path before resolving it, so encoded traversal is
      // rejected instead of being normalized away by the URL parser.
      pathname = decodeURIComponent((req.url || '').split('?')[0]);
    } catch {
      sendText(req, res, 400, 'Bad Request');
      return;
    }
    if (!pathname.startsWith('/') || /[\\\0:]/.test(pathname)) {
      sendText(req, res, 400, 'Bad Request');
      return;
    }
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!publicPathAllowed(relativePath)) {
      sendText(req, res, 404, 'Not Found');
      return;
    }

    try {
      const requestedPath = path.resolve(publicRoot, relativePath);
      if (!isWithin(publicRoot, requestedPath)) {
        sendText(req, res, 404, 'Not Found');
        return;
      }
      const filename = await fs.promises.realpath(requestedPath);
      if (!isWithin(publicRoot, filename) || !publicPathAllowed(path.relative(publicRoot, filename).split(path.sep).join('/'))) {
        sendText(req, res, 404, 'Not Found');
        return;
      }
      const stats = await fs.promises.stat(filename);
      if (!stats.isFile()) {
        sendText(req, res, 404, 'Not Found');
        return;
      }
      const headers = {
        'Content-Type': MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stats.size,
        'X-Content-Type-Options': 'nosniff'
      };
      if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
      }
      const stream = fs.createReadStream(filename);
      stream.once('open', () => {
        res.writeHead(200, headers);
        stream.pipe(res);
      });
      stream.once('error', () => {
        if (res.headersSent) res.destroy();
        else sendText(req, res, 404, 'Not Found');
      });
      res.once('close', () => stream.destroy());
    } catch {
      sendText(req, res, 404, 'Not Found');
    }
  });
}

function parsePort(args = process.argv.slice(2), env = process.env) {
  let raw = env.PORT || '8088';
  if (args.length === 1 && args[0].startsWith('--port=')) raw = args[0].slice(7);
  else if (args.length === 2 && args[0] === '--port') raw = args[1];
  else if (args.length === 1 && /^\d+$/.test(args[0])) raw = args[0];
  else if (args.length) throw new Error('Usage: node server.js [--port PORT]');
  const text = String(raw).trim();
  if (!/^\d+$/.test(text) || Number(text) > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }
  return Number(text);
}

if (require.main === module) {
  try {
    const port = parsePort();
    const server = createStaticServer();
    server.once('error', error => {
      console.error('Static preview failed: ' + error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log('Jiuzhou static preview: http://127.0.0.1:' + server.address().port);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createStaticServer, parsePort, publicPathAllowed, PUBLIC_ROOT_FILES };
