import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');

// The single catch-all Vercel Serverless Function. Local development imports
// the exact same handler that Vercel deploys, so there is no behavioural drift
// between `npm run dev` and production.
const API_ENTRY = path.resolve(ROOT_DIR, 'api/[...route].js');

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

let apiHandlerPromise = null;

async function getApiHandler() {
  if (!apiHandlerPromise) {
    apiHandlerPromise = import(pathToFileURL(API_ENTRY).href).then((mod) => {
      const handler = mod.default || mod;
      if (typeof handler !== 'function') {
        throw new Error('api/[...route].js must default-export a function handler.');
      }
      return handler;
    });
  }
  return apiHandlerPromise;
}

const server = http.createServer(async (req, res) => {
  try {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
    } catch {
      pathname = '/';
    }

    // 1. API routes -> single catch-all handler
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const handler = await getApiHandler();
      return await handler(req, res);
    }

    // 2. Static files from public/
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Prevent path traversal outside of public/
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('403 Forbidden');
      return;
    }

    // If the file doesn't exist, try appending .html (clean URL support)
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
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
   Single catch-all API function: api/[...route].js
  `);
});
