const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = Number(process.env.PORT || 8769);
const HOST = process.env.HOST || '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const ROOT = __dirname;

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  // 解析到 ROOT 内；任何越出项目目录的路径（原始或 URL 编码的 ..）一律拒绝，防路径穿越
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ['.html', '.css', '.js', '.json'].includes(ext) ? 'no-cache' : 'max-age=3600',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  serveStatic(req, res);
});

let activePort = DEFAULT_PORT;

server.on('listening', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : activePort;
  console.log(`简历工坊 Resume Forge server running at http://localhost:${port}`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT && activePort === DEFAULT_PORT) {
    activePort = DEFAULT_PORT + 1;
    console.warn(`Port ${DEFAULT_PORT} is in use, trying ${activePort}...`);
    server.listen(activePort, HOST);
    return;
  }
  throw err;
});

server.listen(activePort, HOST);
