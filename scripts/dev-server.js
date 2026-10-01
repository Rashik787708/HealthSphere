import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse as parseCookie } from 'cookie';
import { parseBody } from '../lib/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');
const API_DIR = path.resolve(ROOT_DIR, 'api');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Route resolver for /api/*
function resolveApiFile(urlPath) {
  // Strip query string and leading /api/
  const clean = urlPath.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const candidate1 = path.join(API_DIR, `${clean}.js`);
  const candidate2 = path.join(API_DIR, clean, 'index.js');

  if (fs.existsSync(candidate1) && fs.statSync(candidate1).isFile()) {
    return candidate1;
  }
  if (fs.existsSync(candidate2) && fs.statSync(candidate2).isFile()) {
    return candidate2;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS & Common Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Enhance res with status() and json() helpers
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
    res.json = function (data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };

    // 1. Handle API routes
    if (pathname.startsWith('/api/')) {
      const apiFile = resolveApiFile(pathname);
      if (!apiFile) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: `API endpoint '${pathname}' not found.` }));
        return;
      }

      // Populate query, cookies, body
      req.query = Object.fromEntries(parsedUrl.searchParams);
      req.cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
      req.body = await parseBody(req);

      const fileUrl = pathToFileURL(apiFile).href;
      const module = await import(fileUrl);
      const handler = module.default || module;

      if (typeof handler === 'function') {
        await handler(req, res);
      } else {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Invalid API handler export.' }));
      }
      return;
    }

    // 2. Handle Static Files from public/
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // If file doesn't exist, try appending .html (clean URL support)
    if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
      filePath = `${filePath}.html`;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 404 Not Found for static
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>404 Not Found</h1><p>The requested page was not found on HealthSphere.</p>');
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
🚀 HealthSphere Server running at http://localhost:${PORT}
🩺 Production-ready healthcare platform
  `);
});
