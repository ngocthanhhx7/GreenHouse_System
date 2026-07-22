const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { validate, rules } = require('./requestValidation');

describe('request validation primitives', () => {
  it('normalizes valid fields without changing the response contract', () => {
    const result = validate(
      { email: '  Thanh@Example.COM ', fullName: '  Nguyễn Ngọc Thành  ' },
      {
        email: [rules.required('Email là bắt buộc'), rules.email('Email không hợp lệ')],
        fullName: [rules.required('Họ tên là bắt buộc')],
      }
    );

    assert.deepEqual(result.errors, []);
    assert.equal(result.value.email, 'thanh@example.com');
    assert.equal(result.value.fullName, 'Nguyễn Ngọc Thành');
  });

  it('returns field-specific Vietnamese errors', () => {
    const result = validate(
      { email: 'khong-hop-le', password: '123' },
      {
        email: [rules.required('Email là bắt buộc'), rules.email('Email không hợp lệ')],
        password: [rules.minLength(8, 'Mật khẩu phải có ít nhất 8 ký tự')],
      }
    );

    assert.deepEqual(result.errors, [
      { field: 'email', message: 'Email không hợp lệ' },
      { field: 'password', message: 'Mật khẩu phải có ít nhất 8 ký tự' },
    ]);
  });
});
