const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { connectAppDb, getVoterDbClient } = require('./config/db');
const Admin = require('./models/Admin');

const authRoutes = require('./routes/authRoutes');
const voterRoutes = require('./routes/voterRoutes');
const schemeRoutes = require('./routes/schemeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const referralRoutes = require('./routes/referralRoutes');
const userChatRoutes = require('./routes/userChatRoutes');
const { getAssemblyMetadata } = require('./services/jurisdictionService');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', userChatRoutes);
app.use('/api/auth', authRoutes);
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
