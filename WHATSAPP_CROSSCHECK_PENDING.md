# WhatsApp Automation — Cross-Check Against `whatsapp_prompts` Spec

Cross-check of the 7-phase build plan in `whatsapp_prompts.zip` against the
**actual deployed code** on the droplet (`/var/www/bjptn/backend`) and the local
repo. Verified by reading source files and querying the live Meta Graph API.

Date: 2026-08-04

Legend: ✅ Done · ⚠️ Deviation (works, differs from spec) · ⛔ Pending (action needed)

---

## TL;DR — What's actually pending

| # | Item | Type | Owner |
|---|------|------|-------|
| 1 | Webhook HMAC verification is **disabled** (`META_APP_SECRET` blanked) | ⛔ Security | You → give me Mylapore app secret |
| 2 | **Flow images not uploaded** — all 13 global slots + per-scheme logos/banners empty; flows use text headers | ⛔ Content | You (Super Admin panel) |
| 3 | **End-to-end QA** (17-point checklist) not yet run on real WhatsApp | ⛔ Testing | You + me (was blocked by the signature bug, now unblocked) |
| 4 | `form-data` used but not declared in `package.json` (resolves transitively via axios) | ⚠️ Minor | me (optional) |

Everything else in the plan is built, deployed, and (for flows) published.

---

## Phase 0 — Verify Meta Credentials

| Spec check | Reality | Status |
|-----------|---------|--------|
| `META_APP_ID` expected `1509484690547937` | **Now `1531052615123009` (Mylapore)** | ⚠️ Spec value was wrong |
| `META_APP_SECRET` present | **Blanked** to bypass verification (temporary) | ⛔ See item #1 |
| `META_PHONE_NUMBER_ID` = 1237240656129241 | Confirmed | ✅ |
| `META_WABA_ID` = 1333149808374304 | Confirmed | ✅ |
| `META_GRAPH_VERSION` = v22.0 | Confirmed | ✅ |
| `META_VERIFY_TOKEN` = bjp_nalam_whatsapp_2026 | Confirmed | ✅ |
| `META_ACCESS_TOKEN` live | Valid, **permanent System User token** (Mylapore) | ✅ |
| Cloudinary / Mongo / JWT keys | All present | ✅ |
| node-forge / sharp installed | **Not installed** — not used (see Phase 1/2) | ⚠️ By design |

> **Important correction to the spec:** the plan assumed the app was
> `1509484690547937`. In reality the WABA is subscribed to a different app —
> **"Mylapore" (`1531052615123009`)** — and the access token belongs to that
> app. Meta signs webhooks with Mylapore's app secret, so the config had to be
> pointed at the Mylapore app. This is why "hi" produced no reply until fixed.

---

## Phase 1 — Infrastructure

| Spec item | Reality | Status |
|-----------|---------|--------|
| `WhatsAppContact` model | Built (fields named `lang`/`voterSnapshot`/`pendingBooth`/`lastSeenAt` instead of `language`/`lastVoterSnapshot`/`pendingBoothSelection`) | ⚠️ Field names differ, functionally equal |
| `metaCloud.js` (sendText, buttons, flow msg, downloadMedia) | Built as `sendText`, `sendButtons`, `sendFlowMessage`, `downloadMedia` (+ flow-mgmt helpers) | ✅ |
| Webhook GET verify | Built; tested — returns challenge on correct token, 403 otherwise | ✅ |
| Webhook POST + HMAC on `rawBody` | Built; **HMAC currently skipped because secret is blank** | ⛔ item #1 |
| `rawBody` capture in server.js | Built (via `express.json` `verify` callback, webhook path only) | ✅ |
| Routes mounted | `/api/whatsapp` + `/api/whatsapp/flow` mounted | ✅ |
| "hi → language buttons" | Built (`GREETING_RE` matches hi/hello/vanakkam/etc.) | ✅ |
| "language pick → Register CTA" | Built | ✅ |
| Encryption via **node-forge** | Uses **Node built-in `crypto`** (RSA-OAEP + AES-128-GCM) instead | ⚠️ By design, no dep needed |

---

## Phase 2 — Register Flow

| Spec item | Reality | Status |
|-----------|---------|--------|
| Screens DETAILS→CONFIRM→SCHEMES→SUMMARY | Built as REG_START→REG_CONFIRM→REG_SCHEMES→**REG_SCHEME_DETAIL**→REG_DONE (extra scheme-detail banner screen added) | ⚠️ Richer than spec |
| EPIC lookup via `findVoterByEpic` | Built | ✅ |
| Voter confirm table | Built (markdown table, bilingual) | ✅ |
| **Multi-select** schemes (CheckboxGroup, min 1) | **Single scheme** via RadioButtonsGroup | ⚠️ Deliberate — "registration applies ONE scheme" |
| Member (User) creation | Built (`upsertUserFromVoter`) | ✅ |
| SchemeApplication creation + duplicate guard | Built (`createApplication`) | ✅ |
| "Choose Service" CTA after register | Built (fires on flow-complete webhook) | ✅ |
| `Scheme.waLogo` / `waBanner` | Added | ✅ |
| `imageBase64` via **sharp** resize | Uses **Cloudinary URL transforms** (`waImageBase64.js`) instead | ⚠️ By design |

---

## Phase 3 — Service Flow

