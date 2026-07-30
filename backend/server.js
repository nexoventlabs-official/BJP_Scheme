const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();

// ── Fail fast on missing/weak critical secrets ──
// Never fall back to a hardcoded JWT secret: an attacker who knows it can forge
// admin tokens. The process must not start without a strong secret configured.
const WEAK_SECRETS = new Set(['bjp_nalam_thittam_secret_2026', 'secret', 'changeme', '']);
if (!process.env.JWT_SECRET || WEAK_SECRETS.has(process.env.JWT_SECRET) || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET is missing or too weak. Set a strong (>=32 char) JWT_SECRET in the environment before starting.');
  process.exit(1);
}
if (!process.env.SMS_API_KEY) {
  console.warn('[WARN] SMS_API_KEY is not set — OTP SMS delivery will fail. Set it in the environment.');
}

const { connectAppDb, getVoterDbClient } = require('./config/db');
const Admin = require('./models/Admin');

const voterRoutes = require('./routes/voterRoutes');
const schemeRoutes = require('./routes/schemeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const referralRoutes = require('./routes/referralRoutes');
const userChatRoutes = require('./routes/userChatRoutes');
const { getAssemblyMetadata } = require('./services/jurisdictionService');

const app = express();

// Middlewares
// Restrict CORS to an explicit allow-list. Extra origins can be added via the
// CORS_ORIGINS env var (comma-separated). Non-browser clients (curl, server-to-
// server) send no Origin header and are allowed through.
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  process.env.BACKEND_URL,
  'https://tnbjp.org',
  'https://www.tnbjp.org',
  'https://tamilnadubjp.live',
  'https://www.tamilnadubjp.live',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : []),
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Secure HTTP headers. crossOriginResourcePolicy is relaxed so the separately
// served frontend can still consume the API responses.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(express.json({ limit: '1mb' }));

// Behind nginx: trust the first proxy hop so rate-limit / logging see the real
// client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// ── Rate limiters (brute-force / abuse protection) ──
const rlMessage = (msg) => ({ success: false, message: msg });

// OTP dispatch — costs money + can be abused for SMS bombing.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: rlMessage('Too many OTP requests. Please wait a few minutes and try again.')
});

// Admin login — throttle credential guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: rlMessage('Too many login attempts. Please wait and try again.')
});

// EPIC lookup — prevents mass voter-roll enumeration.
const epicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: rlMessage('Too many lookups. Please slow down and try again shortly.')
});

app.use('/api/send-otp', otpLimiter);
app.use('/api/admin/login', loginLimiter);
app.use(['/api/validate-epic', '/api/voter/search-epic'], epicLimiter);

// Root API Status Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    message: 'BJP Nalam Thittam API Server Operational',
    version: '1.0.0',
    backend_url: process.env.BACKEND_URL || 'https://bjp-scheme.onrender.com',
    frontend_url: process.env.FRONTEND_URL || 'https://bjp-scheme.vercel.app',
    database_connections: {
      app_database: 'CONNECTED (Mongoose - bjp_nalam_thittam_db)',
      voter_database: 'CONNECTED (MongoClient - voter_db)'
    },
    schemes_info: {
      total_schemes: 23,
      name: '23 Central BJP Welfare Schemes'
    },
    api_endpoints: {
      root_status: 'GET /',
      health_check: 'GET /api/health',
      user_authentication: 'POST /api/send-otp | POST /api/verify-otp',
      user_portal: 'POST /api/validate-epic | POST /api/register-schemes',
      admin_authentication: 'POST /api/admin/login',
      admin_dashboard: 'GET /api/admin/stats | GET /api/admin/applications',
      voter_search: 'POST /api/voter/search',
      schemes_catalog: 'GET /api/schemes',
      referral_system: 'GET /api/referral-link/:code'
    }
  });
});

// API Routes
app.use('/api', userChatRoutes);
app.use('/api/voter', voterRoutes);
app.use('/api/schemes', schemeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/referrals', referralRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'BJP Nalam Thittam API is running smoothly' });
});

// Seed Required Default Admin Credentials
const seedDefaultAdmins = async () => {
  try {
    // 1. Super Admin: admin / admin
    const superAdmin = await Admin.findOne({ username: 'admin' });
    if (!superAdmin) {
      await Admin.create({
        username: 'admin',
        password: 'admin',
        role: 'SUPER_ADMIN',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] Created Super Admin: admin / admin');
    }

    // 2. State Admin: BJP / BJP@2026
    const stateAdmin = await Admin.findOne({ username: 'BJP' });
    if (!stateAdmin) {
      await Admin.create({
        username: 'BJP',
        password: 'BJP@2026',
        role: 'STATE_ADMIN',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] Created State Admin: BJP / BJP@2026');
    }

    // 3. Sample District Admin (Chengalpattu)
    const distAdmin = await Admin.findOne({ username: 'district_chengalpattu' });
    if (!distAdmin) {
      await Admin.create({
        username: 'district_chengalpattu',
        password: 'BJP@2026',
        role: 'DISTRICT_ADMIN',
        district: 'CHENGALPATTU',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] Created District Admin: district_chengalpattu / BJP@2026');
    }

    // 4. Sample Assembly Admin (Thiruporur)
    const assAdmin = await Admin.findOne({ username: 'ass_thiruporur' });
    if (!assAdmin) {
      await Admin.create({
        username: 'ass_thiruporur',
        password: 'BJP@2026',
        role: 'ASSEMBLY_ADMIN',
        district: 'CHENGALPATTU',
        assemblyName: 'Thiruporur',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] Created Assembly Admin: ass_thiruporur / BJP@2026');
    }

    // 5. Sample Booth Admin (Thiruporur Booth 1)
    const boothAdmin = await Admin.findOne({ username: 'booth_thiruporur_1' });
    if (!boothAdmin) {
      await Admin.create({
        username: 'booth_thiruporur_1',
        password: 'BJP@2026',
        role: 'BOOTH_ADMIN',
        district: 'CHENGALPATTU',
        assemblyName: 'Thiruporur',
        boothNo: '1',
        createdBy: 'SYSTEM_SEED'
      });
      console.log('[Admin Seed] Created Booth Admin: booth_thiruporur_1 / BJP@2026');
    }
  } catch (err) {
    console.error('[Admin Seed Error]:', err.message);
  }
};

const PORT = process.env.PORT || 5000;

// Connect DBs and start server
const startServer = async () => {
  await connectAppDb();
  await getVoterDbClient();
  await seedDefaultAdmins();

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` BJP Nalam Thittam Backend API Server Running `);
    console.log(` Port: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });

  // Warm up jurisdiction metadata cache in background (counts all 233 assembly collections)
  // This runs ONCE after server starts so the first admin dashboard request is instant
  console.log('[Warmup] Starting jurisdiction metadata + voter count cache in background...');
  getAssemblyMetadata()
    .then(() => console.log('[Warmup] ✅ Jurisdiction cache ready — all voter roll counts cached!'))
    .catch(err => console.error('[Warmup] ❌ Cache warmup failed:', err.message));
};

startServer();
