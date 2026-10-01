import { query, queryOne } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const notifications = await query(
      `SELECT * FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [user.id]
    );

    const unreadCountRow = await queryOne(
      `SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0`,
      [user.id]
    );

    return jsonResponse(
      res,
      200,
      {
        notifications,
        unreadCount: unreadCountRow?.unread || 0,
      },
      'Notifications retrieved'
    );
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return errorResponse(res, 500, 'Failed to fetch notifications.');
  }
}
