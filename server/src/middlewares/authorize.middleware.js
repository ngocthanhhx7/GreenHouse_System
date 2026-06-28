const { sendError } = require('../utils/apiResponse');

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user && req.user.role;
    if (!role || !allowedRoles.includes(role)) {
      return sendError(res, 'Forbidden: insufficient role permission', 403);
    }
    return next();
  };
}

module.exports = {
  authorizeRoles,
};
