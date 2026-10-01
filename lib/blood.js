/**
 * HealthSphere — Blood Network Routes
 *
 * Donor registry, blood requests with medically validated ABO/Rh matching,
 * donor match responses, and the public emergency broadcast feed.
 *
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, created, fail, requireUser, q, qBool } from './middleware.js';
import {
  generateId,
  sanitizeString,
  isBloodCompatible,
  calculateDistanceKm,
} from './validation.js';
import { logAudit, createNotification } from './audit.js';

/* ------------------------------------------------------------------ */
/* GET /blood/donors  |  GET /blood/donors/:id                         */
/* ------------------------------------------------------------------ */

export async function listDonors(ctx) {
  try {
    const id = q(ctx, 'id');

    if (id) {
      const donor = await queryOne(
        `SELECT bd.*, u.name AS donor_name, u.phone AS donor_phone, u.gender AS donor_gender
         FROM blood_donors bd
         JOIN users u ON bd.user_id = u.id
         WHERE bd.id = ?`,
        [id]
      );
      if (!donor) return fail(ctx, 404, 'Donor not found.');
      return ok(ctx, { donor }, 'Donor retrieved');
    }

    const bloodGroup = q(ctx, 'blood_group');
    const location = q(ctx, 'location');
    const availableOnly = qBool(ctx, 'available');

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
      sql += ' AND bd.blood_group = ?';
      params.push(bloodGroup.trim().toUpperCase());
    }
    if (location) {
      sql += ' AND LOWER(bd.location) LIKE ?';
      params.push(`%${location.trim().toLowerCase()}%`);
    }
    if (availableOnly) sql += ' AND bd.available = 1 AND bd.eligible = 1';

    sql += ' ORDER BY bd.last_donation_date ASC, bd.created_at DESC';

    const donors = await query(sql, params);
    return ok(ctx, { donors, total: donors.length }, 'Donors retrieved');
  } catch (err) {
    console.error('Error fetching donors:', err);
    return fail(ctx, 500, 'Failed to fetch blood donors.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /blood/donors                                                  */
/* ------------------------------------------------------------------ */

export async function registerDonor(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const {
      blood_group,
      location,
      latitude,
      longitude,
      last_donation_date,
      available = 1,
      eligible = 1,
    } = ctx.body || {};

    const cleanGroup = sanitizeString(blood_group).toUpperCase() || user.blood_group;
    const cleanLoc = sanitizeString(location) || user.location;

    if (!cleanGroup) return fail(ctx, 400, 'Blood group is required to register as a donor.');
    if (!cleanLoc) return fail(ctx, 400, 'Location is required.');

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

    await execute('UPDATE users SET blood_group = ?, location = ? WHERE id = ?', [
      cleanGroup,
      cleanLoc,
      user.id,
    ]);

    await logAudit(user.id, 'UPDATE_DONOR_PROFILE', 'blood_donors', donorId, ctx.req);

    const donor = await queryOne('SELECT * FROM blood_donors WHERE id = ?', [donorId]);
    return ok(ctx, { donor }, 'Blood donor profile saved successfully');
  } catch (err) {
    console.error('Error saving donor profile:', err);
    return fail(ctx, 500, 'Failed to save donor profile.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /blood/requests  |  GET /blood/requests/:id                     */
/* ------------------------------------------------------------------ */

export async function listRequests(ctx) {
  try {
    const id = q(ctx, 'id');

    if (id) {
      const request = await queryOne(
        `SELECT br.*, u.name as requester_name, u.phone as requester_phone
         FROM blood_requests br
         JOIN users u ON br.requester_id = u.id
         WHERE br.id = ?`,
        [id]
      );
      if (!request) return fail(ctx, 404, 'Blood request not found.');

      const matches = await query(
        `SELECT dm.*, bd.blood_group as donor_blood_group, bd.location as donor_location, u.name as donor_name, u.phone as donor_phone
         FROM donor_matches dm
         JOIN blood_donors bd ON dm.donor_id = bd.id
         JOIN users u ON bd.user_id = u.id
         WHERE dm.request_id = ?
         ORDER BY dm.distance_km ASC`,
        [id]
      );

      return ok(ctx, { request, matches }, 'Blood request details');
    }

    const urgency = q(ctx, 'urgency');
    const status = q(ctx, 'status');
    const bloodGroup = q(ctx, 'blood_group');

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
      sql += ' AND br.urgency = ?';
      params.push(urgency.toUpperCase());
    }
    if (status) {
      sql += ' AND br.status = ?';
      params.push(status.toUpperCase());
    }
    if (bloodGroup) {
      sql += ' AND br.blood_group = ?';
      params.push(bloodGroup.toUpperCase());
    }

    sql += ` ORDER BY
      CASE br.urgency
        WHEN 'EMERGENCY' THEN 1
        WHEN 'URGENT' THEN 2
        ELSE 3
      END ASC,
      br.created_at DESC`;

    const requests = await query(sql, params);
    return ok(ctx, { requests }, 'Blood requests retrieved');
  } catch (err) {
    console.error('Error fetching blood requests:', err);
    return fail(ctx, 500, 'Failed to fetch blood requests.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /blood/requests                                                */
/* ------------------------------------------------------------------ */

export async function createRequest(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

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
    } = ctx.body || {};

    const cleanPatient = sanitizeString(patient_name);
    const cleanGroup = sanitizeString(blood_group).toUpperCase();
    const cleanRh = sanitizeString(rh_type) || '+';
    const cleanLoc = sanitizeString(location);
    const cleanUrgency = sanitizeString(urgency).toUpperCase();

    if (!cleanPatient) return fail(ctx, 400, 'Patient name is required.');
    if (!cleanGroup) return fail(ctx, 400, 'Blood group is required.');
    if (!cleanLoc) return fail(ctx, 400, 'Hospital / collection location is required.');

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

    // Medically validated ABO/Rh donor matching with Haversine proximity.
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
      if (!isBloodCompatible(donor.blood_group, fullRecipientGroup)) continue;

      const dist = calculateDistanceKm(reqLat, reqLon, donor.latitude, donor.longitude);
      const matchId = generateId('dm');
      const compatibilityText = `Compatible Red Blood Cell Donor (${donor.blood_group} -> ${fullRecipientGroup})`;

      await execute(
        `INSERT INTO donor_matches (id, request_id, donor_id, distance_km, compatibility, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'NOTIFIED', datetime('now'))`,
        [matchId, requestId, donor.id, dist, compatibilityText]
      );

      const notifPrefix =
        finalUrgency === 'EMERGENCY' ? '🚨 EMERGENCY BLOOD REQUEST' : 'Blood Donation Request';
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

    if (matchesCreated.length > 0) {
      await execute(
        `UPDATE blood_requests SET status = 'MATCHED', updated_at = datetime('now') WHERE id = ?`,
        [requestId]
      );
    }

    await logAudit(
      user.id,
      `CREATE_BLOOD_REQUEST_${finalUrgency}`,
      'blood_requests',
      requestId,
      ctx.req
    );

    const request = await queryOne('SELECT * FROM blood_requests WHERE id = ?', [requestId]);

    return created(
      ctx,
      {
        request,
        matchesFound: matchesCreated.length,
        matches: matchesCreated,
      },
      `Blood request created successfully. ${matchesCreated.length} compatible donor(s) notified.`
    );
  } catch (err) {
    console.error('Error creating blood request:', err);
    return fail(ctx, 500, 'Failed to create blood request.');
  }
}

/* ------------------------------------------------------------------ */
/* PATCH /blood/requests/:id  (request status)                         */
/* ------------------------------------------------------------------ */

const VALID_REQUEST_STATUSES = ['PENDING', 'MATCHED', 'FULFILLED', 'CANCELLED'];

export async function updateRequestStatus(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const requestId = ctx.params?.id || q(ctx, 'id');
    if (!requestId) return fail(ctx, 400, 'Blood request id is required.');

    const cleanStatus = sanitizeString(ctx.body?.status).toUpperCase();
    if (!VALID_REQUEST_STATUSES.includes(cleanStatus)) {
      return fail(ctx, 400, `Invalid status. Must be one of: ${VALID_REQUEST_STATUSES.join(', ')}`);
    }

    const request = await queryOne(
      'SELECT * FROM blood_requests WHERE id = ?',
      [requestId]
    );
    if (!request) return fail(ctx, 404, 'Blood request not found.');

    if (user.role === 'PATIENT' && request.requester_id !== user.id) {
      return fail(ctx, 403, 'You can only manage your own blood requests.');
    }
    if (user.role === 'HOSPITAL' && request.requester_id !== user.id) {
      return fail(ctx, 403, 'Hospitals can only manage requests they created.');
    }
    if (user.role === 'DOCTOR' && cleanStatus !== 'FULFILLED') {
      return fail(ctx, 403, 'Doctors may only mark blood requests as FULFILLED.');
    }

    await execute(
      `UPDATE blood_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [cleanStatus, requestId]
    );

    await logAudit(
      user.id,
      `UPDATE_BLOOD_REQUEST_${cleanStatus}`,
      'blood_requests',
      requestId,
      ctx.req
    );

    const updated = await queryOne('SELECT * FROM blood_requests WHERE id = ?', [requestId]);
    return ok(ctx, { request: updated }, `Blood request status updated to ${cleanStatus}`);
  } catch (err) {
    console.error('Error updating blood request status:', err);
    return fail(ctx, 500, 'Failed to update blood request status.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /blood/matches  |  POST / PATCH /blood/matches                 */
/* ------------------------------------------------------------------ */

export async function listMatches(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const requestId = q(ctx, 'request_id');

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
      sql += ' AND dm.request_id = ?';
      params.push(requestId);
    } else if (donor) {
      sql += ' AND dm.donor_id = ?';
      params.push(donor.id);
    } else if (user.role !== 'ADMIN' && user.role !== 'HOSPITAL') {
      return ok(ctx, { matches: [] }, 'No donor matches found');
    }

    sql += ' ORDER BY dm.created_at DESC';

    const matches = await query(sql, params);
    return ok(ctx, { matches }, 'Donor matches retrieved');
  } catch (err) {
    console.error('Error fetching donor matches:', err);
    return fail(ctx, 500, 'Failed to fetch donor matches.');
  }
}

const VALID_MATCH_STATUSES = ['NOTIFIED', 'ACCEPTED', 'DECLINED', 'DONATED'];

export async function updateMatch(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const matchId = ctx.body?.match_id || ctx.params?.id;
    if (!matchId) return fail(ctx, 400, 'match_id is required.');

    const cleanStatus = sanitizeString(ctx.body?.status).toUpperCase();
    if (!VALID_MATCH_STATUSES.includes(cleanStatus)) {
      return fail(ctx, 400, `Invalid status. Must be one of: ${VALID_MATCH_STATUSES.join(', ')}`);
    }

    const match = await queryOne(
      `SELECT dm.*, br.requester_id, br.patient_name, br.blood_group, u_don.name as donor_name, u_don.phone as donor_phone
       FROM donor_matches dm
       JOIN blood_requests br ON dm.request_id = br.id
       JOIN blood_donors bd ON dm.donor_id = bd.id
       JOIN users u_don ON bd.user_id = u_don.id
       WHERE dm.id = ?`,
      [matchId]
    );

    if (!match) return fail(ctx, 404, 'Match record not found.');

    // A donor may only respond to their own match; requesters/admins may adjust.
    if (user.role === 'PATIENT' || user.role === 'HOSPITAL') {
      if (match.requester_id !== user.id) {
        return fail(ctx, 403, 'You can only manage donor matches for your own requests.');
      }
    } else if (user.role === 'DOCTOR') {
      return fail(ctx, 403, 'Doctors cannot update donor match status.');
    }

    await execute('UPDATE donor_matches SET status = ? WHERE id = ?', [cleanStatus, matchId]);

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

    await createNotification(
      match.requester_id,
      `Donor Match Update: ${cleanStatus}`,
      `Donor ${match.donor_name} has updated their response to "${cleanStatus}" for patient ${match.patient_name}.`,
      'BLOOD_MATCH'
    );

    await logAudit(user.id, `UPDATE_MATCH_STATUS_${cleanStatus}`, 'donor_matches', matchId, ctx.req);

    const updated = await queryOne('SELECT * FROM donor_matches WHERE id = ?', [matchId]);
    return ok(ctx, { match: updated }, `Match status updated to ${cleanStatus}`);
  } catch (err) {
    console.error('Error updating match status:', err);
    return fail(ctx, 500, 'Failed to update match status.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /blood/emergency  (public)                                      */
/* ------------------------------------------------------------------ */

export async function listEmergency(ctx) {
  try {
    const emergencyRequests = await query(
      `SELECT
        br.*,
        u.name AS requester_name,
        u.phone AS requester_phone,
        (SELECT COUNT(*) FROM donor_matches dm WHERE dm.request_id = br.id) AS match_count
       FROM blood_requests br
       JOIN users u ON br.requester_id = u.id
       WHERE br.urgency = 'EMERGENCY' AND br.status IN ('PENDING', 'MATCHED')
       ORDER BY br.created_at DESC
       LIMIT 10`
    );

    return ok(
      ctx,
      {
        emergencyRequests,
        count: emergencyRequests.length,
        disclaimer:
          'Blood request matching serves as an alert aid. Actual compatibility and donor screening must be verified by licensed blood bank personnel.',
      },
      'Active emergency blood requests'
    );
  } catch (err) {
    console.error('Error fetching emergency requests:', err);
    return fail(ctx, 500, 'Failed to fetch emergency blood requests.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/blood/donors', handler: listDonors },
  { method: 'POST', path: '/blood/donors', handler: registerDonor },
  { method: 'GET', path: '/blood/donors/:id', handler: listDonors },
  { method: 'GET', path: '/blood/requests', handler: listRequests },
  { method: 'POST', path: '/blood/requests', handler: createRequest, rateLimit: { max: 60, windowMs: 60_000, bucket: 'blood-request' } },
  { method: 'GET', path: '/blood/requests/:id', handler: listRequests },
  { method: 'PATCH', path: '/blood/requests/:id', handler: updateRequestStatus },
  { method: 'GET', path: '/blood/matches', handler: listMatches },
  { method: 'POST', path: '/blood/matches', handler: updateMatch },
  { method: 'PATCH', path: '/blood/matches', handler: updateMatch },
  { method: 'PATCH', path: '/blood/matches/:id', handler: updateMatch },
  { method: 'GET', path: '/blood/match', handler: listMatches },
  { method: 'POST', path: '/blood/match', handler: updateMatch },
  { method: 'PATCH', path: '/blood/match', handler: updateMatch },
  { method: 'PATCH', path: '/blood/match/:id', handler: updateMatch },
  { method: 'GET', path: '/blood/emergency', handler: listEmergency },
  { method: 'GET', path: '/blood/emergencies', handler: listEmergency },
];
