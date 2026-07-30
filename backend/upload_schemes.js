const path = require('path');
const fs = require('fs');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dkjrdntf',
  api_key: process.env.CLOUDINARY_API_KEY || '154929238682266',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'h3zLv5qbCuGmVZcbgxNJcMj0Fko',
  secure: true
});

const SCHEMES_DIR = path.join(__dirname, '../frontend/public/schemes');

async function uploadAllSchemes() {
  console.log('Uploading all 23 scheme images to Cloudinary sequentially...');
  if (!fs.existsSync(SCHEMES_DIR)) {
    console.error('Schemes directory not found:', SCHEMES_DIR);
    return;
  }

  const files = fs.readdirSync(SCHEMES_DIR).filter(f => f.endsWith('.png'));
  console.log(`Found ${files.length} images.`);
  
  const urlMap = {};

  for (const file of files) {
    const schemeName = path.basename(file, '.png');
    const filePath = path.join(SCHEMES_DIR, file);

    try {
      const res = await cloudinary.uploader.upload(filePath, {
        folder: 'bjp_schemes',
        public_id: schemeName.replace(/[^a-zA-Z0-9_-]/g, '_'),
        overwrite: true
      });

      urlMap[schemeName] = res.secure_url;
      console.log(`✓ Uploaded [${schemeName}] -> ${res.secure_url}`);
    } catch (err) {
      console.error(`✗ Failed to upload [${schemeName}]:`, err ? (err.message || err) : 'Error');
    }

    // Wait 500ms between uploads
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n--- UPLOAD SUMMARY MAP ---');
  console.log(JSON.stringify(urlMap, null, 2));

  const targetJsPath = path.join(__dirname, '../frontend/src/utils/cloudinarySchemes.js');
  const jsContent = `export const CLOUDINARY_SCHEME_IMAGES = ${JSON.stringify(urlMap, null, 2)};\n`;
  fs.writeFileSync(targetJsPath, jsContent, 'utf8');
  console.log(`Saved JS mapping to ${targetJsPath}`);
}

uploadAllSchemes();
