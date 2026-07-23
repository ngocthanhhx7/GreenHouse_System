const { codReconciliationService } = require('../services/codReconciliation.service');
const { sendSuccess } = require('../utils/apiResponse');

async function recordCollection(req, res, next) {
  try {
    return sendSuccess(
      res,
      await codReconciliationService.recordCollectionEvidence(req.params.id, req.body),
      'Carrier COD collection evidence recorded'
    );
  } catch (error) {
    return next(error);
  }
}

async function recordSettlement(req, res, next) {
  try {
    return sendSuccess(
      res,
      await codReconciliationService.recordSettlementEvidence(req.params.id, req.body),
      'Carrier COD settlement evidence recorded'
    );
  } catch (error) {
    return next(error);
  }
}

async function finalizeRecovery(req, res, next) {
  try {
    return sendSuccess(
      res,
      await codReconciliationService.finalizeRecovery(req.user.id, req.params.id, req.body),
      'COD recovery finalized'
    );
  } catch (error) {
    return next(error);
  }
}

async function recordGoodsRecovery(req, res, next) {
  try {
    return sendSuccess(
      res,
      await codReconciliationService.recordGoodsRecovery(req.user.id, req.params.id, req.body),
      'Warehouse COD goods recovery recorded',
      201
    );
  } catch (error) {
    return next(error);
  }
}

async function listRecoveryCandidates(req, res, next) {
  try {
    return sendSuccess(res, await codReconciliationService.listWarehouseRecoveryCandidates());
  } catch (error) {
    return next(error);
  }
}

async function getRecoveryCandidate(req, res, next) {
  try {
    return sendSuccess(res, await codReconciliationService.getWarehouseRecoveryCandidate(req.params.id));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  recordCollection,
  recordSettlement,
  recordGoodsRecovery,
  finalizeRecovery,
  listRecoveryCandidates,
  getRecoveryCandidate,
};
