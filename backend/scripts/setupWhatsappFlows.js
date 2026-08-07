/**
 * One-time WhatsApp Flow setup for BJP Nalam Thittam.
 *
 * Steps:
 *   1. Ensure an RSA key pair exists (FLOW_PRIVATE_KEY / FLOW_PUBLIC_KEY in env,
 *      else generate and print — add them to .env, then re-run).
 *   2. Upload the business public key to the phone number (Flow encryption).
 *   3. Create (or reuse) the Register + Service flows, upload their Flow JSON,
 *      set the endpoint URI, and publish.
 *   4. Print the flow IDs to add to .env (WHATSAPP_REG_FLOW_ID / WHATSAPP_SERVICE_FLOW_ID)
 *      and set *_STATUS=PUBLISHED.
 *
 * Run:  node scripts/setupWhatsappFlows.js
 */
require('dotenv').config();
const crypto = require('crypto');
const meta = require('../services/metaCloud');
const { buildRegisterFlowJSON, buildServiceFlowJSON } = require('../services/waFlowJson');

const ENDPOINT_URI = process.env.WHATSAPP_FLOW_ENDPOINT_URI || 'https://tnbjp.org/api/whatsapp/flow';

function ensureKeys() {
  let priv = (process.env.FLOW_PRIVATE_KEY || '').split('\\n').join('\n');
  let pub = (process.env.FLOW_PUBLIC_KEY || '').split('\\n').join('\n');
  if (priv && pub) return { priv, pub, generated: false };

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  console.log('\n=== GENERATED RSA KEY PAIR — add these to backend/.env (single line, \\n-escaped) ===\n');
  console.log('FLOW_PRIVATE_KEY=' + JSON.stringify(privateKey).slice(1, -1));
  console.log('\nFLOW_PUBLIC_KEY=' + JSON.stringify(publicKey).slice(1, -1));
  console.log('\n=== Then re-run this script. ===\n');
  return { priv: privateKey, pub: publicKey, generated: true };
}

async function ensureFlow(name, categories, flowJson) {
  // Reuse an existing flow with the same name if present.
  let flowId = null;
  try {
    const list = await meta.listFlows();
    const found = (list?.data || []).find((f) => f.name === name);
    if (found) flowId = found.id;
  } catch (e) {
    console.warn('listFlows failed:', e.response?.data?.error?.message || e.message);
  }
  if (!flowId) {
    const created = await meta.createFlow(name, categories);
    flowId = created.id;
    console.log(`Created flow "${name}" → ${flowId}`);
  } else {
    console.log(`Reusing flow "${name}" → ${flowId}`);
  }
  await meta.updateFlowJSON(flowId, flowJson);
  console.log(`  Uploaded flow JSON for ${name}`);
  await meta.setFlowEndpoint(flowId, ENDPOINT_URI);
  console.log(`  Set endpoint → ${ENDPOINT_URI}`);
  try {
    await meta.publishFlow(flowId);
    console.log(`  Published ${name}`);
  } catch (e) {
    console.warn(`  Publish ${name} failed (fix JSON/endpoint then re-run):`, e.response?.data?.error?.message || e.message);
  }
  return flowId;
}

async function run() {
  const { pub, generated } = ensureKeys();
  if (generated) process.exit(0);

  console.log('Uploading business public key...');
  try {
    await meta.uploadBusinessPublicKey(pub);
    console.log('  Public key uploaded.');
  } catch (e) {
    console.warn('  uploadBusinessPublicKey failed:', e.response?.data?.error?.message || e.message);
  }

  const regId = await ensureFlow('BJP Nalam Thittam - Register', ['OTHER'], buildRegisterFlowJSON());
  const svcId = await ensureFlow('BJP Nalam Thittam - Services', ['OTHER'], buildServiceFlowJSON());

  console.log('\n=== Add to backend/.env ===');
  console.log(`WHATSAPP_REG_FLOW_ID=${regId}`);
  console.log(`WHATSAPP_REG_FLOW_STATUS=PUBLISHED`);
  console.log(`WHATSAPP_SERVICE_FLOW_ID=${svcId}`);
  console.log(`WHATSAPP_SERVICE_FLOW_STATUS=PUBLISHED`);
  console.log('\nThen restart the backend. Configure the webhook callback URL:');
  console.log('  https://tnbjp.org/api/whatsapp/webhook   (verify token: ' + (process.env.META_VERIFY_TOKEN || 'bjp_nalam_whatsapp_2026') + ')');
  process.exit(0);
}

run().catch((err) => {
  console.error('Setup failed:', err.response?.data || err.message);
  process.exit(1);
});
