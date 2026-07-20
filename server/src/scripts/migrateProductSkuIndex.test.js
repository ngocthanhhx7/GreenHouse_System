const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  CANONICAL_SKU_INDEX,
  canonicalizeSku,
  migrateProductSkuIndex,
} = require('./migrateProductSkuIndex');

function createCollection({ products = [], indexes = [] } = {}) {
  const calls = {
    bulkWrite: [],
    createIndex: [],
    dropIndex: [],
  };

  return {
    calls,
    find() {
      return {
        async toArray() {
          return products.map((product) => ({ ...product }));
        },
      };
    },
    async bulkWrite(operations) {
      calls.bulkWrite.push(operations);
    },
    async indexes() {
      return indexes.map((index) => ({ ...index }));
    },
    async dropIndex(name) {
      calls.dropIndex.push(name);
    },
    async createIndex(key, options) {
      calls.createIndex.push({ key, options });
      return options.name;
    },
  };
}

describe('migrateProductSkuIndex', () => {
  it('canonicalizes values by trimming and uppercasing while preserving blank values as empty strings', () => {
    assert.equal(canonicalizeSku('  sku-001  '), 'SKU-001');
    assert.equal(canonicalizeSku('   '), '');
    assert.equal(canonicalizeSku(null), '');
    assert.equal(canonicalizeSku(undefined), '');
  });

  it('aborts duplicate canonical SKUs before any database mutation', async () => {
    const collection = createCollection({
      products: [
        { _id: 'product-1', sku: ' sku-001 ' },
        { _id: 'product-2', sku: 'SKU-001' },
      ],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, sparse: true }],
    });

    await assert.rejects(
      () => migrateProductSkuIndex({ collection }),
      /Duplicate canonical product SKU "SKU-001" for product IDs: product-1, product-2/
    );
    assert.deepEqual(collection.calls, { bulkWrite: [], createIndex: [], dropIndex: [] });
  });

  it('updates SKU values to their canonical form before replacing a legacy sku_1 index', async () => {
    const collection = createCollection({
      products: [
        { _id: 'product-1', sku: ' sku-001 ' },
        { _id: 'product-2', sku: undefined },
      ],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, unique: false, sparse: true }],
    });

    const result = await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls.bulkWrite, [[
      { updateOne: { filter: { _id: 'product-1' }, update: { $set: { sku: 'SKU-001' } } } },
      { updateOne: { filter: { _id: 'product-2' }, update: { $set: { sku: '' } } } },
    ]]);
    assert.deepEqual(collection.calls.dropIndex, ['sku_1']);
    assert.deepEqual(collection.calls.createIndex, [{
      key: { sku: 1 },
      options: {
        unique: true,
        partialFilterExpression: { sku: { $type: 'string', $gt: '' } },
        name: 'sku_1',
      },
    }]);
    assert.deepEqual(result, { scanned: 2, canonicalized: 2, indexReplaced: true, indexCreated: true });
  });

  it('does not mutate a collection that already has canonical SKU values and the required index', async () => {
    const collection = createCollection({
      products: [{ _id: 'product-1', sku: 'SKU-001' }, { _id: 'product-2', sku: '' }],
      indexes: [{ name: 'sku_1', key: { sku: 1 }, ...CANONICAL_SKU_INDEX }],
    });

    const result = await migrateProductSkuIndex({ collection });

    assert.deepEqual(collection.calls, { bulkWrite: [], createIndex: [], dropIndex: [] });
    assert.deepEqual(result, { scanned: 2, canonicalized: 0, indexReplaced: false, indexCreated: false });
  });
});
