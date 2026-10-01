import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { generateId } from '../../lib/validation.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      let doctorId = url.searchParams.get('doctor_id');

      // If no doctor_id provided, check if logged in as DOCTOR
      if (!doctorId) {
        const user = await requireAuth(req, res);
        if (!user) return;
        if (user.role !== 'DOCTOR') {
          return errorResponse(res, 400, 'doctor_id parameter is required.');
        }
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (!doc) return errorResponse(res, 404, 'Doctor profile not found.');
        doctorId = doc.id;
      }

      const slots = await query(
        `SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC, start_time ASC`,
        [doctorId]
      );

      return jsonResponse(res, 200, { availability: slots }, 'Availability retrieved');
    } catch (err) {
      console.error('Error fetching availability:', err);
      return errorResponse(res, 500, 'Failed to fetch doctor availability.');
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res, ['DOCTOR', 'ADMIN']);
    if (!user) return;

    try {
      let doctorId = null;
      if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (!doc) return errorResponse(res, 404, 'Doctor profile not found.');
        doctorId = doc.id;
      } else {
        doctorId = req.body?.doctor_id;
        if (!doctorId) return errorResponse(res, 400, 'doctor_id is required.');
      }

      const { slots } = req.body || {};
      if (!Array.isArray(slots)) {
        return errorResponse(res, 400, 'slots must be an array of schedule objects.');
      }

      // Delete existing availability for this doctor
      await execute('DELETE FROM doctor_availability WHERE doctor_id = ?', [doctorId]);

      // Insert new slots
      for (const slot of slots) {
        const day = Number(slot.day_of_week);
        if (day >= 0 && day <= 6 && slot.start_time && slot.end_time) {
          await execute(
            `INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time, is_available)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              generateId('av'),
              doctorId,
              day,
              slot.start_time.trim(),
              slot.end_time.trim(),
              slot.is_available === false || slot.is_available === 0 ? 0 : 1,
            ]
          );
        }
      }

      const updated = await query(
        `SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC`,
        [doctorId]
      );

      return jsonResponse(res, 200, { availability: updated }, 'Availability schedule updated');
    } catch (err) {
      console.error('Error updating availability:', err);
      return errorResponse(res, 500, 'Failed to update availability.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
