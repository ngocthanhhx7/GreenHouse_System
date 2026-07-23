const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');
const RegistrationChallenge = require('../models/registrationChallenge.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');
const EmailOutbox = require('../models/emailOutbox.model');
const { hashPassword } = require('../utils/password');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const VIETNAMESE_PHONE = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').replace(/[\s.-]/g, '');
}

function hashRegistrationOtp(email, otp, secret) {
  return crypto.createHmac('sha256', secret).update(`${normalizeEmail(email)}:${otp}`).digest('hex');
}

function encryptOtp(otp, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(otp), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateRegistrationInput(input) {
  const fullName = String(input.fullName || '').trim();
  const phoneNumber = normalizePhone(input.phoneNumber);
  const errors = [];
  if (fullName.length < 2 || fullName.length > 120) errors.push({ field: 'fullName', message: 'Họ tên phải dài từ 2 đến 120 ký tự.' });
  if (!VIETNAMESE_PHONE.test(phoneNumber)) errors.push({ field: 'phoneNumber', message: 'Số điện thoại Việt Nam không hợp lệ.' });
  if (Object.hasOwn(input, 'address')) errors.push({ field: 'address', message: 'Đăng ký không nhận địa chỉ giao hàng.' });
  if (errors.length) throw new ApiError(400, 'Dữ liệu đăng ký không hợp lệ.', errors, 'VALIDATION_ERROR');
  validatePasswordPolicy({ password: input.password, confirmPassword: input.confirmPassword });
  return { fullName, phoneNumber };
}

function createModelRepository() {
  return {
    async findUserByEmail(email, session) {
      const query = User.findOne({ email }).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async findLatest(email, session) {
      const query = RegistrationChallenge.findOne({ email, state: 'PendingVerification' }).sort({ createdAt: -1 }).select('+otpHash');
      return (session ? query.session(session) : query).lean();
    },
    async findLatestAny(email, session) {
      const query = RegistrationChallenge.findOne({ email }).sort({ createdAt: -1 }).select('+otpHash');
      return (session ? query.session(session) : query).lean();
    },
    async findByIdempotency(email, idempotencyKey, session) {
      const query = RegistrationChallenge.findOne({ email, idempotencyKey }).select('+otpHash');
      return (session ? query.session(session) : query).lean();
    },
    async invalidate(email, now, session) {
      const query = RegistrationChallenge.updateMany({ email, state: 'PendingVerification' }, { $set: { state: 'Invalidated', invalidatedAt: now } });
      await (session ? query.session(session) : query);
    },
    async createChallenge(data, session) {
      if (!session) return (await RegistrationChallenge.create(data)).toObject();
      const [created] = await RegistrationChallenge.create([data], { session });
      return created.toObject();
    },
    async incrementAttempt(id, session) {
      const query = RegistrationChallenge.findOneAndUpdate(
        { _id: id, state: 'PendingVerification', attemptCount: { $lt: MAX_ATTEMPTS } },
        { $inc: { attemptCount: 1 } },
        { new: true }
      ).select('+otpHash');
      const item = await (session ? query.session(session) : query).lean();
      if (item?.attemptCount >= MAX_ATTEMPTS) await RegistrationChallenge.updateOne({ _id: id, state: 'PendingVerification' }, { $set: { state: 'Invalidated' } });
      return item;
    },
    async consume(id, now, session) {
      const query = RegistrationChallenge.findOneAndUpdate(
        { _id: id, state: 'PendingVerification', expiresAt: { $gt: now }, attemptCount: { $lt: MAX_ATTEMPTS } },
        { $set: { state: 'Consumed', usedAt: now } },
        { new: true }
      ).select('+otpHash');
      return (session ? query.session(session) : query).lean();
    },
    async createUser(data, session) {
      if (!session) return (await User.create(data)).toObject();
      const [created] = await User.create([data], { session });
      return created.toObject();
    },
    async findCustomerRole(session) {
      const query = Role.findOne({ roleName: 'Customer' });
      return (session ? query.session(session) : query).lean();
    },
    async audit(data, session) {
      if (session) await AuditLog.create([data], { session });
      else await AuditLog.create(data);
    },
    async enqueue(data, session) {
      if (session) {
        const [created] = await EmailOutbox.create([data], { session });
        return created.toObject();
      }
      return (await EmailOutbox.create(data)).toObject();
    },
  };
}

function createTransactionManager() {
  const mongoose = require('mongoose');
  return {
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
  };
}

function publicUser(user, role) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    role: { id: String(role._id), roleName: role.roleName },
  };
}

