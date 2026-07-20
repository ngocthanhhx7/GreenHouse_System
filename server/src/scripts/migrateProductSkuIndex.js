const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { canonicalizeSku } = require('../utils/sku');

const CANONICAL_SKU_BATCH_SIZE = 500;
const LEGACY_SKU_INDEX_NAME = 'sku_1';
const CANONICAL_SKU_INDEX = Object.freeze({
  unique: true,
  partialFilterExpression: { sku: { $type: 'string', $gt: '' } },
  name: 'product_sku_unique_v2',
});

function buildCanonicalSkuExpression() {
  return {
    $toUpper: {
      $trim: {
        input: { $convert: { input: '$sku', to: 'string', onError: '', onNull: '' } },
      },
    },
  };
}

function buildDuplicateCanonicalSkuPipeline() {
  return [
    { $project: { _id: 1, canonicalSku: buildCanonicalSkuExpression() } },
    { $match: { canonicalSku: { $gt: '' } } },
    { $group: { _id: '$canonicalSku', firstProductId: { $first: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 0, sku: '$_id', firstProductId: 1, count: 1 } },
    { $limit: 1 },
  ];
}

function hasSkuKey(index) {
  return JSON.stringify(index?.key) === JSON.stringify({ sku: 1 });
}

function isCanonicalSkuIndex(index) {
  return Boolean(
    index &&
      index.name === CANONICAL_SKU_INDEX.name &&
      hasSkuKey(index) &&
      index.unique === true &&
      index.sparse !== true &&
      JSON.stringify(index.partialFilterExpression) === JSON.stringify(CANONICAL_SKU_INDEX.partialFilterExpression)
  );
}

function isLegacySkuIndex(index) {
  return Boolean(index && index.name === LEGACY_SKU_INDEX_NAME && hasSkuKey(index));
}

function duplicateSkuError(duplicate) {
  return new Error(
    `Duplicate canonical product SKU "${duplicate.sku}" (firstProductId: ${String(duplicate.firstProductId)}, count: ${duplicate.count})`
  );
}

async function findFirstCanonicalSkuDuplicate(collection) {
  return collection.aggregate(buildDuplicateCanonicalSkuPipeline(), { allowDiskUse: true }).next();
}

async function canonicalizeProductSkus(collection) {
  let scanned = 0;
  let canonicalized = 0;
  let operations = [];
  const cursor = collection.find({}, { projection: { _id: 1, sku: 1 } });

  for await (const product of cursor) {
    scanned += 1;
    const sku = canonicalizeSku(product.sku);
    if (product.sku === sku) continue;

    operations.push({ updateOne: { filter: { _id: product._id }, update: { $set: { sku } } } });
    canonicalized += 1;

    if (operations.length === CANONICAL_SKU_BATCH_SIZE) {
      await collection.bulkWrite(operations, { ordered: true });
      operations = [];
    }
  }

  if (operations.length) await collection.bulkWrite(operations, { ordered: true });
  return { scanned, canonicalized };
}

async function migrateProductSkuIndex({ collection }) {
  if (!collection) throw new Error('A products collection is required');

  const initialDuplicate = await findFirstCanonicalSkuDuplicate(collection);
  if (initialDuplicate) throw duplicateSkuError(initialDuplicate);

  const { scanned, canonicalized } = await canonicalizeProductSkus(collection);

  const postCanonicalizationDuplicate = await findFirstCanonicalSkuDuplicate(collection);
  if (postCanonicalizationDuplicate) throw duplicateSkuError(postCanonicalizationDuplicate);

  const indexes = await collection.indexes();
  const canonicalSkuIndex = indexes.find(isCanonicalSkuIndex);
  const legacySkuIndex = indexes.find(isLegacySkuIndex);
  let indexCreated = false;
  let legacyIndexDropped = false;

  if (!canonicalSkuIndex) {
    await collection.createIndex({ sku: 1 }, CANONICAL_SKU_INDEX);
    indexCreated = true;
  }

  if (legacySkuIndex) {
    await collection.dropIndex(LEGACY_SKU_INDEX_NAME);
    legacyIndexDropped = true;
  }

  return {
    scanned,
    canonicalized,
    duplicateChecks: 2,
    indexCreated,
    legacyIndexDropped,
  };
}

async function runCli() {
  require('dotenv').config();
  await connectDatabase();
  const result = await migrateProductSkuIndex({ collection: mongoose.connection.collection('products') });
  console.log('Product SKU index migration completed.');
  console.table([result]);
  await mongoose.disconnect();
}

if (require.main === module) {
  runCli().catch(async (error) => {
    console.error('Product SKU index migration failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  CANONICAL_SKU_BATCH_SIZE,
  CANONICAL_SKU_INDEX,
  buildCanonicalSkuExpression,
  buildDuplicateCanonicalSkuPipeline,
  canonicalizeSku,
  duplicateSkuError,
  findFirstCanonicalSkuDuplicate,
  isCanonicalSkuIndex,
  isLegacySkuIndex,
  migrateProductSkuIndex,
};
