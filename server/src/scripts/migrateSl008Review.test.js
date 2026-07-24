const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

let migration = {};
try {
  migration = require('./migrateSl008Review');
} catch (_error) {
  // RED starts with the production migration absent.
}

const REQUIRED_INDEX_NAMES = [
  'review_customer_product_unique',
  'review_public_visibility_page',
  'review_customer_management_page',
  'review_content_history_version_unique',
  'review_content_history_chronological',
  'review_publication_history_version_unique',
  'review_publication_history_chronological',
  'review_moderation_history_version_unique',
  'review_moderation_history_chronological',
  'review_command_actor_key_unique',
];

function clone(value) {
  return structuredClone(value);
}

class MemoryCollection {
  constructor(name, documents = [], indexes = [], operations = []) {
    this.name = name;
    this.documents = clone(documents);
    this.indexes = clone([
      { name: '_id_', key: { _id: 1 }, unique: true },
      ...indexes,
    ]);
    this.operations = operations;
  }

  find() {
    return {
      toArray: async () => clone(this.documents),
    };
  }

  listIndexes() {
    return {
      toArray: async () => clone(this.indexes),
    };
  }

  async createIndex(key, options) {
    this.operations.push({ type: 'createIndex', collection: this.name, key, options });
    this.indexes.push({ name: options.name, key: clone(key), unique: Boolean(options.unique) });
    return options.name;
  }

  async dropIndex(name) {
    this.operations.push({ type: 'dropIndex', collection: this.name, name });
    this.indexes = this.indexes.filter((index) => index.name !== name);
  }

  async updateOne(filter, update, options) {
    this.operations.push({
      type: 'updateOne',
      collection: this.name,
      filter: clone(filter),
      update: clone(update),
      options: clone(options),
    });
    const document = this.documents.find((item) => String(item._id) === String(filter._id));
    if (!document) return { modifiedCount: 0 };
    Object.assign(document, clone(update.$set || {}));
    return { modifiedCount: 1 };
  }
}

function legacyFixture(mutator = () => {}) {
  const operations = [];
  const createdAt = new Date('2026-01-02T03:04:05.000Z');
  const updatedAt = new Date('2026-01-03T04:05:06.000Z');
  const data = {
    reviews: [{
      _id: 'review-1',
      customerId: 'customer-1',
      productId: 'product-1',
      orderId: 'order-1',
      rating: 5,
      content: 'A proven immutable review',
      status: 'Visible',
      createdAt,
      updatedAt,
    }],
    orders: [{
      _id: 'order-1',
      customerId: 'customer-1',
      deliveredAt: new Date('2026-01-01T00:00:00.000Z'),
    }],
    orderDetails: [{
      _id: 'detail-1',
      orderId: 'order-1',
      productId: 'product-1',
    }],
    contentHistories: [{
      _id: 'content-history-1',
      reviewId: 'review-1',
      actorId: 'customer-1',
      version: 1,
      rating: 5,
      content: 'A proven immutable review',
      createdAt,
    }],
    publicationHistories: [],
    moderationHistories: [],
    commands: [],
  };
  mutator(data);
  const legacyIndexes = [{
    name: 'customerId_1_orderId_1_productId_1',
    key: { customerId: 1, orderId: 1, productId: 1 },
    unique: true,
  }];
  const collections = {
    reviews: new MemoryCollection('reviews', data.reviews, legacyIndexes, operations),
    orders: new MemoryCollection('orders', data.orders, [], operations),
    orderDetails: new MemoryCollection('orderDetails', data.orderDetails, [], operations),
    contentHistories: new MemoryCollection(
      'contentHistories',
      data.contentHistories,
      [],
      operations,
    ),
    publicationHistories: new MemoryCollection(
      'publicationHistories',
      data.publicationHistories,
      [],
      operations,
    ),
    moderationHistories: new MemoryCollection(
      'moderationHistories',
      data.moderationHistories,
      [],
      operations,
    ),
    commands: new MemoryCollection('commands', data.commands, [], operations),
  };
  return { collections, operations, createdAt, updatedAt };
}

function emptyFixture() {
  const fixture = legacyFixture((data) => {
    data.reviews = [];
    data.orders = [];
    data.orderDetails = [];
    data.contentHistories = [];
  });
  return fixture;
}

function repositoryFor(fixture) {
  return migration.createMigrationRepository({ collections: fixture.collections });
}

function mutations(operations) {
  return operations.filter((operation) => (
    operation.type === 'updateOne'
    || operation.type === 'createIndex'
    || operation.type === 'dropIndex'
  ));
}

