const { authService } = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');
const { createEmailOutboxService } = require('../services/email.service');
const { createPasswordResetService } = require('../services/passwordReset.service');
const mongoose = require('mongoose');
const { sessionService } = require('../services/session.service');
const { registrationService } = require('../services/registration.service');
const { internalInvitationService } = require('../services/internalInvitation.service');
const { createCsrfToken } = require('../middlewares/csrf.middleware');
const {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} = require('../utils/sessionCookie');

const passwordResetService = createPasswordResetService({
  outboxService: createEmailOutboxService(),
  transactionManager: {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => { result = await work(session); });
        return result;
      } finally {
        await session.endSession();
      }
    },
  },
});

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
    setSessionCookie(res, result.sessionSelector);
    return sendSuccess(res, { user: result.user }, 'Đăng nhập thành công.');
  } catch (error) {
    return next(error);
  }
}

async function me(req, res) {
  return sendSuccess(res, { user: req.user }, 'Current user loaded');
}

async function logout(req, res, next) {
  try {
    const result = await sessionService.revokeCurrent(readSessionCookie(req), 'LOGOUT');
    clearSessionCookie(res);
    return sendSuccess(
      res,
      result,
      result.alreadyProcessed ? 'Phiên đã được đăng xuất trước đó.' : 'Đăng xuất thành công.'
    );
  } catch (error) {
    return next(error);
  }
}

function resolveIdempotency(req) {
  const headerValue = req.get('Idempotency-Key') || '';
  const bodyValue = req.body?.idempotencyKey || '';
  if (headerValue && bodyValue && headerValue !== bodyValue) {
    throw new (require('../utils/apiError'))(409, 'Mã idempotency trong body và header không khớp.', [], 'IDEMPOTENCY_MISMATCH');
  }
  return headerValue || bodyValue;
}

async function requestRegistrationChallenge(req, res, next) {
  try {
    const result = await registrationService.requestRegistrationChallenge({
      ...req.body,
      idempotencyKey: resolveIdempotency(req),
      ip: req.ip,
    });
    return sendSuccess(res, result, 'Nếu email hợp lệ, mã xác minh sẽ được gửi đến bạn.');
  } catch (error) {
    return next(error);
  }
}

async function completeRegistration(req, res, next) {
  try {
    const result = await registrationService.completeRegistration({
      ...req.body,
      idempotencyKey: resolveIdempotency(req),
    });
    return sendSuccess(res, result, 'Xác minh thành công. Vui lòng đăng nhập.', 201);
  } catch (error) {
    return next(error);
  }
}

async function acceptInvitation(req, res, next) {
  try {
    const result = await internalInvitationService.acceptInvitation({
      ...req.body,
      idempotencyKey: resolveIdempotency(req),
    });
    return sendSuccess(res, result, 'Lời mời đã được chấp nhận. Vui lòng đăng nhập.', 201);
  } catch (error) {
    return next(error);
  }
}

async function csrf(req, res) {
  return sendSuccess(res, {
    csrfToken: createCsrfToken({
      sessionId: req.authSession.id,
      csrfSecret: req.authSession.csrfSecret,
    }),
  }, 'Đã tạo mã bảo vệ yêu cầu.');
}

async function forgotPassword(req, res, next) {
  try {
    const result = await passwordResetService.requestReset(req.body.email);
    return sendSuccess(res, null, result.message);
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const result = await passwordResetService.resetPassword(req.body);
    return sendSuccess(res, null, result.message);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
  csrf,
  requestRegistrationChallenge,
  completeRegistration,
  acceptInvitation,
};
