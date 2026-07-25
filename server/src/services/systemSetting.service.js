const crypto = require('node:crypto');
const mongoose = require('mongoose');

const ApiError = require('../utils/apiError');
const SystemSetting = require('../models/systemSetting.model');
const SystemSettingVersion = require('../models/systemSettingVersion.model');
const DomainOutbox = require('../models/domainOutbox.model');
const { logAudit } = require('../utils/auditLogger');
const { lowStockAlertLifecycle: defaultLowStockLifecycle } = require('./lowStockAlertLifecycle.service');

const SETTING_KEYS = Object.freeze(['PAYMENT_TIMEOUT_MINUTES', 'LOW_STOCK_DEFAULT_THRESHOLD']);
const DEFAULT_VALUES = Object.freeze({ PAYMENT_TIMEOUT_MINUTES: 15, LOW_STOCK_DEFAULT_THRESHOLD: 5 });
const HISTORY_LIMIT = 20;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/;

function withOptionalSession(query, session) { return session ? query.session(session) : query; }

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally { await session.endSession(); }
    },
  };
}

function createModelRepository() {
  return {
    async listVersions(limit = HISTORY_LIMIT, session) {
      return withOptionalSession(SystemSettingVersion.find({}).sort({ version: -1 }).limit(limit), session).lean();
    },
    async findByIdempotencyKey(idempotencyKey, session) {
      return withOptionalSession(SystemSettingVersion.findOne({ idempotencyKey }), session).lean();
    },
    async appendVersion(data, session) {
      const [created] = await SystemSettingVersion.create([data], { session });
      return created.toObject();
    },
    async syncCurrent(values, adminId, session) {
      const operations = SETTING_KEYS.map((key) => ({
        updateOne: {
          filter: { key },
          update: { $set: { key, value: values[key], updatedBy: adminId } },
          upsert: true,
        },
      }));
      await SystemSetting.bulkWrite(operations, { session, runValidators: true });
    },
    async listPendingReevaluations(staleBefore) {
      return DomainOutbox.find({
        eventType: 'SYSTEM_SETTINGS_LOW_STOCK_REEVALUATE',
        $or: [{ status: { $in: ['Pending', 'Failed'] } }, { status: 'Processing', processingStartedAt: { $lte: staleBefore } }],
      }).sort({ createdAt: 1, _id: 1 }).lean();
    },
    async claimReevaluation(id, staleBefore, now) {
      return DomainOutbox.findOneAndUpdate({
        _id: id,
        $or: [{ status: { $in: ['Pending', 'Failed'] } }, { status: 'Processing', processingStartedAt: { $lte: staleBefore } }],
      }, { $set: { status: 'Processing', processingStartedAt: now, lastError: '' }, $inc: { attemptCount: 1 } }, { new: true, runValidators: true }).lean();
    },
    async completeReevaluation(id, processingStartedAt) {
      return DomainOutbox.findOneAndUpdate({ _id: id, status: 'Processing', processingStartedAt }, { $set: { status: 'Completed', completedAt: new Date(), processingStartedAt: null, lastError: '' } }, { new: true, runValidators: true }).lean();
    },
    async failReevaluation(id, processingStartedAt, error) {
      return DomainOutbox.findOneAndUpdate({ _id: id, status: 'Processing', processingStartedAt }, { $set: { status: 'Failed', processingStartedAt: null, lastError: String(error?.message || error || '') } }, { new: true, runValidators: true }).lean();
    },
  };
}

function createModelOutboxPublisher() {
  return {
    async publish(entry, session) {
      const [created] = await DomainOutbox.create([entry], { session });
      return created.toObject();
    },
  };
}

function currentFrom(version) {
  return version
    ? { version: Number(version.version), effectiveAt: version.effectiveAt, values: { ...version.values } }
    : { version: 0, effectiveAt: null, values: { ...DEFAULT_VALUES } };
}

function historyItem(version) {
  return { version: Number(version.version), effectiveAt: version.effectiveAt, reason: version.reason, values: { ...version.values } };
}

function validateCommand(input, idempotencyKey) {
  if (!IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) {
    throw new ApiError(400, 'Idempotency-Key is required and must be a safe bounded identifier', [], 'IDEMPOTENCY_KEY_INVALID');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'expectedVersion,reason,values') {
    throw new ApiError(400, 'System setting command has invalid fields', [], 'SETTINGS_COMMAND_INVALID');
  }
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new ApiError(400, 'expectedVersion must be a non-negative integer', [], 'SETTINGS_VERSION_INVALID');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason || reason.length > 300 || /[\u0000-\u001f]/.test(reason)) throw new ApiError(400, 'reason must be nonblank and at most 300 characters', [], 'SETTINGS_REASON_INVALID');
  if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values) || Object.keys(input.values).sort().join(',') !== SETTING_KEYS.slice().sort().join(',')) {
    throw new ApiError(400, 'values must contain exactly the supported setting keys', [], 'SETTINGS_VALUES_INVALID');
  }
  const values = {};
  for (const key of SETTING_KEYS) {
    const value = input.values[key];
    if (!Number.isInteger(value)) throw new ApiError(400, `${key} must be an integer`, [], 'SETTINGS_VALUE_INVALID');
    if (key === 'PAYMENT_TIMEOUT_MINUTES' && (value < 5 || value > 60)) throw new ApiError(400, `${key} must be between 5 and 60`, [], 'SETTINGS_VALUE_INVALID');
    if (key === 'LOW_STOCK_DEFAULT_THRESHOLD' && value < 0) throw new ApiError(400, `${key} must be a non-negative integer`, [], 'SETTINGS_VALUE_INVALID');
    values[key] = value;
  }
  const canonical = { expectedVersion, reason, values: Object.fromEntries(SETTING_KEYS.map((key) => [key, values[key]])) };
  return { ...canonical, requestHash: crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
}

