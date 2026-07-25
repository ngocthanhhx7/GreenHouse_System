const { randomUUID } = require('node:crypto');

const EmailOutbox = require('../models/emailOutbox.model');
const { logAudit } = require('../utils/auditLogger');
const { sanitizeEmailEventPayload } = require('../utils/emailPayloadSanitizer');
const { decryptOtp } = require('./passwordReset.service');

const MAX_DELIVERY_ATTEMPTS = 5;
const SAFE_DELIVERY_ERRORS = Object.freeze({
  EMAIL_PROVIDER_DISABLED: 'Email provider is disabled',
  EMAIL_PROVIDER_REJECTED: 'Email provider rejected delivery',
  EMAIL_PROVIDER_TIMEOUT: 'Email provider request timed out',
});

function assertEmailConfig(env = process.env) {
  if (env.MAIL_PROVIDER !== 'smtp') return true;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.MAIL_FROM) {
    throw new Error('Thiếu cấu hình SMTP_HOST, SMTP_USER, SMTP_PASS hoặc MAIL_FROM.');
  }
  if (!env.RESET_OTP_SECRET || env.RESET_OTP_SECRET.length < 32) {
    throw new Error('RESET_OTP_SECRET phải có ít nhất 32 ký tự khi bật SMTP.');
  }
  return true;
}

