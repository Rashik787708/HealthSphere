import { query } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  const adminUser = await requireAuth(req, res, ['ADMIN']);
  if (!adminUser) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const action = url.searchParams.get('action');

    let sql = `
      SELECT al.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      sql += ` AND al.action LIKE ?`;
      params.push(`%${action}%`);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT ?`;
    params.push(limit);

    const logs = await query(sql, params);
    return jsonResponse(res, 200, { logs }, 'Audit logs retrieved');
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return errorResponse(res, 500, 'Failed to fetch audit logs.');
  }
}
