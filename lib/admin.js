/**
 * HealthSphere — Administration Routes
 *
 * Platform metrics, user governance, and the immutable security audit trail.
 * Every route in this module requires the ADMIN role (enforced centrally in
 * lib/router.js via each route's `roles` field).
 *
 * Routed by lib/router.js inside the single Vercel Serverless Function.
 */

import { query, queryOne, execute } from './db.js';
import { ok, fail, q, qInt } from './middleware.js';
import { sanitizeString } from './validation.js';
import { logAudit } from './audit.js';

const count = async (sql, args = []) => {
  const row = await queryOne(sql, args);
  return row?.count || 0;
};

/* ------------------------------------------------------------------ */
/* GET /admin/stats                                                    */
/* ------------------------------------------------------------------ */

export async function getStats(ctx) {
  try {
    const totalUsers = await count('SELECT COUNT(*) as count FROM users');
    const patients = await count("SELECT COUNT(*) as count FROM users WHERE role = 'PATIENT'");
    const doctors = await count("SELECT COUNT(*) as count FROM users WHERE role = 'DOCTOR'");
    const hospitals = await count("SELECT COUNT(*) as count FROM users WHERE role = 'HOSPITAL'");

    const appointmentsTotal = await count('SELECT COUNT(*) as count FROM appointments');
    const appointmentsPending = await count(
      "SELECT COUNT(*) as count FROM appointments WHERE status = 'PENDING'"
    );
    const appointmentsConfirmed = await count(
      "SELECT COUNT(*) as count FROM appointments WHERE status = 'CONFIRMED'"
    );
    const appointmentsCompleted = await count(
      "SELECT COUNT(*) as count FROM appointments WHERE status = 'COMPLETED'"
    );

    const bloodRequestsTotal = await count('SELECT COUNT(*) as count FROM blood_requests');
    const emergencyRequests = await count(
      "SELECT COUNT(*) as count FROM blood_requests WHERE urgency = 'EMERGENCY'"
    );
    const activeDonors = await count(
      'SELECT COUNT(*) as count FROM blood_donors WHERE available = 1 AND eligible = 1'
    );

    const recentAppointments = await query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
              u_pat.name as patient_name, u_doc.name as doctor_name
       FROM appointments a
       JOIN users u_pat ON a.patient_id = u_pat.id
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u_doc ON d.user_id = u_doc.id
       ORDER BY a.created_at DESC
       LIMIT 5`
    );

    const recentAudits = await query(
      `SELECT al.*, u.name as user_name, u.role as user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 8`
    );

    return ok(
      ctx,
      {
        stats: {
          totalUsers,
          patients,
          doctors,
          hospitals,
          appointments: {
            total: appointmentsTotal,
            pending: appointmentsPending,
            confirmed: appointmentsConfirmed,
            completed: appointmentsCompleted,
          },
          bloodRequests: { total: bloodRequestsTotal, emergency: emergencyRequests },
          activeDonors,
        },
        recentAppointments,
        recentAudits,
      },
      'Platform statistics retrieved'
    );
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    return fail(ctx, 500, 'Failed to fetch admin stats.');
  }
}

/* ------------------------------------------------------------------ */
/* GET / PATCH / PUT /admin/users                                      */
/* ------------------------------------------------------------------ */

export async function listUsers(ctx) {
  try {
    const role = q(ctx, 'role');
    const search = q(ctx, 'search');
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 100), 1), 500);

    let sql = `
      SELECT id, name, email, role, phone, gender, date_of_birth, blood_group, location, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      sql += ' AND role = ?';
      params.push(role.toUpperCase());
    }

    if (search) {
      const pattern = `%${search.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(location) LIKE ?)';
      params.push(pattern, pattern, pattern);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const users = await query(sql, params);
    return ok(ctx, { users, total: users.length }, 'Users retrieved');
  } catch (err) {
    console.error('Error fetching users:', err);
    return fail(ctx, 500, 'Failed to fetch users.');
  }
}

export async function updateUser(ctx) {
  try {
    const adminUser = ctx.user;
    const { user_id, role, name, phone, blood_group, location } = ctx.body || {};
    if (!user_id) return fail(ctx, 400, 'user_id is required.');

    const target = await queryOne('SELECT * FROM users WHERE id = ?', [user_id]);
    if (!target) return fail(ctx, 404, 'User not found.');

    const allowedRoles = ['PATIENT', 'DOCTOR', 'HOSPITAL', 'ADMIN'];
    if (role && !allowedRoles.includes(role.toUpperCase())) {
      return fail(ctx, 400, 'Invalid role.');
    }

    if (role && target.id === adminUser.id && role.toUpperCase() !== 'ADMIN') {
      return fail(ctx, 400, 'You cannot remove your own administrator role.');
    }

    await execute(
      `UPDATE users
       SET role = COALESCE(?, role),
           name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           blood_group = COALESCE(?, blood_group),
           location = COALESCE(?, location),
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        role ? role.toUpperCase() : null,
        name ? sanitizeString(name) : null,
        phone ? sanitizeString(phone) : null,
        blood_group ? sanitizeString(blood_group) : null,
        location ? sanitizeString(location) : null,
        user_id,
      ]
    );

    await logAudit(adminUser.id, 'ADMIN_UPDATE_USER', 'users', user_id, ctx.req);

    const updated = await queryOne(
      'SELECT id, name, email, role, phone, gender, blood_group, location, updated_at FROM users WHERE id = ?',
      [user_id]
    );

    return ok(ctx, { user: updated }, 'User updated successfully');
  } catch (err) {
    console.error('Error updating user:', err);
    return fail(ctx, 500, 'Failed to update user.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /admin/doctors                                                  */
/* ------------------------------------------------------------------ */

export async function listAdminDoctors(ctx) {
  try {
    const search = q(ctx, 'search');
    const specialization = q(ctx, 'specialization');

    let sql = `
      SELECT d.id, d.user_id, d.specialization, d.qualification, d.experience_years,
             d.license_number, d.hospital_name, d.bio, d.consultation_fee, d.available,
             d.created_at, u.name, u.email, u.phone, u.location
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (specialization) {
      sql += ' AND LOWER(d.specialization) = LOWER(?)';
      params.push(specialization.trim());
    }

    if (search) {
      const pattern = `%${search.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(u.name) LIKE ? OR LOWER(d.hospital_name) LIKE ? OR LOWER(d.license_number) LIKE ?)';
      params.push(pattern, pattern, pattern);
    }

    sql += ' ORDER BY d.experience_years DESC, u.name ASC';

    const doctors = await query(sql, params);
    return ok(ctx, { doctors, total: doctors.length }, 'Doctors retrieved');
  } catch (err) {
    console.error('Error fetching admin doctors:', err);
    return fail(ctx, 500, 'Failed to fetch doctors.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /admin/hospitals                                                */
/* ------------------------------------------------------------------ */

export async function listHospitals(ctx) {
  try {
    const search = q(ctx, 'search');

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.location, u.created_at,
             (SELECT COUNT(*) FROM blood_requests br WHERE br.hospital_id = u.id) AS requests_raised,
             (SELECT COUNT(*) FROM blood_requests br WHERE br.requester_id = u.id) AS requests_created
      FROM users u
      WHERE u.role = 'HOSPITAL'
    `;
    const params = [];

    if (search) {
      sql += ' AND (LOWER(u.name) LIKE ? OR LOWER(u.location) LIKE ?)';
      const pattern = `%${search.trim().toLowerCase()}%`;
      params.push(pattern, pattern);
    }

    sql += ' ORDER BY u.name ASC';

    const hospitals = await query(sql, params);
    return ok(ctx, { hospitals, total: hospitals.length }, 'Hospitals retrieved');
  } catch (err) {
    console.error('Error fetching hospitals:', err);
    return fail(ctx, 500, 'Failed to fetch hospitals.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /admin/appointments                                             */
/* ------------------------------------------------------------------ */

export async function listAdminAppointments(ctx) {
  try {
    const status = q(ctx, 'status');
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 100), 1), 500);

    let sql = `
      SELECT a.*, u_pat.name as patient_name, u_doc.name as doctor_name,
             d.specialization as doctor_specialization
      FROM appointments a
      JOIN users u_pat ON a.patient_id = u_pat.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u_doc ON d.user_id = u_doc.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status.toUpperCase());
    }

    sql += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC LIMIT ?';
    params.push(limit);

    const appointments = await query(sql, params);
    return ok(ctx, { appointments, total: appointments.length }, 'Appointments retrieved');
  } catch (err) {
    console.error('Error fetching admin appointments:', err);
    return fail(ctx, 500, 'Failed to fetch appointments.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /admin/blood-requests                                           */
/* ------------------------------------------------------------------ */

export async function listAdminBloodRequests(ctx) {
  try {
    const status = q(ctx, 'status');
    const urgency = q(ctx, 'urgency');
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 100), 1), 500);

    let sql = `
      SELECT br.*, u.name as requester_name, u.phone as requester_phone,
             (SELECT COUNT(*) FROM donor_matches dm WHERE dm.request_id = br.id) AS match_count
      FROM blood_requests br
      JOIN users u ON br.requester_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND br.status = ?';
      params.push(status.toUpperCase());
    }
    if (urgency) {
      sql += ' AND br.urgency = ?';
      params.push(urgency.toUpperCase());
    }

    sql += ` ORDER BY
      CASE br.urgency
        WHEN 'EMERGENCY' THEN 1
        WHEN 'URGENT' THEN 2
        ELSE 3
      END ASC,
      br.created_at DESC
      LIMIT ?`;
    params.push(limit);

    const requests = await query(sql, params);
    return ok(ctx, { requests, total: requests.length }, 'Blood requests retrieved');
  } catch (err) {
    console.error('Error fetching admin blood requests:', err);
    return fail(ctx, 500, 'Failed to fetch blood requests.');
  }
}

/* ------------------------------------------------------------------ */
/* GET /admin/audit-logs                                               */
/* ------------------------------------------------------------------ */

export async function listAuditLogs(ctx) {
  try {
    const limit = Math.min(Math.max(qInt(ctx, 'limit', 50), 1), 500);
    const action = q(ctx, 'action');
    const entity = q(ctx, 'entity');

    let sql = `
      SELECT al.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      sql += ' AND al.action LIKE ?';
      params.push(`%${action.toUpperCase()}%`);
    }
    if (entity) {
      sql += ' AND al.entity = ?';
      params.push(entity);
    }

    sql += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(limit);

    const logs = await query(sql, params);
    return ok(ctx, { logs, total: logs.length }, 'Audit logs retrieved');
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return fail(ctx, 500, 'Failed to fetch audit logs.');
  }
}

/* ------------------------------------------------------------------ */
/* Route table — every entry is ADMIN only                             */
/* ------------------------------------------------------------------ */

const ADMIN_ONLY = ['ADMIN'];

export const routes = [
  { method: 'GET', path: '/admin/stats', handler: getStats, roles: ADMIN_ONLY },
  { method: 'GET', path: '/admin/users', handler: listUsers, roles: ADMIN_ONLY },
  { method: 'PATCH', path: '/admin/users', handler: updateUser, roles: ADMIN_ONLY },
  { method: 'PUT', path: '/admin/users', handler: updateUser, roles: ADMIN_ONLY },
  { method: 'GET', path: '/admin/doctors', handler: listAdminDoctors, roles: ADMIN_ONLY },
  { method: 'GET', path: '/admin/hospitals', handler: listHospitals, roles: ADMIN_ONLY },
  { method: 'GET', path: '/admin/appointments', handler: listAdminAppointments, roles: ADMIN_ONLY },
  { method: 'GET', path: '/admin/blood-requests', handler: listAdminBloodRequests, roles: ADMIN_ONLY },
  { method: 'GET', path: '/admin/audit-logs', handler: listAuditLogs, roles: ADMIN_ONLY },
];
