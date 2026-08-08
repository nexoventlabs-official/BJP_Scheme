/**
 * Remove all Booth President requests so members can apply again (testing).
 * Run: node scripts/clearBoothRequests.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const BoothPresidentRequest = require('../models/BoothPresidentRequest');

(async () => {
  await connectAppDb();
  const before = await BoothPresidentRequest.countDocuments({});
  const existing = await BoothPresidentRequest.find({}).select('voterName mobile boothNo status').lean();
  existing.forEach((r) => console.log(`  - ${r.voterName || ''} (${r.mobile || ''}) booth ${r.boothNo || ''} [${r.status || ''}]`));
  const res = await BoothPresidentRequest.deleteMany({});
  console.log(`Booth President requests before: ${before}, deleted: ${res.deletedCount}`);
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
