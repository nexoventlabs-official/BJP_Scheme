# BJP NALAM THITTAM — FIX CONTEXT
# 7 Open Issues from Production Readiness Audit
# Feed this file to Antigravity or Kiro to implement all fixes

---

## INSTRUCTION

Read this file completely. Then open the project repository and implement every fix listed below. Each fix includes the exact file, the exact problem, and the exact solution. Do not skip any. After implementing all 7, confirm each one is done.

---

## FIX 1 — JWT Token Revocation

**File:** `backend/models/Admin.js`, `backend/models/User.js`, `backend/middleware/authMiddleware.js`, `backend/controllers/adminController.js`, `backend/controllers/authController.js`

**Problem:**
JWT tokens are issued with a fixed 7-day expiry (`expiresIn: '7d'`) for admins and 30-day for users. There is no way to invalidate a token server-side if an admin account is compromised or a user logs out. The token stays valid until it naturally expires.

**Fix:**
Add a `tokenVersion` integer field to both `Admin` and `User` models. Embed `tokenVersion` in the JWT payload at sign time. In `authMiddleware.js`, after verifying the JWT signature, fetch the user/admin from DB and compare `decoded.tokenVersion === record.tokenVersion`. If they don't match, reject with 401. To revoke all sessions for a user, increment their `tokenVersion` in the DB.

**Exact changes:**

`Admin.js` — add to schema:
```javascript
tokenVersion: { type: Number, default: 0 }
```

`User.js` — add to schema:
```javascript
tokenVersion: { type: Number, default: 0 }
```

`adminController.js` — include in token payload:
```javascript
const generateAdminToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id || admin.id,
      username: admin.username,
      role: admin.role,
      district: admin.district,
      assemblyName: admin.assemblyName,
      boothNo: admin.boothNo,
      isAdmin: true,
      tokenVersion: admin.tokenVersion || 0  // ADD THIS
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};
```

`authController.js` — include in user token payload:
```javascript
const generateToken = (id, tokenVersion = 0) => {
  return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET, { expiresIn: '30d' });
};
```

`authMiddleware.js` — add version check in `protectAdmin`:
```javascript
// After: req.admin = await Admin.findById(decoded.id).select('-password');
if (req.admin && req.admin.tokenVersion !== decoded.tokenVersion) {
  return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
}
```

Same check in `protectUser`:
```javascript
// After: req.user = await User.findById(decoded.id).select('-__v');
if (req.user && req.user.tokenVersion !== decoded.tokenVersion) {
  return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
}
```

To revoke all sessions (e.g. on password change or logout):
```javascript
await Admin.findByIdAndUpdate(adminId, { $inc: { tokenVersion: 1 } });
await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
```

---

## FIX 2 — Admin Seed Passwords from Environment Variables

**File:** `backend/server.js`

**Problem:**
`seedDefaultAdmins()` creates Super Admin (`admin/admin`) and State Admin (`BJP/BJP@2026`) with hardcoded default passwords. If `NODE_ENV=production` and these env vars are not explicitly set, predictable credentials are created.

**Fix:**
Read seed passwords strictly from environment variables. In production, crash at startup if the env vars are missing or still set to the default values.

**Exact change — replace `seedDefaultAdmins` function:**
```javascript
const seedDefaultAdmins = async () => {
  const isProd = process.env.NODE_ENV === 'production';

  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  const stateAdminPassword = process.env.STATE_ADMIN_PASSWORD;

  if (isProd && (!superAdminPassword || superAdminPassword === 'admin')) {
    console.error('[FATAL] SUPER_ADMIN_PASSWORD must be set to a strong value in production.');
    process.exit(1);
  }

  if (isProd && (!stateAdminPassword || stateAdminPassword === 'BJP@2026')) {
    console.error('[FATAL] STATE_ADMIN_PASSWORD must be set to a strong value in production.');
    process.exit(1);
  }

  try {
    const superAdmin = await Admin.findOne({ username: 'admin' });
    if (!superAdmin) {
      await Admin.create({
        username: 'admin',
        password: superAdminPassword || 'admin',
        role: 'SUPER_ADMIN',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] Super Admin created from environment variable.');
    }

    const stateAdmin = await Admin.findOne({ username: 'BJP' });
    if (!stateAdmin) {
      await Admin.create({
        username: 'BJP',
        password: stateAdminPassword || 'BJP@2026',
        role: 'STATE_ADMIN',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] State Admin created from environment variable.');
    }
  } catch (err) {
    console.error('[Admin Seed Error]:', err.message);
  }
};
```

