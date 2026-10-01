import { initDatabase, getClient } from '../lib/db.js';

async function migrate() {
  try {
    console.log('🔄 Initializing HealthSphere database...');
    await initDatabase();
    console.log('✅ Database tables and indexes created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database migration error:', err);
    process.exit(1);
  }
}

migrate();
