# BJP_Schemes — Security & Code Audit Report

**Date:** 27 July 2026
**Scope:** Full codebase — backend (Node/Express + MongoDB) and frontend (React/Vite)
**Type:** Read-only static analysis. **No code was changed.**
**Live target:** https://tnbjp.org (DigitalOcean droplet)

---

## How this was scanned

- Dependency vulnerability scan (`npm audit`) on backend and frontend.
- Manual semantic review of all backend controllers, middleware, models, routes, services, and config.
- Frontend API/auth layer, routing, and dead-code review.
- Note: Semgrep / CodeQL / Python were not installed on the build machine, so the equivalent review (same bug/vulnerability/code-smell classes those tools target) was performed by hand. Semgrep can be installed and run against the repo on request.

**Runtime fact verified:** the droplet `.env` sets `NODE_ENV=production`, so the `devOtp` value is **not** leaked in API responses. (The `123456` OTP bypass below is independent of this and is still active.)

---

## Severity summary

| Severity | Count | Items |
|----------|-------|-------|
| Critical | 4 | Hardcoded OTP bypass, universal admin backdoor passwords, hardcoded JWT secret fallback, committed SMS API key |
| High | 4 | Unauthenticated PII endpoints, unauthenticated write endpoint, ReDoS/regex injection, vulnerable dependencies |
| Medium | 5 | Permissive CORS, no rate limiting, error message leakage, tokens in localStorage, no security headers / body size limit |
| Low / smell | 4 | Dead API calls, orphan pages, duplicated OTP logic, OTP TTL mismatch |

---

## CRITICAL

### C1. Hardcoded OTP bypass `123456`
- **File:** `backend/controllers/userChatController.js` (`verifyOtp`, ~lines 95–105)
- **Issue:** Any mobile number can be "verified" using OTP `123456`, which returns a valid JWT. This is **not** gated by environment, so it is active on the live site. An attacker can log in / register as any mobile number.
- **Impact:** Complete authentication bypass for the user portal.

### C2. Universal admin backdoor passwords
- **File:** `backend/services/jurisdictionService.js` (`authenticateDynamicAdmin`)
- **Issue:** Every dynamic booth/assembly/district admin login also accepts the literal passwords `'admin'` and `'BJP@2026'` (plus `'60227000'` / `'60228000'`). Usernames follow a guessable pattern (`<slug>_admin`, `<slug>_b1`), and real passcodes are sequential (`60227000 + assemblyNo`).
- **Impact:** Anyone can log into any assembly/district/booth dashboard. Broken access control across the entire admin hierarchy.

### C3. Hardcoded JWT secret fallback
- **Files:** `backend/controllers/authController.js`, `backend/controllers/userChatController.js`, `backend/controllers/voterController.js`, `backend/controllers/adminController.js`, `backend/middleware/authMiddleware.js`
- **Issue:** All fall back to the literal secret `bjp_nalam_thittam_secret_2026` when `JWT_SECRET` is unset. That value is in source (and git history).
- **Impact:** If `JWT_SECRET` is ever missing, tokens are signed with a publicly known secret — admin tokens can be forged. The droplet currently sets the env var, but the fallback is a latent risk.

### C4. Real SMS API key committed as fallback
- **File:** `backend/services/smsService.js` (~line 9)
- **Issue:** A live-looking 2Factor API key is hardcoded as the default value.
- **Impact:** Secret exposure. The key should be rotated and the literal removed.

---

## HIGH

### H1. Unauthenticated PII endpoints (IDOR + voter-roll enumeration)
- **File:** `backend/routes/userChatRoutes.js` (no `protectUser` middleware)
- **Endpoints:**
  - `GET /api/profile/:epicNo`, `GET /api/member-status/:ntCode`, `GET /api/my-members/:ntCode` — return names, mobiles, districts, and application history for any supplied EPIC / referral code.
  - `POST /api/validate-epic` — returns voter name, father's name, district, gender, and age for any EPIC. The full Tamil Nadu voter roll is enumerable by guessing EPIC numbers.
