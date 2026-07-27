const { getVoterDbClient } = require('../config/db');

/**
 * Fast Parallel Batch Search for EPIC across 234 Assembly Collections.
 * Instead of searching 234 collections sequentially (taking 15+ seconds),
 * this queries collections in parallel batches of 35 concurrently,
 * finding the voter record in ~200ms.
 */
const findVoterByEpic = async (epicNo, batchSize = 35) => {
  if (!epicNo) return null;
  const cleanEpic = epicNo.trim().toUpperCase();
  const voterDb = await getVoterDbClient();
  const collections = await voterDb.listCollections().toArray();
  const assCols = collections.filter(c => c.name.startsWith('ass_'));

  for (let i = 0; i < assCols.length; i += batchSize) {
    const batch = assCols.slice(i, i + batchSize);
    const promises = batch.map(col =>
      voterDb.collection(col.name)
        .findOne({ EPIC_NO: cleanEpic })
        .then(doc => (doc ? { doc, colName: col.name } : null))
        .catch(() => null)
    );

    const results = await Promise.all(promises);
    const match = results.find(r => r !== null);
    if (match) {
      return match;
    }
  }

  return null;
};

module.exports = {
  findVoterByEpic
};
