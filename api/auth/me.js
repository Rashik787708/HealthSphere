import { queryOne, query, execute } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { sanitizeString } from '../../lib/validation.js';
import { logAudit } from '../../lib/audit.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return; // Response handled by requireAuth

  if (req.method === 'GET') {
    try {
      let doctorProfile = null;
      if (user.role === 'DOCTOR') {
        doctorProfile = await queryOne(
          `SELECT * FROM doctors WHERE user_id = ?`,
          [user.id]
        );
      }

      // Check if user is a registered blood donor
      const donorProfile = await queryOne(
        `SELECT * FROM blood_donors WHERE user_id = ?`,
        [user.id]
      );

      // Unread notifications count
      const notifCount = await queryOne(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
        [user.id]
      );

      return jsonResponse(
        res,
        200,
        {
          user,
          doctorProfile,
          donorProfile,
          unreadNotifications: notifCount?.count || 0,
        },
        'User profile retrieved'
      );
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return errorResponse(res, 500, 'Failed to fetch user profile.');
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const {
        name,
        phone,
        gender,
        date_of_birth,
        blood_group,
        location,
        // Doctor specific
        specialization,
        qualification,
        experience_years,
        hospital_name,
        bio,
        consultation_fee,
        available,
      } = req.body || {};

      const cleanName = sanitizeString(name) || user.name;
      const cleanPhone = sanitizeString(phone) || user.phone;
      const cleanGender = sanitizeString(gender) || user.gender;
      const cleanDob = sanitizeString(date_of_birth) || user.date_of_birth;
      const cleanBlood = sanitizeString(blood_group) || user.blood_group;
      const cleanLoc = sanitizeString(location) || user.location;

      await execute(
        `UPDATE users 
         SET name = ?, phone = ?, gender = ?, date_of_birth = ?, blood_group = ?, location = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [cleanName, cleanPhone, cleanGender, cleanDob, cleanBlood, cleanLoc, user.id]
      );

      if (user.role === 'DOCTOR') {
        const doc = await queryOne('SELECT id FROM doctors WHERE user_id = ?', [user.id]);
        if (doc) {
          await execute(
            `UPDATE doctors 
             SET specialization = COALESCE(?, specialization),
                 qualification = COALESCE(?, qualification),
                 experience_years = COALESCE(?, experience_years),
                 hospital_name = COALESCE(?, hospital_name),
                 bio = COALESCE(?, bio),
                 consultation_fee = COALESCE(?, consultation_fee),
                 available = COALESCE(?, available)
             WHERE id = ?`,
            [
              specialization != null ? sanitizeString(specialization) : null,
              qualification != null ? sanitizeString(qualification) : null,
              experience_years != null ? Number(experience_years) : null,
              hospital_name != null ? sanitizeString(hospital_name) : null,
              bio != null ? sanitizeString(bio) : null,
              consultation_fee != null ? Number(consultation_fee) : null,
              available != null ? (available ? 1 : 0) : null,
              doc.id,
            ]
          );
        }
      }

      // If user is a donor, update blood group and location as well
      await execute(
        `UPDATE blood_donors 
         SET blood_group = COALESCE(?, blood_group), location = COALESCE(?, location), updated_at = datetime('now')
         WHERE user_id = ?`,
        [cleanBlood, cleanLoc, user.id]
      );

      await logAudit(user.id, 'UPDATE_PROFILE', 'users', user.id, req);

      const updatedUser = await queryOne(
        `SELECT id, name, email, role, phone, gender, date_of_birth, blood_group, location, created_at, updated_at 
         FROM users WHERE id = ?`,
        [user.id]
      );

      return jsonResponse(res, 200, { user: updatedUser }, 'Profile updated successfully');
    } catch (err) {
      console.error('Error updating user profile:', err);
      return errorResponse(res, 500, 'Failed to update profile.');
    }
  }

  return errorResponse(res, 405, 'Method not allowed.');
}
