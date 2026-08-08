/**
 * Add ONLY the missing scheme(s) back from the two markdown master files,
 * without touching existing schemes (so uploaded images are preserved).
 *
 * Usage:
 *   node scripts/addMissingSchemes.js <english.md> <tamil.md> [--commit] [--ids=24,33]
 *
 * By default it inserts any id (1..32) that is absent from the DB. Existing
 * ids are skipped entirely (never overwritten).
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const Scheme = require('../models/Scheme');
const { invalidateSchemeCache } = require('../controllers/schemeController');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const idsArg = (args.find((a) => a.startsWith('--ids=')) || '').replace('--ids=', '');
const forceIds = idsArg ? idsArg.split(',').map((s) => Number(s.trim())).filter(Boolean) : null;
const files = args.filter((a) => !a.startsWith('--'));
const EN_PATH = files[0] || '/root/deploy/schemes_en.md';
const TA_PATH = files[1] || '/root/deploy/schemes_ta.md';

const clean = (v) => String(v || '').trim().replace(/^\*+|\*+$/g, '').trim();
const splitDocs = (s) => String(s || '').split(',').map((d) => d.replace(/\*/g, '').replace(/\s*\.\s*$/, '').trim()).filter(Boolean);

function parseFile(content) {
  const blocks = content.split(/^###\s+\d+\s*$/m).slice(1);
  return blocks.map((block) => {
    const vals = [...block.matchAll(/^\s*\*\s*\*\*[^*]+?:\*\*\s*(.+)$/gm)].map((m) => clean(m[1]));
    return { shortName: vals[0] || '', fullTitle: vals[1] || '', cluster: vals[2] || '', benefit: vals[3] || '', overview: vals[4] || '', documents: vals[5] || '' };
  }).filter((s) => s.shortName);
}

const STOP = new Set(['the', 'and', 'for', 'pradhan', 'mantri', 'yojana', 'scheme', 'card', 'pm', 'yojna']);
function makeKeys(name, fullTitle) {
  const set = new Set();
  const push = (w) => { if (w && w.length > 2 && !STOP.has(w)) set.add(w); };
  set.add(String(name).toLowerCase().trim());
  `${name} ${fullTitle}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach(push);
  return [...set].slice(0, 10);
}

function buildDoc(e, t, id) {
  return {
    id, name: e.shortName, fullName: e.fullTitle, cluster: e.cluster, clusterShort: '',
    benefit: e.benefit, overview: e.overview, documents: splitDocs(e.documents),
    keys: makeKeys(e.shortName, e.fullTitle), icon: '', highlight: '', eligibility: '',
    howToApply: '', link: '', tags: [], steps: [],
    name_ta: t.shortName || '', fullName_ta: t.fullTitle || '', cluster_ta: t.cluster || '',
    benefit_ta: t.benefit || '', overview_ta: t.overview || '', documents_ta: splitDocs(t.documents),
    backgroundImage: '', imagePublicId: '', order: id, active: true,
  };
}

(async () => {
  const en = parseFile(fs.readFileSync(EN_PATH, 'utf8'));
  const ta = parseFile(fs.readFileSync(TA_PATH, 'utf8'));
  const n = Math.min(en.length, ta.length);
  console.log(`Parsed EN:${en.length} TA:${ta.length}`);

  await connectAppDb();
  const existing = new Set((await Scheme.find({}).select('id').lean()).map((d) => d.id));

  const toAdd = [];
  for (let i = 0; i < n; i++) {
    const id = i + 1;
    const wanted = forceIds ? forceIds.includes(id) : !existing.has(id);
    if (!wanted) continue;
    if (existing.has(id)) { console.log(`  SKIP [${id}] already exists`); continue; }
    toAdd.push(buildDoc(en[i], ta[i] || {}, id));
  }

  if (!toAdd.length) { console.log('Nothing to add — all present.'); await mongoose.connection.close(); process.exit(0); }
  console.log('Will add:');
  toAdd.forEach((d) => console.log(`  [${d.id}] ${d.name} | ${d.cluster} | TA: ${d.name_ta}`));

  if (!COMMIT) { console.log('DRY RUN — re-run with --commit to write.'); await mongoose.connection.close(); process.exit(0); }

  let inserted = 0;
  for (const d of toAdd) {
    const res = await Scheme.updateOne({ id: d.id }, { $setOnInsert: d }, { upsert: true });
    if (res.upsertedCount > 0) inserted++;
  }
  try { invalidateSchemeCache(); } catch (_) {}
  console.log(`Inserted ${inserted} scheme(s).`);
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error('Failed:', e); process.exit(1); });
