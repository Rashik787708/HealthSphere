import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { sanitizeString } from '../../lib/validation.js';
import { logAudit, createNotification } from '../../lib/audit.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const requestId = url.searchParams.get('request_id');

      // If user is a donor, list matches assigned to them
      const donor = await queryOne('SELECT id FROM blood_donors WHERE user_id = ?', [user.id]);

      let sql = `
        SELECT 
          dm.*,
          br.patient_name,
          br.blood_group as recipient_blood_group,
          br.units_required,
          br.location as request_location,
          br.urgency,
          br.status as request_status,
          u_req.name as requester_name,
          u_req.phone as requester_phone
        FROM donor_matches dm
        JOIN blood_requests br ON dm.request_id = br.id
        JOIN users u_req ON br.requester_id = u_req.id
        WHERE 1=1
      `;
      const params = [];

      if (requestId) {
        sql += ` AND dm.request_id = ?`;
        params.push(requestId);
      } else if (donor) {
        sql += ` AND dm.donor_id = ?`;
        params.push(donor.id);
      }

      sql += ` ORDER BY dm.created_at DESC`;

      const matches = await query(sql, params);
      return jsonResponse(res, 200, { matches }, 'Donor matches retrieved');
    } catch (err) {
      console.error('Error fetching donor matches:', err);
      return errorResponse(res, 500, 'Failed to fetch donor matches.');
    }
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      const { match_id, status } = req.body || {};
      if (!match_id) return errorResponse(res, 400, 'match_id is required.');

      const cleanStatus = sanitizeString(status).toUpperCase();
      const validStatuses = ['NOTIFIED', 'ACCEPTED', 'DECLINED', 'DONATED'];
      if (!validStatuses.includes(cleanStatus)) {
        return errorResponse(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const match = await queryOne(
        `SELECT dm.*, br.requester_id, br.patient_name, br.blood_group, u_don.name as donor_name, u_don.phone as donor_phone
         FROM donor_matches dm
         JOIN blood_requests br ON dm.request_id = br.id
         JOIN blood_donors bd ON dm.donor_id = bd.id
         JOIN users u_don ON bd.user_id = u_don.id
         WHERE dm.id = ?`,
        [match_id]
      );

      if (!match) return errorResponse(res, 404, 'Match record not found.');

      await execute(
        `UPDATE donor_matches SET status = ? WHERE id = ?`,
        [cleanStatus, match_id]
      );

      // If status is DONATED, mark the request as FULFILLED and update donor's last_donation_date
      if (cleanStatus === 'DONATED') {
        await execute(
          `UPDATE blood_requests SET status = 'FULFILLED', updated_at = datetime('now') WHERE id = ?`,
          [match.request_id]
        );
        const todayStr = new Date().toISOString().split('T')[0];
        await execute(
          `UPDATE blood_donors SET last_donation_date = ?, updated_at = datetime('now') WHERE id = ?`,
          [todayStr, match.donor_id]
        );
      }

      // Notify the requester
      await createNotification(
        match.requester_id,
        `Donor Match Update: ${cleanStatus}`,
        `Donor ${match.donor_name} has updated their response to "${cleanStatus}" for patient ${match.patient_name}.`,
        'BLOOD_MATCH'
      );

      await logAudit(user.id, `UPDATE_MATCH_STATUS_${cleanStatus}`, 'donor_matches', match_id, req);

      const updated = await queryOne('SELECT * FROM donor_matches WHERE id = ?', [match_id]);
      return jsonResponse(res, 200, { match: updated }, `Match status updated to ${cleanStatus}`);
    } catch (err) {
      console.error('Error updating match status:', err);
      return errorResponse(res, 500, 'Failed to update match status.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
