const express = require('express');
const crypto = require('crypto');
const chatbot = require('../services/whatsappChatbot');

const router = express.Router();

/* ─── GET verify (Meta subscription handshake) ─── */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (!verifyToken) return res.sendStatus(500);
  if (mode === 'subscribe' && token === verifyToken) return res.status(200).send(challenge);
  if (!mode && !token) return res.json({ status: 'webhook active' });
  return res.sendStatus(403);
});

/* ─── Signature verification (HMAC-SHA256 of raw body) ─── */
function verifySignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ─── POST receiver ─── */
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ack immediately so Meta doesn't retry

  if (process.env.META_APP_SECRET && !verifySignature(req)) {
    console.warn('[wa-webhook] invalid signature');
    return;
  }

  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = value.contacts || [];
        const profileName = contacts[0]?.profile?.name || '';

        for (const msg of value.messages || []) {
          const from = msg.from;

          try {
            if (msg.type === 'interactive') {
              const it = msg.interactive || {};

              // Flow terminal `complete` → nfm_reply with flow_token.
              if (it.type === 'nfm_reply') {
                let flowToken = '';
                let postAction = '';
                try {
                  const parsed = it.nfm_reply?.response_json ? JSON.parse(it.nfm_reply.response_json) : {};
                  flowToken = parsed.flow_token || '';
                  postAction = parsed.post_action || '';
                } catch { /* ignore */ }
                await chatbot.handleFlowComplete({ phone: from, flowToken, postAction }).catch((e) =>
                  console.error('[wa-webhook] handleFlowComplete:', e.message)
                );
                continue;
              }

              // Reply button (language chooser).
              if (it.type === 'button_reply') {
                const buttonId = it.button_reply?.id || '';
                const handled = await chatbot.handleButtonReply({ phone: from, profileName, buttonId });
                if (!handled) {
                  await chatbot.handleInbound({ phone: from, profileName, text: it.button_reply?.title || '' });
                }
                continue;
              }

              // List reply / other interactive → treat as text.
              const text = it.list_reply?.title || '';
              await chatbot.handleInbound({ phone: from, profileName, text });
              continue;
            }

            if (msg.type === 'button') {
              // Template quick-reply button.
              await chatbot.handleInbound({ phone: from, profileName, text: msg.button?.text || '' });
              continue;
            }

            const text = msg.type === 'text' ? (msg.text?.body || '') : '';
            await chatbot.handleInbound({ phone: from, profileName, text });
          } catch (e) {
            console.error('[wa-webhook] message handler error:', e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[wa-webhook] handler error:', err.message);
  }
});

module.exports = router;
