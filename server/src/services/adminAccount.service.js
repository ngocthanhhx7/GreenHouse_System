const mongoose = require('mongoose');
const crypto = require('node:crypto');
const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');
const {
  extractAdminCommandResult,
  extractAuditReplayBinding,
} = require('../utils/auditReplay');
const { sessionService: defaultSessionService } = require('./session.service');
const { activeAssignmentService: defaultAssignmentService } = require('./activeAssignment.service');
const { internalInvitationService: defaultInvitationService } = require('./internalInvitation.service');

const INTERNAL_ROLES = new Set(['Staff', 'WarehouseManager']);
const GOVERNED_ROLES = new Set(['Customer', 'Staff', 'WarehouseManager']);
const FORBIDDEN_COMMANDS = new Set([
  'setPassword', 'editProfile', 'editAddress', 'impersonate', 'delete', 'hard-delete',
  'assignAdmin', 'convertCustomer',
]);

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function normalizeAccountSearch({
  query = '',
  roleName,
  status,
  page = 1,
  pageSize = 25,
} = {}) {
  return {
    query: String(query || '').trim().slice(0, 100),
    roleName,
    status,
    page: boundedPositiveInteger(page, 1, 100_000),
    pageSize: boundedPositiveInteger(pageSize, 25, 100),
  };
}