function renderEmail(
  entry,
  otpSecret,
  { clientUrl = process.env.CLIENT_URL || 'http://localhost:5173' } = {},
) {
  const payload = entry.payload || {};
  if (entry.eventType === 'PASSWORD_RESET_OTP_REQUESTED') {
    const otp = decryptOtp(payload.encryptedOtp, otpSecret);
    return {
      subject: 'Mã OTP đặt lại mật khẩu GreenHome Kitchen',
      text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong ${payload.expiresInMinutes || 10} phút. Không chia sẻ mã này với bất kỳ ai.`,
    };
  }
  if (entry.eventType === 'REGISTRATION_OTP_REQUESTED') {
    const otp = decryptOtp(payload.encryptedOtp, otpSecret);
    return {
      subject: 'Mã xác minh đăng ký GreenHome Kitchen',
      text: `Mã xác minh đăng ký của bạn là ${otp}. Mã có hiệu lực trong ${payload.expiresInMinutes || 10} phút. Không chia sẻ mã này với bất kỳ ai.`,
    };
  }
  if (entry.eventType === 'INTERNAL_INVITATION_CREATED') {
    const token = decryptOtp(payload.encryptedToken, otpSecret);
    const link = new URL('/accept-invitation', clientUrl);
    link.searchParams.set('email', entry.recipient);
    link.searchParams.set('token', token);
    return {
      subject: 'Lời mời tham gia GreenHome Kitchen',
      text: `Bạn được mời tham gia GreenHome Kitchen với vai trò ${payload.roleName || 'nhân viên'}. Hoàn tất kích hoạt tài khoản tại: ${link.toString()}`,
    };
  }
  if (entry.eventType === 'ACCOUNT_REGISTRATION_COMPLETED') {
    return {
      subject: 'Đăng ký thành công - GreenHome Kitchen',
      text: `Xin chào ${payload.fullName || 'bạn'}, tài khoản GreenHome Kitchen của bạn đã được tạo thành công. Bạn có thể đăng nhập để bắt đầu mua sắm.`,
    };
  }
  if (entry.eventType === 'INTERNAL_INVITATION_ACCEPTED') {
    return {
      subject: 'Kích hoạt thành công - GreenHome Kitchen',
      text: `Xin chào ${payload.fullName || 'bạn'}, tài khoản ${payload.roleName || 'nhân viên'} của bạn đã được kích hoạt thành công. Vui lòng đăng nhập để bắt đầu làm việc.`,
    };
  }
  if (entry.eventType === 'PASSWORD_RESET_COMPLETED') {
    return {
      subject: 'Đặt lại mật khẩu thành công - GreenHome Kitchen',
      text: 'Mật khẩu GreenHome Kitchen của bạn đã được đặt lại thành công. Tất cả phiên đăng nhập cũ đã bị thu hồi. Nếu bạn không thực hiện thao tác này, vui lòng liên hệ hỗ trợ ngay.',
    };
  }
  if (entry.eventType === 'PROFILE_PASSWORD_CHANGED') {
    return {
      subject: 'Mật khẩu đã thay đổi - GreenHome Kitchen',
      text: `Xin chào ${payload.fullName || 'bạn'}, mật khẩu GreenHome Kitchen của bạn đã thay đổi và tất cả phiên đăng nhập cũ đã bị thu hồi. Nếu bạn không thực hiện thao tác này, vui lòng liên hệ hỗ trợ ngay.`,
    };
  }
  if (entry.eventType === 'CONTACT_SUBMISSION') {
    return {
      subject: `Liên hệ mới: ${payload.subject || payload.name || 'khách hàng GreenHome'}`,
      text: `Họ tên: ${payload.name || ''}\nEmail: ${payload.email || ''}\nSố điện thoại: ${payload.phone || ''}\nChủ đề: ${payload.subject || ''}\nNội dung: ${payload.message || ''}`,
    };
  }
  if (entry.eventType === 'ORDER_CREATED') {
    return {
      subject: `GreenHome đã nhận đơn hàng ${payload.orderCode || ''}`.trim(),
      text: `Đơn hàng ${payload.orderCode || ''} đã được tạo thành công. Tổng thanh toán: ${payload.totalAmount || 0} VND.`,
    };
  }
  throw new Error(`Unsupported email event: ${entry.eventType}`);
}

function createEmailProvider(providerName = process.env.MAIL_PROVIDER || 'disabled', options = {}) {
  if (providerName === 'fake') return { async send() { return { accepted: true }; } };
  if (providerName !== 'smtp') return { async send() { return { accepted: false, disabled: true }; } };

  const config = { ...process.env, SMTP_HOST: options.host || process.env.SMTP_HOST, SMTP_USER: options.user || process.env.SMTP_USER, SMTP_PASS: options.pass || process.env.SMTP_PASS, MAIL_FROM: options.from || process.env.MAIL_FROM, RESET_OTP_SECRET: options.otpSecret || process.env.RESET_OTP_SECRET };
  if (!options.transporter) assertEmailConfig({ ...config, MAIL_PROVIDER: 'smtp' });
  else if (!config.RESET_OTP_SECRET || config.RESET_OTP_SECRET.length < 32) throw new Error('RESET_OTP_SECRET phải có ít nhất 32 ký tự khi bật SMTP.');
  const host = config.SMTP_HOST;
  const port = Number(options.port || process.env.SMTP_PORT || 465);
  const secure = options.secure ?? String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
  const user = config.SMTP_USER;
  const pass = config.SMTP_PASS;
  const from = config.MAIL_FROM || user;
  const otpSecret = config.RESET_OTP_SECRET;
  const clientUrl = options.clientUrl || process.env.CLIENT_URL || 'http://localhost:5173';
  let transporter = options.transporter;

  if (!transporter) {
    // Loaded only when SMTP is enabled so tests and local disabled mode stay offline.
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }

  return {
    async send(entry) {
      const content = renderEmail(entry, otpSecret, { clientUrl });
      const result = await transporter.sendMail({ from, to: entry.recipient, ...content });
      return { accepted: true, messageId: result && result.messageId };
    },
  };
}

function createModelEmailOutboxRepository({
  model = EmailOutbox,
  createClaimId = randomUUID,
} = {}) {
  function completeAttempt(id, data, claimId) {
    const rootUpdate = {
      status: data.status,
      availableAt: data.availableAt,
      leaseUntil: null,
      claimId: '',
      lastError: data.errorMessage || '',
      sentAt: data.sentAt || null,
      providerMessageId: data.providerMessageId || '',
      updatedAt: data.attemptCompletedAt,
    };
    return model.findOneAndUpdate(
      {
        _id: id,
        status: 'Processing',
        claimId,
        attempts: { $elemMatch: { claimId, completedAt: null } },
      },
      {
        $set: {
          ...rootUpdate,
          'attempts.$[attempt].completedAt': data.attemptCompletedAt,
          'attempts.$[attempt].outcome': data.attemptOutcome,
          'attempts.$[attempt].errorCode': data.errorCode || '',
          'attempts.$[attempt].errorMessage': data.errorMessage || '',
          'attempts.$[attempt].providerMessageId': data.providerMessageId || '',
        },
      },
      {
        arrayFilters: [{ 'attempt.claimId': claimId, 'attempt.completedAt': null }],
        new: true,
      }
    ).lean();
  }

  return {
    async findByIdempotencyKey(key, session) {
      const query = model.findOne({ idempotencyKey: key });
      return (session ? query.session(session) : query).lean();
    },
    async create(data, session) {
      const [created] = await model.create([data], session ? { session } : undefined);
      return created.toObject();
    },
    async finalizeExpiredTerminal(now) {
      const expired = await model.findOneAndUpdate(
        {
          status: 'Processing',
          leaseUntil: { $lte: now },
          attemptCount: { $gte: MAX_DELIVERY_ATTEMPTS },
        },
        [{
          $set: {
            status: 'Failed',
            availableAt: null,
            leaseUntil: null,
            lastError: 'Email delivery lease expired',
            updatedAt: now,
            attempts: {
              $map: {
                input: { $ifNull: ['$attempts', []] },
                as: 'attempt',
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$$attempt.claimId', '$claimId'] },
                        { $eq: [{ $ifNull: ['$$attempt.completedAt', null] }, null] },
                      ],
                    },
                    {
                      $mergeObjects: [
                        '$$attempt',
                        {
                          completedAt: now,
                          outcome: 'Failed',
                          errorCode: 'EMAIL_LEASE_EXPIRED',
                          errorMessage: 'Email delivery lease expired',
                        },
                      ],
                    },
                    '$$attempt',
                  ],
                },
              },
            },
            claimId: '',
          },
        }],
        { sort: { leaseUntil: 1 }, new: true }
      ).lean();
      return expired ? { ...expired, recoveredTerminalLease: true } : null;
    },
    async claimNext(now, leaseUntil) {
      const claimId = createClaimId();
      const nextAttempt = { $add: [{ $ifNull: ['$attemptCount', 0] }, 1] };
      const closeExpiredAttempts = {
        $map: {
          input: { $ifNull: ['$attempts', []] },
          as: 'attempt',
          in: {
            $cond: [
              {
                $and: [
                  { $eq: ['$$attempt.claimId', '$claimId'] },
                  { $eq: [{ $ifNull: ['$$attempt.completedAt', null] }, null] },
                ],
              },
              {
                $mergeObjects: [
                  '$$attempt',
                  {
                    completedAt: now,
                    outcome: 'LeaseExpired',
                    errorCode: 'EMAIL_LEASE_EXPIRED',
                    errorMessage: 'Email delivery lease expired',
                  },
                ],
              },
              '$$attempt',
            ],
          },
        },
      };
      return model.findOneAndUpdate(
        {
          $expr: {
            $lt: [{ $ifNull: ['$attemptCount', 0] }, MAX_DELIVERY_ATTEMPTS],
          },
          $or: [
            {
              status: { $in: ['Pending', 'RetryScheduled'] },
              availableAt: { $lte: now },
            },
            { status: 'Processing', leaseUntil: { $lte: now } },
          ],
        },
        [{
          $set: {
            status: 'Processing',
            leaseUntil,
            claimId,
            attemptCount: nextAttempt,
            updatedAt: now,
            attempts: {
              $concatArrays: [
                closeExpiredAttempts,
                [{
                  attemptNumber: nextAttempt,
                  claimId,
                  claimedAt: now,
                  leaseUntil,
                  completedAt: null,
                  outcome: 'Processing',
                  errorCode: '',
                  errorMessage: '',
                  providerMessageId: '',
                }],
              ],
            },
          },
        }],
        { sort: { availableAt: 1, createdAt: 1 }, new: true }
      ).lean();
    },
    async markSent(id, data, claimId) {
      return completeAttempt(id, data, claimId);
    },
    async markFailed(id, data, claimId) {
      return completeAttempt(id, data, claimId);
    },
  };
}

function providerError(code, safeMessage) {
  const error = new Error(safeMessage);
  error.deliveryCode = code;
  return error;
}

function safeProviderMessageId(value) {
  const normalized = String(value || '').trim();
  return /^[A-Za-z0-9._:@<>-]{1,200}$/.test(normalized) ? normalized : '';
}

async function sendWithTimeout(provider, entry, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.send(entry)),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(providerError('EMAIL_PROVIDER_TIMEOUT', 'Email provider request timed out')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createEmailOutboxService({
  repository = createModelEmailOutboxRepository(),
  provider = createEmailProvider(),
  now = () => new Date(),
  leaseMs = 60_000,
  providerTimeoutMs = 30_000,
  retryBaseMs = 60_000,
  auditLogger = logAudit,
  logger = console,
} = {}) {
  async function auditDelivery(entry, status, errorCode = '') {
    const attemptNumber = Math.max(1, Number(entry.attemptCount || 1));
    const claimIdentity = entry.claimId
      || entry.attempts?.findLast?.((attempt) => attempt.attemptNumber === attemptNumber)?.claimId
      || 'unknown-claim';
    const businessEventId = `${entry.idempotencyKey || entry._id}:EMAIL_DELIVERY:${claimIdentity}`
      .slice(0, 240);
    try {
      await auditLogger({
        actorType: 'EmailService',
        actorId: null,
        source: 'EmailService',
        action: status === 'LostLease'
          ? 'EMAIL_DELIVERY_LEASE_LOST'
          : 'EMAIL_DELIVERY_ATTEMPT_COMPLETED',
        targetType: 'EmailOutbox',
        targetId: String(entry._id),
        outcome: status === 'Sent' ? 'Success' : 'Failed',
        correlationId: String(entry.idempotencyKey || entry._id).slice(0, 240),
        businessEventId,
        reasonCode: errorCode,
        reason: `Email delivery attempt completed with ${status}`,
        previousState: 'Processing',
        newState: status,
        safeFacts: {
          attemptNumber,
          deliveryStatus: status,
          ...(errorCode ? { errorCode } : {}),
        },
        timestamp: now(),
      });
      return 'Written';
    } catch {
      try {
        logger.error('Email delivery audit write failed', {
          code: 'EMAIL_AUDIT_WRITE_FAILED',
          outboxId: String(entry._id),
          attemptNumber,
        });
      } catch {
        // The durable delivery state is authoritative even if operational logging also fails.
      }
      return 'Failed';
    }
  }

  async function withAudit(entry, result, errorCode = '') {
    const auditStatus = await auditDelivery(entry, result.status, errorCode);
    return { ...result, auditStatus };
  }

  return {
    async enqueue(event, session) {
      const payload = sanitizeEmailEventPayload(event.eventType, event.payload);
      const existing = await repository.findByIdempotencyKey(event.idempotencyKey, session);
      if (existing) return existing;
      try {
        return await repository.create({
          eventType: event.eventType,
          idempotencyKey: event.idempotencyKey,
          recipient: event.recipient,
          payload,
          status: 'Pending',
          attemptCount: 0,
          attempts: [],
          availableAt: now(),
        }, session);
      } catch (error) {
        if (error && error.code === 11000) return repository.findByIdempotencyKey(event.idempotencyKey, session);
        throw error;
      }
    },
    async deliverNext() {
      const current = now();
      const expiredTerminal = repository.finalizeExpiredTerminal
        ? await repository.finalizeExpiredTerminal(current)
        : null;
      if (expiredTerminal) {
        return withAudit(expiredTerminal, {
          ...expiredTerminal,
          status: 'Failed',
          errorCode: 'EMAIL_LEASE_EXPIRED',
        }, 'EMAIL_LEASE_EXPIRED');
      }
      const entry = await repository.claimNext(current, new Date(current.getTime() + leaseMs));
      if (!entry) return null;
      const reclaimedAttempt = entry.attempts?.find((attempt) => (
        Number(attempt.attemptNumber) === Number(entry.attemptCount) - 1
        && attempt.outcome === 'LeaseExpired'
      ));
      if (reclaimedAttempt) {
        await auditDelivery({
          ...entry,
          attemptCount: reclaimedAttempt.attemptNumber,
          claimId: reclaimedAttempt.claimId,
        }, 'LostLease', 'EMAIL_LEASE_EXPIRED');
      }
      let result;
      try {
        result = await sendWithTimeout(provider, entry, providerTimeoutMs);
        if (result && result.disabled) {
          throw providerError('EMAIL_PROVIDER_DISABLED', 'Email provider is disabled');
        }
        if (result && result.accepted === false) {
          throw providerError('EMAIL_PROVIDER_REJECTED', 'Email provider rejected delivery');
        }
      } catch (error) {
        const attempt = Math.max(1, Number(entry.attemptCount || 1));
        const terminal = attempt >= MAX_DELIVERY_ATTEMPTS;
        const status = terminal ? 'Failed' : 'RetryScheduled';
        const knownErrorMessage = SAFE_DELIVERY_ERRORS[error && error.deliveryCode];
        const errorCode = knownErrorMessage
          ? error.deliveryCode
          : 'EMAIL_PROVIDER_ERROR';
        const errorMessage = knownErrorMessage || 'Email provider request failed';
        const delay = Math.min(60 * 60_000, retryBaseMs * (2 ** Math.min(attempt - 1, 10)));
        const completedAt = now();
        const finalized = await repository.markFailed(entry._id, {
          status,
          availableAt: terminal ? null : new Date(completedAt.getTime() + delay),
          attemptCompletedAt: completedAt,
          attemptOutcome: status,
          errorCode,
          errorMessage,
          providerMessageId: '',
        }, entry.claimId);
        if (finalized === null) {
          return withAudit(entry, { ...entry, status: 'LostLease' }, 'EMAIL_LEASE_LOST');
        }
        return withAudit(entry, { ...entry, status }, errorCode);
      }

      const completedAt = now();
      const providerMessageId = safeProviderMessageId(result && result.messageId);
      const finalized = await repository.markSent(entry._id, {
        status: 'Sent',
        availableAt: null,
        sentAt: completedAt,
        attemptCompletedAt: completedAt,
        attemptOutcome: 'Sent',
        errorCode: '',
        errorMessage: '',
        providerMessageId,
      }, entry.claimId);
      if (finalized === null) {
        return withAudit(entry, { ...entry, status: 'LostLease' }, 'EMAIL_LEASE_LOST');
      }
      return withAudit(entry, { ...entry, status: 'Sent' });
    },
  };
}

module.exports = {
  createEmailProvider,
  createEmailOutboxService,
  createModelEmailOutboxRepository,
  sanitizeEmailEventPayload,
  renderEmail,
  assertEmailConfig,
};
