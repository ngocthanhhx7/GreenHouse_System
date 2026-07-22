const assert = require('node:assert/strict');
const { it } = require('node:test');
const { assertEmailConfig } = require('./email.service');

it('rejects SMTP startup when the OTP secret is missing or weak', () => {
  assert.throws(() => assertEmailConfig({ MAIL_PROVIDER: 'smtp', RESET_OTP_SECRET: 'short', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'app-pass', MAIL_FROM: 'a@gmail.com' }), /RESET_OTP_SECRET/);
});
