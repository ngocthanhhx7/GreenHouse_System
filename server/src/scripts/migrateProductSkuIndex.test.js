const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const Product = require('../models/product.model');

const {
  CANONICAL_SKU_INDEX,
  CANONICAL_SKU_BATCH_SIZE,
  buildCanonicalSkuExpression,
  buildDuplicateCanonicalSkuPipeline,
  canonicalizeSku,
  listProductIndexes,
  migrateProductSkuIndex,
} = require('./migrateProductSkuIndex');

const PRODUCT_SCHEMA_INDEXES = Product.schema.indexes();

function indexName(key) {
  return Object.entries(key)
    .map(([field, direction]) => `${field}_${direction}`)
    .join('_');
}

function schemaIndexMetadata({ textWeights } = {}) {
  return PRODUCT_SCHEMA_INDEXES.map(([key, options]) => {
    if (Object.values(key).includes('text')) {
      return {
        key: { _fts: 'text', _ftsx: 1 },
        name: options.name || indexName(key),
        weights: textWeights || Object.fromEntries(Object.keys(key).map((field) => [field, 1])),
        ...options,
      };
    }

    return {
      key,
      name: options.name || indexName(key),
      ...options,
    };
  });
}

function schemaIndexCreateCalls() {
  const skuIndex = PRODUCT_SCHEMA_INDEXES.find(([key]) => key.sku === 1);
  return [skuIndex, ...PRODUCT_SCHEMA_INDEXES.filter(([key]) => key.sku !== 1)].map(([key, options]) => ({ key, options }));
}

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

function createCollection({ products = [], indexes = [], indexesError, duplicateChecks = [], aggregateErrors = [], createIndexError } = {}) {
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
      if (indexesError) throw indexesError;
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
  it('treats a NamespaceNotFound code name as an empty product index list', async () => {
    const collection = createCollection({
      indexesError: Object.assign(new Error('ns does not exist'), { codeName: 'NamespaceNotFound' }),
    });

    assert.deepEqual(await listProductIndexes(collection), []);
  });

  it('provisions every Product schema index when products has not been created yet', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexesError: Object.assign(new Error('ns does not exist'), { code: 26 }),
      duplicateChecks: [[], []],
    });

    await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, schemaIndexCreateCalls());
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('propagates index-listing errors other than NamespaceNotFound', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexesError: Object.assign(new Error('index listing unavailable'), { code: 13 }),
      duplicateChecks: [[], []],
    });

    await assert.rejects(() => migrateProductSkuIndex({ collection }), /index listing unavailable/);
    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('leaves existing Product schema supporting indexes and unrelated indexes intact', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: [...schemaIndexMetadata(), { name: 'unrelated_1', key: { stockQuantity: 1 } }],
      duplicateChecks: [[], []],
    });

    await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('does not recreate a text index whose Mongo weights are returned in reverse field order', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: schemaIndexMetadata({ textWeights: { description: 1, name: 1 } }),
      duplicateChecks: [[], []],
    });

    await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

  it('does not recreate an existing weighted text index with the expected name and description fields', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: schemaIndexMetadata({ textWeights: { description: 1, name: 10 } }),
      duplicateChecks: [[], []],
    });

    await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.createIndex, []);
    assert.deepEqual(collection.calls.dropIndex, []);
  });

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
    assert.deepEqual(collection.calls.createIndex, schemaIndexCreateCalls());
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

    assert.deepEqual(collection.calls.createIndex, schemaIndexCreateCalls());
    assert.deepEqual(collection.calls.dropIndex, ['sku_1']);
    assert.equal(collection.calls.events[0], 'createIndex');
    assert.equal(collection.calls.events.at(-1), 'dropIndex');
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
        ...schemaIndexMetadata(),
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

  it('is idempotent when every Product schema index exists', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }],
      indexes: schemaIndexMetadata(),
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
