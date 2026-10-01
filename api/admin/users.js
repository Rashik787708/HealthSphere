import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { sanitizeString } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  const adminUser = await requireAuth(req, res, ['ADMIN']);
  if (!adminUser) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const role = url.searchParams.get('role');
      const search = url.searchParams.get('search');

      let sql = `
        SELECT id, name, email, role, phone, gender, date_of_birth, blood_group, location, created_at, updated_at
        FROM users
        WHERE 1=1
      `;
      const params = [];

      if (role) {
        sql += ` AND role = ?`;
        params.push(role.toUpperCase());
      }

      if (search) {
        const pattern = `%${search.trim().toLowerCase()}%`;
        sql += ` AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(location) LIKE ?)`;
        params.push(pattern, pattern, pattern);
      }

      sql += ` ORDER BY created_at DESC LIMIT 100`;

      const users = await query(sql, params);
      return jsonResponse(res, 200, { users, total: users.length }, 'Users retrieved');
    } catch (err) {
      console.error('Error fetching users:', err);
      return errorResponse(res, 500, 'Failed to fetch users.');
    }
  }

  if (req.method === 'PATCH' || req.method === 'PUT') {
    try {
      const { user_id, role, name, phone, blood_group, location } = req.body || {};
      if (!user_id) return errorResponse(res, 400, 'user_id is required.');

      const target = await queryOne('SELECT * FROM users WHERE id = ?', [user_id]);
      if (!target) return errorResponse(res, 404, 'User not found.');

      const allowedRoles = ['PATIENT', 'DOCTOR', 'HOSPITAL', 'ADMIN'];
      if (role && !allowedRoles.includes(role.toUpperCase())) {
        return errorResponse(res, 400, 'Invalid role.');
      }

      await execute(
        `UPDATE users
         SET role = COALESCE(?, role),
             name = COALESCE(?, name),
             phone = COALESCE(?, phone),
             blood_group = COALESCE(?, blood_group),
             location = COALESCE(?, location),
             updated_at = datetime('now')
         WHERE id = ?`,
        [
          role ? role.toUpperCase() : null,
          name ? sanitizeString(name) : null,
          phone ? sanitizeString(phone) : null,
          blood_group ? sanitizeString(blood_group) : null,
          location ? sanitizeString(location) : null,
          user_id,
        ]
      );

      await logAudit(adminUser.id, 'ADMIN_UPDATE_USER', 'users', user_id, req);

      const updated = await queryOne(
        `SELECT id, name, email, role, phone, gender, blood_group, location, updated_at FROM users WHERE id = ?`,
        [user_id]
      );

      return jsonResponse(res, 200, { user: updated }, 'User updated successfully');
    } catch (err) {
      console.error('Error updating user:', err);
      return errorResponse(res, 500, 'Failed to update user.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
