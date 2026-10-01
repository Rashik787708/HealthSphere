/**
 * HealthSphere — Appointment Routes
 *
 * Listing, booking (with double-booking prevention), and status transitions.
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, created, fail, requireUser, q } from './middleware.js';
import { generateId, sanitizeString } from './validation.js';
import { logAudit, createNotification } from './audit.js';

const APPOINTMENT_SELECT = `
  SELECT
    a.*,
    u_patient.name AS patient_name,
    u_patient.email AS patient_email,
    u_patient.phone AS patient_phone,
    u_patient.blood_group AS patient_blood_group,
    u_patient.gender AS patient_gender,
    u_patient.date_of_birth AS patient_dob,
    u_doctor.name AS doctor_name,
    d.specialization AS doctor_specialization,
    d.hospital_name AS doctor_hospital,
    d.consultation_fee AS doctor_fee
  FROM appointments a
  JOIN users u_patient ON a.patient_id = u_patient.id
  JOIN doctors d ON a.doctor_id = d.id
  JOIN users u_doctor ON d.user_id = u_doctor.id
`;

/* ------------------------------------------------------------------ */
/* GET /appointments  |  GET /appointments/:id                         */
/* ------------------------------------------------------------------ */

export async function listAppointments(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const id = q(ctx, 'id');
    const status = q(ctx, 'status');
    const date = q(ctx, 'date');

    let sql = `${APPOINTMENT_SELECT} WHERE 1=1`;
    const params = [];

    if (id) {
      sql += ' AND a.id = ?';
      params.push(id);
    }

    if (user.role === 'PATIENT') {
      sql += ' AND a.patient_id = ?';
      params.push(user.id);
    } else if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (!doc) return ok(ctx, { appointments: [] }, 'No doctor profile found');
      sql += ' AND a.doctor_id = ?';
      params.push(doc.id);
    } else if (user.role === 'ADMIN') {
      // admins may view all appointments
    } else {
      return fail(ctx, 403, 'Unauthorized to view appointments.');
    }

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status.toUpperCase());
    }

    if (date) {
      sql += ' AND a.appointment_date = ?';
      params.push(date);
    }

    sql += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';

    const appointments = await query(sql, params);
    return ok(ctx, { appointments }, 'Appointments retrieved');
  } catch (err) {
    console.error('Error fetching appointments:', err);
    return fail(ctx, 500, 'Failed to fetch appointments.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /appointments/:id  (single appointment detail)                  */
/* ------------------------------------------------------------------ */

export async function getAppointment(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const id = ctx.params?.id || q(ctx, 'id');
    if (!id) return fail(ctx, 400, 'Appointment id is required.');

    const appointment = await queryOne(`${APPOINTMENT_SELECT} WHERE a.id = ?`, [id]);
    if (!appointment) return fail(ctx, 404, 'Appointment not found.');

    if (user.role === 'PATIENT' && appointment.patient_id !== user.id) {
      return fail(ctx, 403, 'Unauthorized to view this appointment.');
    }
    if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id, user_id FROM doctors WHERE user_id = ?', [user.id]);
      if (!doc || appointment.doctor_id !== doc.id) {
        return fail(ctx, 403, 'Unauthorized to view this appointment.');
      }
    }

    return ok(ctx, { appointment }, 'Appointment retrieved');
  } catch (err) {
    console.error('Error fetching appointment:', err);
    return fail(ctx, 500, 'Failed to fetch appointment.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /appointments                                                  */
/* ------------------------------------------------------------------ */

export async function bookAppointment(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    if (user.role !== 'PATIENT' && user.role !== 'ADMIN') {
      return fail(ctx, 403, 'Only patients can book appointments.');
    }

    const {
      doctor_id,
      appointment_date,
      appointment_time,
      reason,
      notes,
      patient_id: requestedPatientId,
    } = ctx.body || {};

    const patientId =
      user.role === 'ADMIN' && requestedPatientId ? requestedPatientId : user.id;

    if (!doctor_id) return fail(ctx, 400, 'Doctor is required.');
    if (!appointment_date) return fail(ctx, 400, 'Appointment date is required.');
    if (!appointment_time) return fail(ctx, 400, 'Appointment time is required.');
    if (!reason) return fail(ctx, 400, 'Reason for consultation is required.');

    const todayStr = new Date().toISOString().split('T')[0];
    if (appointment_date < todayStr) {
      return fail(ctx, 400, 'Cannot book appointments for past dates.');
    }

    const doctor = await queryOne(
      `SELECT d.*, u.name as doctor_name, u.id as doctor_user_id
       FROM doctors d JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [doctor_id]
    );
    if (!doctor) return fail(ctx, 404, 'Selected doctor was not found.');
    if (doctor.available === 0) {
      return fail(ctx, 400, 'Doctor is currently marked as unavailable for bookings.');
    }

    const existing = await queryOne(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
       AND status IN ('PENDING', 'CONFIRMED')`,
      [doctor_id, appointment_date, appointment_time]
    );
    if (existing) {
      return fail(
        ctx,
        409,
        'This doctor already has an appointment booked or pending at this date and time. Please select another slot.'
      );
    }

    const appointmentId = generateId('apt');
    await execute(
      `INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, reason, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'), datetime('now'))`,
      [
        appointmentId,
        patientId,
        doctor_id,
        appointment_date,
        appointment_time,
        sanitizeString(reason),
        sanitizeString(notes) || null,
      ]
    );

    await logAudit(user.id, 'BOOK_APPOINTMENT', 'appointments', appointmentId, ctx.req);
    await createNotification(
      doctor.doctor_user_id,
      'New Appointment Request',
      `New appointment booking from ${user.name} for ${appointment_date} at ${appointment_time}. Reason: ${reason}`,
      'APPOINTMENT'
    );
    await createNotification(
      patientId,
      'Appointment Request Sent',
      `Your appointment request with Dr. ${doctor.doctor_name} on ${appointment_date} at ${appointment_time} is pending confirmation.`,
      'APPOINTMENT'
    );

    const createdAppointment = await queryOne(
      `SELECT a.*, d.hospital_name, u.name as doctor_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE a.id = ?`,
      [appointmentId]
    );

    return created(
      ctx,
      { appointment: createdAppointment },
      'Appointment booked successfully. Awaiting doctor confirmation.'
    );
  } catch (err) {
    console.error('Error creating appointment:', err);
    return fail(ctx, 500, 'Failed to book appointment.');
  }
}

/* ------------------------------------------------------------------ */
/* POST / PATCH /appointments/status  |  PATCH /appointments/:id      */
/* ------------------------------------------------------------------ */

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED'];

export async function updateStatus(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const appointmentId =
      ctx.body?.appointment_id || ctx.body?.id || ctx.params?.id || q(ctx, 'appointment_id');
    if (!appointmentId) return fail(ctx, 400, 'appointment_id is required.');

    const { notes } = ctx.body || {};
    const cleanStatus = sanitizeString(ctx.body?.status).toUpperCase();
    if (!VALID_STATUSES.includes(cleanStatus)) {
      return fail(ctx, 400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const appointment = await queryOne(
      `SELECT a.*, d.user_id as doctor_user_id, u_doc.name as doctor_name, u_pat.name as patient_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u_doc ON d.user_id = u_doc.id
       JOIN users u_pat ON a.patient_id = u_pat.id
       WHERE a.id = ?`,
      [appointmentId]
    );

    if (!appointment) return fail(ctx, 404, 'Appointment not found.');

    if (user.role === 'PATIENT') {
      if (appointment.patient_id !== user.id) {
        return fail(ctx, 403, 'You can only manage your own appointments.');
      }
      if (cleanStatus !== 'CANCELLED') {
        return fail(ctx, 403, 'Patients can only cancel appointments.');
      }
      if (appointment.status === 'COMPLETED') {
        return fail(ctx, 400, 'Cannot cancel an already completed appointment.');
      }
    } else if (user.role === 'DOCTOR') {
      if (appointment.doctor_user_id !== user.id) {
        return fail(ctx, 403, 'You can only update appointments assigned to you.');
      }
      if (!['CONFIRMED', 'REJECTED', 'COMPLETED'].includes(cleanStatus)) {
        return fail(ctx, 400, 'Doctors can confirm, reject, or complete appointments.');
      }
    } else if (user.role !== 'ADMIN') {
      return fail(ctx, 403, 'Unauthorized to modify appointments.');
    }

    await execute(
      `UPDATE appointments
       SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
       WHERE id = ?`,
      [cleanStatus, sanitizeString(notes) || null, appointmentId]
    );

    await logAudit(
      user.id,
      `UPDATE_APPOINTMENT_STATUS_${cleanStatus}`,
      'appointments',
      appointmentId,
      ctx.req
    );

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

    const updated = await queryOne('SELECT * FROM appointments WHERE id = ?', [appointmentId]);

    return ok(ctx, { appointment: updated }, `Appointment status updated to ${cleanStatus}`);
  } catch (err) {
    console.error('Error updating appointment status:', err);
    return fail(ctx, 500, 'Failed to update appointment status.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/appointments', handler: listAppointments },
  { method: 'POST', path: '/appointments', handler: bookAppointment },
  { method: 'POST', path: '/appointments/status', handler: updateStatus },
  { method: 'PATCH', path: '/appointments/status', handler: updateStatus },
  { method: 'GET', path: '/appointments/:id', handler: getAppointment },
  { method: 'GET', path: '/appointments/:id/status', handler: getAppointment },
  { method: 'PATCH', path: '/appointments/:id', handler: updateStatus },
  { method: 'POST', path: '/appointments/:id/status', handler: updateStatus },
];
