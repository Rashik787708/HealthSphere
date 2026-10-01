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
      const id = url.searchParams.get('id');
      const patientIdParam = url.searchParams.get('patient_id');

      // Detailed single prescription view
      if (id) {
        const prescription = await queryOne(
          `SELECT 
            p.*,
            u_patient.name AS patient_name,
            u_patient.email AS patient_email,
            u_patient.phone AS patient_phone,
            u_patient.blood_group AS patient_blood_group,
            u_patient.gender AS patient_gender,
            u_patient.date_of_birth AS patient_dob,
            u_patient.location AS patient_location,
            u_doc.name AS doctor_name,
            u_doc.email AS doctor_email,
            d.specialization AS doctor_specialization,
            d.qualification AS doctor_qualification,
            d.license_number AS doctor_license,
            d.hospital_name AS doctor_hospital,
            a.appointment_date,
            a.reason AS appointment_reason
          FROM prescriptions p
          JOIN users u_patient ON p.patient_id = u_patient.id
          JOIN doctors d ON p.doctor_id = d.id
          JOIN users u_doc ON d.user_id = u_doc.id
          LEFT JOIN appointments a ON p.appointment_id = a.id
          WHERE p.id = ?`,
          [id]
        );

        if (!prescription) {
          return errorResponse(res, 404, 'Prescription not found.');
        }

        // Check permission: patient can only view their own, doctor can view theirs
        if (user.role === 'PATIENT' && prescription.patient_id !== user.id) {
          return errorResponse(res, 403, 'Unauthorized to view this prescription.');
        }

        return jsonResponse(res, 200, { prescription }, 'Prescription retrieved');
      }

      // List prescriptions
      let sql = `
        SELECT 
          p.*,
          u_patient.name AS patient_name,
          u_doc.name AS doctor_name,
          d.specialization AS doctor_specialization,
          d.hospital_name AS doctor_hospital
        FROM prescriptions p
        JOIN users u_patient ON p.patient_id = u_patient.id
        JOIN doctors d ON p.doctor_id = d.id
        JOIN users u_doc ON d.user_id = u_doc.id
        WHERE 1=1
      `;
      const params = [];

      if (user.role === 'PATIENT') {
        sql += ` AND p.patient_id = ?`;
        params.push(user.id);
      } else if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (doc) {
          if (patientIdParam) {
            sql += ` AND p.patient_id = ?`;
            params.push(patientIdParam);
          } else {
            sql += ` AND p.doctor_id = ?`;
            params.push(doc.id);
          }
        }
      } else if (user.role === 'ADMIN') {
        if (patientIdParam) {
          sql += ` AND p.patient_id = ?`;
          params.push(patientIdParam);
        }
      }

      sql += ` ORDER BY p.created_at DESC`;

      const prescriptions = await query(sql, params);
      return jsonResponse(res, 200, { prescriptions }, 'Prescriptions retrieved');
    } catch (err) {
      console.error('Error fetching prescriptions:', err);
      return errorResponse(res, 500, 'Failed to fetch prescriptions.');
    }
  }

  if (req.method === 'POST') {
    if (user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
      return errorResponse(res, 403, 'Only doctors can issue prescriptions.');
    }

    try {
      const {
        patient_id,
        appointment_id,
        medication_name,
        dosage,
        frequency,
        duration,
        instructions,
      } = req.body || {};

      if (!patient_id) return errorResponse(res, 400, 'patient_id is required.');
      if (!medication_name) return errorResponse(res, 400, 'medication_name is required.');
      if (!dosage) return errorResponse(res, 400, 'dosage is required.');
      if (!frequency) return errorResponse(res, 400, 'frequency is required.');
      if (!duration) return errorResponse(res, 400, 'duration is required.');

      let doctorId = null;
      if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (!doc) return errorResponse(res, 404, 'Doctor profile not found.');
        doctorId = doc.id;
      } else {
        doctorId = req.body?.doctor_id;
        if (!doctorId) return errorResponse(res, 400, 'doctor_id is required.');
      }

      const prescriptionId = generateId('rx');
      await execute(
        `INSERT INTO prescriptions (id, patient_id, doctor_id, appointment_id, medication_name, dosage, frequency, duration, instructions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          prescriptionId,
          patient_id,
          doctorId,
          appointment_id || null,
          sanitizeString(medication_name),
          sanitizeString(dosage),
          sanitizeString(frequency),
          sanitizeString(duration),
          sanitizeString(instructions) || null,
        ]
      );

      await logAudit(user.id, 'CREATE_PRESCRIPTION', 'prescriptions', prescriptionId, req);

      await createNotification(
        patient_id,
        'New Prescription Issued',
        `A new prescription for ${medication_name} (${dosage}) has been issued by Dr. ${user.name}.`,
        'PRESCRIPTION'
      );

      const created = await queryOne('SELECT * FROM prescriptions WHERE id = ?', [prescriptionId]);
      return jsonResponse(res, 201, { prescription: created }, 'Prescription created successfully');
    } catch (err) {
      console.error('Error creating prescription:', err);
      return errorResponse(res, 500, 'Failed to create prescription.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
