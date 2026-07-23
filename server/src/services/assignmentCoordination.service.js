const ApiError = require('../utils/apiError');
const User = require('../models/user.model');
const Role = require('../models/role.model');

const ASSIGNMENT_ROLES = new Set(['Staff', 'WarehouseManager']);

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function createModelAssignmentRepository({
  UserModel = User,
  RoleModel = Role,
} = {}) {
  return {
    async claimActorRole(userId, expectedRole, session) {
      const role = await withSession(
        RoleModel.findOne({ roleName: expectedRole }).select('_id'),
        session,
      ).lean();
      if (!role) return null;
      return withSession(
        UserModel.findOneAndUpdate(
          {
            _id: userId,
            roleId: role._id,
            status: 'Active',
          },
          { $inc: { assignmentEpoch: 1 } },
          { new: true, runValidators: true },
        ).select('+assignmentEpoch'),
        session,
      ).lean();
    },
  };
}

function createAssignmentCoordinator({
  repository = createModelAssignmentRepository(),
} = {}) {
  return {
    async coordinate({ userId, expectedRole, session }) {
      if (!session) {
        throw new ApiError(
          503,
          'Assignment transaction coordination is unavailable.',
          [],
          'ASSIGNMENT_COORDINATION_REQUIRED',
        );
      }
      if (!ASSIGNMENT_ROLES.has(expectedRole)) {
        throw new ApiError(
          500,
          'Assignment actor role is not configured.',
          [],
          'ASSIGNMENT_ROLE_NOT_CONFIGURED',
        );
      }
      const actor = await repository.claimActorRole(userId, expectedRole, session);
      if (!actor) {
        throw new ApiError(
          409,
          'Actor role changed after request authorization.',
          [],
          'ASSIGNMENT_ACTOR_STALE',
        );
      }
      return {
        userId: String(userId),
        role: expectedRole,
        assignmentEpoch: Number(actor.assignmentEpoch || 0),
      };
    },
  };
}

module.exports = {
  createAssignmentCoordinator,
  createModelAssignmentRepository,
  assignmentCoordinator: createAssignmentCoordinator(),
};
