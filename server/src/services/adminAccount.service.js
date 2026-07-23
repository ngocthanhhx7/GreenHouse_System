const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const AuditLog = require('../models/auditLog.model');
const { sessionService: defaultSessionService } = require('./session.service');
const { activeAssignmentService: defaultAssignmentService } = require('./activeAssignment.service');
const { internalInvitationService: defaultInvitationService } = require('./internalInvitation.service');

const INTERNAL_ROLES = new Set(['Staff', 'WarehouseManager']);
const GOVERNED_ROLES = new Set(['Customer', 'Staff', 'WarehouseManager']);
const FORBIDDEN_COMMANDS = new Set([
  'setPassword', 'editProfile', 'editAddress', 'impersonate', 'delete', 'hard-delete', 'assignAdmin', 'convertCustomer',
]);

function createModelRepository() {
  return {
    async findById(id, session) {
      const query = User.findById(id).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async search({ query = '', roleName, status, page = 1, pageSize = 25 } = {}) {
      const filter = {};
      if (query) filter.$or = [{ email: new RegExp(query, 'i') }, { fullName: new RegExp(query, 'i') }];
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
        { new: true }
      ).populate('roleId');
      return (session ? query.session(session) : query).lean();
    },
    async updateRole(id, expectedVersion, roleName, session) {
      const role = await require('../models/role.model').findOne({ roleName }).lean();
      if (!role) return null;
      const query = User.findOneAndUpdate(
        { _id: id, version: expectedVersion },
        { $set: { roleId: role._id }, $inc: { version: 1 } },
        { new: true }
      ).populate('roleId');
      return (session ? query.session(session) : query).lean();
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

function createAdminAccountService({
  repository = createModelRepository(),
  sessionService = defaultSessionService,
  assignmentService = defaultAssignmentService,
  invitationService = defaultInvitationService,
  auditLogger = { async log(entry) { await AuditLog.create(entry); } },
} = {}) {
  const completedCommands = new Map();
  function commandKey(idempotencyKey) {
    if (!idempotencyKey) throw new ApiError(400, 'Thiếu mã idempotency.', [], 'IDEMPOTENCY_REQUIRED');
    return String(idempotencyKey);
  }
  function requireReason(reason) {
    if (!String(reason || '').trim()) throw new ApiError(400, 'Lý do là bắt buộc.', [{ field: 'reason', message: 'Lý do là bắt buộc.' }], 'REASON_REQUIRED');
    return String(reason).trim();
  }
  async function requireAdmin(actorUserId) {
    const actor = await repository.findById(actorUserId);
    if (!actor || (actor.role || actor.roleId)?.roleName !== 'Admin') throw new ApiError(403, 'Chỉ Admin được thực hiện thao tác này.', [], 'ADMIN_REQUIRED');
    return actor;
  }

  return {
    async assertCommandAllowed(command) {
      if (FORBIDDEN_COMMANDS.has(command)) throw new ApiError(403, 'Thao tác quản trị tài khoản không được phép.', [], 'ADMIN_COMMAND_FORBIDDEN');
      return true;
    },
    async listAccounts({ actorUserId, query = '', roleName, status, page = 1, pageSize = 25 } = {}) {
      await requireAdmin(actorUserId);
      const result = await repository.search({ query, roleName, status, page, pageSize });
      const items = Array.isArray(result) ? result : result.items;
      return {
        ...(Array.isArray(result) ? { total: items.length } : result),
        items: items.filter((user) => (user.role || user.roleId)?.roleName !== 'Admin').map(minimumAccount),
      };
    },
    async changeStatus({ actorUserId, targetUserId, nextStatus, reason, expectedVersion, idempotencyKey }) {
      await requireAdmin(actorUserId);
      const key = commandKey(idempotencyKey);
      if (completedCommands.has(key)) return { alreadyProcessed: true, ...completedCommands.get(key) };
      if (actorUserId === targetUserId) throw new ApiError(403, 'Admin không được tự vô hiệu hóa.', [], 'SELF_DISABLE_FORBIDDEN');
      if (!GOVERNED_ROLES.has((await repository.findById(targetUserId))?.roleId?.roleName)) {
        throw new ApiError(403, 'Tài khoản mục tiêu không thuộc phạm vi quản trị.', [], 'ADMIN_TARGET_FORBIDDEN');
      }
      if (!['Active', 'Disabled'].includes(nextStatus)) throw new ApiError(400, 'Trạng thái không hợp lệ.', [], 'STATUS_INVALID');
      const normalizedReason = requireReason(reason);
      const updated = await repository.updateStatus(targetUserId, expectedVersion, nextStatus);
      if (!updated) throw new ApiError(409, 'Phiên bản tài khoản đã thay đổi.', [], 'ACCOUNT_VERSION_CONFLICT');
      let security = null;
      let handoff = null;
      if (nextStatus === 'Disabled') {
        security = await sessionService.revokeAllForUser(targetUserId, 'ACCOUNT_DISABLED');
        handoff = await assignmentService.handleDisabledAccount({ userId: targetUserId, idempotencyKey: key, reason: normalizedReason });
      }
      const result = { user: minimumAccount(updated), revokedSessions: security?.revokedCount || 0, handoff };
      await auditLogger.log({
        userId: actorUserId,
        action: `ACCOUNT_STATUS_${nextStatus.toUpperCase()}`,
        targetEntity: 'User',
        targetId: String(targetUserId),
        description: normalizedReason,
        before: { status: nextStatus === 'Disabled' ? 'Active' : 'Disabled' },
        after: { status: nextStatus },
        eventId: `ACCOUNT_STATUS:${key}`,
      });
      completedCommands.set(key, result);
      return result;
    },
    async transferRole({ actorUserId, targetUserId, targetRole, reason, expectedVersion, idempotencyKey }) {
      await requireAdmin(actorUserId);
      const key = commandKey(idempotencyKey);
      if (completedCommands.has(key)) return { alreadyProcessed: true, ...completedCommands.get(key) };
      const target = await repository.findById(targetUserId);
      if (!target || !INTERNAL_ROLES.has((target.role || target.roleId)?.roleName) || !INTERNAL_ROLES.has(targetRole)) {
        throw new ApiError(403, 'Chỉ được chuyển đổi Staff và Warehouse Manager.', [], 'ROLE_TRANSFER_FORBIDDEN');
      }
      if ((target.role || target.roleId).roleName === targetRole) throw new ApiError(409, 'Vai trò mới phải khác vai trò hiện tại.', [], 'ROLE_TRANSFER_NOOP');
      const normalizedReason = requireReason(reason);
      const active = await assignmentService.hasActiveAssignments(targetUserId);
      if (active.active) throw new ApiError(409, 'Tài khoản còn công việc đang hoạt động.', active.assignments, 'ACTIVE_ASSIGNMENT_BLOCKED');
      const updated = await repository.updateRole(targetUserId, expectedVersion, targetRole);
      if (!updated) throw new ApiError(409, 'Phiên bản tài khoản đã thay đổi.', [], 'ACCOUNT_VERSION_CONFLICT');
      const revoked = await sessionService.revokeAllForUser(targetUserId, 'ROLE_TRANSFER');
      const result = { user: minimumAccount(updated), revokedSessions: revoked.revokedCount };
      await auditLogger.log({
        userId: actorUserId,
        action: 'ACCOUNT_ROLE_TRANSFER',
        targetEntity: 'User',
        targetId: String(targetUserId),
        description: normalizedReason,
        before: { role: (target.role || target.roleId).roleName },
        after: { role: targetRole },
        eventId: `ACCOUNT_ROLE_TRANSFER:${key}`,
      });
      completedCommands.set(key, result);
      return result;
    },
    createInvitation(input) { return invitationService.createInvitation(input); },
    resendInvitation(input) { return invitationService.resendInvitation(input); },
    revokeInvitation(input) { return invitationService.revokeInvitation(input); },
  };
}

module.exports = {
  createAdminAccountService,
  adminAccountService: createAdminAccountService(),
  minimumAccount,
};
