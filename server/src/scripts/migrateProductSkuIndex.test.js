const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  CANONICAL_SKU_INDEX,
  CANONICAL_SKU_BATCH_SIZE,
  buildCanonicalSkuExpression,
  buildDuplicateCanonicalSkuPipeline,
  canonicalizeSku,
  migrateProductSkuIndex,
} = require('./migrateProductSkuIndex');

function asyncCursor(items, nextError) {
  return {
    async next() {
      if (nextError) throw nextError;
      return items.shift() || null;
    },
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield { ...item };
    },
  };
}

function createCollection({ products = [], indexes = [], duplicateChecks = [], aggregateErrors = [], createIndexError } = {}) {
  const calls = { events: [], aggregate: [], find: [], bulkWrite: [], createIndex: [], dropIndex: [] };

  return {
    calls,
    aggregate(pipeline, options) {
      calls.aggregate.push({ pipeline, options });
      return asyncCursor([...(duplicateChecks.shift() || [])], aggregateErrors.shift());
    },
    find(query, options) {
      calls.find.push({ query, options });
      return asyncCursor(products.map((product) => ({ ...product })));
    },
    async bulkWrite(operations, options) {
      calls.bulkWrite.push({ operations, options });
    },
    async indexes() {
      return indexes.map((index) => ({ ...index }));
    },
    async createIndex(key, options) {
      calls.events.push('createIndex');
      calls.createIndex.push({ key, options });
      if (createIndexError) throw createIndexError;
      return options.name;
    },
    async dropIndex(name) {
      calls.events.push('dropIndex');
      calls.dropIndex.push(name);
    },
  };
}

