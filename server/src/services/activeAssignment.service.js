const ApiError = require('../utils/apiError');
const DomainOutbox = require('../models/domainOutbox.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const DamageReport = require('../models/damageReport.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ExchangeShipment = require('../models/exchangeShipment.model');
const SupportRequest = require('../models/supportRequest.model');

function createMongoAssignmentAdapter({
  sliceId,
  model,
  actorFilter,
  activeStatuses,
  entity,
}) {
  return {
    sliceId,
    async hasActiveAssignment(userId, session = null) {
      const query = model.exists({
        ...actorFilter(userId),
        status: { $in: activeStatuses },
      });
      const match = await (session ? query.session(session) : query);
      if (!match) return false;
      return {
        active: true,
        detail: { entity, activeStatuses },
      };
    },
  };
}

function createCurrentSliceAssignmentAdapters({
  StockExportRequestModel = StockExportRequest,
  DamageReportModel = DamageReport,
  ReplenishmentRequestModel = ReplenishmentRequest,
  ReturnRefundRequestModel = ReturnRefundRequest,
  ExchangeCaseModel = ExchangeCase,
  ExchangeShipmentModel = ExchangeShipment,
  SupportRequestModel = SupportRequest,
} = {}) {
  return [
    createMongoAssignmentAdapter({
      sliceId: 'SL-003_STOCK_EXPORT',
      model: StockExportRequestModel,
      actorFilter: (userId) => ({
        $or: [{ requestedBy: userId }, { processedBy: userId }],
      }),
      activeStatuses: ['Pending', 'Approved', 'Processing'],
      entity: 'StockExportRequest',
    }),
    createMongoAssignmentAdapter({
      sliceId: 'SL-005_DAMAGE_REPORT',
      model: DamageReportModel,
      actorFilter: (userId) => ({
        $or: [{ reportedBy: userId }, { confirmedBy: userId }],
      }),
      activeStatuses: ['PendingWarehouseConfirmation', 'PendingReview', 'Confirming'],
      entity: 'DamageReport',
    }),
    createMongoAssignmentAdapter({
      sliceId: 'SL-005_REPLENISHMENT',
      model: ReplenishmentRequestModel,
      actorFilter: (userId) => ({
        $or: [{ requestedBy: userId }, { receivedBy: userId }],
      }),
      activeStatuses: [
        'PendingApproval',
        'Approved',
        'Receiving',
        'PartiallyReceived',
        'ShortClosurePending',
      ],
      entity: 'ReplenishmentRequest',
    }),
    createMongoAssignmentAdapter({
      sliceId: 'SL-001_RETURN_REFUND',
      model: ReturnRefundRequestModel,
      actorFilter: (userId) => ({
        $or: [{ resolvedBy: userId }, { completedBy: userId }],
      }),
      activeStatuses: [
        'Approved',
        'AwaitingInspection',
        'Received',
        'ReadyForRefund',
        'CODRecoveryInProgress',
      ],
      entity: 'ReturnRefundRequest',
    }),
    createMongoAssignmentAdapter({
      sliceId: 'SL-002_EXCHANGE',
      model: ExchangeCaseModel,
      actorFilter: (userId) => ({ decidedBy: userId }),
      activeStatuses: [
        'AwaitingCODReconciliation',
        'CODRecoveryInProgress',
        'Submitted',
        'AwaitingExactStockChoice',
        'WaitingForExactStock',
        'ApprovedAwaitingShipment',
        'CustomerShipped',
        'WarehouseInspecting',
        'OutboundFulfillment',
        'ReplacementShipped',
        'DeliveryIncident',
      ],
      entity: 'ExchangeCase',
    }),
    createMongoAssignmentAdapter({
      sliceId: 'SL-002_EXCHANGE_SHIPMENT',
      model: ExchangeShipmentModel,
      actorFilter: (userId) => ({ createdBy: userId }),
      activeStatuses: ['InTransit', 'Incident'],
      entity: 'ExchangeShipment',
    }),
    createMongoAssignmentAdapter({
      sliceId: 'SL-008_SUPPORT',
      model: SupportRequestModel,
      actorFilter: (userId) => ({
        $or: [{ assigneeId: userId }, { handledBy: userId }],
      }),
      activeStatuses: ['New', 'Open', 'InProgress'],
      entity: 'SupportRequest',
    }),
  ];
}

function createSupportRecoveryHandler({
  getSupportService = () => require('./support.service').supportService,
} = {}) {
  return {
    sliceId: 'SL-008_SUPPORT',
    async recoverDisabledAccount(input, session = null) {
      return getSupportService().clearDisabledAssignee(
        input.userId,
        {},
        {
          idempotencyKey: `sl007-support-clear-${String(input.idempotencyKey || input.userId)}`,
          mongoSession: session,
        },
      );
    },
  };
}

function createCurrentSliceRecoveryHandlers(options = {}) {
  return [createSupportRecoveryHandler(options)];
}

function createModelEventSink() {
  return {
    async emit(event, session = null) {
      const identityKey = String(event.idempotencyKey);
      const query = DomainOutbox.findOneAndUpdate(
        { identityKey },
        {
          $setOnInsert: {
            identityKey,
            eventType: event.eventType,
            payload: event,
            status: 'Pending',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return (session ? query.session(session) : query).lean();
    },
  };
}

function createActiveAssignmentService({
  adapters = createCurrentSliceAssignmentAdapters(),
  recoveryHandlers = [],
  eventSink = createModelEventSink(),
} = {}) {
  async function inspect(userId, session = null) {
    const activeAssignments = [];
    for (const adapter of adapters) {
      const result = await adapter.hasActiveAssignment(userId, session);
      if (result === true || result?.active) {
        activeAssignments.push({
          sliceId: adapter.sliceId,
          detail: result === true ? undefined : result?.detail,
        });
      }
    }
    return activeAssignments;
  }

  return {
    async hasActiveAssignments(userId, session = null) {
      if (!adapters.length) {
        throw new ApiError(
          503,
          'Chưa thể xác minh công việc đang hoạt động của tài khoản.',
          [],
          'ACTIVE_ASSIGNMENT_CHECK_UNAVAILABLE',
        );
      }
      const assignments = await inspect(userId, session);
      return { active: assignments.length > 0, assignments };
    },

    async handleDisabledAccount(
      { userId, idempotencyKey, reason },
      mongoSession = null,
    ) {
      const activeAssignments = await inspect(userId, mongoSession);
      const assignmentCheckUnavailable = adapters.length === 0;
      const input = { userId, idempotencyKey, reason };
      const recoveries = [];
      for (const handler of recoveryHandlers) {
        const recovery = await handler.recoverDisabledAccount(input, mongoSession);
        recoveries.push({
          sliceId: handler.sliceId,
          recovered: Boolean(recovery),
        });
      }
      const event = {
        eventType: 'ACCOUNT_DISABLED',
        idempotencyKey: `ACCOUNT_DISABLED:${String(idempotencyKey || userId)}`,
        userId: String(userId),
        reason,
        activeAssignments,
        assignmentCheckUnavailable,
        impersonationAllowed: false,
      };
      await eventSink.emit(event, mongoSession);
      return { activeAssignments, assignmentCheckUnavailable, recoveries };
    },
  };
}

module.exports = {
  createActiveAssignmentService,
  createCurrentSliceAssignmentAdapters,
  createCurrentSliceRecoveryHandlers,
  createMongoAssignmentAdapter,
  createModelEventSink,
  createSupportRecoveryHandler,
  activeAssignmentService: createActiveAssignmentService({
    recoveryHandlers: createCurrentSliceRecoveryHandlers(),
  }),
};
