import { queryOne, execute } from '../../lib/db.js';
import { hashPassword, signToken, setSessionCookie } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';
import { isValidEmail, isValidPassword, sanitizeString, generateId } from '../../lib/validation.js';
import { logAudit, createNotification } from '../../lib/audit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  try {
    const {
      name,
      email,
      password,
      role = 'PATIENT',
      phone,
      gender,
      date_of_birth,
      blood_group,
      location,
      // Doctor-specific fields if registering as DOCTOR
      specialization,
      qualification,
      experience_years,
      license_number,
      hospital_name,
      bio,
      consultation_fee,
    } = req.body || {};

    const cleanName = sanitizeString(name);
    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanRole = sanitizeString(role).toUpperCase();

    if (!cleanName) {
      return errorResponse(res, 400, 'Name is required.');
    }
    if (!isValidEmail(cleanEmail)) {
      return errorResponse(res, 400, 'A valid email address is required.');
    }
    if (!isValidPassword(password)) {
      return errorResponse(res, 400, 'Password must be at least 6 characters long.');
    }

    const allowedRoles = ['PATIENT', 'DOCTOR', 'HOSPITAL', 'ADMIN'];
    if (!allowedRoles.includes(cleanRole)) {
      return errorResponse(res, 400, 'Invalid role. Must be PATIENT, DOCTOR, HOSPITAL, or ADMIN.');
    }

    // Check if user already exists
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) {
      return errorResponse(res, 409, 'An account with this email already exists.');
    }

    // Hash password
    const passwordHash = await hashPassword(password);
    const userId = generateId('usr');

    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        userId,
        cleanName,
        cleanEmail,
        passwordHash,
        cleanRole,
        sanitizeString(phone) || null,
        sanitizeString(gender) || null,
        sanitizeString(date_of_birth) || null,
        sanitizeString(blood_group) || null,
        sanitizeString(location) || null,
      ]
    );

    // If DOCTOR, create doctor profile record
    if (cleanRole === 'DOCTOR') {
      const doctorId = generateId('doc');
      await execute(
        `INSERT INTO doctors (id, user_id, specialization, qualification, experience_years, license_number, hospital_name, bio, consultation_fee, available, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
        [
          doctorId,
          userId,
          sanitizeString(specialization) || 'General Medicine',
          sanitizeString(qualification) || 'MBBS',
          Number(experience_years) || 1,
          sanitizeString(license_number) || `LIC-${Date.now().toString().slice(-6)}`,
          sanitizeString(hospital_name) || 'City General Hospital',
          sanitizeString(bio) || 'Dedicated healthcare professional.',
          Number(consultation_fee) || 50,
        ]
      );

      // Add default weekly availability (Mon-Fri 09:00 - 17:00)
      for (let day = 1; day <= 5; day++) {
        await execute(
          `INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time, is_available)
           VALUES (?, ?, ?, '09:00', '17:00', 1)`,
          [generateId('av'), doctorId, day]
        );
      }
    }

    // Sign session token
    const token = signToken({ id: userId, email: cleanEmail, role: cleanRole, name: cleanName });
    setSessionCookie(res, token);

    // Audit log & welcome notification
    await logAudit(userId, 'REGISTER', 'users', userId, req);
    await createNotification(
      userId,
      'Welcome to HealthSphere',
      `Hello ${cleanName}, welcome to HealthSphere! Your healthcare journey starts here.`,
      'WELCOME'
    );

    return jsonResponse(
      res,
      201,
      {
        user: {
          id: userId,
          name: cleanName,
          email: cleanEmail,
          role: cleanRole,
          phone: sanitizeString(phone),
          blood_group: sanitizeString(blood_group),
          location: sanitizeString(location),
        },
        token,
      },
      'Account created successfully'
    );
  } catch (err) {
    console.error('Registration error:', err);
    return errorResponse(res, 500, 'Registration failed due to a server error.');
  }
}
