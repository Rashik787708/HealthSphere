/**
 * HealthSphere — Account Routes (register / login / logout / me)
 *
 * Plain backend module. Routed by lib/router.js and executed inside the single
 * Vercel Serverless Function (api/[...route].js).
 */

import { queryOne, execute } from './db.js';
import {
  hashPassword,
  comparePassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  getUserFromRequest,
} from './auth.js';
import { ok, created, fail, requireUser } from './middleware.js';
import { isValidEmail, isValidPassword, sanitizeString, generateId } from './validation.js';
import { logAudit, createNotification } from './audit.js';

/* ------------------------------------------------------------------ */
/* POST /auth/register                                                 */
/* ------------------------------------------------------------------ */

export async function register(ctx) {
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
      specialization,
      qualification,
      experience_years,
      license_number,
      hospital_name,
      bio,
      consultation_fee,
    } = ctx.body || {};

    const cleanName = sanitizeString(name);
    const cleanEmail = sanitizeString(email).toLowerCase();
    const cleanRole = sanitizeString(role).toUpperCase();

    if (!cleanName) return fail(ctx, 400, 'Name is required.');
    if (!isValidEmail(cleanEmail)) return fail(ctx, 400, 'A valid email address is required.');
    if (!isValidPassword(password)) {
      return fail(ctx, 400, 'Password must be at least 6 characters long.');
    }

    // Self-service signup is limited to non-privileged roles; ADMIN accounts are
    // provisioned by an existing administrator via PATCH /api/admin/users.
    const selfServeRoles = ['PATIENT', 'DOCTOR', 'HOSPITAL'];
    if (!selfServeRoles.includes(cleanRole)) {
      return fail(ctx, 403, 'Accounts cannot be self-registered with the ADMIN role.');
    }

    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing) return fail(ctx, 409, 'An account with this email already exists.');

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

      for (let day = 1; day <= 5; day++) {
        await execute(
          `INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time, is_available)
           VALUES (?, ?, ?, '09:00', '17:00', 1)`,
          [generateId('av'), doctorId, day]
        );
      }
    }

    const token = signToken({ id: userId, email: cleanEmail, role: cleanRole, name: cleanName });
    setSessionCookie(ctx.res, token);

    await logAudit(userId, 'REGISTER', 'users', userId, ctx.req);
    await createNotification(
      userId,
      'Welcome to HealthSphere',
      `Hello ${cleanName}, welcome to HealthSphere! Your healthcare journey starts here.`,
      'WELCOME'
    );

    return created(
      ctx,
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
    return fail(ctx, 500, 'Registration failed due to a server error.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /auth/login                                                    */
/* ------------------------------------------------------------------ */

export async function login(ctx) {
  try {
    const { email, password } = ctx.body || {};
    const cleanEmail = sanitizeString(email).toLowerCase();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return fail(ctx, 400, 'Please provide a valid email address.');
    }
    if (!password) return fail(ctx, 400, 'Password is required.');

    const user = await queryOne(
      `SELECT id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at
       FROM users WHERE email = ?`,
      [cleanEmail]
    );

    if (!user) return fail(ctx, 401, 'Invalid email or password.');

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) return fail(ctx, 401, 'Invalid email or password.');

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    setSessionCookie(ctx.res, token);

    await logAudit(user.id, 'LOGIN', 'users', user.id, ctx.req);

    const { password_hash, ...safeUser } = user;
    return ok(ctx, { user: safeUser, token }, 'Logged in successfully');
  } catch (err) {
    console.error('Login error:', err);
    return fail(ctx, 500, 'Login failed due to a server error.');
  }
}

/* ------------------------------------------------------------------ */
/* POST /auth/logout                                                   */
/* ------------------------------------------------------------------ */

export async function logout(ctx) {
  try {
    const user = await getUserFromRequest(ctx.req);
    if (user) await logAudit(user.id, 'LOGOUT', 'users', user.id, ctx.req);
  } catch (e) {
    // non-fatal
  }

  clearSessionCookie(ctx.res);
  return ok(ctx, {}, 'Logged out successfully');
}

/* ------------------------------------------------------------------ */
/* GET / PUT / PATCH /auth/me                                          */
/* ------------------------------------------------------------------ */

export async function getMe(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    let doctorProfile = null;
    if (user.role === 'DOCTOR') {
      doctorProfile = await queryOne('SELECT * FROM doctors WHERE user_id = ?', [user.id]);
    }

    const donorProfile = await queryOne('SELECT * FROM blood_donors WHERE user_id = ?', [user.id]);

    const notifCount = await queryOne(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [user.id]
    );

    return ok(
      ctx,
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
    return fail(ctx, 500, 'Failed to fetch user profile.');
  }
}

export async function updateMe(ctx) {
  try {
    const user = ctx.user || (await requireUser(ctx));
    if (!user) return;

    const {
      name,
      phone,
      gender,
      date_of_birth,
      blood_group,
      location,
      specialization,
      qualification,
      experience_years,
      hospital_name,
      bio,
      consultation_fee,
      available,
    } = ctx.body || {};

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

    await execute(
      `UPDATE blood_donors
       SET blood_group = COALESCE(?, blood_group), location = COALESCE(?, location), updated_at = datetime('now')
       WHERE user_id = ?`,
      [cleanBlood, cleanLoc, user.id]
    );

    await logAudit(user.id, 'UPDATE_PROFILE', 'users', user.id, ctx.req);

    const updatedUser = await queryOne(
      `SELECT id, name, email, role, phone, gender, date_of_birth, blood_group, location, created_at, updated_at
       FROM users WHERE id = ?`,
      [user.id]
    );

    return ok(ctx, { user: updatedUser }, 'Profile updated successfully');
  } catch (err) {
    console.error('Error updating user profile:', err);
    return fail(ctx, 500, 'Failed to update profile.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

const AUTH_RATE = { max: 60, windowMs: 60_000, bucket: 'auth' };
const LOGIN_RATE = { max: 30, windowMs: 60_000, bucket: 'login' };
const REGISTER_RATE = { max: 20, windowMs: 60_000, bucket: 'register' };

export const routes = [
  { method: 'POST', path: '/auth/register', handler: register, rateLimit: REGISTER_RATE },
  { method: 'POST', path: '/auth/login', handler: login, rateLimit: LOGIN_RATE },
  { method: 'POST', path: '/auth/logout', handler: logout, rateLimit: AUTH_RATE },
  { method: 'GET', path: '/auth/me', handler: getMe },
  { method: 'PUT', path: '/auth/me', handler: updateMe },
  { method: 'PATCH', path: '/auth/me', handler: updateMe },
  { method: 'GET', path: '/auth/session', handler: getMe },
];
