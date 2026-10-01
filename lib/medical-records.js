/**
 * HealthSphere — Medical Record Routes
 *
 * Clinical EHR timeline. Patients read their own history; doctors and admins
 * record diagnoses. Routed by lib/router.js inside the single Vercel
 * Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, created, fail, requireUser, q } from './middleware.js';
import { generateId, sanitizeString } from './validation.js';
import { logAudit, createNotification } from './audit.js';

const RECORD_SELECT = `
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
`;

/**
 * Resolve which patient's records the caller is permitted to read.
 * Returns the patient id, or null when the caller may read everything.
 */
function resolveTargetPatient(user, requested) {
  if (user.role === 'PATIENT') return user.id;
  if (requested) return requested;
  return null;
}

/* ------------------------------------------------------------------ */
/* GET /medical-records  |  GET /medical-records/:id                   */
/* ------------------------------------------------------------------ */

export async function listRecords(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const id = q(ctx, 'id');
    const doctorIdParam = q(ctx, 'doctor_id');
    const search = q(ctx, 'search');

    if (id) {
      const record = await queryOne(`${RECORD_SELECT} WHERE mr.id = ?`, [id]);
      if (!record) return fail(ctx, 404, 'Medical record not found.');

      if (user.role === 'PATIENT' && record.patient_id !== user.id) {
        return fail(ctx, 403, 'Unauthorized to view this medical record.');
      }
      if (user.role === 'DOCTOR' && doctorIdParam && record.doctor_id !== doctorIdParam) {
        return fail(ctx, 403, 'Unauthorized to view this medical record.');
      }

      return ok(ctx, { record }, 'Medical record retrieved');
    }

    const patientIdParam = q(ctx, 'patient_id');
    const targetPatientId = resolveTargetPatient(user, patientIdParam);

    let sql = `${RECORD_SELECT} WHERE 1=1`;
    const params = [];

    if (targetPatientId) {
      sql += ' AND mr.patient_id = ?';
      params.push(targetPatientId);
    } else if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (doc) {
        sql += ' AND mr.doctor_id = ?';
        params.push(doc.id);
      }
    } else if (user.role === 'HOSPITAL') {
      return fail(ctx, 403, 'Hospitals cannot access individual medical records.');
    }

    if (doctorIdParam) {
      sql += ' AND mr.doctor_id = ?';
      params.push(doctorIdParam);
    }

    if (search) {
      const searchPattern = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(mr.diagnosis) LIKE ? OR LOWER(mr.symptoms) LIKE ? OR LOWER(mr.notes) LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    sql += ' ORDER BY mr.created_at DESC';

    const records = await query(sql, params);
    return ok(ctx, { records }, 'Medical records retrieved');
  } catch (err) {
    console.error('Error fetching medical records:', err);
    return fail(ctx, 500, 'Failed to fetch medical records.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /medical-records                                               */
/* ------------------------------------------------------------------ */

export async function createRecord(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['DOCTOR', 'ADMIN']));
    if (!user) return;

    const { patient_id, appointment_id, diagnosis, symptoms, notes } = ctx.body || {};

    if (!patient_id) return fail(ctx, 400, 'patient_id is required.');
    if (!diagnosis) return fail(ctx, 400, 'diagnosis is required.');

    let doctorId = null;
    const doctorName = user.name;
    if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (!doc) return fail(ctx, 404, 'Doctor profile not found.');
      doctorId = doc.id;
    } else {
      doctorId = ctx.body?.doctor_id || null;
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

    await logAudit(user.id, 'CREATE_MEDICAL_RECORD', 'medical_records', recordId, ctx.req);
    await createNotification(
      patient_id,
      'New Medical Record Added',
      `Dr. ${doctorName} added a new medical record: ${diagnosis}`,
      'MEDICAL_RECORD'
    );

    const record = await queryOne('SELECT * FROM medical_records WHERE id = ?', [recordId]);
    return created(ctx, { record }, 'Medical record saved successfully');
  } catch (err) {
    console.error('Error creating medical record:', err);
    return fail(ctx, 500, 'Failed to create medical record.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/medical-records', handler: listRecords },
  { method: 'POST', path: '/medical-records', handler: createRecord, roles: ['DOCTOR', 'ADMIN'] },
  { method: 'GET', path: '/medical-records/:id', handler: listRecords },
  { method: 'GET', path: '/records', handler: listRecords },
];