- **Impact:** Mass PII disclosure and insecure direct object reference.

### H2. Unauthenticated write endpoint
- **File:** `backend/routes/userChatRoutes.js` → `POST /api/register-schemes`
- **Issue:** Creates users and applications with no auth, and lets the caller set `referredBy`.
- **Impact:** Referral-count inflation and injection of junk records.

### H3. ReDoS / regex injection from user input
- **File:** `backend/controllers/adminController.js` (`getApplicationsList`, `exportApplicationsCsv`)
- **Issue:** The `search` query param is passed directly to `new RegExp(search, 'i')` without escaping. (The scheme filter escapes its input; `search` does not.)
- **Impact:** A crafted search string can cause catastrophic backtracking and hang the request thread.

### H4. Vulnerable dependencies
- **Backend:** 10 vulnerabilities (9 high, 1 moderate).
- **Frontend:** 12 vulnerabilities (11 high, 1 moderate).
- **Notable:**
  - `react-router` 7.12.0–8.2.0 — RSC-mode CSRF bypass advisory (frontend).
  - `exceljs → archiver → brace-expansion` DoS chain (both backend and frontend); `uuid < 11.1.1` moderate.
- **Note:** npm marks the fixes as breaking (`exceljs` downgrade, `react-router-dom` downgrade), so these require a careful manual bump rather than `npm audit fix --force`.

---

## MEDIUM

### M1. Permissive CORS
- **File:** `backend/server.js` — `cors({ origin: true, credentials: true })` reflects any origin. Practical CSRF risk is low because auth uses Bearer tokens (not cookies), but this should be restricted to your domains.

### M2. No rate limiting
- **Endpoints:** `/api/send-otp`, `/api/admin/login`, `/api/validate-epic`.
- **Impact:** Brute force, SMS-cost bombing, and voter enumeration are unthrottled.

### M3. Internal error messages leaked to clients
- **Files:** most controllers return `error.message` in JSON responses, exposing internal details.

### M4. Tokens stored in `localStorage`
- **File:** `frontend/src/context/AuthContext.jsx` — readable by any injected script (XSS). 30-day user tokens / 7-day admin tokens widen the exposure window.

### M5. No security headers / no request body size limit
- **File:** `backend/server.js` — no `helmet`; `express.json()` has no size cap (large-payload DoS).

---

## LOW / Code smells (cleanup, not urgent)

### L1. Dead / mismatched API calls
- **File:** `frontend/src/api/index.js`
- `chat.logout()` calls `/api/logout` and `publicApi.verifyVoter()` calls `/api/verify/:epicNo` — neither route exists in the backend (would 404 if called).
- The entire `admin` export targets `/admin/api/*` CSRF/cookie endpoints that don't exist (leftover from the old app). `ChatbotPage.jsx` only genuinely uses `chat` + `publicApi`.

### L2. Orphan pages
- **Files:** `frontend/src/pages/UserHome.jsx`, `UserOnboarding.jsx`, `UserProfile.jsx`, `UserReferrals.jsx`, `UserRequests.jsx` are never routed from `App.jsx` (which mounts only ChatbotPage, ReferralPage, AdminPortal). Likely dead files.

### L3. Duplicated OTP logic
- **File:** `backend/controllers/authController.js` (`/api/auth/*`) reimplements send/verify OTP that the frontend does not use (frontend uses the `userChatController` versions at `/api/*`).

### L4. OTP TTL mismatch
- **File:** `backend/models/OtpSession.js` sets a 300s TTL index, but `userChatController` sets `expiresAt` to 10 minutes and `authController` to 5 minutes. Minor inconsistency.

---

## Recommended priority

1. **C1, C2, C3** — active authentication/authorization bypasses. Fix first.
2. **C4, H1, H2** — secret exposure and unauthenticated PII/write access.
3. **H3, H4, M1–M5** — hardening.
4. **L1–L4** — cleanup.

> No fixes have been applied. Backend files are included in this report for visibility only, per the "do not touch the backend" instruction. Await confirmation before any changes are made.
