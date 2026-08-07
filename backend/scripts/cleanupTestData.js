/**
 * Cleanup helper — removes the seeded schemes (DB + their Cloudinary images)
 * and the test scheme-application requests, for a fresh start.
 *
 * SAFE BY DEFAULT: run with no flag to see counts only (dry run).
 *   node scripts/cleanupTestData.js
 * To actually delete (backs up both collections to JSON first):
 *   node scripts/cleanupTestData.js --commit
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectAppDb } = require('../config/db');
const Scheme = require('../models/Scheme');
const SchemeApplication = require('../models/SchemeApplication');
const { deleteImage, publicIdFromUrl, isConfigured } = require('../services/cloudinaryService');

const COMMIT = process.argv.includes('--commit');

async function run() {
  await connectAppDb();

  const schemes = await Scheme.find({}).lean();
  const appCount = await SchemeApplication.countDocuments();

  console.log('──────────────────────────────────────────');
  console.log(`Schemes in DB:            ${schemes.length}`);
  console.log(`Scheme applications:      ${appCount}`);
  console.log('Scheme images to delete from Cloudinary:');
  schemes.forEach((s) => {
    const pid = s.imagePublicId || publicIdFromUrl(s.backgroundImage);
    console.log(`   [${s.id}] ${s.name}  ->  ${pid || '(no image)'}`);
  });
  console.log('──────────────────────────────────────────');

  if (!COMMIT) {
    console.log('DRY RUN — nothing deleted. Re-run with --commit to delete (a backup is written first).');
    await mongoose.connection.close();
    process.exit(0);
  }

  // 1. Backup both collections to JSON.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = '/root/deploy';
  const apps = await SchemeApplication.find({}).lean();
  fs.writeFileSync(path.join(backupDir, `cleanup_schemes_${ts}.json`), JSON.stringify(schemes, null, 2));
  fs.writeFileSync(path.join(backupDir, `cleanup_applications_${ts}.json`), JSON.stringify(apps, null, 2));
  console.log(`Backed up ${schemes.length} schemes and ${apps.length} applications to ${backupDir}`);

  // 2. Delete each scheme's Cloudinary image (never touches other assets like the banner).
  let imgDeleted = 0;
  if (isConfigured()) {
    for (const s of schemes) {
      const pid = s.imagePublicId || publicIdFromUrl(s.backgroundImage);
      if (pid && pid.startsWith('bjp_schemes/')) {
        await deleteImage(pid);
        imgDeleted++;
        console.log(`   deleted image ${pid}`);
      }
    }
  } else {
    console.log('Cloudinary not configured — skipping image deletion.');
  }

  // 3. Delete scheme docs and applications.
  const s1 = await Scheme.deleteMany({});
  const s2 = await SchemeApplication.deleteMany({});

  console.log('──────────────────────────────────────────');
  console.log(`Deleted ${s1.deletedCount} schemes, ${s2.deletedCount} applications, ${imgDeleted} Cloudinary images.`);
  console.log('Done.');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
