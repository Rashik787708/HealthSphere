import { query, queryOne, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { generateId, sanitizeString } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    try {
      const patientIdParam = url.searchParams.get('patient_id');
      const limit = parseInt(url.searchParams.get('limit') || '30', 10);

      let targetPatientId = user.id;
      if (user.role === 'DOCTOR' || user.role === 'ADMIN') {
        if (patientIdParam) {
          targetPatientId = patientIdParam;
        }
      }

      const records = await query(
        `SELECT * FROM wellness_records 
         WHERE patient_id = ? 
         ORDER BY record_date DESC 
         LIMIT ?`,
        [targetPatientId, limit]
      );

      // Compute 7-day or 30-day averages
      let avgSleep = 0;
      let avgWater = 0;
      let totalExercise = 0;
      let latestWeight = null;
      let validSleepCount = 0;
      let validWaterCount = 0;

      records.forEach(r => {
        if (r.sleep_hours != null) {
          avgSleep += Number(r.sleep_hours);
          validSleepCount++;
        }
        if (r.water_intake != null) {
          avgWater += Number(r.water_intake);
          validWaterCount++;
        }
        if (r.exercise_minutes != null) {
          totalExercise += Number(r.exercise_minutes);
        }
        if (latestWeight == null && r.weight != null) {
          latestWeight = Number(r.weight);
        }
      });

      const summary = {
        avgSleepHours: validSleepCount > 0 ? (avgSleep / validSleepCount).toFixed(1) : '0.0',
        avgWaterIntakeLiters: validWaterCount > 0 ? (avgWater / validWaterCount).toFixed(1) : '0.0',
        totalExerciseMinutes: totalExercise,
        latestWeightKg: latestWeight || null,
        totalEntries: records.length,
      };

      return jsonResponse(
        res,
        200,
        {
          records,
          summary,
        },
        'Wellness records retrieved'
      );
    } catch (err) {
      console.error('Error fetching wellness records:', err);
      return errorResponse(res, 500, 'Failed to fetch wellness records.');
    }
  }

  if (req.method === 'POST') {
    if (user.role !== 'PATIENT' && user.role !== 'ADMIN') {
      return errorResponse(res, 403, 'Only patients can record daily wellness.');
    }

    try {
      const {
        record_date = new Date().toISOString().split('T')[0],
        diet_data,
        sleep_hours,
        water_intake,
        exercise_minutes,
        weight,
        mood,
        notes,
      } = req.body || {};

      const patientId = user.id;

      // Check if entry already exists for this date
      const existing = await queryOne(
        `SELECT id FROM wellness_records WHERE patient_id = ? AND record_date = ?`,
        [patientId, record_date]
      );

      let recordId;
      if (existing) {
        recordId = existing.id;
        await execute(
          `UPDATE wellness_records 
           SET diet_data = ?, sleep_hours = ?, water_intake = ?, exercise_minutes = ?, weight = ?, mood = ?, notes = ?
           WHERE id = ?`,
          [
            sanitizeString(diet_data) || null,
            sleep_hours != null ? Number(sleep_hours) : null,
            water_intake != null ? Number(water_intake) : null,
            exercise_minutes != null ? Number(exercise_minutes) : null,
            weight != null ? Number(weight) : null,
            sanitizeString(mood) || null,
            sanitizeString(notes) || null,
            recordId,
          ]
        );
      } else {
        recordId = generateId('well');
        await execute(
          `INSERT INTO wellness_records (id, patient_id, record_date, diet_data, sleep_hours, water_intake, exercise_minutes, weight, mood, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            recordId,
            patientId,
            record_date,
            sanitizeString(diet_data) || null,
            sleep_hours != null ? Number(sleep_hours) : null,
            water_intake != null ? Number(water_intake) : null,
            exercise_minutes != null ? Number(exercise_minutes) : null,
            weight != null ? Number(weight) : null,
            sanitizeString(mood) || null,
            sanitizeString(notes) || null,
          ]
        );
      }

      await logAudit(user.id, 'LOG_WELLNESS', 'wellness_records', recordId, req);

      const saved = await queryOne('SELECT * FROM wellness_records WHERE id = ?', [recordId]);
      return jsonResponse(res, 201, { record: saved }, 'Wellness logged successfully');
    } catch (err) {
      console.error('Error logging wellness:', err);
      return errorResponse(res, 500, 'Failed to log wellness entry.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
