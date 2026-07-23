const { sendSuccess } = require('../utils/apiResponse');
const { adminAccountService } = require('../services/adminAccount.service');

async function listAccounts(req, res, next) {
  try { return sendSuccess(res, await adminAccountService.listAccounts({ actorUserId: req.user.id, ...req.query })); } catch (error) { return next(error); }
}
async function changeStatus(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.changeStatus({
      actorUserId: req.user.id,
      targetUserId: req.params.id,
      ...req.body,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey,
    }));
  } catch (error) { return next(error); }
}
async function transferRole(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.transferRole({
      actorUserId: req.user.id,
      targetUserId: req.params.id,
      ...req.body,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey,
    }));
  } catch (error) { return next(error); }
}
async function createInvitation(req, res, next) {
  try { return sendSuccess(res, await adminAccountService.createInvitation({ ...req.body, createdBy: req.user.id }), 'Đã tạo lời mời.', 201); } catch (error) { return next(error); }
}
async function resendInvitation(req, res, next) {
  try { return sendSuccess(res, await adminAccountService.resendInvitation({ ...req.body, invitationId: req.params.id })); } catch (error) { return next(error); }
}
async function revokeInvitation(req, res, next) {
  try { return sendSuccess(res, await adminAccountService.revokeInvitation({ ...req.body, invitationId: req.params.id })); } catch (error) { return next(error); }
}

module.exports = { listAccounts, changeStatus, transferRole, createInvitation, resendInvitation, revokeInvitation };
