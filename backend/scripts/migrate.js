#!/usr/bin/env node
// Apply schema.sql to Supabase via direct PostgreSQL connection.
// Usage: PGPASSWORD=your_db_password node scripts/migrate.js
// Or set DATABASE_URL in .env:  DATABASE_URL=postgresql://postgres:PASS@db.xxx.supabase.co:5432/postgres
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const schemaFile = path.join(__dirname, '../config/schema.sql');

if (!fs.existsSync(schemaFile)) {
  console.error('schema.sql not found at', schemaFile);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.log('\nTo apply the Supabase schema manually:');
  console.log('1. Open your Supabase project: https://app.supabase.com');
  console.log('2. Go to SQL Editor');
  console.log('3. Paste and run the contents of: backend/config/schema.sql');
  console.log('\nOr set DATABASE_URL in .env and re-run this script:');
  console.log('DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres');
  process.exit(0);
}

try {
  console.log('Applying schema to database...');
  execSync(`psql "${dbUrl}" -f "${schemaFile}"`, { stdio: 'inherit' });
  console.log('Schema applied successfully!');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
}
