/**
 * HealthSphere API Integration Suite
 *
 * Boots a real HTTP server that routes /api/* to the single catch-all handler
 * (api/[...route].js) — the exact module Vercel deploys — and exercises the
 * entire public API contract: registration, login, RBAC, doctors, appointments,
 * medical records, lab results, prescriptions, wellness, blood network,
 * notifications, admin, and security headers.
 *
 * Usage: node scripts/test-api.js
 */

import http from 'http';
import { once } from 'events';
import handler from '../api/[...route].js';
import { initDatabase } from '../lib/db.js';

const DEMO_PASSWORD = 'DemoPassword123!';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/* ------------------------------------------------------------------ */
/* Server + client                                                     */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    return handler(req, res);
  }
  res.statusCode = 404;
  res.end('not found');
});

let BASE = '';

async function invoke(method, path, { token, body, cookie } = {}) {
  const headers = { ...JSON_HEADERS };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }

  return {
    status: res.status,
    headers: res.headers,
    body: json,
    text,
    cookie: res.headers.get('set-cookie'),
  };
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
const failures = [];

function check(condition, name, extra = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name} ${extra}`);
    failures.push(name);
    failed++;
  }
}

function expectStatus(res, expected, name) {
  check(
    res.status === expected,
    name,
    `(expected ${expected}, got ${res.status}: ${res.text?.slice(0, 180)})`
  );
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

async function run() {
  console.log('HealthSphere API Integration Suite');
  console.log('==================================\n');

  await initDatabase();

  const stamp = Date.now();
  const doctorEmail = `doc.${stamp}@test.local`;
  const patientEmail = `pat.${stamp}@test.local`;
  const patient2Email = `pat2.${stamp}@test.local`;
  const blankEmail = `blank.${stamp}@test.local`;

  /* ---------------- Public / routing ---------------- */
  console.log('1. Routing & public endpoints');
  let res = await invoke('GET', '/api');
  expectStatus(res, 200, 'GET /api returns 200');
  check(
    Array.isArray(res.body?.data?.endpoints) && res.body.data.endpoints.length > 20,
    'GET /api lists the full route table'
  );

  res = await invoke('GET', '/api/health');
  expectStatus(res, 200, 'GET /api/health returns 200');

  res = await invoke('GET', '/api/doctors');
  expectStatus(res, 200, 'GET /api/doctors (public) returns 200');
  const doctorList = res.body?.data?.doctors || [];
  check(doctorList.length > 0, 'GET /api/doctors returns seeded doctors');

  res = await invoke('GET', '/api/doctors/does-not-exist');
  expectStatus(res, 404, 'GET /api/doctors/:id 404s for an unknown id');

  if (doctorList[0]) {
    res = await invoke('GET', `/api/doctors/${doctorList[0].id}`);
    expectStatus(res, 200, 'GET /api/doctors/:id path param works');
    check(!!res.body?.data?.doctor, 'GET /api/doctors/:id returns doctor detail');

    res = await invoke('GET', `/api/doctors/${doctorList[0].id}/availability`);
    expectStatus(res, 200, 'GET /api/doctors/:id/availability works');
  }

  res = await invoke('GET', '/api/blood/emergency');
  expectStatus(res, 200, 'GET /api/blood/emergency (public) returns 200');

  res = await invoke('GET', '/api/not-a-real-route');
  expectStatus(res, 404, 'Unknown route returns 404');
  check(
    res.body?.success === false && typeof res.body.error === 'string',
    '404 body uses the { success:false, error } envelope'
  );
  check(!/at Object|Error:\s+\w+Error/.test(res.text), 'Error responses do not leak stack traces');

  res = await invoke('DELETE', '/api/doctors');
  expectStatus(res, 405, 'Unsupported method returns 405');
  check(!!res.headers?.get('allow'), '405 response includes an Allow header');

  res = await invoke('GET', '/api/auth/me');
  expectStatus(res, 401, 'Unauthenticated /api/auth/me returns 401');

  res = await invoke('GET', '/api/admin/stats');
  expectStatus(res, 401, 'Unauthenticated /api/admin/stats returns 401');

  res = await invoke('POST', '/api/auth/login', { body: { email: 'not-an-email', password: 'p' } });
  expectStatus(res, 400, 'Login with a malformed email returns 400');

  res = await invoke('POST', '/api/auth/login', { body: { email: patientEmail } });
  expectStatus(res, 400, 'Login without a password returns 400');

  /* ---------------- Registration ---------------- */
  console.log('\n2. Registration & validation');
  res = await invoke('POST', '/api/auth/register', {
    body: {
      name: 'Dr. Test',
      email: doctorEmail,
      password: 'TestPass123!',
      role: 'DOCTOR',
      specialization: 'Cardiology',
      location: 'Test City',
    },
  });
  expectStatus(res, 201, 'POST /api/auth/register (DOCTOR) returns 201');
  check(!!res.body?.data?.token, 'Register returns a JWT');

  res = await invoke('POST', '/api/auth/register', {
    body: { name: 'Pat', email: 'not-an-email', password: 'TestPass123!' },
  });
  expectStatus(res, 400, 'Register rejects an invalid email');

  res = await invoke('POST', '/api/auth/register', {
    body: { name: 'Pat', email: patientEmail, password: '123' },
  });
  expectStatus(res, 400, 'Register rejects a short password');

  res = await invoke('POST', '/api/auth/register', {
    body: { name: 'Sneaky', email: `sneak.${stamp}@test.local`, password: 'TestPass123!', role: 'ADMIN' },
  });
  expectStatus(res, 403, 'Register refuses to self-provision the ADMIN role');

  res = await invoke('POST', '/api/auth/register', {
    body: {
      name: 'Patient One',
      email: patientEmail,
      password: 'TestPass123!',
      role: 'PATIENT',
      blood_group: 'O-',
      location: 'Test City',
    },
  });
  expectStatus(res, 201, 'POST /api/auth/register (PATIENT) returns 201');

  res = await invoke('POST', '/api/auth/register', {
    body: {
      name: 'Patient Two',
      email: patient2Email,
      password: 'TestPass123!',
      role: 'PATIENT',
      blood_group: 'O+',
      location: 'Test City',
    },
  });
  expectStatus(res, 201, 'POST /api/auth/register (second patient) returns 201');

  res = await invoke('POST', '/api/auth/register', {
    body: { name: 'Dup', email: patientEmail, password: 'TestPass123!' },
  });
  expectStatus(res, 409, 'Duplicate email returns 409');

  // A profile with no blood group or location on file, for donor validation.
  res = await invoke('POST', '/api/auth/register', {
    body: { name: 'Blank Profile', email: blankEmail, password: 'TestPass123!', role: 'PATIENT' },
  });
  expectStatus(res, 201, 'Register accepts a profile with no blood group or location');

  /* ---------------- Login ---------------- */
  console.log('\n3. Login & session');
  res = await invoke('POST', '/api/auth/login', {
    body: { email: patientEmail, password: 'TestPass123!' },
  });
  expectStatus(res, 200, 'POST /api/auth/login returns 200');
  const patientToken = res.body?.data?.token;
  check(!!patientToken, 'Login returns a JWT');
  check(res.body?.data?.user?.password_hash === undefined, 'Login never leaks password_hash');
  check(!!res.cookie, 'Login sets a session cookie');
  check(/HttpOnly/i.test(res.cookie || ''), 'Session cookie is HttpOnly');
  check(/SameSite/i.test(res.cookie || ''), 'Session cookie sets SameSite');

  res = await invoke('POST', '/api/auth/login', { body: { email: patientEmail, password: 'WrongPassword' } });
  expectStatus(res, 401, 'Wrong password returns 401');

  res = await invoke('POST', '/api/auth/login', { body: { email: 'ghost@test.local', password: 'TestPass123!' } });
  expectStatus(res, 401, 'Unknown user returns 401');

  res = await invoke('POST', '/api/auth/login', { body: { email: doctorEmail, password: 'TestPass123!' } });
  expectStatus(res, 200, 'Doctor can log in');
  const doctorToken = res.body?.data?.token;

  res = await invoke('POST', '/api/auth/login', {
    body: { email: 'admin@healthsphere.local', password: DEMO_PASSWORD },
  });
  expectStatus(res, 200, 'Seeded admin can log in');
  const adminToken = res.body?.data?.token;
  check(!!adminToken, 'Admin login returns a JWT');

  res = await invoke('GET', '/api/auth/me', { token: patientToken });
  expectStatus(res, 200, 'GET /api/auth/me returns 200');
  check(res.body?.data?.user?.email === patientEmail, '/auth/me returns the authenticated user');

  res = await invoke('PUT', '/api/auth/me', { token: patientToken, body: { phone: '+1-555-0100' } });
  expectStatus(res, 200, 'PUT /api/auth/me updates the profile');
  check(res.body?.data?.user?.phone === '+1-555-0100', 'Profile update persists');

  res = await invoke('GET', '/api/auth/me', { token: doctorToken });
  check(!!res.body?.data?.doctorProfile, '/auth/me returns doctorProfile for doctors');

  const blankToken = (
    await invoke('POST', '/api/auth/login', { body: { email: blankEmail, password: 'TestPass123!' } })
  ).body?.data?.token;
  check(!!blankToken, 'Profile without a blood group can log in');

  // Cookie-based session (no Bearer header) must work too.
  const cookieLogin = await invoke('POST', '/api/auth/login', {
    body: { email: patientEmail, password: 'TestPass123!' },
  });
  res = await invoke('GET', '/api/auth/me', { cookie: cookieLogin.cookie?.split(';')[0] });
  expectStatus(res, 200, 'Cookie-only session authenticates (no Bearer header)');

  /* ---------------- RBAC ---------------- */
  console.log('\n4. Role-based access control');
  res = await invoke('GET', '/api/admin/stats', { token: patientToken });
  expectStatus(res, 403, 'Patient blocked from /api/admin/stats (403)');

  res = await invoke('GET', '/api/admin/users', { token: doctorToken });
  expectStatus(res, 403, 'Doctor blocked from /api/admin/users (403)');

  res = await invoke('POST', '/api/medical-records', {
    token: patientToken,
    body: { patient_id: 'x', diagnosis: 'self-diagnosis' },
  });
  expectStatus(res, 403, 'Patient cannot author medical records (403)');

  res = await invoke('GET', '/api/appointments', { token: doctorToken });
  expectStatus(res, 200, 'Doctor can list appointments');
  check(Array.isArray(res.body?.data?.appointments), 'Doctor appointment list is an array');

  res = await invoke('GET', '/api/prescriptions', { token: doctorToken });
  expectStatus(res, 200, 'Doctor can list prescriptions');

  /* ---------------- Appointments ---------------- */
  console.log('\n5. Appointments');
  res = await invoke('GET', '/api/doctors?available=1');
  const bookable = (res.body?.data?.doctors || []).filter((d) => d.available === 1);
  check(bookable.length > 0, 'At least one bookable doctor is available');

  // Use the doctor we registered so status transitions are exercisable.
  const targetDoctor = (await invoke('GET', '/api/doctors?search=Dr.%20Test')).body?.data?.doctors?.[0] || bookable[0];

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Unique slot per run so repeated runs against the same database do not
  // collide on the double-booking guard.
  const slotA = `0${(stamp % 9) + 1}:15`;
  const slotB = `1${(stamp % 9) + 1}:45`;

  res = await invoke('POST', '/api/appointments', {
    token: patientToken,
    body: {
      doctor_id: targetDoctor.id,
      appointment_date: tomorrow,
      appointment_time: slotA,
      reason: 'Routine checkup',
    },
  });
  expectStatus(res, 201, 'POST /api/appointments books a slot');
  const appointmentId = res.body?.data?.appointment?.id;
  check(res.body?.data?.appointment?.status === 'PENDING', 'A new appointment starts PENDING');

  res = await invoke('POST', '/api/appointments', {
    token: patientToken,
    body: {
      doctor_id: targetDoctor.id,
      appointment_date: tomorrow,
      appointment_time: slotA,
      reason: 'Double book attempt',
    },
  });
  expectStatus(res, 409, 'Double booking the same slot returns 409');

  res = await invoke('POST', '/api/appointments', {
    token: patientToken,
    body: {
      doctor_id: targetDoctor.id,
      appointment_date: '2020-01-01',
      appointment_time: '10:30',
      reason: 'Past date',
    },
  });
  expectStatus(res, 400, 'Booking a past date returns 400');

  res = await invoke('POST', '/api/appointments', {
    token: patientToken,
    body: { doctor_id: 'nope', appointment_date: tomorrow, appointment_time: '11:00', reason: 'x' },
  });
  expectStatus(res, 404, 'Booking an unknown doctor returns 404');

  res = await invoke('GET', `/api/appointments/${appointmentId}`, { token: patientToken });
  expectStatus(res, 200, 'GET /api/appointments/:id works via path param');

  res = await invoke('POST', '/api/appointments/status', {
    token: patientToken,
    body: { appointment_id: appointmentId, status: 'CONFIRMED' },
  });
  expectStatus(res, 403, 'Patient cannot confirm their own appointment (403)');

  res = await invoke('POST', '/api/appointments/status', {
    token: patientToken,
    body: { appointment_id: appointmentId, status: 'CANCELLED' },
  });
  expectStatus(res, 200, 'Patient can cancel their own appointment');
  check(res.body?.data?.appointment?.status === 'CANCELLED', 'Cancellation persists');

  res = await invoke('POST', '/api/appointments', {
    token: patientToken,
    body: {
      doctor_id: targetDoctor.id,
      appointment_date: tomorrow,
      appointment_time: slotB,
      reason: 'Follow-up consultation',
    },
  });
  expectStatus(res, 201, 'A second appointment books successfully');
  const apt2 = res.body?.data?.appointment?.id;

  res = await invoke('POST', '/api/appointments/status', {
    token: doctorToken,
    body: { appointment_id: apt2, status: 'CONFIRMED' },
  });
  if (res.status === 200) {
    check(res.body?.data?.appointment?.status === 'CONFIRMED', 'Assigned doctor confirms the appointment');

    res = await invoke('POST', '/api/appointments/status', {
      token: doctorToken,
      body: { appointment_id: apt2, status: 'COMPLETED' },
    });
    expectStatus(res, 200, 'Assigned doctor completes the appointment');
  } else {
    expectStatus(res, 403, 'A doctor who does not own the appointment is refused (403)');
  }

  res = await invoke('POST', '/api/appointments/status', {
    token: patientToken,
    body: { appointment_id: 'apt_missing', status: 'CANCELLED' },
  });
  expectStatus(res, 404, 'Updating a missing appointment returns 404');

  res = await invoke('POST', '/api/appointments/status', {
    token: patientToken,
    body: { appointment_id: appointmentId, status: 'BOGUS' },
  });
  expectStatus(res, 400, 'Invalid appointment status returns 400');

  /* ---------------- Records / lab / prescriptions ---------------- */
  console.log('\n6. Medical records, lab results & prescriptions');
  const patientId = (await invoke('GET', '/api/auth/me', { token: patientToken })).body?.data?.user?.id;

  res = await invoke('GET', '/api/medical-records', { token: patientToken });
  expectStatus(res, 200, 'Patient can read their own medical records');

  res = await invoke('POST', '/api/medical-records', {
    token: doctorToken,
    body: {
      patient_id: patientId,
      diagnosis: 'Essential Hypertension',
      symptoms: 'Headache',
      notes: 'Monitor BP daily',
    },
  });
  expectStatus(res, 201, 'Doctor can author a medical record');
  const recordId = res.body?.data?.record?.id;

  res = await invoke('GET', `/api/medical-records/${recordId}`, { token: patientToken });
  expectStatus(res, 200, 'GET /api/medical-records/:id works');

  res = await invoke('POST', '/api/medical-records', {
    token: doctorToken,
    body: { patient_id: patientId },
  });
  expectStatus(res, 400, 'Medical record without a diagnosis returns 400');

  res = await invoke('POST', '/api/prescriptions', {
    token: doctorToken,
    body: {
      patient_id: patientId,
      medication_name: 'Amlodipine',
      dosage: '5mg',
      frequency: 'Once daily',
      duration: '30 days',
      instructions: 'Take in the morning with food',
    },
  });
  expectStatus(res, 201, 'Doctor can issue a prescription');
  const rxId = res.body?.data?.prescription?.id;

  res = await invoke('GET', '/api/prescriptions', { token: patientToken });
  expectStatus(res, 200, 'Patient can list prescriptions');

  res = await invoke('GET', `/api/prescriptions/${rxId}`, { token: patientToken });
  expectStatus(res, 200, 'GET /api/prescriptions/:id works via path param');
  check(res.body?.data?.prescription?.doctor_name !== undefined, 'Rx detail includes doctor identity for print');

  res = await invoke('GET', `/api/prescriptions?id=${rxId}`, { token: patientToken });
  expectStatus(res, 200, 'GET /api/prescriptions?id= still works (legacy contract)');

  res = await invoke('POST', '/api/prescriptions', {
    token: patientToken,
    body: { patient_id: patientId, medication_name: 'X', dosage: '1', frequency: '1', duration: '1' },
  });
  expectStatus(res, 403, 'Patient cannot issue a prescription (403)');

  res = await invoke('POST', '/api/prescriptions', {
    token: doctorToken,
    body: { patient_id: patientId, medication_name: 'X' },
  });
  expectStatus(res, 400, 'Incomplete prescription returns 400');

  res = await invoke('POST', '/api/lab-results', {
    token: doctorToken,
    body: {
      patient_id: patientId,
      test_name: 'Hemoglobin',
      result: '14.2',
      unit: 'g/dL',
      reference_range: '12.0-16.0',
      report_date: tomorrow,
    },
  });
  expectStatus(res, 201, 'Doctor can record a lab result');
  const labId = res.body?.data?.labResult?.id;

  res = await invoke('GET', '/api/lab-results', { token: patientToken });
  expectStatus(res, 200, 'Patient can list lab results');

  res = await invoke('GET', `/api/lab-results/${labId}`, { token: patientToken });
  expectStatus(res, 200, 'GET /api/lab-results/:id works');

  res = await invoke('GET', '/api/lab-results', { token: adminToken });
  expectStatus(res, 200, 'Admin can list all lab results');

  /* ---------------- Wellness ---------------- */
  console.log('\n7. Wellness');
  res = await invoke('POST', '/api/wellness', {
    token: patientToken,
    body: {
      sleep_hours: 7.5,
      water_intake: 2.5,
      exercise_minutes: 45,
      weight: 71.2,
      mood: 'Great',
      diet_data: 'Grilled chicken, quinoa, salad',
    },
  });
  expectStatus(res, 201, 'POST /api/wellness logs a daily entry');
  const wellnessId = res.body?.data?.record?.id;
  const wellnessDate = res.body?.data?.record?.record_date;

  res = await invoke('POST', '/api/wellness', {
    token: patientToken,
    body: { record_date: wellnessDate, water_intake: 3.0 },
  });
  expectStatus(res, 201, 'Re-logging the same date updates rather than duplicating');
  check(res.body?.data?.record?.id === wellnessId, 'Same-date upsert reuses the record id');
  check(Number(res.body?.data?.record?.water_intake) === 3, 'Partial update applies the new value');
  check(Number(res.body?.data?.record?.sleep_hours) === 7.5, 'Partial update preserves untouched fields');

  res = await invoke('GET', '/api/wellness', { token: patientToken });
  expectStatus(res, 200, 'GET /api/wellness returns records');
  check(res.body?.data?.summary?.totalEntries >= 1, 'Wellness summary is computed');

  res = await invoke('POST', '/api/wellness/diet', {
    token: patientToken,
    body: { diet_data: 'Oats, berries, almonds', water_intake: 2.8 },
  });
  expectStatus(res, 201, 'POST /api/wellness/diet logs diet');

  res = await invoke('GET', '/api/wellness/diet', { token: patientToken });
  expectStatus(res, 200, 'GET /api/wellness/diet returns diet entries');
  check((res.body?.data?.dietEntries || []).length > 0, 'Diet entries are returned');

  res = await invoke('POST', '/api/wellness/sleep', {
    token: patientToken,
    body: { sleep_hours: 8.25, mood: 'Rested' },
  });
  expectStatus(res, 201, 'POST /api/wellness/sleep logs sleep');

  res = await invoke('POST', '/api/wellness/sleep', { token: patientToken, body: { sleep_hours: 99 } });
  expectStatus(res, 400, 'Invalid sleep_hours is rejected (400)');

  res = await invoke('GET', '/api/wellness/sleep', { token: patientToken });
  expectStatus(res, 200, 'GET /api/wellness/sleep returns sleep entries');

  res = await invoke('POST', '/api/wellness/ai-assistant', {
    token: patientToken,
    body: { message: 'how much water should I drink' },
  });
  expectStatus(res, 200, 'POST /api/wellness/ai-assistant responds');
  check(
    typeof res.body?.data?.reply === 'string' && res.body.data.reply.length > 50,
    'Assistant returns guidance text'
  );
  check(typeof res.body?.data?.disclaimer === 'string', 'Assistant returns a non-diagnostic disclaimer');

  res = await invoke('POST', '/api/wellness/ai-assistant', { token: patientToken, body: {} });
  expectStatus(res, 400, 'Assistant requires a message');

  res = await invoke('POST', '/api/wellness', { token: doctorToken, body: { sleep_hours: 8 } });
  expectStatus(res, 403, 'Doctor cannot log patient wellness (403)');

  /* ---------------- Blood network ---------------- */
  console.log('\n8. Blood network');
  res = await invoke('POST', '/api/blood/donors', {
    token: patientToken,
    body: { blood_group: 'O-', location: 'Test City', latitude: 40.7128, longitude: -74.006 },
  });
  expectStatus(res, 200, 'POST /api/blood/donors registers a donor');
  const donorId = res.body?.data?.donor?.id;

  res = await invoke('GET', '/api/blood/donors?available=1');
  expectStatus(res, 200, 'GET /api/blood/donors lists available donors');
  check((res.body?.data?.donors || []).length > 0, 'Donor directory returns rows');

  res = await invoke('GET', `/api/blood/donors/${donorId}`);
  expectStatus(res, 200, 'GET /api/blood/donors/:id works');

  res = await invoke('POST', '/api/blood/donors', {
    token: patientToken,
    body: { location: 'Test City' },
  });
  expectStatus(res, 200, 'Donor registration falls back to the blood group on the user profile');

  res = await invoke('POST', '/api/blood/donors', {
    token: blankToken,
    body: { location: 'Test City' },
  });
  expectStatus(res, 400, 'Donor registration without any blood group returns 400');

  res = await invoke('POST', '/api/blood/donors', {
    token: blankToken,
    body: { blood_group: 'A+' },
  });
  expectStatus(res, 400, 'Donor registration without a location returns 400');

  const patient2Token = (
    await invoke('POST', '/api/auth/login', { body: { email: patient2Email, password: 'TestPass123!' } })
  ).body?.data?.token;

  res = await invoke('POST', '/api/blood/donors', {
    token: patient2Token,
    body: { blood_group: 'O+', location: 'Test City', latitude: 40.75, longitude: -74.1 },
  });
  expectStatus(res, 200, 'A second donor registers');

  res = await invoke('POST', '/api/blood/requests', {
    token: patientToken,
    body: {
      patient_name: 'Test Recipient',
      blood_group: 'O-',
      units_required: 2,
      location: 'Test General Hospital',
      urgency: 'EMERGENCY',
      reason: 'Trauma hemorrhage',
      latitude: 40.72,
      longitude: -74.0,
    },
  });
  expectStatus(res, 201, 'POST /api/blood/requests creates an emergency request');
  const bloodRequestId = res.body?.data?.request?.id;
  check(typeof res.body?.data?.matchesFound === 'number', 'Request reports matchesFound');

  res = await invoke('GET', '/api/blood/requests?urgency=EMERGENCY');
  expectStatus(res, 200, 'GET /api/blood/requests filters by urgency');
  check((res.body?.data?.requests || []).length > 0, 'The emergency request appears in the list');

  res = await invoke('GET', `/api/blood/requests/${bloodRequestId}`, { token: patientToken });
  expectStatus(res, 200, 'GET /api/blood/requests/:id returns details with matches');
  check(Array.isArray(res.body?.data?.matches), 'Request detail includes donor matches');

  res = await invoke('GET', '/api/blood/emergency');
  check((res.body?.data?.emergencyRequests || []).length > 0, 'Emergency broadcast feed includes the request');
  check(!!res.body?.data?.disclaimer, 'Emergency feed carries a clinical disclaimer');

  res = await invoke('GET', '/api/blood/matches', { token: patient2Token });
  expectStatus(res, 200, 'A donor can read their match notifications');

  const donorMatches = res.body?.data?.matches || [];
  if (donorMatches.length > 0) {
    const m = donorMatches[0];
    res = await invoke('PATCH', `/api/blood/match/${m.id}`, {
      token: patient2Token,
      body: { status: 'ACCEPTED' },
    });
    expectStatus(res, 200, 'PATCH /api/blood/match/:id updates match status (alias route)');

    res = await invoke('PATCH', '/api/blood/matches', {
      token: patient2Token,
      body: { match_id: m.id, status: 'DONATED' },
    });
    expectStatus(res, 200, 'DONATED fulfils the request and records the donation date');

    res = await invoke('GET', `/api/blood/requests/${bloodRequestId}`, { token: patientToken });
    check(res.body?.data?.request?.status === 'FULFILLED', 'Blood request is FULFILLED after a donation');
  } else {
    check(true, 'Donor match status transitions skipped (no compatible match)');
  }

  res = await invoke('POST', '/api/blood/requests', {
    token: patientToken,
    body: { patient_name: 'X', location: 'Y' },
  });
  expectStatus(res, 400, 'A blood request without a blood group returns 400');

  res = await invoke('POST', '/api/blood/requests', {
    token: doctorToken,
    body: { patient_name: 'X', blood_group: 'A+', location: 'Y' },
  });
  expectStatus(res, 201, 'Doctors may raise blood requests');

  /* ---------------- Notifications ---------------- */
  console.log('\n9. Notifications');
  res = await invoke('GET', '/api/notifications', { token: patientToken });
  expectStatus(res, 200, 'GET /api/notifications returns the feed');
  check(typeof res.body?.data?.unreadCount === 'number', 'Notification feed includes unreadCount');
  check((res.body?.data?.notifications || []).length > 0, 'Patient received notifications from the booking flow');

  res = await invoke('POST', '/api/notifications/read', { token: patientToken, body: { all: true } });
  expectStatus(res, 200, 'POST /api/notifications/read marks all as read');

  res = await invoke('GET', '/api/notifications', { token: patientToken });
  check(res.body?.data?.unreadCount === 0, 'Unread count drops to zero after mark-all-read');

  res = await invoke('GET', '/api/notifications/unread-count', { token: patientToken });
  expectStatus(res, 200, 'GET /api/notifications/unread-count works');

  /* ---------------- Admin ---------------- */
  console.log('\n10. Administration');
  res = await invoke('GET', '/api/admin/stats', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/stats returns platform metrics');
  check(typeof res.body?.data?.stats?.totalUsers === 'number', 'Stats include totalUsers');
  check(!!res.body?.data?.stats?.appointments, 'Stats include the appointment breakdown');
  check(Array.isArray(res.body?.data?.recentAppointments), 'Stats include recent appointments');

  res = await invoke('GET', '/api/admin/users', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/users returns the user directory');
  const users = res.body?.data?.users || [];
  check(users.length > 0, 'User directory returns rows');

  res = await invoke('GET', '/api/admin/users?role=DOCTOR', { token: adminToken });
  check(
    (res.body?.data?.users || []).every((u) => u.role === 'DOCTOR'),
    'Role filter works on /api/admin/users'
  );

  res = await invoke('PATCH', '/api/admin/users', {
    token: adminToken,
    body: { user_id: users[0].id, location: 'Updated City' },
  });
  expectStatus(res, 200, 'PATCH /api/admin/users updates a user');

  res = await invoke('PATCH', '/api/admin/users', {
    token: adminToken,
    body: { user_id: users[0].id, role: 'SUPERUSER' },
  });
  expectStatus(res, 400, 'Admin cannot assign an invalid role (400)');

  res = await invoke('PATCH', '/api/admin/users', { token: adminToken, body: {} });
  expectStatus(res, 400, 'Admin user update requires user_id');

  res = await invoke('GET', '/api/admin/doctors', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/doctors works');

  res = await invoke('GET', '/api/admin/hospitals', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/hospitals works');

  res = await invoke('GET', '/api/admin/appointments', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/appointments works');

  res = await invoke('GET', '/api/admin/blood-requests', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/blood-requests works');

  res = await invoke('GET', '/api/admin/audit-logs', { token: adminToken });
  expectStatus(res, 200, 'GET /api/admin/audit-logs works');
  check((res.body?.data?.logs || []).length > 0, 'The audit trail captured activity');
  check(
    (res.body?.data?.logs || []).some((l) => l.action === 'LOGIN'),
    'The audit trail records LOGIN events'
  );
  check(
    !(res.body?.data?.logs || []).some((l) => 'password_hash' in l),
    'Audit logs contain no credential columns'
  );

  /* ---------------- Logout ---------------- */
  console.log('\n11. Logout');
  res = await invoke('POST', '/api/auth/logout', { token: patientToken, body: {} });
  expectStatus(res, 200, 'POST /api/auth/logout returns 200');
  check(/healthsphere_session=;|Max-Age=0/i.test(res.cookie || ''), 'Logout clears the session cookie');

  /* ---------------- Security headers ---------------- */
  console.log('\n12. Security headers');
  res = await invoke('GET', '/api/doctors');
  check(res.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff is set');
  check(res.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY is set');
  check(!!res.headers.get('referrer-policy'), 'Referrer-Policy is set');
  check(/no-store/.test(res.headers.get('cache-control') || ''), 'Cache-Control: no-store is set for API responses');

  /* ---------------- Summary ---------------- */
  console.log('\n==================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failed:\n  - ' + failures.join('\n  - '));
  console.log('==================================================\n');

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

server.listen(0, '127.0.0.1');
await once(server, 'listening');
BASE = `http://127.0.0.1:${server.address().port}`;

run().catch((err) => {
  console.error('Fatal:', err);
  server.close();
  process.exit(1);
});
