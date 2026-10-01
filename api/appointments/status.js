import { queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { sanitizeString } from '../../lib/validation.js';
import { logAudit, createNotification } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return errorResponse(res, 405, 'Method not allowed. Use POST or PATCH.');
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { appointment_id, status, notes } = req.body || {};

    if (!appointment_id) {
      return errorResponse(res, 400, 'appointment_id is required.');
    }
    const cleanStatus = sanitizeString(status).toUpperCase();
    const validStatuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED'];
    if (!validStatuses.includes(cleanStatus)) {
      return errorResponse(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Get current appointment
    const appointment = await queryOne(
      `SELECT a.*, d.user_id as doctor_user_id, u_doc.name as doctor_name, u_pat.name as patient_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u_doc ON d.user_id = u_doc.id
       JOIN users u_pat ON a.patient_id = u_pat.id
       WHERE a.id = ?`,
      [appointment_id]
    );

    if (!appointment) {
      return errorResponse(res, 404, 'Appointment not found.');
    }

    // Permission checks
    if (user.role === 'PATIENT') {
      if (appointment.patient_id !== user.id) {
        return errorResponse(res, 403, 'You can only manage your own appointments.');
      }
      if (cleanStatus !== 'CANCELLED') {
        return errorResponse(res, 403, 'Patients can only cancel appointments.');
      }
      if (appointment.status === 'COMPLETED') {
        return errorResponse(res, 400, 'Cannot cancel an already completed appointment.');
      }
    } else if (user.role === 'DOCTOR') {
      if (appointment.doctor_user_id !== user.id) {
        return errorResponse(res, 403, 'You can only update appointments assigned to you.');
      }
      if (!['CONFIRMED', 'REJECTED', 'COMPLETED'].includes(cleanStatus)) {
        return errorResponse(res, 400, 'Doctors can confirm, reject, or complete appointments.');
      }
    } else if (user.role !== 'ADMIN') {
      return errorResponse(res, 403, 'Unauthorized to modify appointments.');
    }

    // Update appointment
    await execute(
      `UPDATE appointments 
       SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
       WHERE id = ?`,
      [cleanStatus, sanitizeString(notes) || null, appointment_id]
    );

    // Audit log
    await logAudit(user.id, `UPDATE_APPOINTMENT_STATUS_${cleanStatus}`, 'appointments', appointment_id, req);

    // Notifications
    if (user.role === 'DOCTOR' || user.role === 'ADMIN') {
      let notifMsg = `Your appointment on ${appointment.appointment_date} at ${appointment.appointment_time} with Dr. ${appointment.doctor_name} has been ${cleanStatus.toLowerCase()}.`;
      if (notes) notifMsg += ` Notes: ${notes}`;
      await createNotification(
        appointment.patient_id,
        `Appointment ${cleanStatus}`,
        notifMsg,
        'APPOINTMENT'
      );
    }

    if (user.role === 'PATIENT') {
      await createNotification(
        appointment.doctor_user_id,
        'Appointment Cancelled',
        `Patient ${appointment.patient_name} cancelled the appointment scheduled for ${appointment.appointment_date} at ${appointment.appointment_time}.`,
        'APPOINTMENT'
      );
    }

    const updated = await queryOne('SELECT * FROM appointments WHERE id = ?', [appointment_id]);

    return jsonResponse(
      res,
      200,
      { appointment: updated },
      `Appointment status updated to ${cleanStatus}`
    );
  } catch (err) {
    console.error('Error updating appointment status:', err);
    return errorResponse(res, 500, 'Failed to update appointment status.');
  }
}
