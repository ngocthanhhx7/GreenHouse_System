const mongoose = require('mongoose');

const DamageReport = require('../models/damageReport.model');
const ExchangeCase = require('../models/exchangeCase.model');
const Inventory = require('../models/inventory.model');
const LowStockAlert = require('../models/lowStockAlert.model');
const Order = require('../models/order.model');
const ProductReview = require('../models/productReview.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const SupportRequest = require('../models/supportRequest.model');
const ApiError = require('../utils/apiError');

function same(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function exactRole(...roles) {
  return (actor) => roles.includes(actor.role);
}

function ownerOrRole(ownerField, ownerRole, ...otherRoles) {
  return (actor, record) => (actor.role === ownerRole && same(record[ownerField], actor.id))
    || otherRoles.includes(actor.role);
}

// Each policy is the current, minimal authorization projection needed before a
// notification may link into an owning slice. The destination API remains the
// authoritative field-safe DTO boundary and performs its normal authorization again.
const TARGET_POLICIES = Object.freeze({
  Order: {
    Model: Order,
    projection: '_id customerId orderStatus',
    filter(actor, id) {
      if (actor.role === 'Customer') return { _id: id, customerId: actor.id };
      if (actor.role === 'Staff') return { _id: id };
      return null;
    },
    authorize: ownerOrRole('customerId', 'Customer', 'Staff'),
    href(actor, record) {
      return actor.role === 'Customer' ? `/orders/${record._id}` : `/staff/orders/${record._id}`;
    },
  },
  ReturnRefundRequest: {
    Model: ReturnRefundRequest,
    projection: '_id customerId status',
    filter(actor, id) {
      if (actor.role === 'Customer') return { _id: id, customerId: actor.id };
      if (['Staff', 'WarehouseManager'].includes(actor.role)) return { _id: id };
      return null;
    },
    authorize: ownerOrRole('customerId', 'Customer', 'Staff', 'WarehouseManager'),
    href(actor, record) {
      if (actor.role === 'Customer') return '/return-refunds';
      if (actor.role === 'Staff') return `/staff/return-refunds/${record._id}`;
      return `/warehouse/return-refunds/${record._id}`;
    },
  },
  ExchangeCase: {
    Model: ExchangeCase,
    projection: '_id customerId status',
    filter(actor, id) {
      if (actor.role === 'Customer') return { _id: id, customerId: actor.id };
      if (['Staff', 'WarehouseManager'].includes(actor.role)) return { _id: id };
      return null;
    },
    authorize: ownerOrRole('customerId', 'Customer', 'Staff', 'WarehouseManager'),
    href(actor, record) {
      if (actor.role === 'Customer') return `/exchanges/${record._id}`;
      if (actor.role === 'Staff') return `/staff/exchanges/${record._id}`;
      return `/warehouse/exchanges/${record._id}`;
    },
  },
  ProductReview: {
    Model: ProductReview,
    projection: '_id customerId publicationStatus status',
    filter(actor, id) {
      if (actor.role === 'Customer') return { _id: id, customerId: actor.id };
      if (actor.role === 'Staff') return { _id: id };
      return null;
    },
    authorize: ownerOrRole('customerId', 'Customer', 'Staff'),
    href(actor) { return actor.role === 'Customer' ? '/reviews' : '/staff/reviews'; },
  },
  SupportRequest: {
    Model: SupportRequest,
    projection: '_id customerId status',
    filter(actor, id) {
      if (actor.role === 'Customer') return { _id: id, customerId: actor.id };
      if (actor.role === 'Staff') return { _id: id };
      return null;
    },
    authorize(actor, record) {
      return (actor.role === 'Customer' && same(record.customerId, actor.id))
        || actor.role === 'Staff';
    },
    href(actor, record) {
      return actor.role === 'Customer'
        ? `/support/${record._id}`
        : `/staff/support-requests/${record._id}`;
    },
  },
  Inventory: {
    Model: Inventory,
    projection: '_id inventoryHealth',
    filter(actor, id) { return actor.role === 'WarehouseManager' ? { _id: id } : null; },
    authorize: exactRole('WarehouseManager'),
    href() { return '/warehouse/inventory'; },
  },
  LowStockAlert: {
    Model: LowStockAlert,
    projection: '_id status inventoryId productId',
    filter(actor, id) { return actor.role === 'WarehouseManager' ? { _id: id } : null; },
    authorize: exactRole('WarehouseManager'),
    href() { return '/warehouse/low-stock'; },
  },
  StockExportRequest: {
    Model: StockExportRequest,
    projection: '_id requestedBy orderId status',
    filter(actor, id) {
      if (actor.role === 'Staff') return { _id: id, requestedBy: actor.id };
      if (actor.role === 'WarehouseManager') return { _id: id };
      return null;
    },
    authorize(actor, record) {
      return (actor.role === 'Staff' && same(record.requestedBy, actor.id))
        || actor.role === 'WarehouseManager';
    },
    href(actor, record) {
      return actor.role === 'Staff'
        ? `/staff/orders/${record.orderId}`
        : `/warehouse/stock-exports/${record._id}`;
    },
  },
  ReplenishmentRequest: {
    Model: ReplenishmentRequest,
    projection: '_id requestedBy status',
    filter(actor, id) {
      if (actor.role === 'WarehouseManager') return { _id: id, requestedBy: actor.id };
      if (actor.role === 'Admin') return { _id: id };
      return null;
    },
    authorize: ownerOrRole('requestedBy', 'WarehouseManager', 'Admin'),
    href(actor) { return actor.role === 'Admin' ? '/admin/replenishments' : '/warehouse/replenishments'; },
  },
  DamageReport: {
    Model: DamageReport,
    projection: '_id reportedBy status',
    filter(actor, id) {
      if (actor.role === 'Staff') return { _id: id, reportedBy: actor.id };
      if (actor.role === 'WarehouseManager') return { _id: id };
      return null;
    },
    authorize: ownerOrRole('reportedBy', 'Staff', 'WarehouseManager'),
    href(actor, record) {
      return actor.role === 'Staff'
        ? '/staff/damage-reports'
        : '/warehouse/damage-reports';
    },
  },
});

function unavailable() {
  return new ApiError(404, 'Notification target unavailable', [], 'NOTIFICATION_TARGET_UNAVAILABLE');
}

function isSafeInternalHref(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('undefined')
    && !value.includes('null');
}

function authorizeCurrentTargetRecord(actor = {}, target = {}, record = null) {
  const policy = TARGET_POLICIES[target.collection];
  if (!policy || !record || !same(record._id, target.id)
    || actor.status !== 'Active' || !policy.authorize(actor, record)) return null;
  const href = policy.href(actor, record);
  return isSafeInternalHref(href) ? { href } : null;
}

function createModelTargetAuthorizer() {
  return {
    async authorizeCurrent(actor, target) {
      const policy = TARGET_POLICIES[target.collection];
      if (!policy || actor.status !== 'Active' || !mongoose.isValidObjectId(target.id)) return null;
      const filter = policy.filter(actor, target.id);
      if (!filter) return null;
      const record = await policy.Model.findOne(filter).select(policy.projection).lean();
      return authorizeCurrentTargetRecord(actor, target, record);
    },
  };
}

function createNotificationTargetResolver({ targetAuthorizer = createModelTargetAuthorizer() } = {}) {
  if (!targetAuthorizer?.authorizeCurrent) throw new Error('Notification target current-read authorizer is required');
  return {
    async resolve(actor = {}, target = {}) {
      const normalizedTarget = {
        collection: String(target.collection || ''),
        id: String(target.id || ''),
      };
      if (!actor.id || !actor.role || actor.status !== 'Active'
        || !TARGET_POLICIES[normalizedTarget.collection] || !normalizedTarget.id) throw unavailable();
      try {
        const authorization = await targetAuthorizer.authorizeCurrent(actor, normalizedTarget);
        if (!authorization || !isSafeInternalHref(authorization.href)) {
          throw unavailable();
        }
        return { href: authorization.href };
      } catch (_error) {
        throw unavailable();
      }
    },
  };
}

module.exports = {
  TARGET_POLICIES,
  authorizeCurrentTargetRecord,
  createModelTargetAuthorizer,
  createModelTargetRepository: createModelTargetAuthorizer,
  createNotificationTargetResolver,
};
