const ApiError = require('../utils/apiError');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');
const ReturnItem = require('../models/returnItem.model');

const WAREHOUSE_VISIBLE_STATUSES = new Set([
  'Approved', 'AwaitingInspection', 'Received', 'ReadyForRefund', 'Completed', 'CODRecoveryInProgress',
]);
const SAFE_FILENAME = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

async function findLinkedRequestFromModels(candidateUrls) {
  const direct = await ReturnRefundRequest.findOne({ evidenceImages: { $in: candidateUrls } })
    .select('_id customerId status')
    .lean();
  if (direct) return direct;

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
