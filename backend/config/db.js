const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

// App Write Database Connection (Mongoose)
const connectAppDb = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_APP_URL, {
      dbName: 'bjp_nalam_thittam_db'
    });
    console.log(`[App DB] Connected successfully to Mongoose: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[App DB Connection Error]: ${error.message}`);
    process.exit(1);
  }
};

// Voter Read-Only Database Client (Native MongoDB Client for fast cross-collection queries)
let voterClient = null;

const getVoterDbClient = async () => {
  if (!voterClient) {
    voterClient = new MongoClient(process.env.MONGO_VOTER_URL);
    await voterClient.connect();
    console.log('[Voter DB] Native MongoClient connected');
  }
  return voterClient.db(process.env.MONGO_VOTER_DB_NAME || 'voter_db');
};

module.exports = {
  connectAppDb,
  getVoterDbClient
};
