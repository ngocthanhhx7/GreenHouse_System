const jwt = require('jsonwebtoken');

function signAuthToken(user, jwtSecret) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role.roleName,
      email: user.email,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

function verifyAuthToken(token, jwtSecret) {
  return jwt.verify(token, jwtSecret);
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
};
