const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;
const AUTH_FIELDS = new Set(['email', 'otp', 'password', 'confirmPassword']);
const PASSWORD_POLICY_MESSAGE = 'Mật khẩu phải dài từ 8 đến 72 byte và có ít nhất một chữ cái, một chữ số.';

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validatePasswordResetRequest(input = {}) {
  const values = { email: normalizeEmail(input.email) };
  const errors = {};
  if (!EMAIL_PATTERN.test(values.email)) {
    errors.email = 'Email không hợp lệ.';
  }
  return { values, errors };
}

export function validatePasswordResetCompletion(input = {}) {
  const requestResult = validatePasswordResetRequest(input);
  const values = {
    email: requestResult.values.email,
    otp: String(input.otp || '').trim(),
    password: String(input.password || ''),
    confirmPassword: String(input.confirmPassword || ''),
  };
  const errors = { ...requestResult.errors };

  if (!OTP_PATTERN.test(values.otp)) {
    errors.otp = 'Mã OTP phải gồm đúng 6 chữ số.';
  }

  const passwordBytes = utf8ByteLength(values.password);
  if (
    passwordBytes < 8
    || passwordBytes > 72
    || !/\p{L}/u.test(values.password)
    || !/\d/u.test(values.password)
  ) {
    errors.password = PASSWORD_POLICY_MESSAGE;
  }

  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Xác nhận mật khẩu không khớp.';
  }

  return { values, errors };
}

export function mapAuthFieldErrors(error) {
  return (Array.isArray(error?.errors) ? error.errors : []).reduce((result, item) => {
    if (AUTH_FIELDS.has(item?.field) && typeof item.message === 'string' && item.message.trim()) {
      result[item.field] = item.message.trim();
    }
    return result;
  }, {});
}
