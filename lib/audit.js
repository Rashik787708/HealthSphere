import { execute } from './db.js';
import { generateId } from './validation.js';

export async function logAudit(userId, action, entity, entityId, req = null) {
  try {
    const id = generateId('aud');
    let ip = '127.0.0.1';
    if (req) {
      ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    }
    await execute(
      `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, userId || null, action, entity, String(entityId || ''), ip]
    );
  } catch (err) {
    console.error('Audit log error (non-fatal):', err);
  }
}

export async function createNotification(userId, title, message, type = 'GENERAL') {
  try {
    const id = generateId('notif');
    await execute(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
      [id, userId, title, message, type]
    );
  } catch (err) {
    console.error('Create notification error (non-fatal):', err);
  }
}
