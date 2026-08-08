require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const User = require('../models/User');

(async () => {
  await connectAppDb();
  const users = await User.find({}).select('voterName mobile referralCode referredBy createdAt').sort({ createdAt: 1 }).lean();
  console.log(`Total users: ${users.length}`);
  users.forEach((u) => console.log(`  ${u.voterName} | mobile=${u.mobile} | code=${u.referralCode} | referredBy=${u.referredBy || '(none)'}`));
  const withRef = users.filter((u) => u.referredBy);
  console.log(`Users with referredBy set: ${withRef.length}`);
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
