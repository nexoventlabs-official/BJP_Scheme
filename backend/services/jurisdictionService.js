const { getVoterDbClient } = require('../config/db');

let assemblyCache = null;
let districtCache = null;
let boothCountCache = {};
let districtCollectionMap = {}; // maps district name -> [colName, colName, ...]
let districtVoterCount = {};   // maps district name -> total voter count (from read DB, cached)
let assemblyVoterCount = {};   // maps assemblyName -> total voter count (from read DB, cached)
let boothVoterCountCache = {}; // maps 'assemblyName::boothNo' -> count

const cleanSlug = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const getAssemblyMetadata = async () => {
  if (assemblyCache) return assemblyCache;

  try {
    const voterDb = await getVoterDbClient();
    const collections = await voterDb.listCollections().toArray();

    const list = [];
    const distMap = {};
    const assCols = collections.filter(c => c.name.startsWith('ass_'));

    const items = await Promise.all(
      assCols.map(async (col) => {
        try {
          const sample = await voterDb.collection(col.name).findOne({}, { projection: { DISTRICT: 1, ASSEMBLY_NO: 1, ASSEMBLY_NAME: 1 } });
          if (!sample) return null;

          const assemblyNo = String(sample.ASSEMBLY_NO || col.name.replace('ass_', ''));
          const assemblyName = sample.ASSEMBLY_NAME || (`Assembly ${assemblyNo}`);
          const district = sample.DISTRICT || 'TAMIL NADU';
          const slug = cleanSlug(assemblyName);

          let voterCount = 0;
          try {
            const statsResult = await voterDb.collection(col.name).aggregate([
              { $collStats: { count: {} } }
            ]).toArray();
            voterCount = (statsResult[0] && statsResult[0].count) ? statsResult[0].count : 0;
          } catch {
            voterCount = await voterDb.collection(col.name).countDocuments({});
          }

          return {
            colName: col.name,
            assemblyNo,
            assemblyName,
            district,
            slug,
            label: `${assemblyNo} - ${assemblyName}`,
            voterCount
          };
        } catch {
          return null;
        }
      })
    );

    items.filter(Boolean).forEach(item => {
      const { colName, assemblyNo, assemblyName, district, slug, label, voterCount } = item;

      if (!distMap[district]) {
        distMap[district] = {
          district,
          slug: cleanSlug(district),
          assembliesCount: 0
        };
      }
      distMap[district].assembliesCount++;

      if (!districtCollectionMap[district]) districtCollectionMap[district] = [];
      districtCollectionMap[district].push(colName);

      assemblyVoterCount[assemblyName.toUpperCase()] = (assemblyVoterCount[assemblyName.toUpperCase()] || 0) + voterCount;
      districtVoterCount[district] = (districtVoterCount[district] || 0) + voterCount;

      list.push({ colName, assemblyNo, assemblyName, district, slug, label });
    });

    list.sort((a, b) => parseInt(a.assemblyNo) - parseInt(b.assemblyNo));
    assemblyCache = list;

const Admin = require('../models/Admin');

    // Build district array
    const sortedDistricts = Object.values(distMap).sort((a, b) => a.district.localeCompare(b.district));
    districtCache = sortedDistricts.map((d, idx) => {
      const username = `${d.slug}_admin`;
      return {
        district: d.district,
        assembliesCount: d.assembliesCount,
        username,
        passcode: 'DB_PROTECTED'
      };
    });

    return assemblyCache;
  } catch (err) {
    console.error('[JurisdictionService Error]:', err);
    return [];
  }
};

// Get District Credentials List
const getDistrictCredentialsList = async () => {
  await getAssemblyMetadata();
  return districtCache || [];
};

// Get Assembly Credentials List (All 233 Assemblies)
const getAssemblyCredentialsList = async () => {
  const assemblies = await getAssemblyMetadata();
  return assemblies.map((a) => {
    const username = `${a.slug}_admin`;
    return {
      assemblyNo: a.assemblyNo,
      assemblyName: a.assemblyName,
      district: a.district,
      label: a.label,
      username,
      passcode: 'DB_PROTECTED'
    };
  });
};

