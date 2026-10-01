/**
 * HealthSphere API Middleware
 *
 * Builds a normalized request context for the single catch-all serverless
 * function (api/[...route].js) and provides shared request/response helpers.
 *
 * Nothing in this file is a Vercel Function entry point; it is plain backend
 * code that happens to run inside one.
 */

import { requireAuth } from './auth.js';
import { errorResponse, jsonResponse } from './response.js';

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Best-effort client IP resolution (Vercel, reverse proxies, then socket).
 */
export function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return (
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.headers?.host ||
    'unknown'
  );
}

/**
 * Read and JSON-parse the request body.
 * Vercel pre-parses JSON bodies; the local dev server does not.
 */
export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (req.body.trim() === '') return {};
      try {
        return JSON.parse(req.body);
      } catch {
        const err = new Error('Request body must be valid JSON.');
        err.statusCode = 400;
        throw err;
      }
    }
    if (typeof req.body === 'object') return req.body;
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        const err = new Error('Request body is too large.');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw += chunk.toString();
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('Request body must be valid JSON.');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', () => {
      if (settled) return;
      settled = true;
      resolve({});
    });
  });
}

/**
 * Build the normalized context consumed by every route handler.
 *
 * The `/api` prefix is stripped here so route modules only ever deal with
 * paths like `/doctors/:id`. The original raw URL and query string are
 * preserved on the context for compatibility.
 */
export async function buildContext(req, res) {
  const host = req.headers?.host || 'localhost';
  const rawUrl = req.url || '/api';

  let parsed;
  try {
    parsed = new URL(rawUrl, `http://${host}`);
  } catch {
    parsed = new URL(`http://${host}/api`);
  }

  let pathname = parsed.pathname || '/api';
  if (pathname === '/api' || pathname === '/api/') {
    pathname = '/';
  } else if (pathname.startsWith('/api/')) {
    pathname = `/${pathname.slice('/api/'.length)}`;
  }

  const path = pathname.replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);

  return {
    req,
    res,
    method: (req.method || 'GET').toUpperCase(),
    rawUrl,
    pathname: parsed.pathname,
    path,
    segments,
    params: {},
    query: Object.fromEntries(parsed.searchParams.entries()),
    body: await readBody(req),
    user: null,
    ip: clientIp(req),
  };
}

/* ------------------------------------------------------------------ */
/* Response shortcuts                                                  */
/* ------------------------------------------------------------------ */

export function ok(ctx, data = {}, message = 'Success', status = 200) {
  return jsonResponse(ctx.res, status, data, message);
}

export function created(ctx, data = {}, message = 'Created successfully') {
  return jsonResponse(ctx.res, 201, data, message);
}

export function fail(ctx, status = 400, error = 'An error occurred') {
  return errorResponse(ctx.res, status, error);
}

/* ------------------------------------------------------------------ */
/* Request shortcuts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Read a query-string or path parameter by name.
 * Path parameters are merged into `ctx.query` by the router, so both
 * `/api/doctors?id=doc_1` and `/api/doctors/doc_1` resolve identically.
 */
export function q(ctx, name) {
  const value = ctx.query?.[name];
  return value === undefined ? null : value;
}

export function qInt(ctx, name, fallback) {
  const parsed = parseInt(q(ctx, name) ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function qBool(ctx, name) {
  const value = q(ctx, name);
  return value === '1' || value === 'true';
}

/**
 * Authenticate the current request. Returns the user row, or null after
 * having already written a 401/403 response.
 */
export function requireUser(ctx, allowedRoles = []) {
  return requireAuth(ctx.req, ctx.res, allowedRoles);
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

const buckets = new Map();

function sweepBuckets(now) {
  for (const [key, bucket] of buckets) {
    if (now > bucket.reset) buckets.delete(key);
  }
}

/**
 * In-memory fixed-window rate limiter (best effort on serverless, where each
 * instance keeps its own counters). Returns false and writes 429 when the
 * caller has exceeded the limit.
 */
export function rateLimit(ctx, { max = 30, windowMs = 60_000, bucket = 'default' } = {}) {
  const now = Date.now();
  const key = `${bucket}:${ctx.ip}`;

  let entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + windowMs };
    buckets.set(key, entry);
  }

  entry.count += 1;

  if (buckets.size > 5000) sweepBuckets(now);

  if (entry.count > max) {
    const retryAfter = Math.max(1, Math.ceil((entry.reset - now) / 1000));
    ctx.res.setHeader('Retry-After', String(retryAfter));
    return fail(ctx, 429, 'Too many requests. Please slow down and try again shortly.');
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* Security headers                                                    */
/* ------------------------------------------------------------------ */

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store, max-age=0',
};

export function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!res.headersSent) res.setHeader(key, value);
  }
}
