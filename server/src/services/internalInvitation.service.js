const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');
const InternalInvitation = require('../models/internalInvitation.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');
const EmailOutbox = require('../models/emailOutbox.model');
const { hashPassword } = require('../utils/password');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const INVITED_ROLES = new Set(['Staff', 'WarehouseManager']);
const VIETNAMESE_PHONE = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function normalizePhone(value) { return String(value || '').replace(/[\s.-]/g, ''); }
function hashInvitationToken(email, token, secret) {
  return crypto.createHmac('sha256', secret).update(`${normalizeEmail(email)}:${token}`).digest('hex');
}
function encryptInvitationToken(token, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createModelRepository() {
  return {
    async findUserByEmail(email, session) {
      const query = User.findOne({ email }).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async findLatest(email, session) {
      const query = InternalInvitation.findOne({ email, state: 'PendingAcceptance' }).sort({ createdAt: -1 }).select('+tokenHash');
      return (session ? query.session(session) : query).lean();
    },
    async findById(id, session) {
      const query = InternalInvitation.findOne({ _id: id, state: 'PendingAcceptance' }).select('+tokenHash');
      return (session ? query.session(session) : query).lean();
    },
    async create(data, session) {
      if (!session) return (await InternalInvitation.create(data)).toObject();
      const [created] = await InternalInvitation.create([data], { session });
      return created.toObject();
    },
    async invalidate(email, now, session) {
      const query = InternalInvitation.updateMany({ email, state: 'PendingAcceptance' }, { $set: { state: 'Revoked', revokedAt: now } });
      await (session ? query.session(session) : query);
    },
    async revoke(id, now, reason, session) {
      const query = InternalInvitation.findOneAndUpdate(
        { _id: id, state: 'PendingAcceptance' },
        { $set: { state: 'Revoked', revokedAt: now, reason } },
        { new: true }
      );
      return (session ? query.session(session) : query).lean();
    },
    async consume(id, now, session) {
      const query = InternalInvitation.findOneAndUpdate(
        { _id: id, state: 'PendingAcceptance', expiresAt: { $gt: now } },
        { $set: { state: 'Accepted', acceptedAt: now } },
        { new: true }
      ).select('+tokenHash');
      return (session ? query.session(session) : query).lean();
    },
    async createUser(data, session) {
      if (!session) return (await User.create(data)).toObject();
      const [created] = await User.create([data], { session });
      return created.toObject();
    },
    async findRole(roleName, session) {
      const query = Role.findOne({ roleName });
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

function createInternalInvitationService({
  repository = createModelRepository(),
  tokenSecret = process.env.RESET_OTP_SECRET || process.env.JWT_SECRET || 'greenhome-invitation-development-secret',
  tokenGenerator = () => crypto.randomBytes(32).toString('base64url'),
  now = () => new Date(),
  hashPassword: hash = hashPassword,
  transactionManager = null,
} = {}) {
  const withTransaction = transactionManager || createTransactionManager();
  return {
    async createInvitation({ email: inputEmail, roleName, idempotencyKey, reason = '' }) {
      const email = normalizeEmail(inputEmail);
      if (!INVITED_ROLES.has(roleName)) throw new ApiError(400, 'Chỉ được mời Staff hoặc Warehouse Manager.', [], 'INVITATION_ROLE_FORBIDDEN');
      if (!idempotencyKey) throw new ApiError(400, 'Thiếu mã idempotency.', [], 'IDEMPOTENCY_REQUIRED');
      if (await repository.findUserByEmail(email)) throw new ApiError(409, 'Email đã được sử dụng.', [], 'EMAIL_ALREADY_EXISTS');
      const current = now();
      const latest = await repository.findLatest(email);
      if (latest) throw new ApiError(409, 'Email đã có lời mời đang chờ.', [], 'INVITATION_ALREADY_PENDING');
      const token = tokenGenerator();
      const invitation = await repository.create({
        email,
        roleName,
        tokenHash: hashInvitationToken(email, token, tokenSecret),
        expiresAt: new Date(current.getTime() + INVITATION_TTL_MS),
        state: 'PendingAcceptance',
        idempotencyKey,
        reason,
        createdAt: current,
      });
      await repository.enqueue({
        eventType: 'INTERNAL_INVITATION_CREATED',
        idempotencyKey: `INTERNAL_INVITATION_CREATED:${invitation._id}`,
        recipient: email,
        payload: { invitationId: String(invitation._id), roleName, encryptedToken: encryptInvitationToken(token, tokenSecret) },
      });
      return { invitation: { id: String(invitation._id), email, roleName, expiresAt: invitation.expiresAt } };
    },

    async resendInvitation({ invitationId, idempotencyKey }) {
      const latest = repository.findById
        ? await repository.findById(invitationId)
        : await repository.findLatest(invitationId);
      if (!latest) throw new ApiError(404, 'Invitation not found');
      await repository.invalidate(latest.email, now());
      return this.createInvitation({ email: latest.email, roleName: latest.roleName, idempotencyKey });
    },

    async revokeInvitation({ invitationId, reason = 'ADMIN_REVOKED' }) {
      const revoked = await repository.revoke(invitationId, now(), reason);
      if (!revoked) throw new ApiError(409, 'Lời mời đã được xử lý.', [], 'INVITATION_ALREADY_PROCESSED');
      return { revoked: true };
    },

    async acceptInvitation(input) {
      const email = normalizeEmail(input.email);
      const fullName = String(input.fullName || '').trim();
      const phoneNumber = normalizePhone(input.phoneNumber);
      if (fullName.length < 2 || !VIETNAMESE_PHONE.test(phoneNumber)) {
        throw new ApiError(400, 'Thông tin người nhận lời mời không hợp lệ.', [], 'VALIDATION_ERROR');
      }
      validatePasswordPolicy({ password: input.password, confirmPassword: input.confirmPassword });
      return withTransaction.withTransaction(async (session) => {
        if (await repository.findUserByEmail(email, session)) throw new ApiError(409, 'Email đã được sử dụng.', [], 'EMAIL_ALREADY_EXISTS');
        const invitation = await repository.findLatest(email, session);
        if (!invitation) throw new ApiError(400, 'Lời mời không hợp lệ hoặc đã hết hạn.', [], 'INVITATION_INVALID');
        if (new Date(invitation.expiresAt) <= now()) throw new ApiError(400, 'Lời mời đã hết hạn.', [], 'INVITATION_EXPIRED');
        if (!safeEqual(hashInvitationToken(email, input.token, tokenSecret), invitation.tokenHash)) {
          throw new ApiError(400, 'Lời mời không hợp lệ.', [], 'INVITATION_INVALID');
        }
        const consumed = await repository.consume(invitation._id, now(), session);
        if (!consumed) throw new ApiError(409, 'Lời mời đã được xử lý.', [], 'INVITATION_ALREADY_PROCESSED');
        const role = await repository.findRole(invitation.roleName, session);
        if (!role) throw new ApiError(500, 'Vai trò lời mời chưa được cấu hình.', [], 'INVITATION_ROLE_NOT_CONFIGURED');
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
          action: 'AUTH_INVITATION_ACCEPTED',
          targetEntity: 'User',
          targetId: String(user._id),
          description: 'Internal invitation accepted',
          eventId: `AUTH_INVITATION_ACCEPTED:${String(user._id)}`,
        }, session);
        return {
          user: {
            id: String(user._id),
            fullName: user.fullName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            status: user.status,
            role: { id: String(role._id), roleName: role.roleName },
          },
        };
      });
    },
  };
}

module.exports = {
  INVITATION_TTL_MS,
  INVITED_ROLES,
  createInternalInvitationService,
  encryptInvitationToken,
  hashInvitationToken,
  internalInvitationService: createInternalInvitationService(),
};
