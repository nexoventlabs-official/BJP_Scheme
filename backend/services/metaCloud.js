/**
 * Meta WhatsApp Cloud API client for BJP Nalam Thittam.
 * Adapted from the TVK reference. Handles outbound messages (text, image,
 * interactive reply buttons, flow CTA), media download, and Flow management
 * (create / update JSON / publish / set endpoint / upload public key).
 */
const axios = require('axios');

function cfg() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const wabaId = process.env.META_WABA_ID;
  const appId = process.env.META_APP_ID;
  const v = process.env.META_GRAPH_VERSION || 'v22.0';
  if (!accessToken || !phoneNumberId || !wabaId) {
    throw new Error('Meta config missing — set META_ACCESS_TOKEN / META_PHONE_NUMBER_ID / META_WABA_ID');
  }
  return {
    accessToken,
    phoneNumberId,
    wabaId,
    appId,
    graphVersion: v,
    baseUrl: `https://graph.facebook.com/${v}/${phoneNumberId}`,
    graphRoot: `https://graph.facebook.com/${v}`,
  };
}

const api = axios.create({ timeout: 60000 });
const digits = (to) => String(to).replace(/\D/g, '');

/* ─── Outbound messages ─── */

async function sendText(to, text) {
  const { baseUrl, accessToken } = cfg();
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits(to),
    type: 'text',
    text: { body: text, preview_url: false },
  };
  const { data } = await api.post(`${baseUrl}/messages`, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function sendImage(to, imageUrl, caption = '') {
  const { baseUrl, accessToken } = cfg();
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits(to),
    type: 'image',
    image: { link: imageUrl, caption },
  };
  const { data } = await api.post(`${baseUrl}/messages`, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

/**
 * Interactive reply buttons (max 3). Used for the language chooser:
 * header image + body + [English] [தமிழ்].
 * `buttons` = [{ id, title }] (title <= 20 chars).
 */
async function sendButtons(to, { headerImageUrl, headerText, body, footer, buttons }) {
  const { baseUrl, accessToken } = cfg();
  let header;
  if (headerImageUrl) header = { type: 'image', image: { link: headerImageUrl } };
  else if (headerText) header = { type: 'text', text: String(headerText).slice(0, 60) };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(header ? { header } : {}),
      body: { text: String(body || '').slice(0, 1024) },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        buttons: (buttons || []).slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: String(b.title).slice(0, 20) },
        })),
      },
    },
  };
  const { data } = await api.post(`${baseUrl}/messages`, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

/**
 * Interactive Flow message — header (image/text) + body + a CTA button that
 * opens a WhatsApp Flow. `flow_action` is 'navigate' (open at a screen with
 * seeded data) or 'data_exchange' (INIT round-trips to our endpoint).
 */
async function sendFlowMessage(to, options) {
  const { baseUrl, accessToken } = cfg();
  const {
    flowId,
    flowCta,
    headerImageUrl,
    headerText,
    bodyText,
    footerText,
    flowToken,
    mode = 'published',
    screen,
    data: seedData,
  } = options;

  let header;
  if (headerImageUrl) header = { type: 'image', image: { link: headerImageUrl } };
  else if (headerText) header = { type: 'text', text: headerText };

  const useNavigate = !!screen;
  const parameters = {
    flow_message_version: '3',
    flow_token: flowToken,
    flow_id: flowId,
    flow_cta: flowCta,
    mode,
    flow_action: useNavigate ? 'navigate' : 'data_exchange',
  };
  if (useNavigate) {
    parameters.flow_action_payload = { screen, ...(seedData ? { data: seedData } : {}) };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: digits(to),
    type: 'interactive',
    interactive: {
      type: 'flow',
      ...(header ? { header } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: { name: 'flow', parameters },
    },
  };
  const { data } = await api.post(`${baseUrl}/messages`, payload, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function downloadMedia(mediaId) {
  const { graphRoot, accessToken } = cfg();
  const meta = await api.get(`${graphRoot}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { fields: 'url,mime_type' },
  });
  const mediaUrl = meta.data?.url;
  if (!mediaUrl) throw new Error('Media URL not returned by Graph API');
  const bin = await api.get(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: 'arraybuffer',
    maxContentLength: 30 * 1024 * 1024,
    maxBodyLength: 30 * 1024 * 1024,
  });
  return { buffer: Buffer.from(bin.data), mimeType: meta.data.mime_type || 'application/octet-stream' };
}

/* ─── Flow management (used by the one-time setup script) ─── */

async function createFlow(name, categories = ['OTHER'], { endpointUri } = {}) {
  const { graphRoot, accessToken, wabaId } = cfg();
  const body = { name, categories };
  if (endpointUri) body.endpoint_uri = endpointUri;
  const { data } = await api.post(`${graphRoot}/${wabaId}/flows`, body, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function updateFlowJSON(flowId, flowJsonObj) {
  const FormData = require('form-data');
  const { graphRoot, accessToken } = cfg();
  const fd = new FormData();
  fd.append('file', Buffer.from(JSON.stringify(flowJsonObj)), {
    filename: 'flow.json',
    contentType: 'application/json',
  });
  fd.append('name', 'flow.json');
  fd.append('asset_type', 'FLOW_JSON');
  const { data } = await api.post(`${graphRoot}/${flowId}/assets`, fd, {
    headers: { Authorization: `Bearer ${accessToken}`, ...fd.getHeaders() },
    maxContentLength: 10 * 1024 * 1024,
    maxBodyLength: 10 * 1024 * 1024,
  });
  return data;
}

async function publishFlow(flowId) {
  const { graphRoot, accessToken } = cfg();
  const { data } = await api.post(`${graphRoot}/${flowId}/publish`, {}, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function setFlowEndpoint(flowId, endpointUri) {
  const { graphRoot, accessToken } = cfg();
  const { data } = await api.post(`${graphRoot}/${flowId}`, { endpoint_uri: endpointUri }, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function listFlows() {
  const { graphRoot, accessToken, wabaId } = cfg();
  const { data } = await api.get(`${graphRoot}/${wabaId}/flows`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { fields: 'id,name,status,categories', limit: 200 },
  });
  return data;
}

async function uploadBusinessPublicKey(publicKeyPem) {
  const { phoneNumberId, accessToken, graphVersion } = cfg();
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/whatsapp_business_encryption`;
  const fd = new URLSearchParams();
  fd.append('business_public_key', publicKeyPem);
  const { data } = await api.post(url, fd.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return data;
}

module.exports = {
  cfg,
  sendText,
  sendImage,
  sendButtons,
  sendFlowMessage,
  downloadMedia,
  createFlow,
  updateFlowJSON,
  publishFlow,
  setFlowEndpoint,
  listFlows,
  uploadBusinessPublicKey,
};