function createSystemSettingService({
  repository = createModelRepository(),
  transactionManager = createModelTransactionManager(),
  auditLogger = { log: logAudit },
  outboxPublisher = createModelOutboxPublisher(),
  lowStockLifecycle = defaultLowStockLifecycle,
  clock = () => new Date(),
} = {}) {
  async function load(session) {
    const versions = await repository.listVersions(HISTORY_LIMIT, session);
    return { current: currentFrom(versions[0]), history: versions.map(historyItem) };
  }

  async function resultFor(version, replay = false) {
    const page = await load();
    const current = version ? currentFrom(version) : page.current;
    return { current, history: page.history, ...(replay ? { replay: true } : {}) };
  }

  function staleVersionError(current) {
    return new ApiError(
      409,
      'The supplied expectedVersion is stale',
      [],
      'SETTINGS_VERSION_STALE',
      { current },
    );
  }

  return {
    async listSettings() { return load(); },
    async getCurrentValues() { return (await load()).current.values; },
    async getCurrentSnapshot(session) { return (await load(session)).current; },
    async listHistory() { return (await load()).history; },
    async updateSettings(adminId, input = {}, idempotencyKey, actor = {}) {
      const command = validateCommand(input, idempotencyKey);
      const prior = await repository.findByIdempotencyKey(idempotencyKey);
      if (prior) {
        if (prior.requestHash !== command.requestHash) throw new ApiError(409, 'Idempotency-Key was already used with different facts', [], 'IDEMPOTENCY_KEY_REUSED');
        return resultFor(prior, true);
      }
      try {
        return await transactionManager.withTransaction(async (session) => {
          const replay = await repository.findByIdempotencyKey(idempotencyKey, session);
          if (replay) {
            if (replay.requestHash !== command.requestHash) throw new ApiError(409, 'Idempotency-Key was already used with different facts', [], 'IDEMPOTENCY_KEY_REUSED');
            return resultFor(replay, true);
          }
          const versions = await repository.listVersions(HISTORY_LIMIT - 1, session);
          const current = currentFrom(versions[0]);
          if (command.expectedVersion !== current.version) throw staleVersionError(current);
          const effectiveAt = new Date(clock());
          const version = await repository.appendVersion({
            version: current.version + 1,
            values: command.values,
            reason: command.reason,
            effectiveAt,
            updatedBy: adminId,
            idempotencyKey,
            requestHash: command.requestHash,
          }, session);
          await repository.syncCurrent(command.values, adminId, session);
          await auditLogger.log({
            actorType: 'User', actorId: adminId, actorRole: actor.role || 'Admin', source: 'SystemSettings',
            action: 'SYSTEM_SETTING_UPDATE', targetType: 'SystemSettingVersion', targetId: String(version.version), outcome: 'Success',
            correlationId: idempotencyKey, businessEventId: `system-settings:${version.version}`, reason: command.reason,
            stateVersion: version.version, safeFacts: { values: command.values, effectiveAt: effectiveAt.toISOString() },
          }, session);
          await outboxPublisher.publish({
            identityKey: `system-settings-low-stock:${version.version}`,
            eventType: 'SYSTEM_SETTINGS_LOW_STOCK_REEVALUATE',
            payload: { version: version.version, values: command.values, effectiveAt: effectiveAt.toISOString() },
            status: 'Pending',
          }, session);
          // Reads outside this session cannot see the newly appended document until commit.
          // Build the in-transaction response from the command facts instead.
          return {
            current: currentFrom(version),
            history: [historyItem(version), ...versions.map(historyItem)].slice(0, HISTORY_LIMIT),
          };
        });
      } catch (error) {
        if (error?.code === 11000) {
          const winner = await repository.findByIdempotencyKey(idempotencyKey);
          if (winner && winner.requestHash === command.requestHash) return resultFor(winner, true);
          if (winner) {
            throw new ApiError(409, 'Idempotency-Key was already used with different facts', [], 'IDEMPOTENCY_KEY_REUSED');
          }
          throw staleVersionError((await load()).current);
        }
        throw error;
      }
    },
    async drainPostCommitWork() {
      if (!repository.listPendingReevaluations) return;
      const now = new Date(clock());
      const staleBefore = new Date(now.getTime() - 60_000);
      const items = await repository.listPendingReevaluations(staleBefore);
      for (const item of items) {
        const claimed = await repository.claimReevaluation(item._id, staleBefore, new Date(clock()));
        if (!claimed) continue;
        try {
          await lowStockLifecycle.evaluateAll({
            eventKey: `system-settings:${claimed.payload.version}`,
            settingVersion: Number(claimed.payload.version),
            globalThreshold: Number(claimed.payload.values.LOW_STOCK_DEFAULT_THRESHOLD),
          });
          await repository.completeReevaluation(claimed._id, claimed.processingStartedAt);
        } catch (error) {
          await repository.failReevaluation(claimed._id, claimed.processingStartedAt, error);
        }
      }
    },
  };
}

module.exports = { SETTING_KEYS, DEFAULT_VALUES, createSystemSettingService, systemSettingService: createSystemSettingService() };