**Also add to `.env` / `.env.example`:**
```env
# Strong passwords required in production — startup will fail if these are missing or default
SUPER_ADMIN_PASSWORD=SetStrongSuperAdminPassword2026!
STATE_ADMIN_PASSWORD=SetStrongStateAdminPassword2026!
```

---

## FIX 3 — Compound Indexes on SchemeApplication

**File:** `backend/models/SchemeApplication.js`

**Problem:**
No compound indexes defined on `SchemeApplication`. At 1.13 crore+ records, admin dashboard queries filtering by `{ district, assemblyName, boothNo, status }` and export queries will perform full collection scans. At scale this causes MongoDB CPU spikes and dashboard load times exceeding 10 seconds.

**Fix:**
Add compound indexes at the bottom of `SchemeApplication.js` before the model export.

**Exact change:**
```javascript
// Add these lines before: module.exports = mongoose.model('SchemeApplication', schemeApplicationSchema);

schemeApplicationSchema.index({ district: 1, assemblyName: 1, boothNo: 1, status: 1 });
schemeApplicationSchema.index({ district: 1, assemblyName: 1, status: 1 });
schemeApplicationSchema.index({ district: 1, status: 1 });
schemeApplicationSchema.index({ userId: 1 });
schemeApplicationSchema.index({ epicNo: 1 });
schemeApplicationSchema.index({ mobile: 1 });
schemeApplicationSchema.index({ appliedAt: -1 });
schemeApplicationSchema.index({ schemeName: 1 });
```

Also add to `User.js`:
```javascript
// Add before: module.exports = mongoose.model('User', userSchema);

userSchema.index({ district: 1, assemblyName: 1, boothNo: 1 });
userSchema.index({ referredBy: 1 });
userSchema.index({ referralCode: 1 });
```

---

## FIX 4 — Dashboard Stats Caching

**File:** `backend/controllers/adminController.js`

**Problem:**
`getDashboardStats()` runs 6–8 live MongoDB aggregation pipelines on every single request — `countDocuments`, `aggregate` for status breakdown, district stats, assembly stats, booth stats, scheme popularity, and top referrers. Under concurrent booth admin traffic at 75,064 booths, this hammers MongoDB on every page load.

**Fix:**
Cache the dashboard stats response per admin scope in memory with a 5-minute TTL. Use a simple in-process Map cache (no Redis required as a first step). Key the cache by the admin's scope (role + district + assemblyName + boothNo).

**Exact change — add cache at top of `adminController.js`:**
```javascript
// Simple in-memory stats cache (5-minute TTL per scope key)
const statsCache = new Map();
const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getStatsCacheKey = (admin, query) => {
  return `${admin.role}|${admin.district || ''}|${admin.assemblyName || ''}|${admin.boothNo || ''}|${query.from || ''}|${query.to || ''}`;
};
```

**In `getDashboardStats()` — add cache check at the top and cache set at the bottom:**
```javascript
const getDashboardStats = async (req, res) => {
  try {
    const admin = req.admin;
    const cacheKey = getStatsCacheKey(admin, req.query);
    const cached = statsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    // ... existing aggregation logic unchanged ...

    const responseData = {
      success: true,
      adminRole: admin.role,
      // ... rest of response object
    };

    // Store in cache
    statsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return res.status(200).json(responseData);
  } catch (error) {
    // ... existing error handler
  }
};
```

**Note:** If Redis is available, replace the Map with `ioredis` for cache sharing across PM2 cluster workers. The Map approach works correctly for single-instance deployments.

---

## FIX 5 — Duplicate Scheme Application DB-Level Guard

**File:** `backend/models/SchemeApplication.js`

**Problem:**
Duplicate application prevention is handled in application code only (checking before insert). Concurrent requests — e.g. a user double-tapping Submit on a slow mobile connection — can both pass the check simultaneously and insert duplicate records before either sees the existing one.

**Fix:**
Add a unique compound index at the database level on `(epicNo, schemeId)`. MongoDB will reject the second insert at the driver level, making duplicates impossible regardless of timing.

