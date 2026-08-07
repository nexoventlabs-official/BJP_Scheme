require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');

(async () => {
  await connectAppDb();
  const u = mongoose.connection.collection('users');
  const total = await u.countDocuments();
  const referred = await u.countDocuments({ referredBy: { $nin: [null, '', 'null', 'undefined'] } });
  const list = await u.find({}).project({ voterName: 1, mobile: 1, epicNo: 1, referralCode: 1, referredBy: 1, _id: 0 }).toArray();
  console.log('Total users:', total, '| users with a referrer:', referred);
  console.log(JSON.stringify(list, null, 1));
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
