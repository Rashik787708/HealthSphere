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

      let targetPatientId = null;
      if (user.role === 'PATIENT') {
        targetPatientId = user.id;
      } else if (patientIdParam) {
        targetPatientId = patientIdParam;
      }

      let sql = `
        SELECT 
          lr.*,
          u_patient.name AS patient_name,
          u_doc.name AS doctor_name,
          d.specialization AS doctor_specialization
        FROM lab_results lr
        JOIN users u_patient ON lr.patient_id = u_patient.id
        LEFT JOIN doctors d ON lr.doctor_id = d.id
        LEFT JOIN users u_doc ON d.user_id = u_doc.id
        WHERE 1=1
      `;
      const params = [];

      if (targetPatientId) {
        sql += ` AND lr.patient_id = ?`;
        params.push(targetPatientId);
      }

      sql += ` ORDER BY lr.report_date DESC, lr.created_at DESC`;

      const results = await query(sql, params);
      return jsonResponse(res, 200, { labResults: results }, 'Lab results retrieved');
    } catch (err) {
      console.error('Error fetching lab results:', err);
      return errorResponse(res, 500, 'Failed to fetch lab results.');
    }
  }

  if (req.method === 'POST') {
    if (user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
      return errorResponse(res, 403, 'Only doctors and admins can record lab results.');
    }

    try {
      const {
        patient_id,
        test_name,
        result,
        unit,
        reference_range,
        report_date,
        notes,
      } = req.body || {};

      if (!patient_id) return errorResponse(res, 400, 'patient_id is required.');
      if (!test_name) return errorResponse(res, 400, 'test_name is required.');
      if (!result) return errorResponse(res, 400, 'result value is required.');
      if (!report_date) return errorResponse(res, 400, 'report_date is required.');

      let doctorId = null;
      if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (doc) doctorId = doc.id;
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

      await logAudit(user.id, 'ADD_LAB_RESULT', 'lab_results', labId, req);

      await createNotification(
        patient_id,
        'Lab Result Ready',
        `A new lab report for "${test_name}" has been recorded. Check your records for details.`,
        'LAB_RESULT'
      );

      const created = await queryOne('SELECT * FROM lab_results WHERE id = ?', [labId]);
      return jsonResponse(res, 201, { labResult: created }, 'Lab result recorded successfully');
    } catch (err) {
      console.error('Error creating lab result:', err);
      return errorResponse(res, 500, 'Failed to record lab result.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