function createLiteralSearchRegex(value) {
  const escaped = String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

function createModelRepository() {
  return {
    async findById(id, session) {
      const query = User.findById(id).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async findAuditByEventId(eventId, session) {
      const query = AuditLog.findOne({ eventId }).select({
        userId: 1,
        action: 1,
        targetId: 1,
        replayBinding: 1,
        commandResult: 1,
        'after.commandFingerprint': 1,
        'after.result.user.id': 1,
        'after.result.user.fullName': 1,
        'after.result.user.email': 1,
        'after.result.user.role': 1,
        'after.result.user.status': 1,
        'after.result.user.createdAt': 1,
        'after.result.user.lastLoginAt': 1,
        'after.result.user.version': 1,
        'after.result.revokedSessions': 1,
        'after.result.handoff.activeAssignments.sliceId': 1,
        'after.result.handoff.activeAssignments.detail.entity': 1,
        'after.result.handoff.activeAssignments.detail.activeStatuses': 1,
        'after.result.handoff.assignmentCheckUnavailable': 1,
        'after.result.handoff.recoveries.sliceId': 1,
        'after.result.handoff.recoveries.recovered': 1,
      });
      return (session ? query.session(session) : query).lean();
    },
    async search({ query = '', roleName, status, page = 1, pageSize = 25 } = {}) {
      const filter = {};
      if (query) {
        const literalQuery = createLiteralSearchRegex(query);
        filter.$or = [{ email: literalQuery }, { fullName: literalQuery }];
      }
      if (roleName) {
        const role = await Role.findOne({ roleName }).select('_id').lean();
        if (!role) return { items: [], total: 0 };
        filter.roleId = role._id;
      }
      if (status) filter.status = status;
      const skip = (Number(page) - 1) * Number(pageSize);
      const [items, total] = await Promise.all([
        User.find(filter).populate('roleId').sort({ createdAt: -1 }).skip(skip).limit(Number(pageSize)).lean(),
        User.countDocuments(filter),
      ]);
      return { items, total };
    },
    async updateStatus(id, expectedVersion, nextStatus, session) {
      const query = User.findOneAndUpdate(
        { _id: id, version: expectedVersion, status: { $in: ['Active', 'Disabled'] } },
        { $set: { status: nextStatus }, $inc: { version: 1 } },
        { new: true },
      ).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async updateRole(id, expectedVersion, roleName, session) {
      const roleQuery = Role.findOne({ roleName });
      const role = await (session ? roleQuery.session(session) : roleQuery).lean();
      if (!role) return null;
      const query = User.findOneAndUpdate(
        { _id: id, version: expectedVersion },
        { $set: { roleId: role._id }, $inc: { version: 1 } },
        { new: true },
      ).populate('roleId');
      return (session ? query.session(session) : query).lean();
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

function createAuditLogger() {
  return {
    async log(entry, session = null) {
      if (session) {
        await AuditLog.create([entry], { session });
        return;
      }
      await AuditLog.create(entry);
    },
  };
}

function minimumAccount(user) {
  const role = user.role || user.roleId || {};
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    role: role.roleName,
    status: user.status,
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    version: user.version || 0,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createCommandIdentity({
  operation,
  action,
  actorUserId,
  targetUserId,
  idempotencyKey,
  command,
}) {
  const actor = String(actorUserId);
  const target = String(targetUserId);
  return {
    operation,
    action,
    actorUserId: actor,
    targetUserId: target,
    eventId: `ADMIN_ACCOUNT:${operation}:${actor}:${target}:${sha256(idempotencyKey)}`,
    fingerprint: sha256(JSON.stringify({
      operation,
      actorUserId: actor,
      targetUserId: target,
      ...command,
    })),
  };
}

function createAdminAccountService({
  repository = createModelRepository(),
  sessionService = defaultSessionService,
  assignmentService = defaultAssignmentService,
  invitationService = defaultInvitationService,
  auditLogger = createAuditLogger(),
  transactionManager = createTransactionManager(),
} = {}) {
  const completedCommands = new Map();

  function commandKey(idempotencyKey) {
    if (!idempotencyKey) {
      throw new ApiError(400, 'Thiếu mã idempotency.', [], 'IDEMPOTENCY_REQUIRED');
    }
    return String(idempotencyKey);
  }

  function requireReason(reason) {
    if (!String(reason || '').trim()) {
      throw new ApiError(
        400,
        'Lý do là bắt buộc.',
        [{ field: 'reason', message: 'Lý do là bắt buộc.' }],
        'REASON_REQUIRED',
      );
    }
    return String(reason).trim();
  }

  async function requireAdmin(actorUserId, session = null) {
    const actor = await repository.findById(actorUserId, session);
    if (!actor || (actor.role || actor.roleId)?.roleName !== 'Admin') {
      throw new ApiError(
        403,
        'Chỉ Admin được thực hiện thao tác này.',
        [],
        'ADMIN_REQUIRED',
      );
    }
    return actor;
  }

  function idempotencyConflict() {
    return new ApiError(
      409,
      'Mã idempotency đã được dùng cho một lệnh khác.',
      [],
      'IDEMPOTENCY_KEY_REUSED',
    );
  }

  function idempotencyReplayUnavailable() {
    return new ApiError(
      409,
      'KhÃ´ng thá»ƒ phá»¥c há»“i káº¿t quáº£ lá»‡nh quáº£n trá»‹ trÆ°á»›c Ä‘Ã³.',
      [],
      'IDEMPOTENCY_REPLAY_UNAVAILABLE',
    );
  }

  function remember(identity, result) {
    completedCommands.set(identity.eventId, {
      fingerprint: identity.fingerprint,
      result,
    });
  }

  async function findReplay(identity, session = null) {
    const cached = completedCommands.get(identity.eventId);
    if (cached) {
      if (cached.fingerprint !== identity.fingerprint) throw idempotencyConflict();
      return { alreadyProcessed: true, ...cached.result };
    }
    if (!repository.findAuditByEventId) return null;
    const audit = await repository.findAuditByEventId(identity.eventId, session);
    if (!audit) return null;
    const storedFingerprint = extractAuditReplayBinding(audit).commandFingerprint;
    if (
      String(audit.userId) !== identity.actorUserId
      || String(audit.targetId) !== identity.targetUserId
      || audit.action !== identity.action
      || storedFingerprint !== identity.fingerprint
    ) {
      throw idempotencyConflict();
    }
    const result = extractAdminCommandResult(audit);
    if (!result) throw idempotencyReplayUnavailable();
    remember(identity, result);
    return { alreadyProcessed: true, ...result };
  }

  async function executeDurable(identity, work) {
    const replay = await findReplay(identity);
    if (replay) return replay;
    let result;
    try {
      result = await transactionManager.withTransaction(async (session) => {
        const concurrentReplay = await findReplay(identity, session);
        if (concurrentReplay) return concurrentReplay;
        return work(session);
      });
    } catch (error) {
      const committedReplay = await findReplay(identity);
      if (committedReplay) return committedReplay;
      throw error;
    }
    if (!result.alreadyProcessed) remember(identity, result);
    return result;
  }

  return {
    async assertCommandAllowed(command) {
      if (FORBIDDEN_COMMANDS.has(command)) {
        throw new ApiError(
          403,
          'Thao tác quản trị tài khoản không được phép.',
          [],
          'ADMIN_COMMAND_FORBIDDEN',
        );
      }
      return true;
    },

    async listAccounts({ actorUserId, query = '', roleName, status, page = 1, pageSize = 25 } = {}) {
      await requireAdmin(actorUserId);
      const result = await repository.search(normalizeAccountSearch({
        query,
        roleName,
        status,
        page,
        pageSize,
      }));
      const items = Array.isArray(result) ? result : result.items;
      return {
        ...(Array.isArray(result) ? { total: items.length } : result),
        items: items
          .filter((user) => (user.role || user.roleId)?.roleName !== 'Admin')
          .map(minimumAccount),
      };
    },

    async changeStatus({
      actorUserId,
      targetUserId,
      nextStatus,
      reason,
      expectedVersion,
      idempotencyKey,
    }) {
      const key = commandKey(idempotencyKey);
      await requireAdmin(actorUserId);
      if (actorUserId === targetUserId) {
        throw new ApiError(403, 'Admin không được tự vô hiệu hóa.', [], 'SELF_DISABLE_FORBIDDEN');
      }
      if (!['Active', 'Disabled'].includes(nextStatus)) {
        throw new ApiError(400, 'Trạng thái không hợp lệ.', [], 'STATUS_INVALID');
      }
      const normalizedReason = requireReason(reason);
      const identity = createCommandIdentity({
        operation: 'ACCOUNT_STATUS',
        action: `ACCOUNT_STATUS_${nextStatus.toUpperCase()}`,
        actorUserId,
        targetUserId,
        idempotencyKey: key,
        command: {
          nextStatus,
          reason: normalizedReason,
          expectedVersion,
        },
      });

      return executeDurable(identity, async (session) => {
        await requireAdmin(actorUserId, session);
        const target = await repository.findById(targetUserId, session);
        if (!target || !GOVERNED_ROLES.has((target.role || target.roleId)?.roleName)) {
          throw new ApiError(
            403,
            'Tài khoản mục tiêu không thuộc phạm vi quản trị.',
            [],
            'ADMIN_TARGET_FORBIDDEN',
          );
        }
        const updated = await repository.updateStatus(
          targetUserId,
          expectedVersion,
          nextStatus,
          session,
        );
        if (!updated) {
          throw new ApiError(
            409,
            'Phiên bản tài khoản đã thay đổi.',
            [],
            'ACCOUNT_VERSION_CONFLICT',
          );
        }

        let security = null;
        let handoff = null;
        if (nextStatus === 'Disabled') {
          security = await sessionService.revokeAllForUser(
            targetUserId,
            'ACCOUNT_DISABLED',
            session,
          );
          handoff = await assignmentService.handleDisabledAccount({
            userId: targetUserId,
            idempotencyKey: key,
            reason: normalizedReason,
          }, session);
        }
        const commandResult = {
          user: minimumAccount(updated),
          revokedSessions: security?.revokedCount || 0,
          handoff,
        };
        await auditLogger.log({
          userId: actorUserId,
          action: `ACCOUNT_STATUS_${nextStatus.toUpperCase()}`,
          targetEntity: 'User',
          targetId: String(targetUserId),
          description: normalizedReason,
          before: { status: target.status },
          after: {
            status: nextStatus,
            version: updated.version,
            commandFingerprint: identity.fingerprint,
            result: commandResult,
          },
          eventId: identity.eventId,
        }, session);
        return commandResult;
      });
    },

    async transferRole({
      actorUserId,
      targetUserId,
      targetRole,
      reason,
      expectedVersion,
      idempotencyKey,
    }) {
      const key = commandKey(idempotencyKey);
      await requireAdmin(actorUserId);
      const normalizedReason = requireReason(reason);
      const identity = createCommandIdentity({
        operation: 'ACCOUNT_ROLE_TRANSFER',
        action: 'ACCOUNT_ROLE_TRANSFER',
        actorUserId,
        targetUserId,
        idempotencyKey: key,
        command: {
          targetRole,
          reason: normalizedReason,
          expectedVersion,
        },
      });

      return executeDurable(identity, async (session) => {
        await requireAdmin(actorUserId, session);
        const target = await repository.findById(targetUserId, session);
        const currentRole = (target?.role || target?.roleId)?.roleName;
        if (!target || !INTERNAL_ROLES.has(currentRole) || !INTERNAL_ROLES.has(targetRole)) {
          throw new ApiError(
            403,
            'Chỉ được chuyển đổi Staff và Warehouse Manager.',
            [],
            'ROLE_TRANSFER_FORBIDDEN',
          );
        }
        if (currentRole === targetRole) {
          throw new ApiError(
            409,
            'Vai trò mới phải khác vai trò hiện tại.',
            [],
            'ROLE_TRANSFER_NOOP',
          );
        }
        const active = await assignmentService.hasActiveAssignments(targetUserId, session);
        if (active.active) {
          throw new ApiError(
            409,
            'Tài khoản còn công việc đang hoạt động.',
            active.assignments,
            'ACTIVE_ASSIGNMENT_BLOCKED',
          );
        }
        const updated = await repository.updateRole(
          targetUserId,
          expectedVersion,
          targetRole,
          session,
        );
        if (!updated) {
          throw new ApiError(
            409,
            'Phiên bản tài khoản đã thay đổi.',
            [],
            'ACCOUNT_VERSION_CONFLICT',
          );
        }
        const revoked = await sessionService.revokeAllForUser(
          targetUserId,
          'ROLE_TRANSFER',
          session,
        );
        const commandResult = {
          user: minimumAccount(updated),
          revokedSessions: revoked.revokedCount,
        };
        await auditLogger.log({
          userId: actorUserId,
          action: 'ACCOUNT_ROLE_TRANSFER',
          targetEntity: 'User',
          targetId: String(targetUserId),
          description: normalizedReason,
          before: { role: currentRole },
          after: {
            role: targetRole,
            version: updated.version,
            commandFingerprint: identity.fingerprint,
            result: commandResult,
          },
          eventId: identity.eventId,
        }, session);
        return commandResult;
      });
    },

    async createInvitation(input) {
      const actorUserId = input.actorUserId || input.createdBy;
      await requireAdmin(actorUserId);
      return invitationService.createInvitation({ ...input, actorUserId });
    },

    async resendInvitation(input) {
      await requireAdmin(input.actorUserId);
      return invitationService.resendInvitation(input);
    },

    async revokeInvitation(input) {
      await requireAdmin(input.actorUserId);
      return invitationService.revokeInvitation(input);
    },
  };
}

module.exports = {
  createAdminAccountService,
  createLiteralSearchRegex,
  createTransactionManager,
  normalizeAccountSearch,
  adminAccountService: createAdminAccountService(),
  minimumAccount,
};
