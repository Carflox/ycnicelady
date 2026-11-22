import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, relative, sep } from 'node:path';

const root = resolve(process.cwd(), 'dist');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(
      (req.url || '/').split('?')[0].split('#')[0]
    ).replace(/\/{2,}/g, '/');

    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';

    const file = resolve(root, `.${pathname}`);
    const rel = relative(root, file);

    if (rel.startsWith('..' + sep) || rel === '..') {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const data = await readFile(file);

    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });

    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(4173, '0.0.0.0', () => {
  console.log('Preview: http://localhost:4173');
  console.log('Admin: http://localhost:4173/admin');
});
