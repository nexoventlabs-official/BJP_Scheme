# BJP Nalam Thittam — WhatsApp Automation Plan

Reference basis: the **TVK** production project (`C:\Users\Admin\Desktop\Prodution\TVK`), which already implements this exact architecture (encrypted WhatsApp Flow endpoint, webhook, Meta Cloud sender, admin-managed flow images, voter-DB lookup, dynamic screens). We adapt that pattern to the BJP data model (Users, Schemes, SchemeApplications, Referrals, Booth-President requests).

> Nothing is built yet. This document is for your confirmation. Reply with changes or "go".

---

## 1. What you'll get (end-to-end conversation)

1. **User sends `hi`** → bot replies with an **image header + body + 2 reply buttons: `English` / `தமிழ்`**.
2. **Language chosen** → bot sends an **image header + body + `Register` flow button** (WhatsApp Flow CTA).
3. **Register flow** (opens inside WhatsApp):
   - **Screen 1 — Details:** WhatsApp number (pre-filled, **non-editable**) + **EPIC number** → `Continue`.
   - **Screen 2 — Confirm:** voter details rendered as a **table** (like `table.jpeg`) → `Continue`.
   - **Screen 3 — Schemes:** dynamic list of schemes with logo + title + description (like `options.png`) → select one.
   - **Screen 4 — Scheme details:** **banner image + details** → `Confirm`.
   - On confirm → registers the member + applies the scheme, closes the flow, and bot sends an **image header + body + `Choose Service` flow button**.
4. **Choose Service flow** (banner + service list, like `choose.png`) with:
   - **My Profile** → member details table (`table.jpeg` style).
   - **My Schemes** → applied schemes list (`options.png`) → pick one → application status screen.
   - **Apply Schemes** → not-yet-applied schemes list → pick one → scheme details → `Confirm` → bot sends header + body + `Choose Service` again.
   - **My Referral Link** → referral link screen with copy.
   - **My Members** → referred members list (`options.png`) with a default profile icon.
   - **Be a Booth President** →
     - shows the member's **District / Assembly / Booth** + `Another Booth` + `Confirm`.
     - `Another Booth` → **District dropdown → Assembly dropdown (based on district) → Booth dropdown (based on assembly)** → `Confirm`.
     - on confirm → creates the request, bot sends header + body + `Choose Service`.
     - if a request **already exists** → shows the **request status** instead.

All screens are rendered dynamically by our server (the WhatsApp "Flow Endpoint"), so schemes, members, districts etc. always reflect the live database.

---

## 2. Architecture (new, mirrors TVK)

All new code lives under the existing `backend/`. Reuses existing services: `voterSearchService` (EPIC lookup), `jurisdictionService` (district/assembly/booth), models `User`, `Scheme`, `SchemeApplication`, `BoothPresidentRequest`.

