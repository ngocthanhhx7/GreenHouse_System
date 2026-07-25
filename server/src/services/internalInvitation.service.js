const crypto = require('node:crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const InternalInvitation = require('../models/internalInvitation.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');
const EmailOutbox = require('../models/emailOutbox.model');
const { hashPassword } = require('../utils/password');
const { validatePasswordPolicy } = require('../utils/passwordPolicy');
const { extractAuditReplayBinding } = require('../utils/auditReplay');

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const INVITED_ROLES = new Set(['Staff', 'WarehouseManager']);
const VIETNAMESE_PHONE = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || '').replace(/[\s.-]/g, '');
}

function hashInvitationToken(email, token, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`${normalizeEmail(email)}:${token}`)
    .digest('hex');
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

function resolveInvitationSecret({
  providedSecret,
  environment = process.env.NODE_ENV,
  resetSecret = process.env.RESET_OTP_SECRET,
  jwtSecret = process.env.JWT_SECRET,
} = {}) {
  const secret = String(
    providedSecret
      || resetSecret
      || (environment === 'production' ? '' : jwtSecret)
      || (environment === 'production' ? '' : 'greenhome-invitation-development-secret'),
  );
  if (environment === 'production' && secret.length < 32) {
    throw new Error('RESET_OTP_SECRET must contain at least 32 characters in production.');
  }
  return secret;
}

