const { sendError } = require('../utils/apiResponse');
const { assertSingleApprovedRole } = require('../config/roleMatrix');

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    let role;
    try {
      role = assertSingleApprovedRole(req.user && req.user.role);
    } catch (_error) {
      return sendError(res, 'Dữ liệu vai trò không hợp lệ.', 403, [], 'ROLE_INTEGRITY_INVALID', req);
    }
    if (!allowedRoles.includes(role)) {
      return sendError(res, 'Forbidden: insufficient role permission', 403, [], 'ROLE_FORBIDDEN', req);
    }
    return next();
  };
}

module.exports = {
  authorizeRoles,
};
