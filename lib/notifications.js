/**
 * HealthSphere — Notification Routes
 *
 * In-app notification feed and read-state management.
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, fail, requireUser, q, qInt } from './middleware.js';

/* ------------------------------------------------------------------ */
/* GET /notifications                                                  */
/* ------------------------------------------------------------------ */

export async function listNotifications(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const limit = Math.min(Math.max(qInt(ctx, 'limit', 50), 1), 200);
    const unreadOnly = q(ctx, 'unread') === '1' || q(ctx, 'unread') === 'true';

    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    if (unreadOnly) sql += ' AND is_read = 0';
    sql += ' ORDER BY created_at DESC LIMIT ?';

    const notifications = await query(sql, [user.id, limit]);

    const unreadCountRow = await queryOne(
      'SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [user.id]
    );

    return ok(
      ctx,
      { notifications, unreadCount: unreadCountRow?.unread || 0 },
      'Notifications retrieved'
    );
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return fail(ctx, 500, 'Failed to fetch notifications.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /notifications/unread-count                                     */
/* ------------------------------------------------------------------ */

export async function unreadCount(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const row = await queryOne(
      'SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [user.id]
    );
    return ok(ctx, { unreadCount: row?.unread || 0 }, 'Unread count retrieved');
  } catch (err) {
    console.error('Error fetching unread count:', err);
    return fail(ctx, 500, 'Failed to fetch unread count.');
  }
}

/* ------------------------------------------------------------------ */
/* POST / PATCH /notifications/read  |  /notifications/:id/read        */
/* ------------------------------------------------------------------ */

export async function markRead(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const { id, all } = ctx.body || {};
    const targetId = id || ctx.params?.id;

    if (all) {
      await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [user.id]);
      return ok(ctx, {}, 'All notifications marked as read');
    }

    if (targetId) {
      const result = await execute(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [targetId, user.id]
      );
      if (result.rowsAffected === 0) return fail(ctx, 404, 'Notification not found.');
      return ok(ctx, { id: targetId }, 'Notification marked as read');
    }

    return fail(ctx, 400, 'Specify notification id or all: true.');
  } catch (err) {
    console.error('Error updating notification read state:', err);
    return fail(ctx, 500, 'Failed to update notification.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/notifications', handler: listNotifications },
  { method: 'POST', path: '/notifications/read', handler: markRead },
  { method: 'PATCH', path: '/notifications/read', handler: markRead },
  { method: 'GET', path: '/notifications/unread-count', handler: unreadCount },
  { method: 'POST', path: '/notifications/:id/read', handler: markRead },
  { method: 'PATCH', path: '/notifications/:id/read', handler: markRead },
];