function createModelRepository() {
  return {
    async findUserByEmail(email, session) {
      const query = User.findOne({ email }).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async findUserById(id, session) {
      const query = User.findById(id).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async findLatest(email, session) {
      const query = InternalInvitation.findOne({
        email,
        state: 'PendingAcceptance',
      }).sort({ createdAt: -1 }).select('+tokenHash');
      return (session ? query.session(session) : query).lean();
    },
    async findById(id, session) {
      const query = InternalInvitation.findOne({
        _id: id,
        state: 'PendingAcceptance',
      }).select('+tokenHash');
      return (session ? query.session(session) : query).lean();
    },
    async findAnyById(id, session) {
      const query = InternalInvitation.findById(id).select('+tokenHash');
      return (session ? query.session(session) : query).lean();
    },
    async findByIdempotency(email, idempotencyKey, session) {
      const query = InternalInvitation.findOne({ email, idempotencyKey });
      return (session ? query.session(session) : query).lean();
    },
    async findByIdempotencyKey(idempotencyKey, session) {
      const query = InternalInvitation.findOne({ idempotencyKey });
      return (session ? query.session(session) : query).lean();
    },
    async findAuditByEventId(eventId, session) {
      const query = AuditLog.findOne({ eventId }).select({
        action: 1,
        targetEntity: 1,
        targetId: 1,
        replayBinding: 1,
        'after.commandFingerprint': 1,
        'before.invitationId': 1,
      });
      return (session ? query.session(session) : query).lean();
    },
    async create(data, session) {
      if (!session) return (await InternalInvitation.create(data)).toObject();
      const [created] = await InternalInvitation.create([data], { session });
      return created.toObject();
    },
    async invalidate(email, current, session) {
      const query = InternalInvitation.updateMany(
        { email, state: 'PendingAcceptance' },
        { $set: { state: 'Revoked', revokedAt: current } },
      );
      await (session ? query.session(session) : query);
    },
    async expirePending(email, current, session) {
      const query = InternalInvitation.updateMany(
        {
          email,
          state: 'PendingAcceptance',
          expiresAt: { $lte: current },
        },
        { $set: { state: 'Expired' } },
      );
      await (session ? query.session(session) : query);
    },
    async revoke(id, current, reason, session) {
      const query = InternalInvitation.findOneAndUpdate(
        { _id: id, state: 'PendingAcceptance' },
        { $set: { state: 'Revoked', revokedAt: current, reason } },
        { new: true },
      );
      return (session ? query.session(session) : query).lean();
    },
    async consume(id, current, session) {
      const query = InternalInvitation.findOneAndUpdate(
        {
          _id: id,
          state: 'PendingAcceptance',
          expiresAt: { $gt: current },
        },
        { $set: { state: 'Accepted', acceptedAt: current } },
        { new: true },
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
  return {
    async withTransaction(work) {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
  };
}

function publicInvitation(invitation) {
  return {
    id: String(invitation._id),
    email: invitation.email,
    roleName: invitation.roleName,
    expiresAt: invitation.expiresAt,
  };
}

function publicAcceptedUser(user) {
  const role = user.role || user.roleId;
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    role: { id: String(role._id), roleName: role.roleName },
  };
}

function invitationCommandIdentity(operation, idempotencyKey) {
  const digest = crypto
    .createHash('sha256')
    .update(`${operation}:${String(idempotencyKey)}`)
    .digest('hex');
  return `${operation}:${digest}`;
}

function invitationCommandFingerprint(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function createInternalInvitationService({
  repository = createModelRepository(),
  tokenSecret,
  tokenGenerator = () => crypto.randomBytes(32).toString('base64url'),
  now = () => new Date(),
  hashPassword: hash = hashPassword,
  transactionManager = null,
  environment = process.env.NODE_ENV,
} = {}) {
  const withTransaction = transactionManager || createTransactionManager();
  const resolvedTokenSecret = resolveInvitationSecret({
    providedSecret: tokenSecret,
    environment,
  });

  function requireCommand({ actorUserId, idempotencyKey }) {
    if (!actorUserId) {
      throw new ApiError(403, 'Thiếu người thực hiện thao tác.', [], 'ADMIN_ACTOR_REQUIRED');
    }
    if (!idempotencyKey) {
      throw new ApiError(400, 'Thiếu mã idempotency.', [], 'IDEMPOTENCY_REQUIRED');
    }
  }

  function idempotencyKeyReused() {
    return new ApiError(
      409,
      'Mã idempotency đã được dùng cho một thao tác khác.',
      [],
      'IDEMPOTENCY_KEY_REUSED',
    );
  }

  function idempotencyReplayUnavailable() {
    return new ApiError(
      409,
      'Không thể phục hồi kết quả thao tác lời mời trước đó.',
      [],
      'IDEMPOTENCY_REPLAY_UNAVAILABLE',
    );
  }

  function assertAuditBinding(audit, action, commandFingerprint) {
    if (
      audit.action !== action
      || audit.targetEntity !== (action === 'AUTH_INVITATION_ACCEPTED' ? 'User' : 'InternalInvitation')
      || extractAuditReplayBinding(audit).commandFingerprint !== commandFingerprint
    ) {
      throw idempotencyKeyReused();
    }
  }

  async function findCreateReplay({
    email,
    roleName,
    idempotencyKey,
    actorUserId,
    reason,
    session = null,
  }) {
    if (!repository.findAuditByEventId) return null;
    const action = 'INTERNAL_INVITATION_CREATED';
    const eventId = invitationCommandIdentity(action, idempotencyKey);
    const commandFingerprint = invitationCommandFingerprint({
      email,
      roleName,
      actorUserId: String(actorUserId),
      reason,
    });
    const audit = await repository.findAuditByEventId(eventId, session);
    if (!audit) return null;
    assertAuditBinding(audit, action, commandFingerprint);
    const invitation = repository.findAnyById
      ? await repository.findAnyById(audit.targetId, session)
      : await repository.findById(audit.targetId, session);
    if (!invitation) throw idempotencyReplayUnavailable();
    return { invitation: publicInvitation(invitation), replay: true };
  }

  async function findRevokeReplay({
    invitationId,
    idempotencyKey,
    actorUserId,
    reason,
    session = null,
  }) {
    if (!repository.findAuditByEventId) return null;
    const action = 'INTERNAL_INVITATION_REVOKED';
    const eventId = invitationCommandIdentity(action, idempotencyKey);
    const commandFingerprint = invitationCommandFingerprint({
      invitationId: String(invitationId),
      actorUserId: String(actorUserId),
      reason,
    });
    const audit = await repository.findAuditByEventId(eventId, session);
    if (!audit) return null;
    assertAuditBinding(audit, action, commandFingerprint);
    return { revoked: true, replay: true };
  }

  function acceptanceFingerprint({
    email,
    token,
    fullName,
    phoneNumber,
    password,
  }) {
    return invitationCommandFingerprint({
      email,
      invitationProof: crypto
        .createHash('sha256')
        .update(`${email}:${String(token || '')}`)
        .digest('hex'),
      fullName,
      phoneNumber,
      passwordProof: crypto
        .createHash('sha256')
        .update(String(password || ''))
        .digest('hex'),
    });
  }

  async function findAcceptReplay({
    eventId,
    commandFingerprint,
    session = null,
  }) {
    if (!repository.findAuditByEventId || !repository.findUserById) return null;
    const audit = await repository.findAuditByEventId(eventId, session);
    if (!audit) return null;
    assertAuditBinding(audit, 'AUTH_INVITATION_ACCEPTED', commandFingerprint);
    const existing = await repository.findUserById(audit.targetId, session);
    if (!existing) throw idempotencyReplayUnavailable();
    return { user: publicAcceptedUser(existing), replay: true };
  }

  async function findResendReplay({ invitationId, idempotencyKey, session }) {
    const eventId = `INTERNAL_INVITATION_RESENT:${idempotencyKey}`;
    const audit = repository.findAuditByEventId
      ? await repository.findAuditByEventId(eventId, session)
      : null;
    if (!audit) return null;

    if (
      audit.action !== 'INTERNAL_INVITATION_RESENT'
      || String(extractAuditReplayBinding(audit).priorTargetId || '') !== String(invitationId)
    ) {
      throw idempotencyKeyReused();
    }

    const invitation = repository.findAnyById
      ? await repository.findAnyById(audit.targetId, session)
      : repository.findById
        ? await repository.findById(audit.targetId, session)
      : null;
    if (
      !invitation
      || String(invitation._id) !== String(audit.targetId)
      || invitation.idempotencyKey !== idempotencyKey
      || String(invitation.replacedInvitationId || '') !== String(invitationId)
    ) {
      throw idempotencyKeyReused();
    }
    return { invitation: publicInvitation(invitation), replay: true };
  }

  async function createInsideTransaction({
    email,
    roleName,
    idempotencyKey,
    actorUserId,
    reason,
    action,
    replacedInvitationId = null,
    auditEventId = null,
    commandFingerprint = null,
    session,
  }) {
    const token = tokenGenerator();
    const current = now();
    const invitation = await repository.create({
      email,
      roleName,
      tokenHash: hashInvitationToken(email, token, resolvedTokenSecret),
      expiresAt: new Date(current.getTime() + INVITATION_TTL_MS),
      state: 'PendingAcceptance',
      idempotencyKey,
      reason,
      createdBy: actorUserId,
      replacedInvitationId,
      createdAt: current,
    }, session);
    await repository.enqueue({
      eventType: 'INTERNAL_INVITATION_CREATED',
      idempotencyKey: `${action}:${String(invitation._id)}`,
      recipient: email,
      payload: {
        invitationId: String(invitation._id),
        roleName,
        encryptedToken: encryptInvitationToken(token, resolvedTokenSecret),
      },
    }, session);
    await repository.audit({
      userId: actorUserId,
      action,
      targetEntity: 'InternalInvitation',
      targetId: String(invitation._id),
      description: reason || action,
      before: replacedInvitationId
        ? { invitationId: String(replacedInvitationId), state: 'PendingAcceptance' }
        : null,
      after: {
        email,
        roleName,
        state: 'PendingAcceptance',
        expiresAt: invitation.expiresAt,
        ...(commandFingerprint ? { commandFingerprint } : {}),
      },
      eventId: auditEventId || `${action}:${idempotencyKey}`,
    }, session);
    return { invitation: publicInvitation(invitation) };
  }

  return {
    async createInvitation({
      email: inputEmail,
      roleName,
      idempotencyKey,
      actorUserId,
      reason = '',
    }) {
      const email = normalizeEmail(inputEmail);
      const normalizedReason = String(reason || '').trim();
      if (!INVITED_ROLES.has(roleName)) {
        throw new ApiError(
          400,
          'Chỉ được mời Staff hoặc Warehouse Manager.',
          [],
          'INVITATION_ROLE_FORBIDDEN',
        );
      }
      requireCommand({ actorUserId, idempotencyKey });

      try {
        return await withTransaction.withTransaction(async (session) => {
          const durableReplay = await findCreateReplay({
            email,
            roleName,
            idempotencyKey,
            actorUserId,
            reason: normalizedReason,
            session,
          });
          if (durableReplay) return durableReplay;
          if (await repository.findUserByEmail(email, session)) {
            throw new ApiError(409, 'Email đã được sử dụng.', [], 'EMAIL_ALREADY_EXISTS');
          }
          const replay = repository.findByIdempotency
            ? await repository.findByIdempotency(email, idempotencyKey, session)
            : null;
          if (replay) {
            if (
              replay.roleName !== roleName
              || String(replay.createdBy || '') !== String(actorUserId)
              || String(replay.reason || '') !== normalizedReason
            ) {
              throw idempotencyKeyReused();
            }
            return { invitation: publicInvitation(replay), replay: true };
          }
          const latest = await repository.findLatest(email, session);
          if (latest) {
            const current = now();
            if (new Date(latest.expiresAt) <= current) {
              await repository.expirePending(email, current, session);
              return createInsideTransaction({
                email,
                roleName,
                idempotencyKey,
                actorUserId,
                reason: normalizedReason,
                action: 'INTERNAL_INVITATION_CREATED',
                auditEventId: invitationCommandIdentity(
                  'INTERNAL_INVITATION_CREATED',
                  idempotencyKey,
                ),
                commandFingerprint: invitationCommandFingerprint({
                  email,
                  roleName,
                  actorUserId: String(actorUserId),
                  reason: normalizedReason,
                }),
                session,
              });
            }
            throw new ApiError(
              409,
              'Email đã có lời mời đang chờ.',
              [],
              'INVITATION_ALREADY_PENDING',
            );
          }
          return createInsideTransaction({
            email,
            roleName,
            idempotencyKey,
            actorUserId,
            reason: normalizedReason,
            action: 'INTERNAL_INVITATION_CREATED',
            auditEventId: invitationCommandIdentity(
              'INTERNAL_INVITATION_CREATED',
              idempotencyKey,
            ),
            commandFingerprint: invitationCommandFingerprint({
              email,
              roleName,
              actorUserId: String(actorUserId),
              reason: normalizedReason,
            }),
            session,
          });
        });
      } catch (error) {
        if (error?.code === 11000) {
          const durableReplay = await findCreateReplay({
            email,
            roleName,
            idempotencyKey,
            actorUserId,
            reason: normalizedReason,
          });
          if (durableReplay) return durableReplay;
          const replay = repository.findByIdempotency
            ? await repository.findByIdempotency(email, idempotencyKey)
            : null;
          if (replay) {
            if (
              replay.roleName !== roleName
              || String(replay.createdBy || '') !== String(actorUserId)
              || String(replay.reason || '') !== normalizedReason
            ) {
              throw idempotencyKeyReused();
            }
            return { invitation: publicInvitation(replay), replay: true };
          }
          const pending = repository.findLatest
            ? await repository.findLatest(email)
            : null;
          if (pending && new Date(pending.expiresAt) > now()) {
            throw new ApiError(
              409,
              'Email đã có lời mời đang chờ.',
              [],
              'INVITATION_ALREADY_PENDING',
            );
          }
        }
        throw error;
      }
    },

    async resendInvitation({
      invitationId,
      idempotencyKey,
      actorUserId,
      reason = 'Invitation resent',
    }) {
      requireCommand({ actorUserId, idempotencyKey });
      let invitationEmail = null;
      try {
        return await withTransaction.withTransaction(async (session) => {
          const replay = await findResendReplay({ invitationId, idempotencyKey, session });
          if (replay) return replay;

          const latest = await repository.findById(invitationId, session);
          if (!latest) {
            throw new ApiError(404, 'Không tìm thấy lời mời.', [], 'INVITATION_NOT_FOUND');
          }
          invitationEmail = latest.email;
          const conflictingCommand = repository.findByIdempotency
            ? await repository.findByIdempotency(latest.email, idempotencyKey, session)
            : null;
          if (conflictingCommand) throw idempotencyKeyReused();
          await repository.invalidate(latest.email, now(), session);
          return createInsideTransaction({
            email: latest.email,
            roleName: latest.roleName,
            idempotencyKey,
            actorUserId,
            reason,
            action: 'INTERNAL_INVITATION_RESENT',
            replacedInvitationId: latest._id,
            session,
          });
        });
      } catch (error) {
        if (error?.code === 11000) {
          const replay = await findResendReplay({ invitationId, idempotencyKey });
          if (replay) return replay;
          if (invitationEmail && repository.findByIdempotency) {
            const existing = await repository.findByIdempotency(invitationEmail, idempotencyKey);
            if (existing) throw idempotencyKeyReused();
          }
        }
        throw error;
      }
    },

    async revokeInvitation({
      invitationId,
      idempotencyKey,
      actorUserId,
      reason = 'ADMIN_REVOKED',
    }) {
      requireCommand({ actorUserId, idempotencyKey });
      const normalizedReason = String(reason || '').trim();
      const action = 'INTERNAL_INVITATION_REVOKED';
      const eventId = invitationCommandIdentity(action, idempotencyKey);
      const commandFingerprint = invitationCommandFingerprint({
        invitationId: String(invitationId),
        actorUserId: String(actorUserId),
        reason: normalizedReason,
      });
      try {
        return await withTransaction.withTransaction(async (session) => {
          const replay = await findRevokeReplay({
            invitationId,
            idempotencyKey,
            actorUserId,
            reason: normalizedReason,
            session,
          });
          if (replay) return replay;
          const revoked = await repository.revoke(
            invitationId,
            now(),
            normalizedReason,
            session,
          );
          if (!revoked) {
            throw new ApiError(
              409,
              'Lời mời đã được xử lý.',
              [],
              'INVITATION_ALREADY_PROCESSED',
            );
          }
          await repository.audit({
            userId: actorUserId,
            action,
            targetEntity: 'InternalInvitation',
            targetId: String(invitationId),
            description: normalizedReason,
            before: {
              email: revoked.email,
              roleName: revoked.roleName,
              state: 'PendingAcceptance',
            },
            after: { state: 'Revoked', commandFingerprint },
            eventId,
          }, session);
          return { revoked: true };
        });
      } catch (error) {
        if (error?.code === 11000) {
          const replay = await findRevokeReplay({
            invitationId,
            idempotencyKey,
            actorUserId,
            reason: normalizedReason,
          });
          if (replay) return replay;
        }
        throw error;
      }
    },

    async acceptInvitation(input) {
      const email = normalizeEmail(input.email);
      const fullName = String(input.fullName || '').trim();
      const phoneNumber = normalizePhone(input.phoneNumber);
      if (!input.idempotencyKey) {
        throw new ApiError(400, 'Thiếu mã idempotency.', [], 'IDEMPOTENCY_REQUIRED');
      }
      if (fullName.length < 2 || !VIETNAMESE_PHONE.test(phoneNumber)) {
        throw new ApiError(
          400,
          'Thông tin người nhận lời mời không hợp lệ.',
          [],
          'VALIDATION_ERROR',
        );
      }
      validatePasswordPolicy({
        password: input.password,
        confirmPassword: input.confirmPassword,
      });

      const eventId = invitationCommandIdentity(
        'AUTH_INVITATION_ACCEPTED',
        input.idempotencyKey,
      );
      const commandFingerprint = acceptanceFingerprint({
        email,
        token: input.token,
        fullName,
        phoneNumber,
        password: input.password,
      });
      try {
        return await withTransaction.withTransaction(async (session) => {
          const replay = await findAcceptReplay({
            eventId,
            commandFingerprint,
            session,
          });
          if (replay) return replay;
          const invitation = await repository.findLatest(email, session);
          if (!invitation) {
            throw new ApiError(
              400,
              'Lời mời không hợp lệ hoặc đã hết hạn.',
              [],
              'INVITATION_INVALID',
            );
          }
          if (new Date(invitation.expiresAt) <= now()) {
            throw new ApiError(
              400,
              'Lời mời không hợp lệ hoặc đã hết hạn.',
              [],
              'INVITATION_INVALID',
            );
          }
          if (!safeEqual(
            hashInvitationToken(email, input.token, resolvedTokenSecret),
            invitation.tokenHash,
          )) {
            throw new ApiError(400, 'Lời mời không hợp lệ.', [], 'INVITATION_INVALID');
          }
          if (await repository.findUserByEmail(email, session)) {
            throw new ApiError(409, 'Email đã được sử dụng.', [], 'EMAIL_ALREADY_EXISTS');
          }
          const consumed = await repository.consume(invitation._id, now(), session);
          if (!consumed) {
            throw new ApiError(
              409,
              'Lời mời đã được xử lý.',
              [],
              'INVITATION_ALREADY_PROCESSED',
            );
          }
          const role = await repository.findRole(invitation.roleName, session);
          if (!role) {
            throw new ApiError(
              500,
              'Vai trò lời mời chưa được cấu hình.',
              [],
              'INVITATION_ROLE_NOT_CONFIGURED',
            );
          }
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
            after: { commandFingerprint },
            eventId,
          }, session);
          await repository.enqueue({
            eventType: 'INTERNAL_INVITATION_ACCEPTED',
            idempotencyKey: `INTERNAL_INVITATION_ACCEPTED:${String(user._id)}`,
            recipient: email,
            payload: {
              userId: String(user._id),
              fullName: user.fullName,
              roleName: role.roleName,
            },
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
      } catch (error) {
        if (error?.code === 11000) {
          const replay = await findAcceptReplay({
            eventId,
            commandFingerprint,
          });
          if (replay) return replay;
        }
        throw error;
      }
    },
  };
}

module.exports = {
  INVITATION_TTL_MS,
  INVITED_ROLES,
  createInternalInvitationService,
  encryptInvitationToken,
  hashInvitationToken,
  resolveInvitationSecret,
  internalInvitationService: createInternalInvitationService(),
};
