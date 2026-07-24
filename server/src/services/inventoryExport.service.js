const mongoose = require('mongoose');

const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const FulfillmentCycle = require('../models/fulfillmentCycle.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const OrderReservation = require('../models/orderReservation.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const ApiError = require('../utils/apiError');
const { logAudit } = require('../utils/auditLogger');
const {
  assignmentCoordinator: defaultAssignmentCoordinator,
} = require('./assignmentCoordination.service');
const {
  lowStockAlertLifecycle: defaultLowStockLifecycle,
} = require('./lowStockAlertLifecycle.service');

function withOptionalSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelTransactionManager() {
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function createModelRepository() {
  return {
    async findStockExportById(id, session) {
      return withOptionalSession(StockExportRequest.findById(id), session).lean();
    },
    async claimExportProcessing(
      id,
      commandKey,
      userId,
      note,
      staleBefore,
      processingStartedAt,
      session,
    ) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        {
          _id: id,
          $or: [
            { status: { $in: ['Pending', 'Failed'] } },
            {
              status: 'Processing',
              $or: [
                { processingStartedAt: { $lte: staleBefore } },
                { processingStartedAt: null },
              ],
            },
          ],
        },
        {
          $set: {
            status: 'Processing',
            processingCommandKey: commandKey,
            processingStartedAt,
            processedBy: userId,
            note,
            failureCode: '',
            failureReason: '',
          },
        },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async completeExport(id, commandKey, completedAt, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: 'Processing', processingCommandKey: commandKey },
        {
          $set: {
            status: 'Completed',
            completedCommandKey: commandKey,
            completedAt,
            exportedAt: completedAt,
          },
        },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async updateCycle(id, patch, session) {
      return withOptionalSession(FulfillmentCycle.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async failExport(id, commandKey, failureCode, failureReason, session) {
      return withOptionalSession(StockExportRequest.findOneAndUpdate(
        { _id: id, status: 'Processing', processingCommandKey: commandKey },
        { $set: { status: 'Failed', failureCode, failureReason } },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async findOrderById(id, session) {
      return withOptionalSession(Order.findById(id), session).lean();
    },
    async findCycleById(id, session) {
      return withOptionalSession(FulfillmentCycle.findById(id), session).lean();
    },
    async listOrderDetails(orderId, session) {
      return withOptionalSession(OrderDetail.find({ orderId }).sort({ createdAt: 1 }), session).lean();
    },
    async findInventoryByProductId(productId, session) {
      return withOptionalSession(Inventory.findOne({ productId }), session).lean();
    },
    async claimOrderReservationConsumption(orderId, orderDetailId, session) {
      return withOptionalSession(OrderReservation.findOneAndUpdate(
        { orderId, orderDetailId, status: 'Reserved' },
        { $set: { status: 'Consumed' } },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async captureReservation(productId, quantity, userId, session) {
      return withOptionalSession(Inventory.findOneAndUpdate(
        {
          productId,
          inventoryHealth: { $ne: 'ReconciliationRequired' },
          sellableQuantity: { $gte: quantity },
          reservedQuantity: { $gte: quantity },
        },
        {
          $inc: {
            stockQuantity: -quantity,
            sellableQuantity: -quantity,
            reservedQuantity: -quantity,
          },
          $set: { lastUpdatedBy: userId },
        },
        { new: true, runValidators: true },
      ), session).lean();
    },
    async createTransaction(data, session) {
      const [transaction] = await InventoryTransaction.create(
        [data],
        session ? { session } : undefined,
      );
      return transaction.toObject();
    },
  };
}

function normalizeCommandKey(value) {
  const commandKey = String(value || '').trim();
  if (
    commandKey.length < 8
    || commandKey.length > 160
    || !/^[A-Za-z0-9:._-]+$/.test(commandKey)
  ) {
    throw new ApiError(
      400,
      'A valid export idempotencyKey is required',
      [{ field: 'idempotencyKey', message: 'Use 8-160 letters, numbers, ., _, :, or -' }],
      'EXPORT_IDEMPOTENCY_KEY_INVALID',
    );
  }
  return commandKey;
}

function toStockExportResponse(request, order, details = []) {
  return {
    id: String(request._id),
    orderId: String(request.orderId),
    cycleId: request.cycleId ? String(request.cycleId) : null,
    requestKind: request.requestKind || 'Initial',
    status: request.status,
    note: request.note || '',
    processingStartedAt: request.processingStartedAt || null,
    completedAt: request.completedAt || request.exportedAt || null,
    failureCode: request.failureCode || '',
    failureReason: request.failureReason || '',
    order: order ? {
      id: String(order._id),
      orderCode: order.orderCode,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
    } : null,
    details,
  };
}

function responseFor(request, order, details, idempotentReplay) {
  return {
    stockExport: toStockExportResponse(request, order, details),
    order: { id: String(order._id), orderStatus: order.orderStatus },
    idempotentReplay,
  };
}

function createInventoryExportService({
  repository = createModelRepository(),
  transactionManager = createModelTransactionManager(),
  auditLogger = { log: logAudit },
  assignmentCoordinator = defaultAssignmentCoordinator,
  lowStockLifecycle = defaultLowStockLifecycle,
  clock = () => new Date(),
  processingLeaseMs = 60_000,
} = {}) {
  async function currentResponse(request, replay) {
    const [order, details] = await Promise.all([
      repository.findOrderById(request.orderId),
      repository.listOrderDetails(request.orderId),
    ]);
    return responseFor(request, order, details, replay);
  }

  async function processStockExport(userId, id, input = {}) {
    const commandKey = normalizeCommandKey(input.idempotencyKey);
    const initial = await repository.findStockExportById(id);
    if (!initial) throw new ApiError(404, 'Stock export request not found');
    if (initial.status === 'Completed') return currentResponse(initial, true);
    if (initial.status === 'Failed' && initial.processingCommandKey === commandKey) {
      return currentResponse(initial, true);
    }
    const claimStartedAt = new Date(clock());
    const leaseMs = Number.isFinite(processingLeaseMs) && processingLeaseMs > 0
      ? processingLeaseMs
      : 60_000;
    const staleBefore = new Date(claimStartedAt.getTime() - leaseMs);
    const initialProcessingAt = initial.processingStartedAt
      ? new Date(initial.processingStartedAt)
      : null;
    const staleProcessing = initial.status === 'Processing'
      && (
        !initialProcessingAt
        || Number.isNaN(initialProcessingAt.getTime())
        || initialProcessingAt <= staleBefore
      );
    if (initial.status === 'Processing' && !staleProcessing) {
      if (initial.processingCommandKey === commandKey) {
        return currentResponse(initial, true);
      }
      throw new ApiError(
        409,
        'Stock export is already Processing',
        [],
        'EXPORT_ALREADY_PROCESSING',
        { stockExportId: String(initial._id), status: initial.status },
      );
    }
    if (initial.status === 'Cancelled') {
      throw new ApiError(409, 'Cancelled stock export cannot be processed', [], 'EXPORT_STALE_STATE');
    }

    const note = input.note === undefined ? initial.note : String(input.note || '').trim();
    const claimed = await transactionManager.withTransaction(async (session) => {
      await assignmentCoordinator.coordinate({
        userId,
        expectedRole: 'WarehouseManager',
        session,
      });
      return repository.claimExportProcessing(
        id,
        commandKey,
        userId,
        note,
        staleBefore,
        claimStartedAt,
        session,
      );
    });
    if (!claimed) {
      const concurrent = await repository.findStockExportById(id);
      if (
        concurrent?.status === 'Completed'
        || concurrent?.processingCommandKey === commandKey
      ) return currentResponse(concurrent, true);
      throw new ApiError(409, 'Stock export changed concurrently', [], 'EXPORT_STALE_STATE');
    }

    let committed;
    try {
      committed = await transactionManager.withTransaction(async (session) => {
        const order = await repository.findOrderById(claimed.orderId, session);
        const cycle = claimed.cycleId
          ? await repository.findCycleById(claimed.cycleId, session)
          : null;
        const requestMatchesCycle = cycle
          && String(cycle.orderId) === String(claimed.orderId)
          && (
            (claimed.requestKind === 'Initial' && cycle.cycleType === 'Initial')
            || (claimed.requestKind === 'Resend' && cycle.cycleType === 'Resend')
          );
        if (!requestMatchesCycle || cycle.status !== 'AwaitingExport') {
          throw new ApiError(
            409,
            'Stock export requires its matching AwaitingExport fulfillment cycle',
            [],
            'EXPORT_CYCLE_STALE',
          );
        }
        const expectedOrderStatus = claimed.requestKind === 'Resend'
          ? 'Shipped'
          : 'Confirmed';
        if (!order || order.orderStatus !== expectedOrderStatus) {
          throw new ApiError(
            409,
            claimed.requestKind === 'Resend'
              ? 'Resend stock export requires the original Order to remain Shipped'
              : 'Stock export requires a Confirmed order',
            [],
            'EXPORT_STALE_STATE',
          );
        }
        const details = await repository.listOrderDetails(claimed.orderId, session);
        if (!details.length) {
          throw new ApiError(409, 'Stock export requires order items', [], 'EXPORT_INVALID_REQUEST');
        }

        for (const detail of details) {
          const quantity = Number(detail.quantity);
          const inventory = await repository.findInventoryByProductId(detail.productId, session);
          if (inventory?.inventoryHealth === 'ReconciliationRequired') {
            throw new ApiError(
              409,
              'Stock export is blocked while Inventory reconciliation is required',
              [],
              'EXPORT_INVENTORY_RECONCILIATION_REQUIRED',
            );
          }
          const sellable = Number(inventory?.sellableQuantity ?? inventory?.stockQuantity ?? 0);
          if (!inventory || sellable < quantity) {
            throw new ApiError(409, 'Insufficient stock for export', [], 'EXPORT_STOCK_INSUFFICIENT');
          }
          if (Number(inventory.reservedQuantity || 0) < quantity) {
            throw new ApiError(409, 'Stock export requires a full reservation', [], 'EXPORT_RESERVATION_MISSING');
          }
        }

        const inventories = [];
        for (const detail of details) {
          const quantity = Number(detail.quantity);
          const reservation = await repository.claimOrderReservationConsumption(
            order._id,
            detail._id,
            session,
          );
          if (!reservation) {
            throw new ApiError(
              409,
              'Order reservation lineage is missing or already consumed',
              [],
              'EXPORT_RESERVATION_MISSING',
            );
          }
          const before = await repository.findInventoryByProductId(detail.productId, session);
          const beforeSellable = Number(before.sellableQuantity ?? before.stockQuantity ?? 0);
          const after = await repository.captureReservation(
            detail.productId,
            quantity,
            userId,
            session,
          );
          if (!after) {
            throw new ApiError(409, 'Stock export requires a full reservation', [], 'EXPORT_RESERVATION_MISSING');
          }
          const afterSellable = Number(after.sellableQuantity ?? after.stockQuantity ?? 0);
          await repository.createTransaction({
            productId: before.productId && before.productId._id ? before.productId._id : before.productId,
            orderId: order._id,
            relatedCollection: 'StockExportRequest',
            relatedId: id,
            performedBy: userId,
            transactionType: 'STOCK_EXPORT',
            quantity: -quantity,
            beforeQuantity: beforeSellable,
            afterQuantity: afterSellable,
            reason: `Stock export for order ${order.orderCode}`,
            movementKey: `stock-export:${id}:${String(detail._id)}`,
            idempotencyKey: `stock-export:${id}:${String(detail._id)}`,
            dimension: 'sellable',
            beforeSellableQuantity: beforeSellable,
            afterSellableQuantity: afterSellable,
          }, session);
          inventories.push(after);
        }
        const completed = await repository.completeExport(id, commandKey, clock(), session);
        if (!completed) {
          throw new ApiError(409, 'Stock export could not be completed', [], 'EXPORT_STALE_STATE');
        }
        if (!completed.cycleId) {
          throw new ApiError(409, 'Stock export has no fulfillment cycle', [], 'EXPORT_CYCLE_MISSING');
        }
        const updatedCycle = await repository.updateCycle(
          completed.cycleId,
          { status: 'Exported' },
          session,
        );
        if (!updatedCycle) {
          throw new ApiError(409, 'Stock export fulfillment cycle is missing', [], 'EXPORT_CYCLE_MISSING');
        }
        await auditLogger.log({
          userId,
          action: 'INVENTORY_EXPORT_COMPLETED',
          targetEntity: 'StockExportRequest',
          targetId: String(id),
          description: `Completed exact stock export for order ${order.orderCode}`,
        }, session);
        return { completed, order, details, inventories };
      });
    } catch (error) {
      await transactionManager.withTransaction((session) => repository.failExport(
        id,
        commandKey,
        error.errorCode || 'EXPORT_FAILED',
        String(error.message || 'Stock export failed').slice(0, 1000),
        session,
      ));
      throw error;
    }

    for (const inventory of committed.inventories) {
      await lowStockLifecycle?.evaluate(inventory, { eventKey: `stock-export:${id}` });
    }
    return responseFor(committed.completed, committed.order, committed.details, false);
  }

  return { processStockExport };
}

module.exports = {
  createInventoryExportService,
  createModelRepository,
};
