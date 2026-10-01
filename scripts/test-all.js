import { queryOne, query, execute, initDatabase } from '../lib/db.js';
import { hashPassword, comparePassword, signToken, verifyToken } from '../lib/auth.js';
import { isBloodCompatible, calculateDistanceKm, generateId } from '../lib/validation.js';

async function runTests() {
  console.log('🧪 Starting HealthSphere Comprehensive Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Database Connection & Schema Verification
    console.log('1️⃣ Database & Schema Tests:');
    await initDatabase();
    const userCount = await queryOne('SELECT COUNT(*) as count FROM users');
    assert(userCount && userCount.count >= 0, 'Database tables exist and can be queried');

    // 2. Authentication & Cryptography Tests
    console.log('\n2️⃣ Authentication & Cryptography Tests:');
    const rawPass = 'SecretMedicalPass123!';
    const hashed = await hashPassword(rawPass);
    assert(hashed && hashed.startsWith('$2'), 'Bcrypt password hash generated properly');
    const match = await comparePassword(rawPass, hashed);
    assert(match === true, 'Bcrypt password comparison matches correct password');
    const wrongMatch = await comparePassword('WrongPassword', hashed);
    assert(wrongMatch === false, 'Bcrypt password comparison rejects incorrect password');

    const token = signToken({ id: 'test_usr_1', email: 'test@healthsphere.local', role: 'PATIENT' });
    const verified = verifyToken(token);
    assert(verified && verified.id === 'test_usr_1' && verified.role === 'PATIENT', 'JWT token generation & verification succeeds');

    // 3. Medical Blood ABO/Rh Compatibility Tests (Prompt Section 20)
    console.log('\n3️⃣ Medical Blood ABO/Rh Compatibility Tests:');
    // Recipient O- can receive ONLY O-
    assert(isBloodCompatible('O-', 'O-') === true, 'O- recipient accepts O- donor');
    assert(isBloodCompatible('O+', 'O-') === false, 'O- recipient REJECTS O+ donor');
    assert(isBloodCompatible('A-', 'O-') === false, 'O- recipient REJECTS A- donor');

    // Recipient O+ can receive O+, O-
    assert(isBloodCompatible('O+', 'O+') === true, 'O+ recipient accepts O+ donor');
    assert(isBloodCompatible('O-', 'O+') === true, 'O+ recipient accepts O- donor');
    assert(isBloodCompatible('A+', 'O+') === false, 'O+ recipient REJECTS A+ donor');

    // Recipient A+ can receive A+, A-, O+, O-
    assert(isBloodCompatible('A+', 'A+') === true, 'A+ recipient accepts A+ donor');
    assert(isBloodCompatible('A-', 'A+') === true, 'A+ recipient accepts A- donor');
    assert(isBloodCompatible('O-', 'A+') === true, 'A+ recipient accepts O- donor');
    assert(isBloodCompatible('B+', 'A+') === false, 'A+ recipient REJECTS B+ donor');

    // Recipient AB+ (Universal Recipient) can receive any group
    assert(isBloodCompatible('O-', 'AB+') === true, 'AB+ universal recipient accepts O-');
    assert(isBloodCompatible('A+', 'AB+') === true, 'AB+ universal recipient accepts A+');
    assert(isBloodCompatible('B+', 'AB+') === true, 'AB+ universal recipient accepts B+');
    assert(isBloodCompatible('AB+', 'AB+') === true, 'AB+ universal recipient accepts AB+');

    // 4. Distance Calculation
    console.log('\n4️⃣ Distance Calculation:');
    const dist = calculateDistanceKm(47.6062, -122.3321, 47.6101, -122.3421);
    assert(typeof dist === 'number' && dist > 0 && dist < 5, 'Haversine distance calculated accurately within radius');

    // 5. Query Clinical Tables
    console.log('\n5️⃣ Clinical Data Verification:');
    const doctors = await query('SELECT * FROM doctors');
    assert(doctors.length >= 2, `Doctors exist in directory (${doctors.length} found)`);

    const appointments = await query('SELECT * FROM appointments');
    assert(appointments.length >= 2, `Appointments exist in database (${appointments.length} found)`);

    const prescriptions = await query('SELECT * FROM prescriptions');
    assert(prescriptions.length >= 2, `Digital prescriptions exist in database (${prescriptions.length} found)`);

    const emergencyRequests = await query("SELECT * FROM blood_requests WHERE urgency = 'EMERGENCY'");
    assert(emergencyRequests.length >= 1, `Active emergency blood requests exist for urgent matching (${emergencyRequests.length} found)`);

    console.log(`\n======================================================`);
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log(`======================================================\n`);

    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