describe('SL-008 Review-only migration', () => {
  it('exposes the Review-only production migration command', () => {
    const packageJson = require('../../package.json');
    assert.equal(
      packageJson.scripts['migrate:sl008-review'],
      'node src/scripts/migrateSl008Review.js',
    );
  });

  it('exports the ten locked Review indexes and migration seams', () => {
    assert.equal(typeof migration.createMigrationRepository, 'function');
    assert.equal(typeof migration.migrateSl008Review, 'function');
    assert.equal(typeof migration.runCli, 'function');
    assert.equal(typeof migration.formatDiagnostic, 'function');
    assert.deepEqual(
      migration.REQUIRED_INDEXES.map((index) => index.name),
      REQUIRED_INDEX_NAMES,
    );
  });

  it('fails duplicate, Hidden, evidence, owner, delivery, and history preflights before any mutation', async () => {
    const cases = [
      {
        name: 'duplicate Customer+Product identity',
        code: 'SL008_REVIEW_DUPLICATE_IDENTITY',
        mutate(data) {
          data.reviews.push({ ...clone(data.reviews[0]), _id: 'review-2', orderId: 'order-2' });
        },
      },
      {
        name: 'legacy Hidden ambiguity',
        code: 'SL008_REVIEW_HIDDEN_AMBIGUOUS',
        mutate(data) { data.reviews[0].status = 'Hidden'; },
      },
      {
        name: 'zero matching OrderDetails',
        code: 'SL008_REVIEW_EVIDENCE_COUNT',
        mutate(data) { data.orderDetails = []; },
      },
      {
        name: 'multiple matching OrderDetails',
        code: 'SL008_REVIEW_EVIDENCE_COUNT',
        mutate(data) {
          data.orderDetails.push({ ...data.orderDetails[0], _id: 'detail-2' });
        },
      },
      {
        name: 'mismatched canonical OrderDetail',
        code: 'SL008_REVIEW_EVIDENCE_MISMATCH',
        mutate(data) {
          Object.assign(data.reviews[0], {
            orderDetailId: 'detail-1',
            publicationStatus: 'Published',
            moderationStatus: 'Allowed',
            version: 1,
          });
          data.orderDetails[0].productId = 'other-product';
        },
      },
      {
        name: 'foreign owner',
        code: 'SL008_REVIEW_OWNER_MISMATCH',
        mutate(data) { data.orders[0].customerId = 'other-customer'; },
      },
      {
        name: 'missing deliveredAt',
        code: 'SL008_REVIEW_DELIVERY_UNPROVEN',
        mutate(data) { data.orders[0].deliveredAt = null; },
      },
      {
        name: 'missing immutable history',
        code: 'SL008_REVIEW_HISTORY_AMBIGUOUS',
        mutate(data) { data.contentHistories = []; },
      },
    ];

    for (const row of cases) {
      const fixture = legacyFixture(row.mutate);
      await assert.rejects(
        () => migration.migrateSl008Review({ repository: repositoryFor(fixture) }),
        (error) => error?.code === row.code,
        row.name,
      );
      assert.deepEqual(mutations(fixture.operations), [], row.name);
    }
  });

  it('rejects every required-key index whose name or semantic options are not exact before mutation', async () => {
    const key = { customerId: 1, productId: 1 };
    const cases = [
      {
        name: 'wrong name',
        index: { name: 'customerId_1_productId_1', key, unique: true },
      },
      {
        name: 'wrong unique option',
        index: { name: 'review_customer_product_unique', key, unique: false },
      },
      {
        name: 'wrong name and wrong unique option',
        index: { name: 'unsafe_review_identity', key, unique: false },
      },
      {
        name: 'unexpected sparse option',
        index: {
          name: 'review_customer_product_unique',
          key,
          unique: true,
          sparse: true,
        },
      },
      {
        name: 'unexpected partial filter option',
        index: {
          name: 'review_customer_product_unique',
          key,
          unique: true,
          partialFilterExpression: { status: 'Visible' },
        },
      },
      {
        name: 'unexpected storage-engine option',
        index: {
          name: 'review_customer_product_unique',
          key,
          unique: true,
          storageEngine: { wiredTiger: { configString: 'block_compressor=zstd' } },
        },
      },
    ];

    for (const row of cases) {
      const fixture = emptyFixture();
      fixture.collections.reviews.indexes.push(clone(row.index));

      await assert.rejects(
        () => migration.migrateSl008Review({ repository: repositoryFor(fixture) }),
        (error) => error?.code === 'SL008_REVIEW_INDEX_CONFLICT',
        row.name,
      );
      assert.deepEqual(mutations(fixture.operations), [], row.name);
    }
  });

  it('rejects non-Visible or missing legacy status without explicit independent state facts before mutation', async () => {
    const cases = [
      ['missing', (review) => { delete review.status; }],
      ['null', (review) => { review.status = null; }],
      ['blank', (review) => { review.status = ''; }],
      ['malformed', (review) => { review.status = 'Archived'; }],
      ['wrong case', (review) => { review.status = 'visible'; }],
      ['ambiguous Hidden', (review) => { review.status = 'Hidden'; }],
    ];

    for (const [name, mutate] of cases) {
      const fixture = legacyFixture((data) => mutate(data.reviews[0]));

      await assert.rejects(
        () => migration.migrateSl008Review({ repository: repositoryFor(fixture) }),
        (error) => /^SL008_REVIEW_.*_AMBIGUOUS$/u.test(error?.code || ''),
        name,
      );
      assert.deepEqual(mutations(fixture.operations), [], name);
    }
  });

  it('backfills only proven Visible facts conditionally without changing timestamps or inventing history', async () => {
    const fixture = legacyFixture();
    const beforeHistory = clone(fixture.collections.contentHistories.documents);

    const result = await migration.migrateSl008Review({
      repository: repositoryFor(fixture),
    });

    assert.equal(result.reviewsBackfilled, 1);
    assert.equal(result.businessWrites, 1);
    const review = fixture.collections.reviews.documents[0];
    assert.equal(review.orderDetailId, 'detail-1');
    assert.equal(review.publicationStatus, 'Published');
    assert.equal(review.moderationStatus, 'Allowed');
    assert.equal(review.version, 1);
    assert.equal(review.createdAt.toISOString(), fixture.createdAt.toISOString());
    assert.equal(review.updatedAt.toISOString(), fixture.updatedAt.toISOString());
    assert.deepEqual(fixture.collections.contentHistories.documents, beforeHistory);
    assert.deepEqual(fixture.collections.publicationHistories.documents, []);
    assert.deepEqual(fixture.collections.moderationHistories.documents, []);
    assert.deepEqual(fixture.collections.commands.documents, []);

    const write = fixture.operations.find((operation) => operation.type === 'updateOne');
    assert.equal(write.filter._id, 'review-1');
    assert.equal(write.filter.status, 'Visible');
    assert.deepEqual(write.filter.orderDetailId, { $exists: false });
    assert.deepEqual(write.options, { timestamps: false });
  });

  it('performs a dry run with zero business or index mutation', async () => {
    const fixture = legacyFixture();
    const before = clone(fixture.collections.reviews.documents);

    const result = await migration.migrateSl008Review({
      repository: repositoryFor(fixture),
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.businessWrites, 0);
    assert.equal(result.indexesCreated, 0);
    assert.equal(result.legacyIndexesDropped, 0);
    assert.equal(result.plannedReviewBackfills, 1);
    assert.equal(result.plannedIndexes, 10);
    assert.equal(result.plannedLegacyIndexDrops, 1);
    assert.deepEqual(fixture.collections.reviews.documents, before);
    assert.deepEqual(mutations(fixture.operations), []);
  });

  it('creates missing canonical indexes once, drops the legacy unique afterward, and repeats with zero operations', async () => {
    const fixture = emptyFixture();
    const repository = repositoryFor(fixture);

    const first = await migration.migrateSl008Review({ repository });
    const firstOperations = clone(fixture.operations);
    const second = await migration.migrateSl008Review({ repository });
    const secondOperations = fixture.operations.slice(firstOperations.length);

    assert.equal(first.businessWrites, 0);
    assert.equal(first.indexesCreated, 10);
    assert.equal(first.legacyIndexesDropped, 1);
    assert.equal(second.businessWrites, 0);
    assert.equal(second.indexesCreated, 0);
    assert.equal(second.legacyIndexesDropped, 0);
    assert.deepEqual(secondOperations, []);

    const replacement = firstOperations.findIndex(
      (operation) => operation.type === 'createIndex'
        && operation.options.name === 'review_customer_product_unique',
    );
    const legacyDrop = firstOperations.findIndex(
      (operation) => operation.type === 'dropIndex'
        && operation.name === 'customerId_1_orderId_1_productId_1',
    );
    assert.ok(replacement >= 0);
    assert.ok(legacyDrop > replacement);
  });

  it('sets autoIndex false before connecting and passes the CLI dry-run flag', async () => {
    const calls = [];
    const mongooseClient = {
      set(key, value) { calls.push(['set', key, value]); },
      async disconnect() { calls.push(['disconnect']); },
    };

    await migration.runCli({
      argv: ['--dry-run'],
      loadEnv() { calls.push(['env']); },
      mongooseClient,
      async connect() { calls.push(['connect']); },
      async migrate(options) {
        calls.push(['migrate', options]);
        return { dryRun: true, businessWrites: 0, indexesCreated: 0 };
      },
      logger: {
        log(message) { calls.push(['log', message]); },
        table(value) { calls.push(['table', value]); },
      },
    });

    assert.deepEqual(calls.slice(0, 4), [
      ['env'],
      ['set', 'autoIndex', false],
      ['connect'],
      ['migrate', { dryRun: true }],
    ]);
    assert.deepEqual(calls.at(-1), ['disconnect']);
  });

  it('formats bounded diagnostics without stack, document IDs, or user content', () => {
    const error = new Error(`private review text ${'x'.repeat(2_000)}`);
    error.code = 'SL008_REVIEW_HISTORY_AMBIGUOUS';
    error.stack = 'secret stack';
    error.reviewId = 'internal-review-id';

    const diagnostic = migration.formatDiagnostic(error);

    assert.ok(diagnostic.length <= 160);
    assert.match(diagnostic, /SL008_REVIEW_HISTORY_AMBIGUOUS/);
    assert.doesNotMatch(diagnostic, /private review text|secret stack|internal-review-id/);
  });
});