describe('migrateProductSkuIndex', () => {
  it('builds a bounded null-safe canonical SKU duplicate aggregation pipeline', () => {
    assert.deepEqual(buildCanonicalSkuExpression(), {
      $toUpper: {
        $trim: {
          input: { $convert: { input: '$sku', to: 'string', onError: '', onNull: '' } },
        },
      },
    });
    assert.deepEqual(buildDuplicateCanonicalSkuPipeline(), [
      { $project: { _id: 1, canonicalSku: buildCanonicalSkuExpression() } },
      { $match: { canonicalSku: { $gt: '' } } },
      { $group: { _id: '$canonicalSku', firstProductId: { $first: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $project: { _id: 0, sku: '$_id', firstProductId: 1, count: 1 } },
      { $limit: 1 },
    ]);
    assert.equal(JSON.stringify(buildDuplicateCanonicalSkuPipeline()).includes('$push'), false);
  });

  it('aborts an initial aggregate duplicate check before reads, writes, or index changes', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-002' }],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, sparse: true }],
      duplicateChecks: [[{ sku: 'SKU-001', firstProductId: 'product-1', count: 2 }]],
    });

    await assert.rejects(
      () => migrateProductSkuIndex({ collection }),
      /Duplicate canonical product SKU "SKU-001".*firstProductId: product-1.*count: 2/
    );
    assert.equal(collection.calls.aggregate.length, 1);
    assert.deepEqual(collection.calls.aggregate.map(({ options }) => options), [{ allowDiskUse: true }]);
    assert.deepEqual(collection.calls.find, []);
    assert.deepEqual(collection.calls.bulkWrite, []);
    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('canonicalizes through cursor-backed fixed-size bulk write batches', async () => {
    const products = Array.from({ length: CANONICAL_SKU_BATCH_SIZE + 1 }, (_, index) => ({
      _id: `product-${index}`,
      sku: ` sku-${index} `,
    }));
    const collection = createCollection({ products, duplicateChecks: [[], []] });

    const result = await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.bulkWrite.map(({ operations, options }) => [operations.length, options]), [
      [CANONICAL_SKU_BATCH_SIZE, { ordered: true }],
      [1, { ordered: true }],
    ]);
    assert.equal(collection.calls.bulkWrite[0].operations[0].updateOne.update.$set.sku, 'SKU-0');
    assert.equal(collection.calls.aggregate.length, 2);
    assert.deepEqual(collection.calls.aggregate.map(({ options }) => options), [
      { allowDiskUse: true },
      { allowDiskUse: true },
    ]);
    assert.deepEqual(collection.calls.createIndex, [{ key: { sku: 1 }, options: CANONICAL_SKU_INDEX }]);
    assert.deepEqual(result, {
      scanned: CANONICAL_SKU_BATCH_SIZE + 1,
      canonicalized: CANONICAL_SKU_BATCH_SIZE + 1,
      duplicateChecks: 2,
      indexCreated: true,
      legacyIndexDropped: false,
    });
  });

  it('preserves the legacy index when the post-canonicalization duplicate check finds a race', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: ' sku-001 ' }],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, sparse: true }],
      duplicateChecks: [[], [{ sku: 'SKU-001', firstProductId: 'product-1', count: 2 }]],
    });

    await assert.rejects(() => migrateProductSkuIndex({ collection }), /Duplicate canonical product SKU/);
    assert.equal(collection.calls.bulkWrite.length, 1);
    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('propagates a recheck aggregate failure before creating or dropping indexes', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: ' sku-001 ' }],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, sparse: true }],
      duplicateChecks: [[], []],
      aggregateErrors: [null, new Error('aggregate recheck failed')],
    });

    await assert.rejects(() => migrateProductSkuIndex({ collection }), /aggregate recheck failed/);
    assert.deepEqual(collection.calls.aggregate.map(({ options }) => options), [
      { allowDiskUse: true },
      { allowDiskUse: true },
    ]);
    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('creates the versioned index before dropping a legacy SKU index', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, unique: false, sparse: true }],
      duplicateChecks: [[], []],
    });

    const result = await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, [{ key: { sku: 1 }, options: CANONICAL_SKU_INDEX }]);
    assert.deepEqual(collection.calls.dropIndex, ['sku_1']);
    assert.deepEqual(collection.calls.events, ['createIndex', 'dropIndex']);
    assert.deepEqual(result, {
      scanned: 1,
      canonicalized: 0,
      duplicateChecks: 2,
      indexCreated: true,
      legacyIndexDropped: true,
    });
  });

  it('preserves the legacy index when creation of the new index fails', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, sparse: true }],
      duplicateChecks: [[], []],
      createIndexError: new Error('unique index build failed'),
    });

    await assert.rejects(() => migrateProductSkuIndex({ collection }), /unique index build failed/);
    assert.equal(collection.calls.createIndex.length, 1);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('drops only the legacy SKU index when the new canonical index already exists', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: [
        { name: 'sku_1', key: { sku: 1 }, sparse: true },
        { name: 'product_sku_unique_v2', key: { sku: 1 }, ...CANONICAL_SKU_INDEX },
        { name: 'unrelated_1', key: { categoryId: 1 } },
      ],
      duplicateChecks: [[], []],
    });

    const result = await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, ['sku_1']);
    assert.deepEqual(result, {
      scanned: 1,
      canonicalized: 0,
      duplicateChecks: 2,
      indexCreated: false,
      legacyIndexDropped: true,
    });
  });

  it('does not drop an unrelated index that happens to use the legacy name', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: [
        { name: 'sku_1', key: { categoryId: 1 } },
        { name: 'product_sku_unique_v2', key: { sku: 1 }, ...CANONICAL_SKU_INDEX },
      ],
      duplicateChecks: [[], []],
    });

    await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('is idempotent when only the correct versioned index exists', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: [{ name: 'product_sku_unique_v2', key: { sku: 1 }, ...CANONICAL_SKU_INDEX }],
      duplicateChecks: [[], []],
    });

    const result = await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
    assert.deepEqual(result, {
      scanned: 1,
      canonicalized: 0,
      duplicateChecks: 2,
      indexCreated: false,
      legacyIndexDropped: false,
    });
  });

  it('canonicalizes null and non-string SKU values consistently', () => {
    assert.equal(canonicalizeSku('  sku-001  '), 'SKU-001');
    assert.equal(canonicalizeSku('   '), '');
    assert.equal(canonicalizeSku(null), '');
    assert.equal(canonicalizeSku(undefined), '');
    assert.equal(canonicalizeSku(123), '123');
  });
});
