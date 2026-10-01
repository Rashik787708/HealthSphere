import { queryOne, query } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  const user = await requireAuth(req, res, ['ADMIN']);
  if (!user) return;

  try {
    const totalUsers = await queryOne(`SELECT COUNT(*) as count FROM users`);
    const patients = await queryOne(`SELECT COUNT(*) as count FROM users WHERE role = 'PATIENT'`);
    const doctors = await queryOne(`SELECT COUNT(*) as count FROM users WHERE role = 'DOCTOR'`);
    const hospitals = await queryOne(`SELECT COUNT(*) as count FROM users WHERE role = 'HOSPITAL'`);

    const appointmentsTotal = await queryOne(`SELECT COUNT(*) as count FROM appointments`);
    const appointmentsPending = await queryOne(`SELECT COUNT(*) as count FROM appointments WHERE status = 'PENDING'`);
    const appointmentsConfirmed = await queryOne(`SELECT COUNT(*) as count FROM appointments WHERE status = 'CONFIRMED'`);
    const appointmentsCompleted = await queryOne(`SELECT COUNT(*) as count FROM appointments WHERE status = 'COMPLETED'`);

    const bloodRequestsTotal = await queryOne(`SELECT COUNT(*) as count FROM blood_requests`);
    const emergencyRequests = await queryOne(`SELECT COUNT(*) as count FROM blood_requests WHERE urgency = 'EMERGENCY'`);
    const activeDonors = await queryOne(`SELECT COUNT(*) as count FROM blood_donors WHERE available = 1 AND eligible = 1`);

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

    return jsonResponse(
      res,
      200,
      {
        stats: {
          totalUsers: totalUsers?.count || 0,
          patients: patients?.count || 0,
          doctors: doctors?.count || 0,
          hospitals: hospitals?.count || 0,
          appointments: {
            total: appointmentsTotal?.count || 0,
            pending: appointmentsPending?.count || 0,
            confirmed: appointmentsConfirmed?.count || 0,
            completed: appointmentsCompleted?.count || 0,
          },
          bloodRequests: {
            total: bloodRequestsTotal?.count || 0,
            emergency: emergencyRequests?.count || 0,
          },
          activeDonors: activeDonors?.count || 0,
        },
        recentAppointments,
        recentAudits,
      },
      'Platform statistics retrieved'
    );
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    return errorResponse(res, 500, 'Failed to fetch admin stats.');
  }
}
