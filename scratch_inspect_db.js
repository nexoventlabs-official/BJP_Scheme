const { getVoterDbClient } = require('./config/db');
require('dotenv').config();

async function run() {
  const db = await getVoterDbClient();
  const col = db.collection('ass_11');
  const count = await col.countDocuments({ PART_NO: '1' });
  console.log('--- ASS_11 (Dr.Radhakrishnan Nagar) BOOTH 1 VOTER COUNT ---', count);

  const voters = await col.find({ PART_NO: '1' }).limit(10).toArray();

  console.log('Sample Voters in Dr.Radhakrishnan Nagar Booth 1:');
  voters.forEach((v, idx) => {
    console.log(`\nVoter #${idx + 1}:`);
    console.log(JSON.stringify(v, null, 2));
  });

  // Check if any voter document in ass_11 has door / house number or father/spouse name in any field
  const sampleAny = await col.findOne({});
  console.log('\n--- ALL DOCUMENT KEYS IN ASS_11 ---');
  console.log(Object.keys(sampleAny || {}));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
