/**
 * Subscribe the Meta app to WhatsApp webhooks (sets callback URL + verify token
 * at the app level) and subscribe the WABA to the app. One-time.
 *
 * Run: node scripts/waSubscribe.js
 */
require('dotenv').config();
const axios = require('axios');

const v = process.env.META_GRAPH_VERSION || 'v22.0';
const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const wabaId = process.env.META_WABA_ID;
const userToken = process.env.META_ACCESS_TOKEN;
const callbackUrl = process.env.WHATSAPP_WEBHOOK_URL || 'https://tnbjp.org/api/whatsapp/webhook';
const verifyToken = process.env.META_VERIFY_TOKEN || 'bjp_nalam_whatsapp_2026';

const appToken = `${appId}|${appSecret}`;

(async () => {
  // 1. App-level webhook subscription (callback URL + verify token + fields).
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${v}/${appId}/subscriptions`,
      null,
      {
        params: {
          object: 'whatsapp_business_account',
          callback_url: callbackUrl,
          verify_token: verifyToken,
          fields: 'messages,message_template_status_update',
          access_token: appToken,
        },
      }
    );
    console.log('App webhook subscription:', JSON.stringify(data));
  } catch (e) {
    console.log('App subscription FAILED:', JSON.stringify(e.response?.data || e.message));
  }

  // 2. Subscribe the WABA to this app (so it delivers events).
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${v}/${wabaId}/subscribed_apps`,
      null,
      { params: { access_token: userToken } }
    );
    console.log('WABA subscribed_apps:', JSON.stringify(data));
  } catch (e) {
    console.log('WABA subscribe FAILED:', JSON.stringify(e.response?.data || e.message));
  }

  process.exit(0);
})();
