const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const PasswordResetToken = require('../models/passwordResetToken.model');
const { hashPassword: defaultHashPassword } = require('../utils/password');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');
const { sessionService: defaultSessionService } = require('./session.service');

const GENERIC_RESPONSE = 'Nếu email tồn tại, mã OTP đặt lại mật khẩu sẽ được gửi đến hộp thư của bạn.';

function resolveOtpSecret({
  value,
  environment = process.env.NODE_ENV,
  resetSecret = process.env.RESET_OTP_SECRET,
  jwtSecret = process.env.JWT_SECRET,
} = {}) {
  const secret = String(
    value
      || resetSecret
      || (environment === 'production' ? '' : jwtSecret)
      || (environment === 'production' ? '' : 'greenhome-development-otp-secret'),
  );
  if (environment === 'production' && secret.length < 32) {
    throw new Error('RESET_OTP_SECRET phải có ít nhất 32 ký tự trong production.');
  }
  return secret;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashOtp(email, otp, secret) {
  return crypto.createHmac('sha256', secret).update(`${normalizeEmail(email)}:${otp}`).digest('hex');
}

function encryptOtp(otp, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(otp), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptOtp(encryptedValue, secret) {
  const [ivValue, tagValue, ciphertextValue] = String(encryptedValue || '').split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted OTP payload');
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
}

function createModelUserRepository() {
  return {
    async findByEmail(email, session) {
      const query = User.findOne({ email });
      return (session ? query.session(session) : query).lean();
    },
    async updatePasswordIfCredentialVersion(id, expectedVersion, data, session) {
      const credentialFilter = expectedVersion === 0
        ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
        : { credentialVersion: expectedVersion };
      const query = User.findOneAndUpdate(
        { _id: id, ...credentialFilter },
        { $set: data, $inc: { credentialVersion: 1 } },
        { new: true }
      );
      return (session ? query.session(session) : query).lean();
    },
  };
}

function createModelTokenRepository() {
  return {
    async invalidateForUser(userId, now, session) {
      const query = PasswordResetToken.updateMany(
        { userId, usedAt: null },
        { $set: { usedAt: now } },
      );
      return session ? query.session(session) : query;
    },
    async create(data, session) {
      if (!session) return (await PasswordResetToken.create(data)).toObject();
      const [created] = await PasswordResetToken.create([data], { session });
      return created.toObject();
    },
    async findLatestForUser(userId, session) {
      const query = PasswordResetToken.findOne({ userId, usedAt: null })
        .select('+otpHash')
        .sort({ createdAt: -1 });
      return (session ? query.session(session) : query).lean();
    },
    async recordFailedAttempt(id, now, maxAttempts) {
      const token = await PasswordResetToken.findOneAndUpdate(
        { _id: id, usedAt: null, attemptCount: { $lt: maxAttempts } },
        { $inc: { attemptCount: 1 } },
        { new: true }
      ).select('+otpHash').lean();
      if (token && token.attemptCount >= maxAttempts) {
        token.usedAt = now;
        await PasswordResetToken.updateOne({ _id: id, usedAt: null }, { $set: { usedAt: now } });
      }
      return token;
    },
    async consume(id, now, maxAttempts, session) {
      const query = PasswordResetToken.findOneAndUpdate(
        { _id: id, usedAt: null, expiresAt: { $gt: now }, attemptCount: { $lt: maxAttempts } },
        { $set: { usedAt: now } },
        { new: true }
      );
      return (session ? query.session(session) : query).lean();
    },
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateResetInput({ email, otp, password, confirmPassword }) {
  const errors = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) errors.push({ field: 'email', message: 'Email không hợp lệ.' });
  if (!/^\d{6}$/.test(String(otp || ''))) errors.push({ field: 'otp', message: 'Mã OTP phải gồm đúng 6 chữ số.' });
  if (password !== confirmPassword) errors.push({ field: 'confirmPassword', message: 'Xác nhận mật khẩu không khớp.' });
  if (errors.length) throw new ApiError(400, 'Dữ liệu đặt lại mật khẩu không hợp lệ.', errors, 'VALIDATION_ERROR');
  validatePasswordPolicy({ password, confirmPassword });
}

function otpProofError() {
  const message = 'Mã OTP không hợp lệ hoặc đã được sử dụng.';
  return new ApiError(400, message, [{ field: 'otp', message }], 'OTP_INVALID_OR_USED');
}

function createPasswordResetService({
  userRepository = createModelUserRepository(),
  tokenRepository = createModelTokenRepository(),
  outboxService,
  now = () => new Date(),
  otpGenerator = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
  otpSecret,
  hashPassword = defaultHashPassword,
  sessionService = defaultSessionService,
  ttlMs = 10 * 60_000,
  cooldownMs = 60_000,
  maxAttempts = 5,
  transactionManager = null,
  environment = process.env.NODE_ENV,
} = {}) {
  if (!outboxService) throw new Error('outboxService is required');
  const resolvedOtpSecret = resolveOtpSecret({ value: otpSecret, environment });

  return {
    async requestReset(inputEmail) {
      const email = normalizeEmail(inputEmail);
      const createRequest = async (session) => {
        const user = await userRepository.findByEmail(email, session);
        if (!user || user.status === 'Disabled') return { message: GENERIC_RESPONSE };

        const current = now();
        const latest = await tokenRepository.findLatestForUser(user._id, session);
        if (latest && current.getTime() - new Date(latest.createdAt).getTime() < cooldownMs) {
          return { message: GENERIC_RESPONSE };
        }

        await tokenRepository.invalidateForUser(user._id, current, session);
        const otp = otpGenerator();
        const token = await tokenRepository.create({
          userId: user._id,
          otpHash: hashOtp(email, otp, resolvedOtpSecret),
          expiresAt: new Date(current.getTime() + ttlMs),
          attemptCount: 0,
          usedAt: null,
          createdAt: current,
        }, session);
        await outboxService.enqueue({
          eventType: 'PASSWORD_RESET_OTP_REQUESTED',
          idempotencyKey: `PASSWORD_RESET_OTP_REQUESTED:${token._id}`,
          recipient: email,
          payload: {
            userId: String(user._id),
            encryptedOtp: encryptOtp(otp, resolvedOtpSecret),
            expiresInMinutes: Math.floor(ttlMs / 60_000),
          },
        }, session);
        return { message: GENERIC_RESPONSE };
      };
      return transactionManager
        ? transactionManager.withTransaction(createRequest)
        : createRequest(null);
    },

    async resetPassword(input) {
      validateResetInput(input);
      const email = normalizeEmail(input.email);
      const user = await userRepository.findByEmail(email);
      if (!user || user.status === 'Disabled') {
        throw otpProofError();
      }

      const current = now();
      const token = await tokenRepository.findLatestForUser(user._id);
      if (!token) throw otpProofError();
      if (token.expiresAt <= current) throw otpProofError();
      if (token.attemptCount >= maxAttempts) throw otpProofError();

      const suppliedHash = hashOtp(email, String(input.otp), resolvedOtpSecret);
      if (!safeEqual(suppliedHash, token.otpHash)) {
        await tokenRepository.recordFailedAttempt(token._id, current, maxAttempts);
        throw otpProofError();
      }

      const expectedCredentialVersion = Number(user.credentialVersion || 0);
      const update = async (session) => {
        const consumed = await tokenRepository.consume(token._id, current, maxAttempts, session);
        if (!consumed) throw otpProofError();
        const updated = await userRepository.updatePasswordIfCredentialVersion(
          user._id,
          expectedCredentialVersion,
          {
            passwordHash: await hashPassword(input.password),
            passwordChangedAt: current,
          },
          session
        );
        if (!updated) {
          throw new ApiError(
            409,
            'Mật khẩu đã được thay đổi bởi một yêu cầu khác. Vui lòng yêu cầu OTP mới.',
            [],
            'CREDENTIAL_CHANGED_CONCURRENTLY'
          );
        }
        await sessionService.revokeAllForUser(user._id, 'PASSWORD_RESET', session);
        if (outboxService.enqueue) {
          await outboxService.enqueue({
            eventType: 'PASSWORD_RESET_COMPLETED',
            idempotencyKey: `PASSWORD_RESET_COMPLETED:${String(token._id)}`,
            recipient: email,
            payload: { userId: String(user._id) },
          }, session);
        }
      };
      if (transactionManager) await transactionManager.withTransaction(update);
      else await update(null);
      return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' };
    },
  };
}

module.exports = {
  createPasswordResetService,
  hashOtp,
  encryptOtp,
  decryptOtp,
  resolveOtpSecret,
  GENERIC_RESPONSE,
};
