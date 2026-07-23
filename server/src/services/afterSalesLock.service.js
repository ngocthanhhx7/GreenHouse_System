const AfterSalesOrderLock = require('../models/afterSalesOrderLock.model');

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function createAfterSalesLockService({ model = AfterSalesOrderLock, clock = () => new Date() } = {}) {
  return {
    async find(orderId, session) {
      return withSession(model.findOne({ orderId }), session).lean();
    },

    async claim({ orderId, caseType, caseId }, session) {
      const at = new Date(clock());
      const existing = await withSession(model.findOne({ orderId }), session).lean();
      if (!existing) {
        try {
          const [created] = await model.create([{
            orderId, caseType, caseId, status: 'Active', acquiredAt: at,
          }], session ? { session } : undefined);
          return created.toObject();
        } catch (error) {
          if (error?.code !== 11000) throw error;
          return null;
        }
      }
      if (existing.status === 'Active' || existing.status === 'ClosedPermanently') return null;
      return withSession(model.findOneAndUpdate(
        { _id: existing._id, status: 'Released' },
        {
          $set: {
            status: 'Active', caseType, caseId, acquiredAt: at,
            releasedAt: null, terminalStatus: '',
            previousCaseType: existing.caseType,
            previousCaseId: existing.caseId,
          },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },

    async release({ orderId, caseType, caseId, terminalStatus, closePermanently = false }, session) {
      return withSession(model.findOneAndUpdate(
        { orderId, status: 'Active', caseType, caseId },
        {
          $set: {
            status: closePermanently ? 'ClosedPermanently' : 'Released',
            releasedAt: new Date(clock()),
            terminalStatus,
          },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },

    async transfer({ orderId, fromCaseType, fromCaseId, toCaseType, toCaseId }, session) {
      return withSession(model.findOneAndUpdate(
        { orderId, status: 'Active', caseType: fromCaseType, caseId: fromCaseId },
        {
          $set: {
            caseType: toCaseType,
            caseId: toCaseId,
            previousCaseType: fromCaseType,
            previousCaseId: fromCaseId,
            acquiredAt: new Date(clock()),
            terminalStatus: '',
          },
        },
        { new: true, runValidators: true }
      ), session).lean();
    },
  };
}

module.exports = {
  createAfterSalesLockService,
  afterSalesLockService: createAfterSalesLockService(),
};
