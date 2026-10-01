/**
 * HealthSphere Internal API Router
 *
 * The entire HealthSphere backend is deployed as ONE Vercel Serverless
 * Function (`api/[...route].js`) so that the Hobby plan's 12-function limit is
 * never reached. This module holds the route table and dispatches requests
 * internally based on `req.method` + the parsed path.
 *
 * Route modules live in /lib/ and are plain backend code, not Vercel
 * Functions. Each exports a `routes` array of:
 *
 *   { method, path, handler, roles?, rateLimit? }
 *
 * `path` supports `:param` segments. Static routes always win over
 * parameterized ones (e.g. `/appointments/status` beats `/appointments/:id`).
 */

import { errorResponse, jsonResponse } from './response.js';
import { requireUser, rateLimit } from './middleware.js';

import { routes as accountRoutes } from './accounts.js';
import { routes as doctorRoutes } from './doctors.js';
import { routes as appointmentRoutes } from './appointments.js';
import { routes as medicalRecordRoutes } from './medical-records.js';
import { routes as labResultRoutes } from './lab-results.js';
import { routes as prescriptionRoutes } from './prescriptions.js';
import { routes as wellnessRoutes } from './wellness.js';
import { routes as bloodRoutes } from './blood.js';
import { routes as notificationRoutes } from './notifications.js';
import { routes as adminRoutes } from './admin.js';

const ROUTE_MODULES = [
  accountRoutes,
  doctorRoutes,
  appointmentRoutes,
  medicalRecordRoutes,
  labResultRoutes,
  prescriptionRoutes,
  wellnessRoutes,
  bloodRoutes,
  notificationRoutes,
  adminRoutes,
];

/**
 * Compile every route once, sorted so that routes with fewer path parameters
 * are matched first.
 */
const ROUTES = ROUTE_MODULES.flat()
  .map((route) => {
    const segments = route.path.split('/').filter(Boolean);
    return {
      ...route,
      segments,
      paramCount: segments.filter((s) => s.startsWith(':')).length,
    };
  })
  .sort((a, b) => a.paramCount - b.paramCount);

function matchSegments(routeSegments, pathSegments) {
  if (routeSegments.length !== pathSegments.length) return null;

  const params = {};
  for (let i = 0; i < routeSegments.length; i++) {
    const routeSegment = routeSegments[i];
    const pathSegment = pathSegments[i];

    if (routeSegment.startsWith(':')) {
      const value = decodeURIComponent(pathSegment);
      if (!value) return null;
      params[routeSegment.slice(1)] = value;
    } else if (routeSegment !== pathSegment) {
      return null;
    }
  }
  return params;
}

function indexHandler(ctx) {
  return jsonResponse(ctx.res, 200, {
    name: 'HealthSphere API',
    version: '1.0.0',
    database: 'Turso / libSQL',
    docs: '/api/health',
    endpoints: ALL_ROUTES.map((r) => `${r.method} ${r.path}`).sort(),
  }, 'HealthSphere API');
}

function healthHandler(ctx) {
  return jsonResponse(ctx.res, 200, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }, 'HealthSphere API is operational');
}

const BASE_ROUTES = [
  { method: 'GET', path: '/', handler: indexHandler },
  { method: 'GET', path: '/health', handler: healthHandler },
];

const ALL_ROUTES = [
  ...BASE_ROUTES.map((r) => ({
    ...r,
    segments: r.path.split('/').filter(Boolean),
    paramCount: 0,
  })),
  ...ROUTES,
];

/**
 * Dispatch a prepared context to the matching route handler.
 */
export async function dispatch(ctx) {
  const allowedMethods = new Set();
  let methodMismatch = false;

  for (const route of ALL_ROUTES) {
    const params = matchSegments(route.segments, ctx.segments);
    if (!params) continue;

    if (route.method !== ctx.method) {
      allowedMethods.add(route.method);
      methodMismatch = true;
      continue;
    }

    ctx.params = params;
    // Expose path parameters through the same accessor as query strings so
    // `/api/prescriptions/rx_1` and `/api/prescriptions?id=rx_1` behave
    // identically and existing frontend calls keep working untouched.
    for (const [key, value] of Object.entries(params)) {
      if (ctx.query[key] === undefined) ctx.query[key] = value;
    }

    if (route.rateLimit && !rateLimit(ctx, route.rateLimit)) return;

    if (route.roles && route.roles.length > 0) {
      const user = await requireUser(ctx, route.roles);
      if (!user) return;
      ctx.user = user;
    }

    return await route.handler(ctx);
  }

  if (methodMismatch) {
    const allow = [...allowedMethods].sort().join(', ');
    if (!ctx.res.headersSent) ctx.res.setHeader('Allow', allow);
    return errorResponse(
      ctx.res,
      405,
      `Method ${ctx.method} is not allowed for ${ctx.path}. Allowed: ${allow}.`
    );
  }

  return errorResponse(ctx.res, 404, `API endpoint '${ctx.path}' not found.`);
}
