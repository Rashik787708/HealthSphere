import { queryOne } from '../../lib/db.js';
import { comparePassword, signToken, setSessionCookie } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { isValidEmail, sanitizeString } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  try {
    const { email, password } = req.body || {};
    const cleanEmail = sanitizeString(email).toLowerCase();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return errorResponse(res, 400, 'Please provide a valid email address.');
    }
    if (!password) {
      return errorResponse(res, 400, 'Password is required.');
    }

    const user = await queryOne(
      `SELECT id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at 
       FROM users WHERE email = ?`,
      [cleanEmail]
    );

    if (!user) {
      return errorResponse(res, 401, 'Invalid email or password.');
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      return errorResponse(res, 401, 'Invalid email or password.');
    }

    // Sign session token
    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    setSessionCookie(res, token);

    // Audit log
    await logAudit(user.id, 'LOGIN', 'users', user.id, req);

    // Return safe user object (omit password_hash)
    const { password_hash, ...safeUser } = user;

    return jsonResponse(
      res,
      200,
      {
        user: safeUser,
        token,
      },
      'Logged in successfully'
    );
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse(res, 500, 'Login failed due to a server error.');
  }
}
