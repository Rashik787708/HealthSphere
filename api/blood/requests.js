import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import {
  generateId,
  sanitizeString,
  isBloodCompatible,
  calculateDistanceKm,
} from '../../lib/validation.js';
import { logAudit, createNotification } from '../../lib/audit.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const urgency = url.searchParams.get('urgency');
      const status = url.searchParams.get('status');
      const bloodGroup = url.searchParams.get('blood_group');
      const id = url.searchParams.get('id');

      if (id) {
        const reqRow = await queryOne(
          `SELECT br.*, u.name as requester_name, u.phone as requester_phone
           FROM blood_requests br
           JOIN users u ON br.requester_id = u.id
           WHERE br.id = ?`,
          [id]
        );
        if (!reqRow) return errorResponse(res, 404, 'Blood request not found.');

        const matches = await query(
          `SELECT dm.*, bd.blood_group as donor_blood_group, bd.location as donor_location, u.name as donor_name, u.phone as donor_phone
           FROM donor_matches dm
           JOIN blood_donors bd ON dm.donor_id = bd.id
           JOIN users u ON bd.user_id = u.id
           WHERE dm.request_id = ?
           ORDER BY dm.distance_km ASC`,
          [id]
        );

        return jsonResponse(res, 200, { request: reqRow, matches }, 'Blood request details');
      }

      let sql = `
        SELECT 
          br.*,
          u.name AS requester_name,
          u.phone AS requester_phone,
          (SELECT COUNT(*) FROM donor_matches dm WHERE dm.request_id = br.id) AS match_count
        FROM blood_requests br
        JOIN users u ON br.requester_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (urgency) {
        sql += ` AND br.urgency = ?`;
        params.push(urgency.toUpperCase());
      }

      if (status) {
        sql += ` AND br.status = ?`;
        params.push(status.toUpperCase());
      }

      if (bloodGroup) {
        sql += ` AND br.blood_group = ?`;
        params.push(bloodGroup.toUpperCase());
      }

      // Order: EMERGENCY first, then URGENT, then NORMAL, then newest
      sql += ` ORDER BY 
        CASE br.urgency 
          WHEN 'EMERGENCY' THEN 1 
          WHEN 'URGENT' THEN 2 
          ELSE 3 
        END ASC, 
        br.created_at DESC`;

      const requests = await query(sql, params);
      return jsonResponse(res, 200, { requests }, 'Blood requests retrieved');
    } catch (err) {
      console.error('Error fetching blood requests:', err);
      return errorResponse(res, 500, 'Failed to fetch blood requests.');
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return;

    try {
      const {
        patient_name,
        blood_group,
        rh_type = '+',
        units_required = 1,
        location,
        urgency = 'NORMAL',
        reason,
        hospital_id,
        latitude,
        longitude,
      } = req.body || {};

      const cleanPatient = sanitizeString(patient_name);
      const cleanGroup = sanitizeString(blood_group).toUpperCase();
      const cleanRh = sanitizeString(rh_type) || '+';
      const cleanLoc = sanitizeString(location);
      const cleanUrgency = sanitizeString(urgency).toUpperCase();

      if (!cleanPatient) return errorResponse(res, 400, 'Patient name is required.');
      if (!cleanGroup) return errorResponse(res, 400, 'Blood group is required.');
      if (!cleanLoc) return errorResponse(res, 400, 'Hospital / collection location is required.');

      const fullRecipientGroup = cleanGroup.includes('+') || cleanGroup.includes('-')
        ? cleanGroup
        : `${cleanGroup}${cleanRh}`;

      const validUrgencies = ['NORMAL', 'URGENT', 'EMERGENCY'];
      const finalUrgency = validUrgencies.includes(cleanUrgency) ? cleanUrgency : 'NORMAL';

      const requestId = generateId('br');
      await execute(
        `INSERT INTO blood_requests (id, requester_id, hospital_id, patient_name, blood_group, rh_type, units_required, location, urgency, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'))`,
        [
          requestId,
          user.id,
          hospital_id || null,
          cleanPatient,
          fullRecipientGroup,
          cleanRh,
          Number(units_required) || 1,
          cleanLoc,
          finalUrgency,
          sanitizeString(reason) || null,
        ]
      );

      // Medical Donor Matching:
      // Fetch available & eligible donors
      const allDonors = await query(
        `SELECT bd.*, u.id as user_id, u.name as user_name 
         FROM blood_donors bd 
         JOIN users u ON bd.user_id = u.id 
         WHERE bd.available = 1 AND bd.eligible = 1 AND bd.user_id != ?`,
        [user.id]
      );

      const matchesCreated = [];
      const reqLat = latitude != null ? Number(latitude) : null;
      const reqLon = longitude != null ? Number(longitude) : null;

      for (const donor of allDonors) {
        if (isBloodCompatible(donor.blood_group, fullRecipientGroup)) {
          const dist = calculateDistanceKm(reqLat, reqLon, donor.latitude, donor.longitude);
          const matchId = generateId('dm');
          const compatibilityText = `Compatible Red Blood Cell Donor (${donor.blood_group} -> ${fullRecipientGroup})`;

          await execute(
            `INSERT INTO donor_matches (id, request_id, donor_id, distance_km, compatibility, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'NOTIFIED', datetime('now'))`,
            [matchId, requestId, donor.id, dist, compatibilityText]
          );

          // Dispatch in-app notification to the donor
          const notifPrefix = finalUrgency === 'EMERGENCY' ? '🚨 EMERGENCY BLOOD REQUEST' : 'Blood Donation Request';
          await createNotification(
            donor.user_id,
            `${notifPrefix}: ${fullRecipientGroup}`,
            `Urgent need for ${units_required} unit(s) of ${fullRecipientGroup} for ${cleanPatient} at ${cleanLoc}. Reason: ${reason || 'Immediate transfusion requirement'}.`,
            finalUrgency === 'EMERGENCY' ? 'EMERGENCY_BLOOD' : 'BLOOD_REQUEST'
          );

          matchesCreated.push({
            id: matchId,
            donor_id: donor.id,
            donor_name: donor.user_name,
            blood_group: donor.blood_group,
            distance_km: dist,
          });
        }
      }

      await logAudit(user.id, `CREATE_BLOOD_REQUEST_${finalUrgency}`, 'blood_requests', requestId, req);

      const created = await queryOne('SELECT * FROM blood_requests WHERE id = ?', [requestId]);

      return jsonResponse(
        res,
        201,
        {
          request: created,
          matchesFound: matchesCreated.length,
          matches: matchesCreated,
        },
        `Blood request created successfully. ${matchesCreated.length} compatible donor(s) notified.`
      );
    } catch (err) {
      console.error('Error creating blood request:', err);
      return errorResponse(res, 500, 'Failed to create blood request.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
