import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse, serialize } from 'cookie';
import { queryOne } from './db.js';
import { errorResponse } from './response.js';

const JWT_SECRET = process.env.SESSION_SECRET || 'healthsphere-fallback-session-secret-change-in-prod';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const COOKIE_NAME = 'healthsphere_session';

/**
 * Hash a password
 */
export async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainPassword, salt);
}

/**
 * Compare plain password against hash
 */
export async function comparePassword(plainPassword, hash) {
  return await bcrypt.compare(plainPassword, hash);
}

/**
 * Sign JWT token
 */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Set session cookie on response
 */
export function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieStr = serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: TOKEN_MAX_AGE,
    path: '/',
  });
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Clear session cookie on response
 */
export function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieStr = serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Parse token from request (Bearer header or cookie)
 */
export function getTokenFromRequest(req) {
  // 1. Check Authorization header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Check Cookie header
  const cookieHeader = req.headers['cookie'] || req.headers['Cookie'];
  if (cookieHeader) {
    const cookies = parse(cookieHeader);
    if (cookies[COOKIE_NAME]) {
      return cookies[COOKIE_NAME];
    }
  }

  return null;
}

/**
 * Authenticate request and return user row or null
 */
export async function getUserFromRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) return null;

  const user = await queryOne(
    `SELECT id, name, email, role, phone, gender, date_of_birth, blood_group, location, created_at 
     FROM users WHERE id = ?`,
    [decoded.id]
  );

  return user || null;
}

/**
 * Authorization guard helper
 * @param {Array<string>} allowedRoles e.g. ['ADMIN', 'DOCTOR']
 * Returns user if authorized, otherwise sends 401/403 and returns null
 */
export async function requireAuth(req, res, allowedRoles = []) {
  const user = await getUserFromRequest(req);

  if (!user) {
    errorResponse(res, 401, 'Authentication required. Please log in.');
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    errorResponse(res, 403, `Access forbidden. Required role: ${allowedRoles.join(' or ')}.`);
    return null;
  }

  return user;
}