**New backend files**
- `routes/whatsappWebhook.js` — `GET` verify (hub.verify_token) + `POST` receiver (HMAC signature check) → routes inbound messages.
- `routes/whatsappFlow.js` — the **encrypted Flow Endpoint** (RSA-OAEP + AES-128-GCM). Handles `INIT / data_exchange / BACK / ping`, returns each screen with dynamic data + base64 images.
- `services/metaCloud.js` — Meta Graph API sender: `sendText`, `sendImage`, `sendInteractiveButtons` (language buttons), `sendFlowMessage` (Register / Choose Service CTA), `downloadMedia`, plus flow-management helpers (`createFlow`, `updateFlowJSON`, `publishFlow`, `setFlowEndpoint`, `uploadBusinessPublicKey`).
- `services/whatsappChatbot.js` — inbound orchestration: `hi` → language buttons → register CTA; language + button handling; flow-complete follow-ups.
- `services/waFlowJson.js` — the **Flow JSON** screen definitions uploaded to Meta (Register flow + Service flow).
- `services/waServiceCatalog.js` — the 6 Choose-Service tiles (id, title, description, iconKey).
- `services/flowImages.js` + `routes/flowImages.js` — admin-managed image slots (fetched as base64 into flow screens).
- `services/imageBase64.js` — fetch a Cloudinary URL → resized base64 (Meta's ~250 KB per-response budget).
- `models/WhatsAppContact.js` — per-phone conversation state (language, current step, last voter snapshot, pending booth-president selection).
- `models/FlowImage.js` — `{ key, url, publicId, resourceType }` image slots.
- `scripts/setupWhatsappFlows.js` — one-time: generate RSA keys, upload public key to Meta, create the 2 flows, upload flow JSON, set endpoint, publish.

**Reused / extended**
- `Scheme` model: add optional WhatsApp media fields **`waLogo`** (list icon) and **`waBanner`** (details banner) — kept separate from the web `backgroundImage` as you requested.
- `server.js`: mount `/api/whatsapp/webhook` and `/api/whatsapp/flow`; capture `rawBody` for signature verification.

**Encryption:** WhatsApp Flows require an RSA key pair. Public key is uploaded to Meta; private key stays in `.env` (`FLOW_PRIVATE_KEY`). Each flow request is decrypted, handled, and the response is AES-GCM re-encrypted (exactly the TVK `flowEndpoint.js` mechanism).

---

## 3. Admin panel — "Flow Images" page (Super Admin)

A new sidebar item **"Flow / WhatsApp Images"** where you upload every image the WhatsApp flow uses. These are **separate** from the web scheme background images.

**Global image slots (fixed keys):**
- `wa_language_header` — header image on the "choose language" message.
- `wa_register_header` — header image on the "Register" CTA message.
- `wa_register_banner` — banner shown on the Register flow screens.
- `wa_choose_service_banner` — banner at the top of the Choose Service flow (`choose.png`).
- `wa_choose_service_header` — header image on the "Choose Service" chat message.
- `wa_confirm_header` — header image on confirmation messages.
- `wa_member_default_icon` — default profile icon for "My Members".
- Service icons: `wa_svc_my_profile`, `wa_svc_my_schemes`, `wa_svc_apply_schemes`, `wa_svc_referral`, `wa_svc_members`, `wa_svc_booth_president`.

**Per-scheme WhatsApp images:** the page also lists each scheme with two upload slots — **Logo** (`waLogo`, used in the schemes list) and **Details Banner** (`waBanner`, used on the scheme details screen). Stored on the Scheme record.

All uploads go to Cloudinary; the flow endpoint caches them (10 min) and busts the cache on upload.

---

## 4. Environment / credentials (stored server-side only, never committed)

Added to the droplet `backend/.env` (values from the credentials you provided):

```
META_ACCESS_TOKEN=***(provided)***
META_APP_ID=1509484690547937
META_APP_SECRET=***(provided)***
META_PHONE_NUMBER_ID=1237240656129241
META_WABA_ID=1333149808374304
META_GRAPH_VERSION=v22.0
META_VERIFY_TOKEN=bjp_nalam_whatsapp_2026     # proposed — change if you like
FLOW_PRIVATE_KEY=***(generated at setup)***
FLOW_PUBLIC_KEY=***(generated at setup)***
WHATSAPP_REG_FLOW_ID=***(from createFlow at setup)***
WHATSAPP_SERVICE_FLOW_ID=***(from createFlow at setup)***
# CLOUDINARY_* already present
```

Note: the access token you gave is a **user/long-lived token**. For production I recommend a **System User permanent token** so it doesn't expire — I'll flag this during setup.

---

## 5. Meta setup steps (done during implementation)

1. Generate RSA key pair → upload public key to the phone number (`uploadBusinessPublicKey`).
2. `createFlow` × 2 (Register, Service) → `updateFlowJSON` with our screen definitions → `setFlowEndpoint` to our Flow Endpoint URL → `publishFlow`.
3. Configure the **webhook** in the Meta App (WhatsApp → Configuration):
   - **Callback URL:** `https://tnbjp.org/api/whatsapp/webhook`
   - **Verify token:** `bjp_nalam_whatsapp_2026`
   - Subscribe to the `messages` field.

---

## 6. Callback URL & Verify Token (what you asked for)

- **Callback URL:** `https://tnbjp.org/api/whatsapp/webhook`
- **Verify Token:** `bjp_nalam_whatsapp_2026`
- **Flow Endpoint URL** (set on each flow, not the webhook): `https://tnbjp.org/api/whatsapp/flow`

(Final values become live only after implementation + deploy; the verify token can be anything you prefer.)

---

## 7. Important considerations / open questions

1. **One webhook per app/number.** A Meta App's WhatsApp webhook points to a **single** callback URL, and this phone number delivers to that one URL. Since these credentials are shared with "another project", pointing the webhook at BJP means **this number's messages come to BJP** (the other project stops receiving them unless it shares this backend). Please confirm this number is dedicated to BJP now. (Creating a new *Flow* for BJP is fine and does not affect the other project's flow — only the webhook ownership matters.)
2. **Registration = one scheme.** In the register flow the user picks **one** scheme to apply during sign-up (more can be added later via "Apply Schemes"). Confirm that's the intended behavior (the web chatbot allows multi-select).
3. **EPIC-only lookup.** Your spec asks only for WhatsApp number (fixed) + EPIC on screen 1 (no DOB). We'll look up the voter by EPIC alone. Confirm.
4. **Language depth.** Should every flow screen be fully bilingual (all titles/labels in the chosen language), or English UI with Tamil for the key messages? Full bilingual is more work but doable — please pick.
5. **Booth-President dropdowns** rely on the jurisdiction data (district → assemblies → booths). We'll reuse `jurisdictionService`; confirm it can enumerate assemblies per district and booths per assembly.
6. **Media/token limits.** Flow responses cap ~250 KB, so banners are sent at ~1600×200 and icons at ~200×200 (auto-resized), matching TVK.

---

## 8. Phased implementation

- **Phase 1 — Infra:** metaCloud service, webhook (verify + receive), rawBody in server.js, `.env`, RSA keys + public-key upload, WhatsAppContact model. Deliver a working "hi → language buttons → Register CTA".
- **Phase 2 — Register flow:** Flow JSON + endpoint screens (Details → Confirm table → Schemes list → Scheme details → Confirm), voter lookup, member + application creation, "Choose Service" follow-up.
- **Phase 3 — Service flow:** Choose Service menu + My Profile, My Schemes (+ status), Apply Schemes, My Referral Link, My Members.
- **Phase 4 — Booth President:** current jurisdiction + Another Booth (cascading dropdowns) + status-if-exists.
- **Phase 5 — Admin Flow Images page:** global slots + per-scheme logo/banner, wired to the flow endpoint.
- **Phase 6 — Meta wiring & QA:** create/publish flows, set endpoint, configure webhook, end-to-end test on your number, then deploy.

---

## 9. Deliverables at the end
- Live WhatsApp automation on the provided number.
- Super Admin "Flow / WhatsApp Images" page.
- Callback URL + verify token configured.
- The `Scheme` model carrying separate WhatsApp logo/banner images.
- No secrets in the repo (all in `.env` on the droplet).

---

Reply with answers to the open questions in §7 (or "go with defaults") and I'll start Phase 1.