function createRegistrationService({
  repository = createModelRepository(),
  otpSecret = process.env.RESET_OTP_SECRET || process.env.JWT_SECRET || 'greenhome-registration-development-secret',
  otpGenerator = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
  now = () => new Date(),
  hashPassword: hash = hashPassword,
  transactionManager = null,
} = {}) {
  const withTransaction = transactionManager || createTransactionManager();
  return {
    async requestRegistrationChallenge({ email: inputEmail, idempotencyKey, ip = '' }) {
      const email = normalizeEmail(inputEmail);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, 'Email không hợp lệ.', [{ field: 'email', message: 'Email không hợp lệ.' }], 'VALIDATION_ERROR');
      }
      if (!idempotencyKey) throw new ApiError(400, 'Thiếu mã idempotency.', [], 'IDEMPOTENCY_REQUIRED');
      if (await repository.findUserByEmail(email)) return { accepted: true, generic: true };
      if (repository.findByIdempotency) {
        const replay = await repository.findByIdempotency(email, idempotencyKey);
        if (replay) return { accepted: true, challengeId: String(replay._id), expiresAt: replay.expiresAt, replay: true };
      }
      const current = now();
      const latest = await (repository.findLatestAny
        ? repository.findLatestAny(email)
        : repository.findLatest(email));
      if (latest && current.getTime() - new Date(latest.createdAt).getTime() < OTP_COOLDOWN_MS) {
        throw new ApiError(429, 'Vui lòng chờ trước khi gửi lại mã.', [], 'OTP_RESEND_COOLDOWN');
      }
      await repository.invalidate(email, current);
      const otp = otpGenerator();
      const challenge = await repository.createChallenge({
        email,
        otpHash: hashRegistrationOtp(email, otp, otpSecret),
        expiresAt: new Date(current.getTime() + OTP_TTL_MS),
        attemptCount: 0,
        state: 'PendingVerification',
        idempotencyKey,
        ip,
        createdAt: current,
      });
      await repository.enqueue({
        eventType: 'REGISTRATION_OTP_REQUESTED',
        idempotencyKey: `REGISTRATION_OTP_REQUESTED:${challenge._id}`,
        recipient: email,
        payload: {
          challengeId: String(challenge._id),
          encryptedOtp: encryptOtp(otp, otpSecret),
          expiresInMinutes: 10,
        },
      });
      return { accepted: true, challengeId: String(challenge._id), expiresAt: challenge.expiresAt };
    },

    async completeRegistration(input) {
      const email = normalizeEmail(input.email);
      const { fullName, phoneNumber } = validateRegistrationInput(input);
      const current = now();
      return withTransaction.withTransaction(async (session) => {
        if (await repository.findUserByEmail(email, session)) throw new ApiError(409, 'Email đã được sử dụng.', [], 'EMAIL_ALREADY_EXISTS');
        const challenge = await repository.findLatest(email, session);
        if (!challenge) throw new ApiError(400, 'Mã OTP không hợp lệ hoặc đã được sử dụng.', [], 'OTP_INVALID_OR_USED');
        if (new Date(challenge.expiresAt) <= current) throw new ApiError(400, 'Mã OTP đã hết hạn.', [], 'OTP_EXPIRED');
        if (challenge.attemptCount >= MAX_ATTEMPTS) throw new ApiError(429, 'Đã vượt quá số lần nhập OTP.', [], 'OTP_ATTEMPT_LIMIT');
        const suppliedHash = hashRegistrationOtp(email, String(input.otp), otpSecret);
        if (!safeEqual(suppliedHash, challenge.otpHash)) {
          const updated = await repository.incrementAttempt(challenge._id, session);
          if (!updated || updated.attemptCount >= MAX_ATTEMPTS) throw new ApiError(429, 'Đã vượt quá số lần nhập OTP.', [], 'OTP_ATTEMPT_LIMIT');
          throw new ApiError(400, 'Mã OTP không chính xác.', [{ field: 'otp', message: 'Mã OTP không chính xác.' }], 'OTP_INCORRECT');
        }
        const consumed = await repository.consume(challenge._id, current, session);
        if (!consumed) throw new ApiError(409, 'Mã OTP đã được xử lý.', [], 'OTP_ALREADY_PROCESSED');
        const role = await repository.findCustomerRole(session);
        if (!role) throw new ApiError(500, 'Customer role is not configured');
        const user = await repository.createUser({
          fullName,
          email,
          phoneNumber,
          passwordHash: await hash(input.password),
          roleId: role._id,
          status: 'Active',
        }, session);
        await repository.audit({
          userId: user._id,
          action: 'AUTH_REGISTER_VERIFIED',
          targetEntity: 'User',
          targetId: String(user._id),
          description: 'Verified Customer registration completed',
          eventId: `AUTH_REGISTER_VERIFIED:${String(user._id)}`,
        }, session);
        return { user: publicUser(user, role) };
      });
    },
  };
}

module.exports = {
  MAX_ATTEMPTS,
  OTP_COOLDOWN_MS,
  OTP_TTL_MS,
  createRegistrationService,
  hashRegistrationOtp,
  registrationService: createRegistrationService(),
};
