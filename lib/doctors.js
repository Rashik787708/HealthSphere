/**
 * HealthSphere — Doctor Routes
 *
 * Directory search, doctor detail, and weekly availability management.
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, fail, requireUser, q, qBool } from './middleware.js';
import { generateId, sanitizeString } from './validation.js';

/* ------------------------------------------------------------------ */
/* GET /doctors  |  GET /doctors/:id                                   */
/* ------------------------------------------------------------------ */

export async function listDoctors(ctx) {
  try {
    const doctorId = q(ctx, 'id');
    const specialization = q(ctx, 'specialization');
    const search = q(ctx, 'search');
    const location = q(ctx, 'location');
    const maxFee = q(ctx, 'max_fee');
    const availableOnly = qBool(ctx, 'available');

    if (doctorId) {
      const doc = await queryOne(
        `SELECT d.*, u.name, u.email, u.phone, u.location, u.gender
         FROM doctors d
         JOIN users u ON d.user_id = u.id
         WHERE d.id = ?`,
        [doctorId]
      );

      if (!doc) return fail(ctx, 404, 'Doctor not found.');

      const availability = await query(
        'SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC, start_time ASC',
        [doctorId]
      );

      return ok(ctx, { doctor: doc, availability }, 'Doctor details retrieved');
    }

    let sql = `
      SELECT d.*, u.name, u.email, u.phone, u.location, u.gender
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (specialization) {
      sql += ' AND LOWER(d.specialization) = LOWER(?)';
      params.push(specialization.trim());
    }

    if (search) {
      const searchPattern = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(u.name) LIKE ? OR LOWER(d.specialization) LIKE ? OR LOWER(d.hospital_name) LIKE ? OR LOWER(u.location) LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (location) {
      sql += ' AND LOWER(u.location) LIKE ?';
      params.push(`%${location.trim().toLowerCase()}%`);
    }

    if (maxFee) {
      const feeNum = parseFloat(maxFee);
      if (!isNaN(feeNum)) {
        sql += ' AND d.consultation_fee <= ?';
        params.push(feeNum);
      }
    }

    if (availableOnly) sql += ' AND d.available = 1';

    sql += ' ORDER BY d.experience_years DESC, u.name ASC';

    const doctors = await query(sql, params);

    const specRows = await query(
      `SELECT DISTINCT specialization FROM doctors WHERE specialization IS NOT NULL AND specialization != '' ORDER BY specialization ASC`
    );
    const specializations = specRows.map((r) => r.specialization);

    return ok(
      ctx,
      { doctors, specializations, total: doctors.length },
      'Doctors list retrieved'
    );
  } catch (err) {
    console.error('Error fetching doctors:', err);
    return fail(ctx, 500, 'Failed to fetch doctors list.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /doctors/availability  |  GET /doctors/:id/availability         */
/* ------------------------------------------------------------------ */

export async function getAvailability(ctx) {
  try {
    let doctorId = q(ctx, 'doctor_id') || ctx.params?.id;

    if (!doctorId) {
      const user = ctx.user || (await requireUser(ctx));
      if (!user) return;
      if (user.role !== 'DOCTOR') {
        return fail(ctx, 400, 'doctor_id parameter is required.');
      }
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (!doc) return fail(ctx, 404, 'Doctor profile not found.');
      doctorId = doc.id;
    }

    const slots = await query(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC, start_time ASC',
      [doctorId]
    );

    return ok(ctx, { availability: slots }, 'Availability retrieved');
  } catch (err) {
    console.error('Error fetching availability:', err);
    return fail(ctx, 500, 'Failed to fetch doctor availability.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /doctors/availability  |  POST /doctors/:id/availability       */
/* ------------------------------------------------------------------ */

export async function setAvailability(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['DOCTOR', 'ADMIN']));
    if (!user) return;

    let doctorId = null;
    if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (!doc) return fail(ctx, 404, 'Doctor profile not found.');
      doctorId = doc.id;
    } else {
      doctorId = ctx.body?.doctor_id || ctx.params?.id;
      if (!doctorId) return fail(ctx, 400, 'doctor_id is required.');
    }

    const { slots } = ctx.body || {};
    if (!Array.isArray(slots)) {
      return fail(ctx, 400, 'slots must be an array of schedule objects.');
    }

    await execute('DELETE FROM doctor_availability WHERE doctor_id = ?', [doctorId]);

    for (const slot of slots) {
      const day = Number(slot?.day_of_week);
      const startTime = sanitizeString(slot?.start_time);
      const endTime = sanitizeString(slot?.end_time);
      if (Number.isInteger(day) && day >= 0 && day <= 6 && startTime && endTime) {
        await execute(
          `INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time, is_available)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            generateId('av'),
            doctorId,
            day,
            startTime,
            endTime,
            slot.is_available === false || slot.is_available === 0 ? 0 : 1,
          ]
        );
      }
    }

    const updated = await query(
      'SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC',
      [doctorId]
    );

    return ok(ctx, { availability: updated }, 'Availability schedule updated');
  } catch (err) {
    console.error('Error updating availability:', err);
    return fail(ctx, 500, 'Failed to update availability.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/doctors', handler: listDoctors },
  { method: 'GET', path: '/doctors/availability', handler: getAvailability },
  { method: 'POST', path: '/doctors/availability', handler: setAvailability, roles: ['DOCTOR', 'ADMIN'] },
  { method: 'PUT', path: '/doctors/availability', handler: setAvailability, roles: ['DOCTOR', 'ADMIN'] },
  { method: 'GET', path: '/doctors/:id', handler: listDoctors },
  { method: 'GET', path: '/doctors/:id/availability', handler: getAvailability },
  { method: 'POST', path: '/doctors/:id/availability', handler: setAvailability, roles: ['DOCTOR', 'ADMIN'] },
  { method: 'PUT', path: '/doctors/:id/availability', handler: setAvailability, roles: ['DOCTOR', 'ADMIN'] },
];