// Get booth list & credentials for an assembly
const getBoothCredentialsForAssembly = async (assemblyNo) => {
  const assemblies = await getAssemblyMetadata();
  const target = assemblies.find(a => a.assemblyNo === String(assemblyNo));
  if (!target) return null;

  const voterDb = await getVoterDbClient();
  let boothNumbers = boothCountCache[target.assemblyNo];

  if (!boothNumbers) {
    const distinctBooths = await voterDb.collection(target.colName).distinct('PART_NO');
    boothNumbers = distinctBooths
      .filter(b => b && b.trim() !== '')
      .map(b => String(b).trim());

    boothNumbers.sort((a, b) => parseInt(a) - parseInt(b));
    boothCountCache[target.assemblyNo] = boothNumbers;
  }

  const boothLogins = boothNumbers.map((bNo) => {
    const username = `${target.slug}_b${bNo}`;
    return {
      boothNo: String(bNo),
      username,
      passcode: 'DB_PROTECTED'
    };
  });

  return {
    assemblyNo: target.assemblyNo,
    assemblyName: target.assemblyName,
    district: target.district,
    totalBooths: boothNumbers.length,
    boothLogins
  };
};

// Dynamic Admin Authentication Helper — Loads & Verifies Credentials from MongoDB Database
const authenticateDynamicAdmin = async (username, password) => {
  const cleanUsername = username.trim().toLowerCase();
  const cleanPassword = password.trim();

  // 1. Direct MongoDB lookup for any seeded / dynamic admin account
  const dbAdmin = await Admin.findOne({ username: cleanUsername });
  if (dbAdmin) {
    const isMatch = await dbAdmin.matchPassword(cleanPassword);
    if (isMatch) {
      return {
        _id: dbAdmin._id,
        username: dbAdmin.username,
        role: dbAdmin.role,
        district: dbAdmin.district,
        assemblyName: dbAdmin.assemblyName,
        boothNo: dbAdmin.boothNo,
        tokenVersion: dbAdmin.tokenVersion || 1
      };
    }
  }

  // 2. Initial On-Demand Seeding for Valid Jurisdiction Passcodes
  const assemblies = await getAssemblyMetadata();
  const districts = Object.values(districtCache || {});

  // Check Booth Admin Username format: e.g. gummidipoondi_b1 or ass33_b1
  const boothMatch = cleanUsername.match(/^([a-z0-9]+)_b([0-9]+)$/);
  if (boothMatch) {
    const slug = boothMatch[1];
    const boothNo = boothMatch[2];
    const targetAssembly = assemblies.find(a => a.slug === slug || `ass${a.assemblyNo}` === slug);

    if (targetAssembly) {
      const initialSeedPassword = process.env.BOOTH_ADMIN_DEFAULT_PASSWORD || `BJP@Booth${boothNo}#2026`;
      if (cleanPassword === initialSeedPassword) {
        const newAdmin = await Admin.create({
          username: cleanUsername,
          password: cleanPassword,
          role: 'BOOTH_ADMIN',
          district: targetAssembly.district,
          assemblyName: targetAssembly.assemblyName,
          boothNo: String(boothNo),
          createdBy: 'AUTO_JURISDICTION_SEED'
        });
        return {
          _id: newAdmin._id,
          username: newAdmin.username,
          role: newAdmin.role,
          district: newAdmin.district,
          assemblyName: newAdmin.assemblyName,
          boothNo: newAdmin.boothNo,
          tokenVersion: newAdmin.tokenVersion || 1
        };
      }
    }
  }

  // Check Assembly Admin Username format: e.g. gummidipoondi_admin or ass33_admin
  const assMatch = cleanUsername.match(/^([a-z0-9]+)_admin$/);
  if (assMatch) {
    const slug = assMatch[1];
    const targetAssembly = assemblies.find(a => a.slug === slug || `ass${a.assemblyNo}` === slug);

    if (targetAssembly) {
      const initialSeedPassword = process.env.ASSEMBLY_ADMIN_DEFAULT_PASSWORD || `BJP@Ass${targetAssembly.assemblyNo}#2026`;
      if (cleanPassword === initialSeedPassword) {
        const newAdmin = await Admin.create({
          username: cleanUsername,
          password: cleanPassword,
          role: 'ASSEMBLY_ADMIN',
          district: targetAssembly.district,
          assemblyName: targetAssembly.assemblyName,
          boothNo: null,
          createdBy: 'AUTO_JURISDICTION_SEED'
        });
        return {
          _id: newAdmin._id,
          username: newAdmin.username,
          role: newAdmin.role,
          district: newAdmin.district,
          assemblyName: newAdmin.assemblyName,
          boothNo: null,
          tokenVersion: newAdmin.tokenVersion || 1
        };
      }
    }
  }

  // Check District Admin Username format: e.g. thiruvallur_admin or chengalpattu_admin
  const distObj = districts.find(d => d.username.toLowerCase() === cleanUsername);
  if (distObj) {
    const initialSeedPassword = process.env.DISTRICT_ADMIN_DEFAULT_PASSWORD || `BJP@Dist${cleanSlug(distObj.district)}#2026`;
    if (cleanPassword === initialSeedPassword) {
      const newAdmin = await Admin.create({
        username: cleanUsername,
        password: cleanPassword,
        role: 'DISTRICT_ADMIN',
        district: distObj.district,
        assemblyName: null,
        boothNo: null,
        createdBy: 'AUTO_JURISDICTION_SEED'
      });
      return {
        _id: newAdmin._id,
        username: newAdmin.username,
        role: newAdmin.role,
        district: newAdmin.district,
        assemblyName: null,
        boothNo: null,
        tokenVersion: newAdmin.tokenVersion || 1
      };
    }
  }

  return null;
};

