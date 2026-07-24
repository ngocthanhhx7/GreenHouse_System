const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const ProductReview = require('../models/productReview.model');
const ReviewContentHistory = require('../models/reviewContentHistory.model');
const ReviewPublicationHistory = require('../models/reviewPublicationHistory.model');
const ReviewModerationHistory = require('../models/reviewModerationHistory.model');
const ReviewCommand = require('../models/reviewCommand.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');

const REQUIRED_INDEXES = Object.freeze([
  Object.freeze({
    collection: 'reviews',
    name: 'review_customer_product_unique',
    key: Object.freeze({ customerId: 1, productId: 1 }),
    unique: true,
  }),
  Object.freeze({
    collection: 'reviews',
    name: 'review_public_visibility_page',
    key: Object.freeze({
      productId: 1,
      publicationStatus: 1,
      moderationStatus: 1,
      createdAt: -1,
      _id: -1,
    }),
  }),
  Object.freeze({
    collection: 'reviews',
    name: 'review_customer_management_page',
    key: Object.freeze({ customerId: 1, createdAt: -1, _id: -1 }),
  }),
  Object.freeze({
    collection: 'contentHistories',
    name: 'review_content_history_version_unique',
    key: Object.freeze({ reviewId: 1, version: 1 }),
    unique: true,
  }),
  Object.freeze({
    collection: 'contentHistories',
    name: 'review_content_history_chronological',
    key: Object.freeze({ reviewId: 1, createdAt: 1, _id: 1 }),
  }),
  Object.freeze({
    collection: 'publicationHistories',
    name: 'review_publication_history_version_unique',
    key: Object.freeze({ reviewId: 1, version: 1 }),
    unique: true,
  }),
  Object.freeze({
    collection: 'publicationHistories',
    name: 'review_publication_history_chronological',
    key: Object.freeze({ reviewId: 1, createdAt: 1, _id: 1 }),
  }),
  Object.freeze({
    collection: 'moderationHistories',
    name: 'review_moderation_history_version_unique',
    key: Object.freeze({ reviewId: 1, version: 1 }),
    unique: true,
  }),
  Object.freeze({
    collection: 'moderationHistories',
    name: 'review_moderation_history_chronological',
    key: Object.freeze({ reviewId: 1, createdAt: 1, _id: 1 }),
  }),
  Object.freeze({
    collection: 'commands',
    name: 'review_command_actor_key_unique',
    key: Object.freeze({ actorId: 1, idempotencyKey: 1 }),
    unique: true,
  }),
]);

const LEGACY_REVIEW_UNIQUE_KEY = Object.freeze({
  customerId: 1,
  orderId: 1,
  productId: 1,
});

function migrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function valueId(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && (value._id !== undefined || value.id !== undefined)) {
    return String(value._id ?? value.id);
  }
  return String(value);
}

function sameKey(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([field, direction], index) => (
      rightEntries[index]?.[0] === field
      && rightEntries[index]?.[1] === direction
    ));
}

