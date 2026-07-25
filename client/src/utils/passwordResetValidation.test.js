import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mapAuthFieldErrors,
  validatePasswordResetCompletion,
  validatePasswordResetRequest,
} from './passwordResetValidation.js';

describe('password reset client validation', () => {
  it('normalizes a valid recovery email', () => {
    assert.deepEqual(validatePasswordResetRequest({ email: '  THANH@Example.COM ' }), {
      values: { email: 'thanh@example.com' },
      errors: {},
    });
  });

  it('rejects an invalid request email before calling the API', () => {
    assert.deepEqual(validatePasswordResetRequest({ email: 'khong-hop-le' }).errors, {
      email: 'Email không hợp lệ.',
    });
  });

  it('accepts the same OTP and password boundaries as the server', () => {
    const result = validatePasswordResetCompletion({
      email: 'THANH@example.com',
      otp: '123456',
      password: 'Bếpxanh123',
      confirmPassword: 'Bếpxanh123',
    });

    assert.deepEqual(result, {
      values: {
        email: 'thanh@example.com',
        otp: '123456',
        password: 'Bếpxanh123',
        confirmPassword: 'Bếpxanh123',
      },
      errors: {},
    });
  });

  it('returns separate OTP password-policy and confirmation errors', () => {
    const result = validatePasswordResetCompletion({
      email: 'thanh@example.com',
      otp: '12ab',
      password: 'chimatkhau',
      confirmPassword: 'khongkhop',
    });

    assert.deepEqual(result.errors, {
      otp: 'Mã OTP phải gồm đúng 6 chữ số.',
      password: 'Mật khẩu phải dài từ 8 đến 72 byte và có ít nhất một chữ cái, một chữ số.',
      confirmPassword: 'Xác nhận mật khẩu không khớp.',
    });
  });

  it('measures the password boundary in UTF-8 bytes', () => {
    const result = validatePasswordResetCompletion({
      email: 'thanh@example.com',
      otp: '123456',
      password: `${'ế'.repeat(36)}1`,
      confirmPassword: `${'ế'.repeat(36)}1`,
    });

    assert.equal(result.errors.password, 'Mật khẩu phải dài từ 8 đến 72 byte và có ít nhất một chữ cái, một chữ số.');
  });

  it('maps authoritative backend field errors by field name', () => {
    assert.deepEqual(mapAuthFieldErrors({
      errors: [
        { field: 'otp', message: 'Mã OTP không hợp lệ hoặc đã được sử dụng.' },
        { field: 'confirmPassword', message: 'Xác nhận mật khẩu không khớp.' },
        { field: '', message: 'Không hợp lệ' },
      ],
    }), {
      otp: 'Mã OTP không hợp lệ hoặc đã được sử dụng.',
      confirmPassword: 'Xác nhận mật khẩu không khớp.',
    });
  });
});
