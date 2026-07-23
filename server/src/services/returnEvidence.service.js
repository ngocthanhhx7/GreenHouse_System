const ApiError = require('../utils/apiError');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const ReturnItem = require('../models/returnItem.model');
const ExchangeCase = require('../models/exchangeCase.model');
const ExchangeLine = require('../models/exchangeLine.model');
const ExchangeInspection = require('../models/exchangeInspection.model');

const WAREHOUSE_VISIBLE_STATUSES = new Set([
  'Approved', 'AwaitingInspection', 'Received', 'ReadyForRefund', 'Completed', 'CODRecoveryInProgress',
  'CustomerShipped', 'WarehouseInspecting', 'OutboundFulfillment',
  'ReplacementShipped', 'DeliveryIncident', 'ClosedNoExchange',
]);
const SAFE_FILENAME = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

async function findLinkedRequestFromModels(candidateUrls) {
  const direct = await ReturnRefundRequest.findOne({ evidenceImages: { $in: candidateUrls } })
    .select('_id customerId status')
    .lean();
  if (direct) return direct;

  const exchange = await ExchangeCase.findOne({ evidenceImages: { $in: candidateUrls } })
    .select('_id customerId status')
    .lean();
  if (exchange) return exchange;

  const exchangeLine = await ExchangeLine.findOne({ rejectionEvidenceImages: { $in: candidateUrls } })
    .select('exchangeCaseId')
    .lean();
  if (exchangeLine) {
    const linked = await ExchangeCase.findById(exchangeLine.exchangeCaseId).select('_id customerId status').lean();
    if (linked) return linked;
  }

  const inspection = await ExchangeInspection.findOne({ evidenceImages: { $in: candidateUrls } })
    .select('exchangeCaseId')
    .lean();
  if (inspection) {
    const linked = await ExchangeCase.findById(inspection.exchangeCaseId).select('_id customerId status').lean();
    if (linked) return linked;
  }

  const returnItem = await ReturnItem.findOne({ evidenceImages: { $in: candidateUrls } })
    .select('returnRefundRequestId')
    .lean();
  if (!returnItem) return null;
  return ReturnRefundRequest.findById(returnItem.returnRefundRequestId)
    .select('_id customerId status')
    .lean();
}

function createReturnEvidenceAccessService({ findLinkedRequest = findLinkedRequestFromModels } = {}) {
  return {
    async authorize(actorId, actorRole, rawFilename) {
      const filename = String(rawFilename || '').toLowerCase();
      if (!SAFE_FILENAME.test(filename)) throw new ApiError(404, 'Return evidence not found');

      const candidateUrls = [
        `/api/return-refunds/evidence/${filename}`,
        `/api/exchanges/evidence/${filename}`,
        `/uploads/return-evidence/${filename}`,
      ];
      const request = await findLinkedRequest(candidateUrls);
      if (!request) throw new ApiError(404, 'Return evidence not found');

      const isAllowed = actorRole === 'Staff'
        || (actorRole === 'Customer' && String(request.customerId) === String(actorId))
        || (actorRole === 'WarehouseManager' && WAREHOUSE_VISIBLE_STATUSES.has(request.status));
      if (!isAllowed) throw new ApiError(404, 'Return evidence not found');
      return { filename, requestId: String(request._id || '') };
    },
  };
}

module.exports = {
  createReturnEvidenceAccessService,
  returnEvidenceAccessService: createReturnEvidenceAccessService(),
};
