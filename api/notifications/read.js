import { execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { id, all } = req.body || {};

    if (all) {
      await execute(
        `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
        [user.id]
      );
      return jsonResponse(res, 200, {}, 'All notifications marked as read');
    }

    if (id) {
      await execute(
        `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
        [id, user.id]
      );
      return jsonResponse(res, 200, {}, 'Notification marked as read');
    }

    return errorResponse(res, 400, 'Specify notification id or all: true.');
  } catch (err) {
    console.error('Error updating notification read state:', err);
    return errorResponse(res, 500, 'Failed to update notification.');
  }
}
