/**
 * HealthSphere — Single Catch-all Vercel Serverless Function
 * =============================================================================
 * This is the ONLY Vercel Serverless Function in the entire project.
 *
 * The Hobby plan caps deployments at 12 Serverless Functions, and the previous
 * architecture (one file per endpoint under /api) produced 23. All routing now
 * happens inside this handler via lib/router.js, so the platform always sees
 * exactly one function while the public API contract is unchanged:
 *
 *   GET    /api/doctors
 *   GET    /api/doctors/:id
 *   POST   /api/auth/login            ... etc.
 *
 * Backend logic lives in /lib/ and is bundled as plain modules — not detected
 * by Vercel as functions.
 * =============================================================================
 */

import { buildContext, applySecurityHeaders } from '../lib/middleware.js';
import { dispatch } from '../lib/router.js';
import { errorResponse } from '../lib/response.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);

  // Preflight for cross-origin tooling. The frontend is same-origin in
  // production, so this is only relevant to API clients.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  try {
    const ctx = await buildContext(req, res);
    return await dispatch(ctx);
  } catch (err) {
    // Never leak stack traces or database internals to the client.
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      const status = Number(err?.statusCode) || 500;
      return errorResponse(
        res,
        status >= 400 && status < 600 ? status : 500,
        status === 400
          ? 'Invalid request body.'
          : 'An unexpected server error occurred. Please try again.'
      );
    }
    return res.end();
  }
}
