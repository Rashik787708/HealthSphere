import { query } from '../../lib/db.js';
import { jsonResponse, errorResponse } from '../../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  try {
    const emergencyRequests = await query(
      `SELECT 
        br.*,
        u.name AS requester_name,
        u.phone AS requester_phone,
        (SELECT COUNT(*) FROM donor_matches dm WHERE dm.request_id = br.id) AS match_count
       FROM blood_requests br
       JOIN users u ON br.requester_id = u.id
       WHERE br.urgency = 'EMERGENCY' AND br.status IN ('PENDING', 'MATCHED')
       ORDER BY br.created_at DESC
       LIMIT 10`
    );

    return jsonResponse(
      res,
      200,
      {
        emergencyRequests,
        count: emergencyRequests.length,
        disclaimer: 'Blood request matching serves as an alert aid. Actual compatibility and donor screening must be verified by licensed blood bank personnel.',
      },
      'Active emergency blood requests'
    );
  } catch (err) {
    console.error('Error fetching emergency requests:', err);
    return errorResponse(res, 500, 'Failed to fetch emergency blood requests.');
  }
}
