const ApiError = require('./apiError');

function passwordBytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function validatePasswordPolicy({
  password,
  confirmPassword,
  passwordField = 'password',
  confirmationField = 'confirmPassword',
} = {}) {
  const value = String(password || '');
  const bytes = passwordBytes(value);
  if (bytes < 8 || bytes > 72 || !/\p{L}/u.test(value) || !/\d/u.test(value)) {
    throw new ApiError(
      400,
      'Mật khẩu phải dài từ 8 đến 72 byte và có ít nhất một chữ cái, một chữ số.',
      [{ field: passwordField, message: 'Mật khẩu phải dài từ 8 đến 72 byte và có ít nhất một chữ cái, một chữ số.' }],
      'PASSWORD_POLICY_INVALID'
    );
  }
  if (value !== String(confirmPassword || '')) {
    throw new ApiError(
      400,
      'Xác nhận mật khẩu không khớp.',
      [{ field: confirmationField, message: 'Xác nhận mật khẩu không khớp.' }],
      'PASSWORD_CONFIRMATION_MISMATCH'
    );
  }
  return { password: value };
}

module.exports = { passwordBytes, validatePasswordPolicy };
