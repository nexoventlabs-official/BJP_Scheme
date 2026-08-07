# WhatsApp Automation — Reality Check

Cross-check of the three flagged concerns against the **actual current code** in
`backend/`. Each was verified by reading the real files, not a summary.

Date checked: 2026-08-04

---

## Summary Table

| # | Concern raised | Reality in current code | Status |
|---|----------------|-------------------------|--------|
| 1 | `mongoose` not imported → `/api/health` 500s | `mongoose` **is** imported at top of `server.js` | ✅ Not a bug (fixed) |
| 2a | Needs `node-forge` for RSA-OAEP + AES-GCM | Uses Node built-in `crypto` — no extra dep | ✅ Not needed |
| 2b | Needs `sharp` to resize images under Meta's ~250 KB limit | Uses Cloudinary on-the-fly URL transforms | ✅ Not needed |
| 3 | `express.json` needs a `verify` callback for raw body (HMAC) | `verify` callback already captures `req.rawBody` for the webhook | ✅ Done |
| — | `form-data` is `require`d but not in `package.json` | Present in `node_modules` (transitive via `axios`) | ⚠️ Minor — see below |

---

## 1. Health check / `mongoose` import — NOT A BUG

**Concern:** `server.js` references `mongoose.connection.readyState` in `/api/health`
but never imports `mongoose`, so the route 500s on demand.

**Reality:** `backend/server.js` line 2:

```js
const express = require('express');
const mongoose = require('mongoose');   // ← imported
```

The health route uses it correctly:

```js
app.get('/api/health', async (req, res) => {
  const mongooseState = mongoose.connection.readyState;
  const isDbConnected = mongooseState === 1;
  ...
});
```

`GET /api/health` works. This concern reflected an earlier version of the file.

---

## 2a. RSA-OAEP + AES-128-GCM — no `node-forge` needed

The Flow endpoint decryption/encryption in `backend/routes/whatsappFlow.js` uses
Node's **built-in `crypto`** module (available since Node 15+), exactly the
"alternative" option that avoids an extra dependency:

```js
const crypto = require('crypto');

// RSA-OAEP unwrap of the AES key
const aesKeyBuffer = crypto.privateDecrypt(
  { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(encrypted_aes_key, 'base64')
);

// AES-128-GCM decrypt (auth tag = last 16 bytes)
const decipher = crypto.createDecipheriv('aes-128-gcm', aesKeyBuffer, ivBuffer);
decipher.setAuthTag(authTag);
```

Response encryption flips the IV bit-wise and re-encrypts with `aes-128-gcm`,
per Meta's Flow spec. **`node-forge` is not installed and not required.**

---

## 2b. Image sizing — no `sharp` needed

Instead of resizing bytes locally with `sharp`, images are shrunk by
**Cloudinary transformation parameters injected into the URL** before download.
See `backend/services/waImageBase64.js`:

```js
function withCloudinaryTransform(url, opts = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const parts = [];
  if (opts.width)  parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  parts.push(`c_${opts.crop || 'fill'}`);
  parts.push(`q_${opts.quality || 70}`);
  parts.push(`f_${opts.format || 'jpg'}`);
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}
```

Callers request sensible sizes to stay within Meta's Flow response budget, e.g.
banners `w_1600,h_200,c_fill,q_80,f_jpg` and icons `w_200,h_200,...`. Cloudinary
returns an already-resized JPEG, so nothing needs resizing in-process.
**`sharp` is not installed and not required.**

> Note: this approach only shrinks images that are hosted on Cloudinary
> (URL contains `/upload/`). All flow images are uploaded through the admin
> Flow Images page to Cloudinary, so they all qualify.

---

## 3. Raw body for HMAC — ALREADY IN PLACE

**Concern:** `app.use(express.json({ limit: '8mb' }))` parses JSON before the
raw bytes can be captured, so `X-Hub-Signature-256` HMAC verification has
nothing to hash.

**Reality:** `backend/server.js` already adds a `verify` callback that stores the
raw buffer **only** for the webhook path:

```js
app.use(express.json({
  limit: '8mb',
  verify: (req, _res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api/whatsapp/webhook')) {
      req.rawBody = buf.toString();
    }
  },
}));
```

The webhook route reads `req.rawBody` to compute the HMAC and compare against
Meta's `X-Hub-Signature-256`. Working as intended.

---

## Minor item worth tracking: `form-data` not declared

`backend/services/metaCloud.js` does `require('form-data')` inside
`updateFlowJSON()` (used by the one-time Flow setup script for multipart
`FLOW_JSON` asset upload).

- It is **not** listed in `backend/package.json` dependencies.
- It currently resolves because `axios` depends on it, so it exists in
  `node_modules/form-data` transitively.

**Risk:** relying on a transitive dependency is fragile — a future `axios`
version could drop or restructure it. It only affects the setup script path,
not the live webhook/flow runtime.

**Recommended fix (optional, low priority):** declare it explicitly.

```bash
cd backend
npm install form-data
```

This adds one line to `package.json` and removes the implicit dependency.

---

## Bottom line

All three originally flagged concerns were resolved in the implementation:
built-in `crypto` (no `node-forge`), Cloudinary transforms (no `sharp`),
`mongoose` imported, and `rawBody` capture wired for the webhook. The only
open item is the cosmetic/robustness fix of pinning `form-data` in
`package.json`.
