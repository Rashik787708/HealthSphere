import { clearSessionCookie, getUserFromRequest } from '../../lib/auth.js';
import { jsonResponse } from '../../lib/response.js';
import { logAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  try {
    const user = await getUserFromRequest(req);
    if (user) {
      await logAudit(user.id, 'LOGOUT', 'users', user.id, req);
    }
  } catch (e) {
    // non-fatal
  }

  clearSessionCookie(res);
  return jsonResponse(res, 200, {}, 'Logged out successfully');
}