function sameTimestamp(left, right) {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function sameText(left, right) {
  return String(left ?? '') === String(right ?? '');
}

async function readAll(collection) {
  return collection.find({}).toArray();
}

async function readIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

function hasExpectedOptions(index, spec) {
  const metadataOptions = new Set([
    'v',
    'ns',
    'key',
    'name',
    'collection',
    'background',
  ]);
  const normalizeOptions = (source) => Object.fromEntries(
    Object.entries(source).flatMap(([option, value]) => {
      if (metadataOptions.has(option) || value === undefined) return [];
      if (['unique', 'sparse', 'hidden'].includes(option) && value !== true) return [];
      return [[option, value]];
    }),
  );
  return sameKey(index.key, spec.key)
    && JSON.stringify(normalizeOptions(index)) === JSON.stringify(normalizeOptions(spec));
}

function assertHistoryIndexable(histories) {
  for (const rows of histories) {
    const identities = new Set();
    for (const row of rows) {
      const version = Number(row.version);
      const identity = `${valueId(row.reviewId)}\u0000${version}`;
      if (
        !valueId(row.reviewId)
        || !Number.isInteger(version)
        || version < 1
        || identities.has(identity)
      ) {
        throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
      }
      identities.add(identity);
    }
  }
}

function assertCommandsIndexable(commands) {
  const identities = new Set();
  for (const command of commands) {
    const actorId = String(command.actorId || '');
    const idempotencyKey = String(command.idempotencyKey || '');
    const identity = `${actorId}\u0000${idempotencyKey}`;
    if (!actorId || !idempotencyKey || identities.has(identity)) {
      throw migrationError('SL008_REVIEW_COMMAND_DUPLICATE');
    }
    identities.add(identity);
  }
}

function historiesFor(rows, reviewId) {
  return rows.filter((row) => valueId(row.reviewId) === reviewId);
}

function assertReviewHistory(review, historyRows, canonicalVersion) {
  // The approved SL-008 migration lock forbids synthesizing an initial/current
  // history from a mutable legacy row. A Visible row is backfillable only when
  // existing append-only rows prove every aggregate version and current fact.
  const reviewId = valueId(review);
  const contentRows = historiesFor(historyRows.content, reviewId);
  const publicationRows = historiesFor(historyRows.publication, reviewId);
  const moderationRows = historiesFor(historyRows.moderation, reviewId);
  const allRows = [
    ...contentRows.map((row) => ({ ...row, kind: 'content' })),
    ...publicationRows.map((row) => ({ ...row, kind: 'publication' })),
    ...moderationRows.map((row) => ({ ...row, kind: 'moderation' })),
  ].sort((left, right) => Number(left.version) - Number(right.version));

  if (!allRows.length || !contentRows.length) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }
  const derivedVersion = Number(allRows.at(-1).version);
  const version = canonicalVersion || derivedVersion;
  if (
    !Number.isInteger(version)
    || version < 1
    || allRows.length !== version
    || allRows.some((row, index) => Number(row.version) !== index + 1)
  ) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }

  const first = allRows[0];
  if (
    first.kind !== 'content'
    || Number(first.version) !== 1
    || valueId(first.actorId) !== valueId(review.customerId)
    || !sameTimestamp(first.createdAt, review.createdAt)
  ) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }
  if (contentRows.some((row) => valueId(row.actorId) !== valueId(review.customerId))) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }

  const latestContent = contentRows.reduce((latest, row) => (
    !latest || Number(row.version) > Number(latest.version) ? row : latest
  ), null);
  if (
    Number(latestContent.rating) !== Number(review.rating)
    || !sameText(latestContent.content, review.content)
  ) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }

  const latestPublication = publicationRows.reduce((latest, row) => (
    !latest || Number(row.version) > Number(latest.version) ? row : latest
  ), null);
  const latestModeration = moderationRows.reduce((latest, row) => (
    !latest || Number(row.version) > Number(latest.version) ? row : latest
  ), null);
  const publicationStatus = latestPublication?.afterStatus || 'Published';
  const moderationStatus = latestModeration?.afterStatus || 'Allowed';

  if (
    review.publicationStatus !== undefined
    && review.publicationStatus !== null
    && review.publicationStatus !== publicationStatus
  ) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }
  if (
    review.moderationStatus !== undefined
    && review.moderationStatus !== null
    && review.moderationStatus !== moderationStatus
  ) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }
  if (
    review.status === 'Visible'
    && (publicationStatus !== 'Published' || moderationStatus !== 'Allowed')
  ) {
    throw migrationError('SL008_REVIEW_HISTORY_AMBIGUOUS');
  }

  return { version, publicationStatus, moderationStatus };
}

function missingFieldCondition(review, field) {
  return Object.hasOwn(review, field) ? review[field] : { $exists: false };
}

