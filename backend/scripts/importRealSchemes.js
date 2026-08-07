/**
 * Import REAL schemes from the two markdown master files (English + Tamil).
 *
 * Parses each "### N" block by bullet ORDER (label-independent, so it works
 * even though the Tamil file mixes Tamil/English labels):
 *   [Short Name, Full Title, Cluster, Benefit, Overview, Documents]
 *
 * Usage:
 *   node scripts/importRealSchemes.js <english.md> <tamil.md>            (dry run)
 *   node scripts/importRealSchemes.js <english.md> <tamil.md> --commit   (write to DB)
 *
 * Images are left empty (backgroundImage: '') — upload them later via the panel.
 * Upserts by numeric id so it is safe to re-run.
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const Scheme = require('../models/Scheme');
const { invalidateSchemeCache } = require('../controllers/schemeController');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const files = args.filter((a) => !a.startsWith('--'));
const EN_PATH = files[0] || '/root/deploy/schemes_en.md';
const TA_PATH = files[1] || '/root/deploy/schemes_ta.md';

const clean = (v) =>
  String(v || '')
    .trim()
    .replace(/^\*+|\*+$/g, '') // strip surrounding markdown emphasis
    .trim();

// Split a documents string into a clean array.
const splitDocs = (s) =>
  String(s || '')
    .split(',')
    .map((d) => d.replace(/\*/g, '').replace(/\s*\.\s*$/, '').trim())
    .filter(Boolean);

function parseFile(content) {
  // Blocks start at "### <number>" lines.
  const blocks = content.split(/^###\s+\d+\s*$/m).slice(1);
  return blocks
    .map((block) => {
      const vals = [...block.matchAll(/^\s*\*\s*\*\*[^*]+?:\*\*\s*(.+)$/gm)].map((m) => clean(m[1]));
      return {
        shortName: vals[0] || '',
        fullTitle: vals[1] || '',
        cluster: vals[2] || '',
        benefit: vals[3] || '',
        overview: vals[4] || '',
        documents: vals[5] || '',
      };
    })
    .filter((s) => s.shortName);
}

const STOP = new Set(['the', 'and', 'for', 'pradhan', 'mantri', 'yojana', 'scheme', 'card', 'pm', 'yojna']);
function makeKeys(name, fullTitle) {
  const set = new Set();
  const push = (w) => { if (w && w.length > 2 && !STOP.has(w)) set.add(w); };
  set.add(String(name).toLowerCase().trim());
  `${name} ${fullTitle}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .forEach(push);
  return [...set].slice(0, 10);
}

async function run() {
  const en = parseFile(fs.readFileSync(EN_PATH, 'utf8'));
  const ta = parseFile(fs.readFileSync(TA_PATH, 'utf8'));

  console.log(`Parsed EN: ${en.length} schemes, TA: ${ta.length} schemes`);
  const n = Math.min(en.length, ta.length);
  if (en.length !== ta.length) {
    console.log(`WARNING: count mismatch — importing the first ${n} by order.`);
  }

  const docs = [];
  for (let i = 0; i < n; i++) {
    const e = en[i];
    const t = ta[i] || {};
    docs.push({
      id: i + 1,
      name: e.shortName,
      fullName: e.fullTitle,
      cluster: e.cluster,
      clusterShort: '', // adapters fall back to `cluster`
      benefit: e.benefit,
      overview: e.overview,
      documents: splitDocs(e.documents),
      keys: makeKeys(e.shortName, e.fullTitle),
      icon: '',
      highlight: '',
      eligibility: '',
      howToApply: '',
      link: '',
      tags: [],
      steps: [],
      // Tamil
      name_ta: t.shortName || '',
      fullName_ta: t.fullTitle || '',
      cluster_ta: t.cluster || '',
      benefit_ta: t.benefit || '',
      overview_ta: t.overview || '',
      documents_ta: splitDocs(t.documents),
      backgroundImage: '',
      imagePublicId: '',
      order: i + 1,
      active: true,
    });
  }

  console.log('──────────────────────────────────────────');
  docs.forEach((d) => console.log(`  [${d.id}] ${d.name}  |  ${d.cluster}  |  TA: ${d.name_ta}`));
  console.log('──────────────────────────────────────────');

  if (!COMMIT) {
    console.log(`DRY RUN — ${docs.length} schemes parsed, nothing written. Re-run with --commit to import.`);
    process.exit(0);
  }

  await connectAppDb();
  let inserted = 0;
  let updated = 0;
  for (const d of docs) {
    const res = await Scheme.updateOne({ id: d.id }, { $set: d }, { upsert: true });
    if (res.upsertedCount > 0) inserted++;
    else updated++;
  }
  try { invalidateSchemeCache(); } catch (_) {}
  console.log(`Imported: ${inserted} inserted, ${updated} updated. Total in payload: ${docs.length}.`);
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => { console.error('Import failed:', err); process.exit(1); });
