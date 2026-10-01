import { getClient, initDatabase, execute, queryOne } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { generateId, isBloodCompatible, calculateDistanceKm } from '../lib/validation.js';

async function seed() {
  try {
    console.log('🌱 Starting HealthSphere database seeding...');
    await initDatabase();

    // Check if already seeded
    const existingAdmin = await queryOne(`SELECT id FROM users WHERE email = 'admin@healthsphere.local'`);
    if (existingAdmin) {
      console.log('⚠️ Database already seeded. Skipping to prevent duplicate records.');
      process.exit(0);
    }

    const defaultPassword = 'DemoPassword123!';
    const passwordHash = await hashPassword(defaultPassword);

    console.log('👤 Creating demo users...');
    // 1. Admin
    const adminId = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'HealthSphere Administrator', 'admin@healthsphere.local', ?, 'ADMIN', '+1-555-0100', 'Other', '1985-05-15', 'O+', 'Seattle, WA', datetime('now'))`,
      [adminId, passwordHash]
    );

    // 2. Doctors
    const doc1UserId = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'Dr. Sarah Jenkins, MD', 'dr.sarah@healthsphere.local', ?, 'DOCTOR', '+1-555-0101', 'Female', '1982-03-22', 'A+', 'Seattle, WA', datetime('now'))`,
      [doc1UserId, passwordHash]
    );

    const doc1Id = generateId('doc');
    await execute(
      `INSERT INTO doctors (id, user_id, specialization, qualification, experience_years, license_number, hospital_name, bio, consultation_fee, available, created_at)
       VALUES (?, ?, 'Cardiology', 'MBBS, MD (Cardiology), FACC', 14, 'MED-LIC-88291', 'Pacific Heart & Vascular Institute', 'Specializing in preventive cardiology, coronary artery disease management, and cardiac wellness.', 85.0, 1, datetime('now'))`,
      [doc1Id, doc1UserId]
    );

    const doc2UserId = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'Dr. Marcus Vance, MD', 'dr.marcus@healthsphere.local', ?, 'DOCTOR', '+1-555-0102', 'Male', '1987-08-11', 'B+', 'Bellevue, WA', datetime('now'))`,
      [doc2UserId, passwordHash]
    );

    const doc2Id = generateId('doc');
    await execute(
      `INSERT INTO doctors (id, user_id, specialization, qualification, experience_years, license_number, hospital_name, bio, consultation_fee, available, created_at)
       VALUES (?, ?, 'Neurology', 'MBBS, DM (Neurology)', 9, 'MED-LIC-94102', 'Evergreen Neurological Center', 'Expert in migraine therapies, sleep-wake neurology, and cognitive health.', 110.0, 1, datetime('now'))`,
      [doc2Id, doc2UserId]
    );

    const doc3UserId = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'Dr. Elena Rostova, MD', 'dr.elena@healthsphere.local', ?, 'DOCTOR', '+1-555-0103', 'Female', '1989-11-04', 'O-', 'Seattle, WA', datetime('now'))`,
      [doc3UserId, passwordHash]
    );

    const doc3Id = generateId('doc');
    await execute(
      `INSERT INTO doctors (id, user_id, specialization, qualification, experience_years, license_number, hospital_name, bio, consultation_fee, available, created_at)
       VALUES (?, ?, 'General Medicine', 'MBBS, Board Certified Family Medicine', 7, 'MED-LIC-73620', 'Northwest Community Medical', 'Passionate about comprehensive preventative health, metabolic wellness, and long-term vitality.', 50.0, 1, datetime('now'))`,
      [doc3Id, doc3UserId]
    );

    // 3. Hospital
    const hospUserId = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'St. Jude Regional Hospital', 'hospital@stjude.local', ?, 'HOSPITAL', '+1-555-0104', 'Other', '1970-01-01', null, 'Seattle, WA', datetime('now'))`,
      [hospUserId, passwordHash]
    );

    // 4. Patients
    const patient1Id = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'Alex Rivera', 'patient.alex@healthsphere.local', ?, 'PATIENT', '+1-555-0105', 'Male', '1992-06-18', 'O-', 'Downtown Seattle, WA', datetime('now'))`,
      [patient1Id, passwordHash]
    );

    const patient2Id = generateId('usr');
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, phone, gender, date_of_birth, blood_group, location, created_at)
       VALUES (?, 'Samantha Hayes', 'patient.samantha@healthsphere.local', ?, 'PATIENT', '+1-555-0106', 'Female', '1995-12-09', 'A+', 'Capitol Hill, Seattle, WA', datetime('now'))`,
      [patient2Id, passwordHash]
    );

    console.log('⏰ Creating doctor availability schedules...');
    const doctors = [doc1Id, doc2Id, doc3Id];
    for (const dId of doctors) {
      // Mon to Fri slots
      for (let day = 1; day <= 5; day++) {
        await execute(
          `INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time, is_available)
           VALUES (?, ?, ?, '09:00', '17:00', 1)`,
          [generateId('av'), dId, day]
        );
      }
    }

    console.log('📅 Creating appointments...');
    // Future Confirmed appointment
    const apt1Id = generateId('apt');
    await execute(
      `INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, reason, status, notes, created_at)
       VALUES (?, ?, ?, '2026-10-15', '10:00', 'Comprehensive cardiovascular check-up and lipid panel review', 'CONFIRMED', 'Patient fasting required prior to visit', datetime('now'))`,
      [apt1Id, patient1Id, doc1Id]
    );

    // Completed past appointment with Dr. Elena
    const apt2Id = generateId('apt');
    await execute(
      `INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, reason, status, notes, created_at)
       VALUES (?, ?, ?, '2026-09-20', '14:30', 'Seasonal allergy follow-up and general fatigue assessment', 'COMPLETED', 'Patient reported mild fatigue and dry throat', datetime('now', '-10 days'))`,
      [apt2Id, patient1Id, doc3Id]
    );

    // Pending appointment for Samantha with Dr. Marcus
    const apt3Id = generateId('apt');
    await execute(
      `INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, appointment_time, reason, status, notes, created_at)
       VALUES (?, ?, ?, '2026-10-18', '11:00', 'Recurrent tension headaches following work screen time', 'PENDING', null, datetime('now'))`,
      [apt3Id, patient2Id, doc2Id]
    );

    console.log('📋 Creating medical records & prescriptions...');
    const medRec1Id = generateId('med');
    await execute(
      `INSERT INTO medical_records (id, patient_id, doctor_id, appointment_id, diagnosis, symptoms, notes, created_at)
       VALUES (?, ?, ?, ?, 'Allergic Rhinitis with Mild Fatigue', 'Nasal congestion, intermittent sneezing, mild non-specific fatigue for 2 weeks.', 'Advised regular hydration, allergen avoidance, and second-generation antihistamine as prescribed.', datetime('now', '-10 days'))`,
      [medRec1Id, patient1Id, doc3Id, apt2Id]
    );

    const rx1Id = generateId('rx');
    await execute(
      `INSERT INTO prescriptions (id, patient_id, doctor_id, appointment_id, medication_name, dosage, frequency, duration, instructions, created_at)
       VALUES (?, ?, ?, ?, 'Cetirizine Hydrochloride', '10mg', 'Once daily', '14 days', 'Take 1 tablet with water in the evening before bedtime. May cause mild drowsiness.', datetime('now', '-10 days'))`,
      [rx1Id, patient1Id, doc3Id, apt2Id]
    );

    const rx2Id = generateId('rx');
    await execute(
      `INSERT INTO prescriptions (id, patient_id, doctor_id, appointment_id, medication_name, dosage, frequency, duration, instructions, created_at)
       VALUES (?, ?, ?, ?, 'Omega-3 Fish Oil Concentrate', '1000mg', 'Twice daily', '30 days', 'Take with meals to support healthy blood lipid profile and heart health.', datetime('now', '-10 days'))`,
      [rx2Id, patient1Id, doc3Id, apt2Id]
    );

    console.log('🧪 Creating lab results...');
    await execute(
      `INSERT INTO lab_results (id, patient_id, doctor_id, test_name, result, unit, reference_range, report_date, notes, created_at)
       VALUES (?, ?, ?, 'Lipid Panel - Total Cholesterol', '188', 'mg/dL', '< 200 mg/dL', '2026-09-18', 'Normal healthy lipid range observed.', datetime('now', '-12 days'))`,
      [generateId('lab'), patient1Id, doc1Id]
    );

    await execute(
      `INSERT INTO lab_results (id, patient_id, doctor_id, test_name, result, unit, reference_range, report_date, notes, created_at)
       VALUES (?, ?, ?, 'Fasting Blood Glucose', '92', 'mg/dL', '70 - 99 mg/dL', '2026-09-18', 'Within optimal baseline fasting range.', datetime('now', '-12 days'))`,
      [generateId('lab'), patient1Id, doc3Id]
    );

    console.log('🌿 Creating wellness records...');
    const sampleWellness = [
      { date: '2026-09-25', sleep: 7.5, water: 2.4, exercise: 45, weight: 72.0, mood: 'Energized', diet: 'Oatmeal with berries; Grilled salmon with quinoa and asparagus; Greek yogurt' },
      { date: '2026-09-26', sleep: 8.0, water: 2.8, exercise: 30, weight: 71.9, mood: 'Calm', diet: 'Scrambled eggs, whole wheat toast; Mediterranean chickpea salad; Herbal tea' },
      { date: '2026-09-27', sleep: 6.8, water: 2.1, exercise: 50, weight: 71.8, mood: 'Focused', diet: 'Smoothie with spinach and whey; Brown rice with tofu and broccoli' },
      { date: '2026-09-28', sleep: 7.2, water: 2.5, exercise: 20, weight: 71.8, mood: 'Good', diet: 'Avocado toast; Lentil soup with crusty sourdough; Apple slices' },
      { date: '2026-09-29', sleep: 8.2, water: 3.0, exercise: 60, weight: 71.7, mood: 'Refreshed', diet: 'Chia pudding with almonds; Grilled chicken salad; Steamed edamame' },
    ];

    for (const w of sampleWellness) {
      await execute(
        `INSERT INTO wellness_records (id, patient_id, record_date, diet_data, sleep_hours, water_intake, exercise_minutes, weight, mood, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Consistent hydration and restful sleep pattern', datetime('now'))`,
        [generateId('well'), patient1Id, w.date, w.diet, w.sleep, w.water, w.exercise, w.weight, w.mood]
      );
    }

    console.log('🩸 Creating blood donors & blood requests...');
    // Alex Rivera registered as universal red blood cell donor O-
    const donor1Id = generateId('don');
    await execute(
      `INSERT INTO blood_donors (id, user_id, blood_group, location, latitude, longitude, last_donation_date, available, eligible, created_at)
       VALUES (?, ?, 'O-', 'Downtown Seattle, WA', 47.6062, -122.3321, '2026-06-15', 1, 1, datetime('now'))`,
      [donor1Id, patient1Id]
    );

    // Dr. Elena registered as donor O-
    const donor2Id = generateId('don');
    await execute(
      `INSERT INTO blood_donors (id, user_id, blood_group, location, latitude, longitude, last_donation_date, available, eligible, created_at)
       VALUES (?, ?, 'O-', 'Seattle, WA', 47.6101, -122.3421, '2026-04-10', 1, 1, datetime('now'))`,
      [donor2Id, doc3UserId]
    );

    // Samantha registered as donor A+
    const donor3Id = generateId('don');
    await execute(
      `INSERT INTO blood_donors (id, user_id, blood_group, location, latitude, longitude, last_donation_date, available, eligible, created_at)
       VALUES (?, ?, 'A+', 'Capitol Hill, Seattle, WA', 47.6253, -122.3222, '2026-07-20', 1, 1, datetime('now'))`,
      [donor3Id, patient2Id]
    );

    // Emergency Blood Request by St. Jude Regional Hospital
    const emgReqId = generateId('br');
    await execute(
      `INSERT INTO blood_requests (id, requester_id, hospital_id, patient_name, blood_group, rh_type, units_required, location, urgency, reason, status, created_at)
       VALUES (?, ?, ?, 'Lucas Tremblay', 'O-', '-', 3, 'St. Jude Trauma Center - ER Bay 4', 'EMERGENCY', 'Critical trauma transfusion following acute vehicular accident', 'PENDING', datetime('now'))`,
      [emgReqId, hospUserId, hospUserId]
    );

    // Urgent Blood Request
    const urgReqId = generateId('br');
    await execute(
      `INSERT INTO blood_requests (id, requester_id, hospital_id, patient_name, blood_group, rh_type, units_required, location, urgency, reason, status, created_at)
       VALUES (?, ?, ?, 'Clara Morales', 'A+', '+', 2, 'Pacific Heart Surgery Ward 3B', 'URGENT', 'Scheduled bypass procedure requirement', 'PENDING', datetime('now', '-1 hour'))`,
      [urgReqId, doc1UserId, hospUserId]
    );

    // Match donor Alex (O-) and Dr. Elena (O-) to emergency request
    const dist1 = calculateDistanceKm(47.6062, -122.3321, 47.6062, -122.3321);
    await execute(
      `INSERT INTO donor_matches (id, request_id, donor_id, distance_km, compatibility, status, created_at)
       VALUES (?, ?, ?, ?, 'Compatible Red Blood Cell Donor (O- -> O-)', 'NOTIFIED', datetime('now'))`,
      [generateId('dm'), emgReqId, donor1Id, dist1]
    );

    await execute(
      `INSERT INTO donor_matches (id, request_id, donor_id, distance_km, compatibility, status, created_at)
       VALUES (?, ?, ?, 1.8, 'Compatible Red Blood Cell Donor (O- -> O-)', 'NOTIFIED', datetime('now'))`,
      [generateId('dm'), emgReqId, donor2Id]
    );

    // Match Samantha (A+) and Alex (O-) to Clara Morales (A+)
    await execute(
      `INSERT INTO donor_matches (id, request_id, donor_id, distance_km, compatibility, status, created_at)
       VALUES (?, ?, ?, 2.4, 'Compatible Red Blood Cell Donor (A+ -> A+)', 'NOTIFIED', datetime('now'))`,
      [generateId('dm'), urgReqId, donor3Id]
    );

    console.log('🔔 Creating initial notifications...');
    await execute(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, '🚨 EMERGENCY BLOOD REQUEST: O-', 'Critical trauma patient Lucas Tremblay needs 3 units of O- at St. Jude Trauma Center.', 'EMERGENCY_BLOOD', 0, datetime('now'))`,
      [generateId('notif'), patient1Id]
    );

    await execute(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, 'Appointment Confirmed', 'Your cardiovascular consultation with Dr. Sarah Jenkins on 2026-10-15 at 10:00 has been confirmed.', 'APPOINTMENT', 0, datetime('now'))`,
      [generateId('notif'), patient1Id]
    );

    await execute(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, 'New Appointment Booking', 'Samantha Hayes requested an appointment for tension headaches on 2026-10-18 at 11:00.', 'APPOINTMENT', 0, datetime('now'))`,
      [generateId('notif'), doc2UserId]
    );

    console.log('📝 Creating initial audit logs...');
    await execute(
      `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, ip_address, created_at)
       VALUES (?, ?, 'SYSTEM_SEED', 'system', 'seed', '127.0.0.1', datetime('now'))`,
      [generateId('aud'), adminId]
    );

    console.log('✅ HealthSphere database seeded successfully!');
    console.log(`
════════════════════════════════════════════════════════════
⭐ DEMO CREDENTIALS (PASSWORD FOR ALL: ${defaultPassword})
------------------------------------------------------------
👑 Admin:      admin@healthsphere.local
🩺 Doctor:     dr.sarah@healthsphere.local (Cardiology)
🧠 Doctor:     dr.marcus@healthsphere.local (Neurology)
🏥 Hospital:   hospital@stjude.local
👤 Patient:    patient.alex@healthsphere.local (O-)
👤 Patient:    patient.samantha@healthsphere.local (A+)
════════════════════════════════════════════════════════════
    `);

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seed();