// Get total voter roll count for entire state
const getStateVoterRollCount = async () => {
  await getAssemblyMetadata();
  return Object.values(districtVoterCount).reduce((sum, count) => sum + count, 0);
};

// Get cached voter roll count for a district (instant — populated at server startup)
const getDistrictVoterRollCount = async (district) => {
  const assemblies = await getAssemblyMetadata(); // ensures cache is built
  if (!district) return null;
  const matched = assemblies.filter(
    a => a.district.toUpperCase() === district.toUpperCase()
  );
  if (matched.length === 0) return null;
  return matched.reduce((sum, a) => sum + (assemblyVoterCount[a.assemblyName.toUpperCase()] || 0), 0);
};

// Get cached voter roll count for an assembly (instant)
const getAssemblyVoterRollCount = async (assemblyName) => {
  await getAssemblyMetadata();
  if (!assemblyName) return null;
  return assemblyVoterCount[assemblyName.toUpperCase()] || null;
};

// Get collections for a district (for other uses)
const getCollectionsForDistrict = async (district) => {
  await getAssemblyMetadata();
  if (!district) return [];
  const key = Object.keys(districtCollectionMap).find(
    k => k.toUpperCase() === district.toUpperCase()
  );
  return key ? districtCollectionMap[key] : [];
};

// Get collection name for an assembly
const getCollectionForAssembly = async (assemblyName) => {
  const assemblies = await getAssemblyMetadata();
  const match = assemblies.find(
    a => a.assemblyName.toUpperCase() === (assemblyName || '').toUpperCase()
  );
  return match ? [match.colName] : [];
};

// Get cached voter roll count for a booth (batch aggregates full assembly once for 100% instant cached hits)
let assemblyBoothCached = new Set();

const getBoothVoterRollCount = async (assemblyName, boothNo) => {
  if (!assemblyName || !boothNo) return null;
  const assKey = assemblyName.toUpperCase();
  const cacheKey = `${assKey}::${String(boothNo)}`;

  if (boothVoterCountCache[cacheKey] !== undefined) {
    return boothVoterCountCache[cacheKey];
  }

  try {
    const assemblies = await getAssemblyMetadata();
    const match = assemblies.find(a => a.assemblyName.toUpperCase() === assKey);
    if (!match) return null;

    const voterDb = await getVoterDbClient();

    if (!assemblyBoothCached.has(match.colName)) {
      assemblyBoothCached.add(match.colName);
      const counts = await voterDb.collection(match.colName).aggregate([
        { $group: { _id: '$PART_NO', count: { $sum: 1 } } }
      ], { allowDiskUse: true }).toArray();

      counts.forEach(c => {
        if (c._id !== null && c._id !== undefined) {
          boothVoterCountCache[`${assKey}::${String(c._id)}`] = c.count;
        }
      });
    }

    return boothVoterCountCache[cacheKey] || null;
  } catch (err) {
    console.error('[getBoothVoterRollCount Error]:', err.message);
    return null;
  }
};

module.exports = {
  getAssemblyMetadata,
  getDistrictCredentialsList,
  getAssemblyCredentialsList,
  getBoothCredentialsForAssembly,
  authenticateDynamicAdmin,
  getCollectionsForDistrict,
  getCollectionForAssembly,
  getDistrictVoterRollCount,
  getAssemblyVoterRollCount,
  getBoothVoterRollCount,
  getStateVoterRollCount
};

