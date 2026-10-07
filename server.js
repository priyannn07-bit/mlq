// Local dev server: serves /public and mounts the same handler Vercel uses.
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/schedule');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  if (req.url.startsWith('/api/schedule')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = null; }
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      handler(req, res);
    });
    return;
  }
  const file = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(3000, () => console.log('http://localhost:3000'));
