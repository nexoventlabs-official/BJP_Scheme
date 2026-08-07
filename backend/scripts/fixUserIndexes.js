/**
 * Migration: make the users.epicNo index NON-unique.
 *
 * The schema previously had epicNo unique, which blocks two members from
 * sharing the same voter ID. Mobile is the true unique identifier. This drops
 * any unique epicNo index and recreates it as a plain (non-unique) lookup index.
 *
 * Run:  node scripts/fixUserIndexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');

async function run() {
  await connectAppDb();
  const coll = mongoose.connection.collection('users');

  const indexes = await coll.indexes();
  console.log('Current indexes:', indexes.map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));

  // Drop every index whose key is exactly { epicNo: 1 } (covers epicNo_1).
  for (const idx of indexes) {
    const keys = Object.keys(idx.key || {});
    if (keys.length === 1 && keys[0] === 'epicNo') {
      await coll.dropIndex(idx.name);
      console.log(`Dropped index ${idx.name}${idx.unique ? ' (was unique)' : ''}`);
    }
  }

  // Recreate as a non-unique lookup index.
  await coll.createIndex({ epicNo: 1 }, { unique: false, name: 'epicNo_1' });
  console.log('Created non-unique index epicNo_1');

  const after = await coll.indexes();
  console.log('Indexes now:', after.map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
