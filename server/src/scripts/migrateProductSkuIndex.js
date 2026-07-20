const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { canonicalizeSku } = require('../utils/sku');

const CANONICAL_SKU_INDEX = Object.freeze({
  unique: true,
  partialFilterExpression: { sku: { $type: 'string', $gt: '' } },
  name: 'sku_1',
});

function isCanonicalSkuIndex(index) {
  return Boolean(
    index &&
      index.name === CANONICAL_SKU_INDEX.name &&
      JSON.stringify(index.key) === JSON.stringify({ sku: 1 }) &&
      index.unique === true &&
      index.sparse !== true &&
      JSON.stringify(index.partialFilterExpression) === JSON.stringify(CANONICAL_SKU_INDEX.partialFilterExpression)
  );
}

function findCanonicalSkuDuplicates(products) {
  const productIdsBySku = new Map();

  for (const product of products) {
    const sku = canonicalizeSku(product.sku);
    if (!sku) continue;
    const ids = productIdsBySku.get(sku) || [];
    ids.push(String(product._id));
    productIdsBySku.set(sku, ids);
  }

  return [...productIdsBySku.entries()]
    .filter(([, productIds]) => productIds.length > 1)
    .map(([sku, productIds]) => ({ sku, productIds }));
}

function duplicateSkuError(duplicates) {
  const [duplicate] = duplicates;
  return new Error(`Duplicate canonical product SKU "${duplicate.sku}" for product IDs: ${duplicate.productIds.join(', ')}`);
}

async function migrateProductSkuIndex({ collection }) {
  if (!collection) throw new Error('A products collection is required');

  const products = await collection.find({}, { projection: { _id: 1, sku: 1 } }).toArray();
  const duplicates = findCanonicalSkuDuplicates(products);
  if (duplicates.length) throw duplicateSkuError(duplicates);

  const operations = products.flatMap((product) => {
    const sku = canonicalizeSku(product.sku);
    return product.sku === sku
      ? []
      : [{ updateOne: { filter: { _id: product._id }, update: { $set: { sku } } } }];
  });
  if (operations.length) await collection.bulkWrite(operations, { ordered: true });

  const skuIndex = (await collection.indexes()).find((index) => index.name === CANONICAL_SKU_INDEX.name);
  if (isCanonicalSkuIndex(skuIndex)) {
    return { scanned: products.length, canonicalized: operations.length, indexReplaced: false, indexCreated: false };
  }

  const indexReplaced = Boolean(skuIndex);
  if (skuIndex) await collection.dropIndex(CANONICAL_SKU_INDEX.name);
  await collection.createIndex({ sku: 1 }, CANONICAL_SKU_INDEX);

  return { scanned: products.length, canonicalized: operations.length, indexReplaced, indexCreated: true };
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
  CANONICAL_SKU_INDEX,
  canonicalizeSku,
  duplicateSkuError,
  findCanonicalSkuDuplicates,
  isCanonicalSkuIndex,
  migrateProductSkuIndex,
};
