import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { generateId, sanitizeString } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const bloodGroup = url.searchParams.get('blood_group');
      const location = url.searchParams.get('location');
      const availableOnly = url.searchParams.get('available');

      let sql = `
        SELECT 
          bd.*,
          u.name AS donor_name,
          u.phone AS donor_phone,
          u.gender AS donor_gender
        FROM blood_donors bd
        JOIN users u ON bd.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (bloodGroup) {
        sql += ` AND bd.blood_group = ?`;
        params.push(bloodGroup.trim().toUpperCase());
      }

      if (location) {
        sql += ` AND LOWER(bd.location) LIKE ?`;
        params.push(`%${location.trim().toLowerCase()}%`);
      }

      if (availableOnly === '1' || availableOnly === 'true') {
        sql += ` AND bd.available = 1 AND bd.eligible = 1`;
      }

      sql += ` ORDER BY bd.last_donation_date ASC, bd.created_at DESC`;

      const donors = await query(sql, params);
      return jsonResponse(res, 200, { donors, total: donors.length }, 'Donors retrieved');
    } catch (err) {
      console.error('Error fetching donors:', err);
      return errorResponse(res, 500, 'Failed to fetch blood donors.');
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const {
        blood_group,
        location,
        latitude,
        longitude,
        last_donation_date,
        available = 1,
        eligible = 1,
      } = req.body || {};

      const cleanGroup = sanitizeString(blood_group).toUpperCase() || user.blood_group;
      const cleanLoc = sanitizeString(location) || user.location;

      if (!cleanGroup) {
        return errorResponse(res, 400, 'Blood group is required to register as a donor.');
      }
      if (!cleanLoc) {
        return errorResponse(res, 400, 'Location is required.');
      }

      // Check if user already registered as donor
      const existing = await queryOne('SELECT id FROM blood_donors WHERE user_id = ?', [user.id]);

      let donorId;
      if (existing) {
        donorId = existing.id;
        await execute(
          `UPDATE blood_donors 
           SET blood_group = ?, location = ?, latitude = ?, longitude = ?, last_donation_date = ?, available = ?, eligible = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [
            cleanGroup,
            cleanLoc,
            latitude != null ? Number(latitude) : null,
            longitude != null ? Number(longitude) : null,
            sanitizeString(last_donation_date) || null,
            available ? 1 : 0,
            eligible ? 1 : 0,
            donorId,
          ]
        );
      } else {
        donorId = generateId('don');
        await execute(
          `INSERT INTO blood_donors (id, user_id, blood_group, location, latitude, longitude, last_donation_date, available, eligible, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            donorId,
            user.id,
            cleanGroup,
            cleanLoc,
            latitude != null ? Number(latitude) : null,
            longitude != null ? Number(longitude) : null,
            sanitizeString(last_donation_date) || null,
            available ? 1 : 0,
            eligible ? 1 : 0,
          ]
        );
      }

      // Sync user table blood group & location
      await execute(
        `UPDATE users SET blood_group = ?, location = ? WHERE id = ?`,
        [cleanGroup, cleanLoc, user.id]
      );

      await logAudit(user.id, 'UPDATE_DONOR_PROFILE', 'blood_donors', donorId, req);

      const donor = await queryOne('SELECT * FROM blood_donors WHERE id = ?', [donorId]);
      return jsonResponse(res, 200, { donor }, 'Blood donor profile saved successfully');
    } catch (err) {
      console.error('Error saving donor profile:', err);
      return errorResponse(res, 500, 'Failed to save donor profile.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
