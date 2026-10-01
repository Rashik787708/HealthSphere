/**
 * HealthSphere — Lab Result Routes
 *
 * Diagnostic laboratory reports with standard reference ranges.
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, created, fail, requireUser, q } from './middleware.js';
import { generateId, sanitizeString } from './validation.js';
import { logAudit, createNotification } from './audit.js';

const LAB_SELECT = `
  SELECT
    lr.*,
    u_patient.name AS patient_name,
    u_doc.name AS doctor_name,
    d.specialization AS doctor_specialization
  FROM lab_results lr
  JOIN users u_patient ON lr.patient_id = u_patient.id
  LEFT JOIN doctors d ON lr.doctor_id = d.id
  LEFT JOIN users u_doc ON d.user_id = u_doc.id
`;

/* ------------------------------------------------------------------ */
/* GET /lab-results  |  GET /lab-results/:id                           */
/* ------------------------------------------------------------------ */

export async function listLabResults(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const id = q(ctx, 'id');

    if (id) {
      const result = await queryOne(`${LAB_SELECT} WHERE lr.id = ?`, [id]);
      if (!result) return fail(ctx, 404, 'Lab result not found.');
      if (user.role === 'PATIENT' && result.patient_id !== user.id) {
        return fail(ctx, 403, 'Unauthorized to view this lab result.');
      }
      return ok(ctx, { labResult: result }, 'Lab result retrieved');
    }

    const patientIdParam = q(ctx, 'patient_id');
    let targetPatientId = null;
    if (user.role === 'PATIENT') {
      targetPatientId = user.id;
    } else if (patientIdParam) {
      targetPatientId = patientIdParam;
    } else if (user.role === 'HOSPITAL') {
      return fail(ctx, 403, 'Hospitals cannot access individual lab results.');
    }

    let sql = `${LAB_SELECT} WHERE 1=1`;
    const params = [];

    if (targetPatientId) {
      sql += ' AND lr.patient_id = ?';
      params.push(targetPatientId);
    }

    sql += ' ORDER BY lr.report_date DESC, lr.created_at DESC';

    const results = await query(sql, params);
    return ok(ctx, { labResults: results }, 'Lab results retrieved');
  } catch (err) {
    console.error('Error fetching lab results:', err);
    return fail(ctx, 500, 'Failed to fetch lab results.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /lab-results                                                   */
/* ------------------------------------------------------------------ */

export async function createLabResult(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx, ['DOCTOR', 'ADMIN']));
    if (!user) return;

    const {
      patient_id,
      test_name,
      result,
      unit,
      reference_range,
      report_date,
      notes,
    } = ctx.body || {};

    if (!patient_id) return fail(ctx, 400, 'patient_id is required.');
    if (!test_name) return fail(ctx, 400, 'test_name is required.');
    if (!result) return fail(ctx, 400, 'result value is required.');
    if (!report_date) return fail(ctx, 400, 'report_date is required.');

    let doctorId = null;
    if (user.role === 'DOCTOR') {
      const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
      if (doc) doctorId = doc.id;
    } else {
      doctorId = ctx.body?.doctor_id || null;
    }

    const labId = generateId('lab');
    await execute(
      `INSERT INTO lab_results (id, patient_id, doctor_id, test_name, result, unit, reference_range, report_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        labId,
        patient_id,
        doctorId,
        sanitizeString(test_name),
        sanitizeString(result),
        sanitizeString(unit) || null,
        sanitizeString(reference_range) || null,
        sanitizeString(report_date),
        sanitizeString(notes) || null,
      ]
    );

    await logAudit(user.id, 'ADD_LAB_RESULT', 'lab_results', labId, ctx.req);
    await createNotification(
      patient_id,
      'Lab Result Ready',
      `A new lab report for "${test_name}" has been recorded. Check your records for details.`,
      'LAB_RESULT'
    );

    const createdRow = await queryOne('SELECT * FROM lab_results WHERE id = ?', [labId]);
    return created(ctx, { labResult: createdRow }, 'Lab result recorded successfully');
  } catch (err) {
    console.error('Error creating lab result:', err);
    return fail(ctx, 500, 'Failed to record lab result.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', path: '/lab-results', handler: listLabResults },
  { method: 'POST', path: '/lab-results', handler: createLabResult, roles: ['DOCTOR', 'ADMIN'] },
  { method: 'GET', path: '/lab-results/:id', handler: listLabResults },
];
