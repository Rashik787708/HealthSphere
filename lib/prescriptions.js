/**
 * HealthSphere — Prescription Routes
 *
 * Digital e-prescriptions including the printable detail view consumed by the
 * Rx print flow. Routed by lib/router.js inside the single Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, created, fail, requireUser, q } from './middleware.js';
import { generateId, sanitizeString } from './validation.js';
import { logAudit, createNotification } from './audit.js';

const RX_LIST_SELECT = `
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
`;

const RX_DETAIL_SELECT = `
  SELECT
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
`;

/* ------------------------------------------------------------------ */
/* GET /prescriptions  |  GET /prescriptions/:id                        */
/* ------------------------------------------------------------------ */

export async function listPrescriptions(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const id = q(ctx, 'id');
    const patientIdParam = q(ctx, 'patient_id');

    if (id) {
      const prescription = await queryOne(`${RX_DETAIL_SELECT} WHERE p.id = ?`, [id]);
      if (!prescription) return fail(ctx, 404, 'Prescription not found.');

      if (user.role === 'PATIENT' && prescription.patient_id !== user.id) {
        return fail(ctx, 403, 'Unauthorized to view this prescription.');
      }
      if (user.role === 'HOSPITAL') {
        return fail(ctx, 403, 'Hospitals cannot access individual prescriptions.');
      }

      return ok(ctx, { prescription }, 'Prescription retrieved');
    }

    let sql = `${RX_LIST_SELECT} WHERE 1=1`;
    const params = [];

    if (user.role === 'PATIENT') {
      sql += ' AND p.patient_id = ?';
      params.push(user.id);
    } else if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (doc) {
        if (patientIdParam) {
          sql += ' AND p.patient_id = ?';
          params.push(patientIdParam);
        } else {
          sql += ' AND p.doctor_id = ?';
          params.push(doc.id);
        }
      }
    } else if (user.role === 'ADMIN') {
      if (patientIdParam) {
        sql += ' AND p.patient_id = ?';
        params.push(patientIdParam);
      }
    } else if (user.role === 'HOSPITAL') {
      return fail(ctx, 403, 'Hospitals cannot access individual prescriptions.');
    }

    sql += ' ORDER BY p.created_at DESC';

    const prescriptions = await query(sql, params);
    return ok(ctx, { prescriptions }, 'Prescriptions retrieved');
  } catch (err) {
    console.error('Error fetching prescriptions:', err);
    return fail(ctx, 500, 'Failed to fetch prescriptions.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /prescriptions                                                 */
/* ------------------------------------------------------------------ */

export async function createPrescription(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['DOCTOR', 'ADMIN']));
    if (!user) return;

    const {
      patient_id,
      appointment_id,
      medication_name,
      dosage,
      frequency,
      duration,
      instructions,
    } = ctx.body || {};

    if (!patient_id) return fail(ctx, 400, 'patient_id is required.');
    if (!medication_name) return fail(ctx, 400, 'medication_name is required.');
    if (!dosage) return fail(ctx, 400, 'dosage is required.');
    if (!frequency) return fail(ctx, 400, 'frequency is required.');
    if (!duration) return fail(ctx, 400, 'duration is required.');

    let doctorId = null;
    if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (!doc) return fail(ctx, 404, 'Doctor profile not found.');
      doctorId = doc.id;
    } else {
      doctorId = ctx.body?.doctor_id;
      if (!doctorId) return fail(ctx, 400, 'doctor_id is required.');
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

    await logAudit(user.id, 'CREATE_PRESCRIPTION', 'prescriptions', prescriptionId, ctx.req);
    await createNotification(
      patient_id,
      'New Prescription Issued',
      `A new prescription for ${medication_name} (${dosage}) has been issued by Dr. ${user.name}.`,
      'PRESCRIPTION'
    );

    const createdRow = await queryOne('SELECT * FROM prescriptions WHERE id = ?', [prescriptionId]);
    return created(ctx, { prescription: createdRow }, 'Prescription created successfully');
  } catch (err) {
    console.error('Error creating prescription:', err);
    return fail(ctx, 500, 'Failed to create prescription.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/prescriptions', handler: listPrescriptions },
  { method: 'POST', path: '/prescriptions', handler: createPrescription, roles: ['DOCTOR', 'ADMIN'] },
  { method: 'GET', path: '/prescriptions/:id', handler: listPrescriptions },
];