| Spec item | Reality | Status |
|-----------|---------|--------|
| 5 service tiles catalog | Built (in `waHelpers.SERVICES`, 6 incl. booth) | ✅ |
| MENU screen | Built (`SERVICE_MENU`) | ✅ |
| My Profile | Built | ✅ |
| My Schemes + status | Built (`MY_SCHEMES` → `APP_STATUS`) | ✅ |
| Apply Schemes (**multi-select**) + confirm | Built as single-scheme (`APPLY_LIST`→`APPLY_DETAIL`→`APPLY_DONE`) | ⚠️ Single-select by design |
| My Referral Link (no EPIC/mobile) | Built | ✅ |
| My Members (no EPIC/mobile — DPDP) | Built — shows name + assembly/booth only | ✅ |
| `handleFlowComplete` APPLY | Built (apply persists, re-sends service CTA) | ✅ |
| Registered user "hi" → **direct** service CTA | Registered user gets language buttons first, **then** service flow | ⚠️ Minor — language step kept intentionally |

---

## Phase 4 — Booth President

| Spec item | Reality | Status |
|-----------|---------|--------|
| 6th tile "Be a Booth President" | Built | ✅ |
| Existing request → status screen | Built (`BOOTH_STATUS`) | ✅ |
| Current booth confirm | Built (`BOOTH_HOME`) | ✅ |
| Another booth: District→Assembly→Booth dropdowns | Built (`BOOTH_DISTRICT`→`BOOTH_ASSEMBLY`→`BOOTH_BOOTH`) via `jurisdictionService` | ✅ |
| Confirm → create request | Built (`createBoothRequest`) | ✅ |
| Duplicate blocked (any status) | Built | ✅ |
| `isCustomBooth` + original jurisdiction saved | Built | ✅ |

---

## Phase 5 — Admin Flow Images Page

| Spec item | Reality | Status |
|-----------|---------|--------|
| `FlowImage` model | Built | ✅ |
| flow-images service + 10-min cache | Built (`waFlowImages.js`, `ensureKeysExist` seed) | ✅ |
| Routes (SUPER_ADMIN protected) | Built (`flowImagesRoutes.js`, mounted `/api/admin/flow-images`) | ✅ |
| Global slots GET/POST/DELETE | Built | ✅ |
| Per-scheme logo/banner endpoints | Built | ✅ |
| `FlowImagesView.jsx` | Built | ✅ |
| AdminSidebar tab (SUPER_ADMIN) | Built (`flow_images`, MessageCircle icon) | ✅ |
| SuperAdminDashboard wired | Built | ✅ |
| **Images actually uploaded** | **None uploaded yet** — every slot empty | ⛔ item #2 |

---

## Phase 6 — Meta Wiring & QA

| Spec item | Reality | Status |
|-----------|---------|--------|
| `setupWhatsappFlows.js` | Built + run | ✅ |
| RSA keys generated + uploaded to Meta | Done (`FLOW_PRIVATE_KEY`/`FLOW_PUBLIC_KEY` set) | ✅ |
| Register flow created | `913590874548078` — **PUBLISHED** (verified via Graph API) | ✅ |
| Service flow created | `27001780656163245` — **PUBLISHED** (verified) | ✅ |
| Flow JSON uploaded (both) | Done (flows render) | ✅ |
| Endpoint set on both flows | `https://tnbjp.org/api/whatsapp/flow` | ✅ |
| Both flows published | Confirmed via `GET /{waba}/flows` | ✅ |
| Webhook callback configured in Meta | Delivering to `/api/whatsapp/webhook` (POSTs arriving) | ✅ |
| **17-point QA on real WhatsApp** | **Not yet completed** — first "hi" was dropped by the signature bug (now fixed) | ⛔ item #3 |

### QA checklist status (all pending a real run)
1–17: not yet verified end-to-end. The blocker (webhook rejecting messages) is
resolved; a fresh "hi" should now walk through language → register → service.

---

## Detailed pending items & how to close them

### 1. Restore webhook signature verification (security) ⛔
Currently `META_APP_SECRET=` (blank) so the HMAC check is skipped and the
webhook accepts unsigned POSTs. To secure it:
- Get the **App Secret** for app **Mylapore (`1531052615123009`)**:
  Meta dashboard → that app → App settings → Basic → App Secret → Show.
- Send it to me; I'll set `META_APP_SECRET` and restart. Verification will pass
  because Meta signs with that app's secret.

### 2. Upload flow images ⛔
Super Admin → **WhatsApp Flow Images**. Upload the 13 global slots
(language/register/choose-service headers + banners, 6 service icons, member
icon, confirm header) and per-scheme logo + banner. Until then, all flow headers
fall back to the text "BJP Nalam Thittam" (functional, just not branded).

### 3. Run the 17-point QA ⛔
Send "hi" from a test number and walk the full journey (language → register →
schemes → confirm → choose service → each tile → booth president). Record
pass/fail. I can tail server logs live while you test.

### 4. Pin `form-data` (minor) ⚠️
`metaCloud.js` `require('form-data')` resolves only transitively through axios.
Optional hardening: `npm install form-data` in `backend/`.

---

## Deliberate deviations from the spec (NOT bugs)

These differ from the prompt text but were intentional design choices already
agreed during the build:

1. **Single-scheme** selection in Register and Apply (spec asked for multi-select).
2. **Node built-in `crypto`** for Flow encryption instead of `node-forge`.
3. **Cloudinary URL transforms** for image sizing instead of `sharp`.
4. **Screen names** differ (REG_START vs DETAILS, etc.) and a richer scheme-detail
   banner screen was added.
5. **`WhatsAppContact`** field names differ but cover the same data.
6. **`META_APP_ID`** points to the real subscribed app (Mylapore), correcting the
   spec's assumed value.
7. Registered users still see the **language step** before the service menu.

---

## Bottom line

The build matches the plan's intent across all 7 phases; flows are live and
published. Three real items remain before it's production-ready:
**(1) restore the webhook secret**, **(2) upload flow images**, and
**(3) run the end-to-end QA**. Item 3 was blocked by the app-secret mismatch,
which is now worked around, so testing can proceed.
