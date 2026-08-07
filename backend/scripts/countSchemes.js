require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const Scheme = require('../models/Scheme');
(async () => {
  await connectAppDb();
  const all = await Scheme.find({}).select('id name active').sort({ id: 1 }).lean();
  console.log('total', all.length, 'active', all.filter((s) => s.active !== false).length);
  const ids = all.map((s) => s.id);
  const missing = [];
  for (let i = 1; i <= 32; i++) if (!ids.includes(i)) missing.push(i);
  console.log('ids:', ids.join(','));
  console.log('missing 1..32:', missing.join(',') || 'none');
  console.log('inactive:', all.filter((s) => s.active === false).map((s) => `${s.id}:${s.name}`).join(', ') || 'none');
  await mongoose.connection.close();
  process.exit(0);
})();
