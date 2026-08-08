/**
 * One-off cleanup: remove the two test members + all their data so they can
 * register again from scratch (web or WhatsApp).
 * Targeted precisely by mobile number — nothing else is touched.
 *
 * Run on the droplet:  node scripts/cleanupTestMembers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');

const MOBILES = ['7305171482', '8106811285'];

(async () => {
  await connectAppDb();
  const User = require('../models/User');
  const SchemeApplication = require('../models/SchemeApplication');
  const WhatsAppContact = require('../models/WhatsAppContact');
  let BoothPresidentRequest = null;
  try { BoothPresidentRequest = require('../models/BoothPresidentRequest'); } catch { /* optional */ }

  const users = await User.find({ mobile: { $in: MOBILES } }).lean();
  const ids = users.map((u) => u._id);
  console.log('Members matched:', users.length ? users.map((u) => `${u.voterName} (${u.mobile})`).join(', ') : 'none');

  const appsBefore = await SchemeApplication.countDocuments({ $or: [{ userId: { $in: ids } }, { mobile: { $in: MOBILES } }] });

  const apps = await SchemeApplication.deleteMany({ $or: [{ userId: { $in: ids } }, { mobile: { $in: MOBILES } }] });
  const booth = BoothPresidentRequest
    ? await BoothPresidentRequest.deleteMany({ $or: [{ userId: { $in: ids } }, { mobile: { $in: MOBILES } }] })
    : { deletedCount: 0 };
  const contacts = await WhatsAppContact.deleteMany({ $or: MOBILES.map((m) => ({ phone: { $regex: m + '$' } })) });
  const delUsers = await User.deleteMany({ mobile: { $in: MOBILES } });

  console.log('--- Deleted ---');
  console.log('SchemeApplications :', apps.deletedCount, `(counted ${appsBefore})`);
  console.log('BoothPresidentReqs :', booth.deletedCount);
  console.log('WhatsAppContacts   :', contacts.deletedCount);
  console.log('Users              :', delUsers.deletedCount);

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error('Cleanup failed:', e.message); process.exit(1); });
