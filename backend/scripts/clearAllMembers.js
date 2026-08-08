/**
 * Reset member data for testing: remove ALL users, their scheme applications,
 * booth-president requests, and WhatsApp contacts. Admins + scheme catalog are
 * NOT touched. Run: node scripts/clearAllMembers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const User = require('../models/User');
const SchemeApplication = require('../models/SchemeApplication');
let BoothPresidentRequest = null;
let WhatsAppContact = null;
try { BoothPresidentRequest = require('../models/BoothPresidentRequest'); } catch {}
try { WhatsAppContact = require('../models/WhatsAppContact'); } catch {}

(async () => {
  await connectAppDb();
  const before = {
    users: await User.countDocuments({}),
    apps: await SchemeApplication.countDocuments({}),
    booth: BoothPresidentRequest ? await BoothPresidentRequest.countDocuments({}) : 0,
    contacts: WhatsAppContact ? await WhatsAppContact.countDocuments({}) : 0,
  };
  const u = await User.deleteMany({});
  const a = await SchemeApplication.deleteMany({});
  const b = BoothPresidentRequest ? await BoothPresidentRequest.deleteMany({}) : { deletedCount: 0 };
  const c = WhatsAppContact ? await WhatsAppContact.deleteMany({}) : { deletedCount: 0 };
  console.log('--- Before ---', before);
  console.log('Deleted Users              :', u.deletedCount);
  console.log('Deleted SchemeApplications :', a.deletedCount);
  console.log('Deleted BoothPresidentReqs :', b.deletedCount);
  console.log('Deleted WhatsAppContacts   :', c.deletedCount);
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
