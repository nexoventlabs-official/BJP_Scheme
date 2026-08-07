/**
 * Cleanup helper — removes test USERS and their related records (OTP sessions,
 * booth-president requests) for a fresh start. Referral leaderboard is derived
 * from users, so this clears it.
 *
 * SAFE BY DEFAULT: run with no flag to see counts only (dry run).
 *   node scripts/cleanupTestUsers.js
 * To actually delete (backs up each collection to JSON first):
 *   node scripts/cleanupTestUsers.js --commit
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const BACKUP_DIR = '/root/deploy';

async function dumpAndClear(collName, ts) {
  const coll = mongoose.connection.collection(collName);
  const docs = await coll.find({}).toArray();
  if (COMMIT) {
    fs.writeFileSync(path.join(BACKUP_DIR, `cleanup_${collName}_${ts}.json`), JSON.stringify(docs, null, 2));
    const res = await coll.deleteMany({});
    console.log(`  ${collName}: backed up ${docs.length}, deleted ${res.deletedCount}`);
  } else {
    console.log(`  ${collName}: ${docs.length} documents`);
  }
}

async function run() {
  await connectAppDb();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  const allColls = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections present:', allColls.map((c) => c.name).join(', '));
  console.log('──────────────────────────────────────────');
  console.log(COMMIT ? 'DELETING test users & related records...' : 'DRY RUN — counts only:');

  // Collections that hold per-user test data. (Admin credentials are NOT touched.)
  for (const name of ['users', 'otpsessions', 'boothpresidentrequests']) {
    try {
      await dumpAndClear(name, ts);
    } catch (e) {
      console.log(`  ${name}: (skipped — ${e.message})`);
    }
  }

  console.log('──────────────────────────────────────────');
  console.log(COMMIT ? 'Done.' : 'Re-run with --commit to delete (backup written first).');
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => { console.error('Cleanup failed:', err); process.exit(1); });
