import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { generateId, sanitizeString } from '../../lib/validation.js';
import { logAudit, createNotification } from '../../lib/audit.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // GET: List appointments
  if (req.method === 'GET') {
    try {
      const status = url.searchParams.get('status');
      const date = url.searchParams.get('date');
      const id = url.searchParams.get('id');

      let sql = `
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
        WHERE 1=1
      `;
      const params = [];

      if (id) {
        sql += ` AND a.id = ?`;
        params.push(id);
      }

      if (user.role === 'PATIENT') {
        sql += ` AND a.patient_id = ?`;
        params.push(user.id);
      } else if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (!doc) {
          return jsonResponse(res, 200, { appointments: [] }, 'No doctor profile found');
        }
        sql += ` AND a.doctor_id = ?`;
        params.push(doc.id);
      } else if (user.role === 'ADMIN') {
        // admin can view all
      } else {
        return errorResponse(res, 403, 'Unauthorized to view appointments.');
      }

      if (status) {
        sql += ` AND a.status = ?`;
        params.push(status.toUpperCase());
      }

      if (date) {
        sql += ` AND a.appointment_date = ?`;
        params.push(date);
      }

      sql += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;

      const appointments = await query(sql, params);
      return jsonResponse(res, 200, { appointments }, 'Appointments retrieved');
    } catch (err) {
      console.error('Error fetching appointments:', err);
      return errorResponse(res, 500, 'Failed to fetch appointments.');
    }
  }

  // POST: Book an appointment
  if (req.method === 'POST') {
    if (user.role !== 'PATIENT' && user.role !== 'ADMIN') {
      return errorResponse(res, 403, 'Only patients can book appointments.');
    }

    try {
      const {
        doctor_id,
        appointment_date,
        appointment_time,
        reason,
        notes,
        patient_id: requestedPatientId,
      } = req.body || {};

      const patientId = user.role === 'ADMIN' && requestedPatientId ? requestedPatientId : user.id;

      if (!doctor_id) return errorResponse(res, 400, 'Doctor is required.');
      if (!appointment_date) return errorResponse(res, 400, 'Appointment date is required.');
      if (!appointment_time) return errorResponse(res, 400, 'Appointment time is required.');
      if (!reason) return errorResponse(res, 400, 'Reason for consultation is required.');

      // Check date validity (prevent booking in past)
      const todayStr = new Date().toISOString().split('T')[0];
      if (appointment_date < todayStr) {
        return errorResponse(res, 400, 'Cannot book appointments for past dates.');
      }

      // Check doctor existence
      const doctor = await queryOne(
        `SELECT d.*, u.name as doctor_name, u.id as doctor_user_id 
         FROM doctors d JOIN users u ON d.user_id = u.id 
         WHERE d.id = ?`,
        [doctor_id]
      );
      if (!doctor) {
        return errorResponse(res, 404, 'Selected doctor was not found.');
      }
      if (doctor.available === 0) {
        return errorResponse(res, 400, 'Doctor is currently marked as unavailable for bookings.');
      }

      // Prevent double booking at the same date and time
      const existing = await queryOne(
        `SELECT id FROM appointments 
         WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? 
         AND status IN ('PENDING', 'CONFIRMED')`,
        [doctor_id, appointment_date, appointment_time]
      );
      if (existing) {
        return errorResponse(
          res,
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

      // Audit & Notification for the doctor
      await logAudit(user.id, 'BOOK_APPOINTMENT', 'appointments', appointmentId, req);
      await createNotification(
        doctor.doctor_user_id,
        'New Appointment Request',
        `New appointment booking from ${user.name} for ${appointment_date} at ${appointment_time}. Reason: ${reason}`,
        'APPOINTMENT'
      );

      // Also confirm to patient
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

      return jsonResponse(
        res,
        201,
        { appointment: createdAppointment },
        'Appointment booked successfully. Awaiting doctor confirmation.'
      );
    } catch (err) {
      console.error('Error creating appointment:', err);
      return errorResponse(res, 500, 'Failed to book appointment.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