function buildConditionalBackfill(review, evidence, state) {
  const set = {};
  for (const [field, value] of Object.entries({
    orderDetailId: evidence._id,
    publicationStatus: state.publicationStatus,
    moderationStatus: state.moderationStatus,
    version: state.version,
  })) {
    if (review[field] === undefined || review[field] === null) set[field] = value;
  }
  if (!Object.keys(set).length) return null;

  const filter = {
    _id: review._id,
    customerId: review.customerId,
    productId: review.productId,
    orderId: review.orderId,
    rating: review.rating,
    content: review.content,
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
  for (const field of Object.keys(set)) {
    filter[field] = missingFieldCondition(review, field);
  }
  return { filter, update: { $set: set } };
}

function resolveEvidence(review, orders, orderDetails) {
  const reviewId = valueId(review);
  const productId = valueId(review.productId);
  const legacyOrderId = valueId(review.orderId);
  const explicitDetailId = valueId(review.orderDetailId);
  const matches = explicitDetailId
    ? orderDetails.filter((detail) => valueId(detail) === explicitDetailId)
    : orderDetails.filter((detail) => (
      valueId(detail.orderId) === legacyOrderId
      && valueId(detail.productId) === productId
    ));

  if (matches.length !== 1) throw migrationError('SL008_REVIEW_EVIDENCE_COUNT');
  const detail = matches[0];
  if (
    valueId(detail.productId) !== productId
    || (legacyOrderId && valueId(detail.orderId) !== legacyOrderId)
  ) {
    throw migrationError('SL008_REVIEW_EVIDENCE_MISMATCH');
  }
  const matchingOrders = orders.filter((order) => valueId(order) === valueId(detail.orderId));
  if (matchingOrders.length !== 1) throw migrationError('SL008_REVIEW_EVIDENCE_MISMATCH');
  const order = matchingOrders[0];
  if (valueId(order.customerId) !== valueId(review.customerId)) {
    throw migrationError('SL008_REVIEW_OWNER_MISMATCH');
  }
  if (!order.deliveredAt) throw migrationError('SL008_REVIEW_DELIVERY_UNPROVEN');
  if (!reviewId || !productId || !valueId(review.customerId)) {
    throw migrationError('SL008_REVIEW_EVIDENCE_MISMATCH');
  }
  return detail;
}

function defaultCollections() {
  return {
    reviews: ProductReview.collection,
    orders: Order.collection,
    orderDetails: OrderDetail.collection,
    contentHistories: ReviewContentHistory.collection,
    publicationHistories: ReviewPublicationHistory.collection,
    moderationHistories: ReviewModerationHistory.collection,
    commands: ReviewCommand.collection,
  };
}

function createMigrationRepository({ collections = defaultCollections() } = {}) {
  async function inspectIndexes() {
    const byCollection = {};
    for (const collectionName of new Set(
      REQUIRED_INDEXES.map((index) => index.collection),
    )) {
      byCollection[collectionName] = await readIndexes(collections[collectionName]);
    }

    const missingRequired = [];
    for (const spec of REQUIRED_INDEXES) {
      const indexes = byCollection[spec.collection];
      const named = indexes.find((index) => index.name === spec.name);
      const samePattern = indexes.filter((index) => sameKey(index.key, spec.key));
      if (
        (named && !hasExpectedOptions(named, spec))
        || samePattern.some((index) => (
          index.name !== spec.name || !hasExpectedOptions(index, spec)
        ))
      ) {
        throw migrationError('SL008_REVIEW_INDEX_CONFLICT');
      }
      if (!named) missingRequired.push(spec);
    }

    const legacyIndexes = byCollection.reviews.filter((index) => (
      index.name !== 'review_customer_product_unique'
      && Boolean(index.unique)
      && sameKey(index.key, LEGACY_REVIEW_UNIQUE_KEY)
    ));
    return { byCollection, missingRequired, legacyIndexes };
  }

  return {
    async preflight() {
      const [
        reviews,
        orders,
        orderDetails,
        contentHistories,
        publicationHistories,
        moderationHistories,
        commands,
      ] = await Promise.all([
        readAll(collections.reviews),
        readAll(collections.orders),
        readAll(collections.orderDetails),
        readAll(collections.contentHistories),
        readAll(collections.publicationHistories),
        readAll(collections.moderationHistories),
        readAll(collections.commands),
      ]);

      const reviewIdentities = new Set();
      for (const review of reviews) {
        const identity = `${valueId(review.customerId)}\u0000${valueId(review.productId)}`;
        if (reviewIdentities.has(identity)) {
          throw migrationError('SL008_REVIEW_DUPLICATE_IDENTITY');
        }
        reviewIdentities.add(identity);
      }
      assertHistoryIndexable([
        contentHistories,
        publicationHistories,
        moderationHistories,
      ]);
      assertCommandsIndexable(commands);

      const historyRows = {
        content: contentHistories,
        publication: publicationHistories,
        moderation: moderationHistories,
      };
      const backfills = [];
      for (const review of reviews) {
        if (
          Object.hasOwn(review, 'version')
          && (!Number.isInteger(review.version) || review.version < 1)
        ) {
          throw migrationError('SL008_REVIEW_VERSION_AMBIGUOUS');
        }
        const hasExplicitIndependentFacts = (
          ['Published', 'Withdrawn'].includes(review.publicationStatus)
          && ['Allowed', 'HiddenByStaff'].includes(review.moderationStatus)
        );
        if (!hasExplicitIndependentFacts && review.status !== 'Visible') {
          throw migrationError(
            review.status === 'Hidden'
              ? 'SL008_REVIEW_HIDDEN_AMBIGUOUS'
              : 'SL008_REVIEW_STATUS_AMBIGUOUS',
          );
        }
        const evidence = resolveEvidence(review, orders, orderDetails);
        const canonicalVersion = Number.isInteger(Number(review.version))
          && Number(review.version) >= 1
          ? Number(review.version)
          : null;
        const state = assertReviewHistory(review, historyRows, canonicalVersion);
        const backfill = buildConditionalBackfill(review, evidence, state);
        if (backfill) backfills.push(backfill);
      }

      const indexPlan = await inspectIndexes();
      return {
        backfills,
        missingRequired: indexPlan.missingRequired,
        legacyIndexes: indexPlan.legacyIndexes,
      };
    },

    async backfillReviews(backfills) {
      let modified = 0;
      for (const backfill of backfills) {
        const result = await collections.reviews.updateOne(
          backfill.filter,
          backfill.update,
          { timestamps: false },
        );
        if (Number(result.modifiedCount || 0) !== 1) {
          throw migrationError('SL008_REVIEW_CONCURRENT_CHANGE');
        }
        modified += 1;
      }
      return modified;
    },

    async ensureRequiredIndexes() {
      let created = 0;
      for (const spec of REQUIRED_INDEXES) {
        const indexes = await readIndexes(collections[spec.collection]);
        const existing = indexes.find((index) => index.name === spec.name);
        if (existing) {
          if (!hasExpectedOptions(existing, spec)) {
            throw migrationError('SL008_REVIEW_INDEX_CONFLICT');
          }
          continue;
        }
        await collections[spec.collection].createIndex(spec.key, {
          name: spec.name,
          ...(spec.unique ? { unique: true } : {}),
        });
        created += 1;
      }
      return created;
    },

    async dropLegacyUniqueIndexes() {
      const indexes = await readIndexes(collections.reviews);
      const replacement = indexes.find(
        (index) => index.name === 'review_customer_product_unique',
      );
      const replacementSpec = REQUIRED_INDEXES[0];
      if (!replacement || !hasExpectedOptions(replacement, replacementSpec)) {
        throw migrationError('SL008_REVIEW_REPLACEMENT_INDEX_MISSING');
      }
      const legacy = indexes.filter((index) => (
        index.name !== replacement.name
        && Boolean(index.unique)
        && sameKey(index.key, LEGACY_REVIEW_UNIQUE_KEY)
      ));
      for (const index of legacy) await collections.reviews.dropIndex(index.name);
      return legacy.length;
    },
  };
}

async function migrateSl008Review({
  repository = createMigrationRepository(),
  dryRun = false,
} = {}) {
  const plan = await repository.preflight();
  if (dryRun) {
    return {
      dryRun: true,
      plannedReviewBackfills: plan.backfills.length,
      plannedIndexes: plan.missingRequired.length,
      plannedLegacyIndexDrops: plan.legacyIndexes.length,
      reviewsBackfilled: 0,
      indexesCreated: 0,
      legacyIndexesDropped: 0,
      businessWrites: 0,
    };
  }

  const indexesCreated = await repository.ensureRequiredIndexes();
  const reviewsBackfilled = await repository.backfillReviews(plan.backfills);
  const legacyIndexesDropped = await repository.dropLegacyUniqueIndexes();
  return {
    dryRun: false,
    plannedReviewBackfills: plan.backfills.length,
    plannedIndexes: plan.missingRequired.length,
    plannedLegacyIndexDrops: plan.legacyIndexes.length,
    reviewsBackfilled,
    indexesCreated,
    legacyIndexesDropped,
    businessWrites: reviewsBackfilled,
  };
}

function parseCliArgs(argv) {
  const unknown = argv.filter((argument) => argument !== '--dry-run');
  if (unknown.length) throw migrationError('SL008_REVIEW_CLI_ARGUMENT_INVALID');
  return { dryRun: argv.includes('--dry-run') };
}

function formatDiagnostic(error) {
  const candidate = String(error?.code || 'SL008_REVIEW_UNEXPECTED_ERROR');
  const code = /^[A-Z0-9_]{1,96}$/u.test(candidate)
    ? candidate
    : 'SL008_REVIEW_UNEXPECTED_ERROR';
  return `SL-008 Review migration failed (${code}).`;
}

async function runCli({
  argv = process.argv.slice(2),
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateSl008Review,
  logger = console,
} = {}) {
  const options = parseCliArgs(argv);
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect(process.env.MONGODB_URI, {
    mongooseClient,
    requireTransactions: false,
  });
  try {
    const result = await migrate(options);
    logger.log(
      result.dryRun
        ? 'SL-008 Review migration dry run completed.'
        : 'SL-008 Review migration completed.',
    );
    logger.table([result]);
    return result;
  } finally {
    await mongooseClient.disconnect();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(formatDiagnostic(error));
    process.exitCode = 1;
  });
}

module.exports = {
  LEGACY_REVIEW_UNIQUE_KEY,
  REQUIRED_INDEXES,
  createMigrationRepository,
  formatDiagnostic,
  migrateSl008Review,
  parseCliArgs,
  runCli,
};
