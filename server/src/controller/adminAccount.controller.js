const ApiError = require('../utils/apiError');
const { sendSuccess } = require('../utils/apiResponse');
const { adminAccountService } = require('../services/adminAccount.service');

function resolveIdempotency(req) {
  const headerValue = req.get('Idempotency-Key') || '';
  const bodyValue = req.body?.idempotencyKey || '';
  if (headerValue && bodyValue && headerValue !== bodyValue) {
    throw new ApiError(
      409,
      'Mã idempotency trong body và header không khớp.',
      [],
      'IDEMPOTENCY_MISMATCH',
    );
  }
  return headerValue || bodyValue;
}

async function listAccounts(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.listAccounts({
      ...req.query,
      actorUserId: req.user.id,
    }));
  } catch (error) {
    return next(error);
  }
}

async function changeStatus(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.changeStatus({
      ...req.body,
      actorUserId: req.user.id,
      targetUserId: req.params.id,
      idempotencyKey: resolveIdempotency(req),
    }));
  } catch (error) {
    return next(error);
  }
}

async function transferRole(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.transferRole({
      ...req.body,
      actorUserId: req.user.id,
      targetUserId: req.params.id,
      idempotencyKey: resolveIdempotency(req),
    }));
  } catch (error) {
    return next(error);
  }
}

async function createInvitation(req, res, next) {
  try {
    return sendSuccess(
      res,
      await adminAccountService.createInvitation({
        ...req.body,
        actorUserId: req.user.id,
        idempotencyKey: resolveIdempotency(req),
      }),
      'Đã tạo lời mời.',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function resendInvitation(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.resendInvitation({
      ...req.body,
      invitationId: req.params.id,
      actorUserId: req.user.id,
      idempotencyKey: resolveIdempotency(req),
    }));
  } catch (error) {
    return next(error);
  }
}

async function revokeInvitation(req, res, next) {
  try {
    return sendSuccess(res, await adminAccountService.revokeInvitation({
      ...req.body,
      invitationId: req.params.id,
      actorUserId: req.user.id,
      idempotencyKey: resolveIdempotency(req),
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAccounts,
  changeStatus,
  transferRole,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  resolveIdempotency,
};
