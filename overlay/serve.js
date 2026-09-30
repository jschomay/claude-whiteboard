#!/usr/bin/env node
// Serve a whiteboard folder, plus the overlay at /whiteboard.js, and exit on
// its own once no page has been open for a while.
//
//   node serve.js <dir> [--idle-minutes N]
//
// Prints the URL and returns right away (the server keeps running detached).
// Open pages ping /__ping every 30s; with no ping or request for the idle
// window (default 3 min), the server exits.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const dir = path.resolve(args[0] || '.');
const idleIdx = args.indexOf('--idle-minutes');
const idleMs = (idleIdx >= 0 ? Number(args[idleIdx + 1]) : 3) * 60 * 1000;
const OVERLAY = path.join(__dirname, 'whiteboard.js');

// Detach: re-run ourselves in the background and print the URL it reports.
if (!process.env.WHITEBOARD_CHILD) {
  const child = spawn(process.execPath, [__filename, ...args], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, WHITEBOARD_CHILD: '1' },
  });
  child.stdout.once('data', d => {
    process.stdout.write(d);
    child.unref();
    child.stdout.destroy();
    process.exit(0);
  });
  child.once('exit', code => process.exit(code || 1));
  return;
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.md': 'text/markdown', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.txt': 'text/plain',
};

let timer;
function touch() {
  clearTimeout(timer);
  timer = setTimeout(() => process.exit(0), idleMs);
}

const server = http.createServer((req, res) => {
  touch();
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__ping') { res.writeHead(204); return res.end(); }
  let file = url === '/whiteboard.js' ? OVERLAY : path.join(dir, url);
  if (!file.startsWith(dir) && file !== OVERLAY) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(0, '127.0.0.1', () => {
  touch();
  console.log(`http://localhost:${server.address().port}/`);
});
