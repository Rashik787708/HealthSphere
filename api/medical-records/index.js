import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { generateId, sanitizeString } from '../../lib/validation.js';
import { logAudit, createNotification } from '../../lib/audit.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const patientIdParam = url.searchParams.get('patient_id');
      const search = url.searchParams.get('search');
      const doctorIdParam = url.searchParams.get('doctor_id');

      let targetPatientId = null;

      if (user.role === 'PATIENT') {
        targetPatientId = user.id;
      } else if (user.role === 'DOCTOR' || user.role === 'ADMIN') {
        if (patientIdParam) {
          targetPatientId = patientIdParam;
        }
      }

      let sql = `
        SELECT 
          mr.*,
          u_patient.name AS patient_name,
          u_patient.email AS patient_email,
          u_patient.blood_group AS patient_blood_group,
          u_patient.gender AS patient_gender,
          u_patient.date_of_birth AS patient_dob,
          u_doc.name AS doctor_name,
          d.specialization AS doctor_specialization,
          d.hospital_name AS doctor_hospital,
          a.appointment_date,
          a.appointment_time,
          a.reason AS appointment_reason
        FROM medical_records mr
        JOIN users u_patient ON mr.patient_id = u_patient.id
        LEFT JOIN doctors d ON mr.doctor_id = d.id
        LEFT JOIN users u_doc ON d.user_id = u_doc.id
        LEFT JOIN appointments a ON mr.appointment_id = a.id
        WHERE 1=1
      `;
      const params = [];

      if (targetPatientId) {
        sql += ` AND mr.patient_id = ?`;
        params.push(targetPatientId);
      } else if (user.role === 'DOCTOR') {
        // If doctor didn't specify a patient, get records created by this doctor
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (doc) {
          sql += ` AND mr.doctor_id = ?`;
          params.push(doc.id);
        }
      }

      if (doctorIdParam) {
        sql += ` AND mr.doctor_id = ?`;
        params.push(doctorIdParam);
      }

      if (search) {
        const searchPattern = `%${search.trim().toLowerCase()}%`;
        sql += ` AND (LOWER(mr.diagnosis) LIKE ? OR LOWER(mr.symptoms) LIKE ? OR LOWER(mr.notes) LIKE ?)`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      sql += ` ORDER BY mr.created_at DESC`;

      const records = await query(sql, params);
      return jsonResponse(res, 200, { records }, 'Medical records retrieved');
    } catch (err) {
      console.error('Error fetching medical records:', err);
      return errorResponse(res, 500, 'Failed to fetch medical records.');
    }
  }

  if (req.method === 'POST') {
    if (user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
      return errorResponse(res, 403, 'Only doctors and administrators can add medical records.');
    }

    try {
      const {
        patient_id,
        appointment_id,
        diagnosis,
        symptoms,
        notes,
      } = req.body || {};

      if (!patient_id) return errorResponse(res, 400, 'patient_id is required.');
      if (!diagnosis) return errorResponse(res, 400, 'diagnosis is required.');

      let doctorId = null;
      let doctorName = user.name;
      if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (!doc) return errorResponse(res, 404, 'Doctor profile not found.');
        doctorId = doc.id;
      }

      const recordId = generateId('med');
      await execute(
        `INSERT INTO medical_records (id, patient_id, doctor_id, appointment_id, diagnosis, symptoms, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          recordId,
          patient_id,
          doctorId,
          appointment_id || null,
          sanitizeString(diagnosis),
          sanitizeString(symptoms) || null,
          sanitizeString(notes) || null,
        ]
      );

      await logAudit(user.id, 'CREATE_MEDICAL_RECORD', 'medical_records', recordId, req);

      await createNotification(
        patient_id,
        'New Medical Record Added',
        `Dr. ${doctorName} added a new medical record: ${diagnosis}`,
        'MEDICAL_RECORD'
      );

      const record = await queryOne('SELECT * FROM medical_records WHERE id = ?', [recordId]);
      return jsonResponse(res, 201, { record }, 'Medical record saved successfully');
    } catch (err) {
      console.error('Error creating medical record:', err);
      return errorResponse(res, 500, 'Failed to create medical record.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
