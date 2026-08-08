require('dotenv').config();
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const Scheme = require('../models/Scheme');

(async () => {
  await connectAppDb();
  const docs = await Scheme.find({}).sort({ id: 1 }).lean();
  console.log(`Total docs in DB: ${docs.length}`);
  const present = new Set(docs.map((d) => d.id));
  docs.forEach((d) => console.log(`  [${d.id}] ${d.name}  | active=${d.active !== false}`));
  const missing = [];
  for (let i = 1; i <= 32; i++) if (!present.has(i)) missing.push(i);
  console.log('Missing ids (1..32):', missing.join(', ') || 'none');
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