**Exact change — add to `SchemeApplication.js`:**
```javascript
// Add with the other indexes before module.exports
schemeApplicationSchema.index({ epicNo: 1, schemeId: 1 }, { unique: true });
```

**Also update the apply handler to catch duplicate key errors gracefully:**
```javascript
// In schemeController.js and userChatController.js — wrap the SchemeApplication.create() call:
try {
  const newApp = await SchemeApplication.create({ ... });
  appliedResults.push(newApp);
} catch (err) {
  if (err.code === 11000) {
    // Duplicate key — already applied for this scheme
    skippedAlreadyApplied.push(schemeInfo.name);
  } else {
    throw err;
  }
}
```

---

## FIX 6 — Global Express Error Handler

**File:** `backend/server.js`

**Problem:**
Express 4 does not automatically catch errors thrown inside async route handlers. Any unhandled promise rejection in a controller crashes the request silently or causes an unformatted response. There is no global error middleware currently mounted.

**Fix:**
Add two things to `server.js`:

**1. Install express-async-errors (catches async throws automatically):**
```bash
npm install express-async-errors
```

**2. Import at the very top of `server.js` (before any routes):**
```javascript
import 'express-async-errors'; // Must be first import after express
```

**3. Add global error handler middleware at the bottom of `server.js` — after all routes, before `app.listen`:**
```javascript
// Global error handler — must be last middleware, must have 4 arguments
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', {
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  if (res.headersSent) return next(err);

  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again.'
      : err.message,
  });
});
```

---

## FIX 7 — Health Check with Live DB Ping

**File:** `backend/server.js`

**Problem:**
`/api/health` currently returns `{ status: 'OK' }` statically. It does not verify whether MongoDB connections are actually alive. A monitoring tool or load balancer checking this endpoint would see OK even if both databases are down.

**Fix:**
Replace the static health check with a live ping to both MongoDB connections.

**Exact change — replace the existing `/api/health` route:**
```javascript
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    databases: {
      appDb: 'UNKNOWN',
      voterDb: 'UNKNOWN',
    }
  };

  // Check App DB (Mongoose)
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.command({ ping: 1 });
      health.databases.appDb = 'OK';
    } else {
      health.databases.appDb = 'DISCONNECTED';
      health.status = 'DEGRADED';
    }
  } catch (err) {
    health.databases.appDb = 'ERROR';
    health.status = 'DEGRADED';
  }

  // Check Voter DB (Native MongoClient)
  try {
    const { getVoterDbClient } = require('./config/db');
    const voterDb = await getVoterDbClient();
    await voterDb.command({ ping: 1 });
    health.databases.voterDb = 'OK';
  } catch (err) {
    health.databases.voterDb = 'ERROR';
    health.status = 'DEGRADED';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  return res.status(statusCode).json(health);
});
```

**Expected healthy response:**
```json
{
  "status": "OK",
  "timestamp": "2026-08-03T10:00:00.000Z",
  "uptime": 3600,
  "databases": {
    "appDb": "OK",
    "voterDb": "OK"
  }
}
```

---

## COMPLETION CHECKLIST

After implementing all fixes, verify each one:

- [ ] FIX 1 — `tokenVersion` field exists in Admin and User models. JWT payload includes it. Middleware rejects mismatched version.
- [ ] FIX 2 — `seedDefaultAdmins` reads passwords from `SUPER_ADMIN_PASSWORD` and `STATE_ADMIN_PASSWORD` env vars. Crashes in production if missing or default.
- [ ] FIX 3 — Compound indexes defined in `SchemeApplication.js` and `User.js` before `module.exports`.
- [ ] FIX 4 — `statsCache` Map exists in `adminController.js`. `getDashboardStats` checks cache before querying DB.
- [ ] FIX 5 — Unique index on `{ epicNo: 1, schemeId: 1 }` in `SchemeApplication.js`. Duplicate key error (11000) caught gracefully in apply handlers.
- [ ] FIX 6 — `express-async-errors` imported at top of `server.js`. 4-argument error handler mounted after all routes.
- [ ] FIX 7 — `/api/health` pings both MongoDB connections. Returns `DEGRADED` with 503 if either DB is unreachable.
