const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const {
  createMigrationRepository: createReviewMigrationRepository,
} = require('./migrateSl008Review');
const {
  createMigrationRepository: createSupportMigrationRepository,
} = require('./migrateSl008Support');

function migrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function migrateSl008ReviewSupport({
  reviewRepository = createReviewMigrationRepository(),
  supportRepository = createSupportMigrationRepository(),
  dryRun = false,
} = {}) {
  // Both domains must prove their complete plans before either domain writes.
  const reviewPlan = await reviewRepository.preflight();
  const supportPlan = await supportRepository.preflight();

  if (dryRun) {
    return {
      dryRun: true,
      plannedReviewBackfills: reviewPlan.backfills.length,
      plannedSupportRequestWrites: supportPlan.requestWrites.length,
      plannedSupportMessageWrites: supportPlan.messageWrites.length,
      plannedIndexes:
        reviewPlan.missingRequired.length + supportPlan.missingRequired.length,
      plannedLegacyIndexDrops:
        reviewPlan.legacyIndexes.length + supportPlan.legacyEquivalent.length,
      reviewsBackfilled: 0,
      supportRequestWrites: 0,
      supportMessageWrites: 0,
      indexesCreated: 0,
      legacyIndexesDropped: 0,
      businessWrites: 0,
    };
  }

  const reviewIndexesCreated = await reviewRepository.ensureRequiredIndexes();
  const reviewsBackfilled = await reviewRepository.backfillReviews(reviewPlan.backfills);
  const legacyIndexesDropped = await reviewRepository.dropLegacyUniqueIndexes();
  const supportWrites = await supportRepository.applyBusinessWrites(supportPlan);
  const supportIndexesCreated = await supportRepository.ensureRequiredIndexes(supportPlan);

  return {
    dryRun: false,
    plannedReviewBackfills: reviewPlan.backfills.length,
    plannedSupportRequestWrites: supportPlan.requestWrites.length,
    plannedSupportMessageWrites: supportPlan.messageWrites.length,
    plannedIndexes:
      reviewPlan.missingRequired.length + supportPlan.missingRequired.length,
    plannedLegacyIndexDrops:
      reviewPlan.legacyIndexes.length + supportPlan.legacyEquivalent.length,
    reviewsBackfilled,
    supportRequestWrites: supportWrites.requestWrites,
    supportMessageWrites: supportWrites.messageWrites,
    indexesCreated: reviewIndexesCreated + supportIndexesCreated,
    legacyIndexesDropped,
    businessWrites:
      reviewsBackfilled + supportWrites.requestWrites + supportWrites.messageWrites,
  };
}

function parseCliArgs(argv) {
  const unknown = argv.filter((argument) => argument !== '--dry-run');
  if (unknown.length) throw migrationError('SL008_MIGRATION_CLI_ARGUMENT_INVALID');
  return { dryRun: argv.includes('--dry-run') };
}

function formatDiagnostic(error) {
  const candidate = String(error?.code || 'SL008_MIGRATION_UNEXPECTED_ERROR');
  const code = /^[A-Z0-9_]{1,96}$/u.test(candidate)
    ? candidate
    : 'SL008_MIGRATION_UNEXPECTED_ERROR';
  return `SL-008 migration failed (${code}).`;
}

async function runCli({
  argv = process.argv.slice(2),
  loadEnv = () => require('dotenv').config(),
  mongooseClient = mongoose,
  connect = connectDatabase,
  migrate = migrateSl008ReviewSupport,
  logger = console,
} = {}) {
  const options = parseCliArgs(argv);
  loadEnv();
  mongooseClient.set('autoIndex', false);
  await connect(process.env.MONGODB_URI, { mongooseClient, requireTransactions: true });
  try {
    const result = await migrate(options);
    logger.log(result.dryRun
      ? 'SL-008 Review and Support migration dry run completed.'
      : 'SL-008 Review and Support migration completed.');
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
  formatDiagnostic,
  migrateSl008ReviewSupport,
  parseCliArgs,
  runCli,
};
