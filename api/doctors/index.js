import { query, queryOne } from '../../lib/db.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const doctorId = url.searchParams.get('id');
    const specialization = url.searchParams.get('specialization');
    const search = url.searchParams.get('search');
    const location = url.searchParams.get('location');
    const maxFee = url.searchParams.get('max_fee');
    const availableOnly = url.searchParams.get('available');

    // If specific doctor ID requested
    if (doctorId) {
      const doc = await queryOne(
        `SELECT d.*, u.name, u.email, u.phone, u.location, u.gender
         FROM doctors d
         JOIN users u ON d.user_id = u.id
         WHERE d.id = ?`,
        [doctorId]
      );

      if (!doc) {
        return errorResponse(res, 404, 'Doctor not found.');
      }

      // Fetch availability
      const availability = await query(
        `SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC, start_time ASC`,
        [doctorId]
      );

      return jsonResponse(
        res,
        200,
        {
          doctor: doc,
          availability,
        },
        'Doctor details retrieved'
      );
    }

    // List doctors with search and filter
    let sql = `
      SELECT d.*, u.name, u.email, u.phone, u.location, u.gender
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (specialization) {
      sql += ` AND LOWER(d.specialization) = LOWER(?)`;
      params.push(specialization.trim());
    }

    if (search) {
      const searchPattern = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(u.name) LIKE ? OR LOWER(d.specialization) LIKE ? OR LOWER(d.hospital_name) LIKE ? OR LOWER(u.location) LIKE ?)`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (location) {
      sql += ` AND LOWER(u.location) LIKE ?`;
      params.push(`%${location.trim().toLowerCase()}%`);
    }

    if (maxFee) {
      const feeNum = parseFloat(maxFee);
      if (!isNaN(feeNum)) {
        sql += ` AND d.consultation_fee <= ?`;
        params.push(feeNum);
      }
    }

    if (availableOnly === '1' || availableOnly === 'true') {
      sql += ` AND d.available = 1`;
    }

    sql += ` ORDER BY d.experience_years DESC, u.name ASC`;

    const doctors = await query(sql, params);

    // Also get distinct specializations for filter dropdowns
    const specRows = await query(
      `SELECT DISTINCT specialization FROM doctors WHERE specialization IS NOT NULL AND specialization != '' ORDER BY specialization ASC`
    );
    const specializations = specRows.map(r => r.specialization);

    return jsonResponse(
      res,
      200,
      {
        doctors,
        specializations,
        total: doctors.length,
      },
      'Doctors list retrieved'
    );
  } catch (err) {
    console.error('Error fetching doctors:', err);
    return errorResponse(res, 500, 'Failed to fetch doctors list.');
  }
}
