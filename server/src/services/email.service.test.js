const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createEmailOutboxService, createEmailProvider } = require('./email.service');
const { encryptOtp } = require('./passwordReset.service');

describe('email outbox service', () => {
  it('enqueues idempotently by event key', async () => {
    const events = [];
    const repository = {
      async findByIdempotencyKey(key) { return events.find((event) => event.idempotencyKey === key) || null; },
      async create(data) { events.push({ _id: `event-${events.length + 1}`, ...data }); return events.at(-1); },
    };
    const service = createEmailOutboxService({ repository, provider: createEmailProvider('disabled') });
    const first = await service.enqueue({ eventType: 'CONTACT_SUBMISSION', idempotencyKey: 'contact-1', recipient: 'owner@example.com', payload: {} });
    const second = await service.enqueue({ eventType: 'CONTACT_SUBMISSION', idempotencyKey: 'contact-1', recipient: 'owner@example.com', payload: {} });
    assert.equal(first._id, second._id);
    assert.equal(events.length, 1);
  });

  it('marks delivery failure for retry without throwing to the caller', async () => {
    const events = [{ _id: 'event-1', status: 'Pending', availableAt: new Date(0), attemptCount: 0 }];
    const repository = {
      async claimNext() { return events[0]; },
      async markFailed(id, data) { Object.assign(events.find((event) => event._id === id), data); },
      async markSent() {},
    };
    const service = createEmailOutboxService({ repository, provider: { async send() { throw new Error('disabled'); } }, now: () => new Date('2026-07-22T00:00:00Z') });
    const result = await service.deliverNext();
    assert.equal(result.status, 'Failed');
    assert.equal(events[0].attemptCount, 1);
    assert.ok(events[0].availableAt > new Date('2026-07-22T00:00:00Z'));
  });

  it('sends a Vietnamese OTP email through an injected SMTP transport', async () => {
    const sent = [];
    const secret = 'test-otp-secret-at-least-32-characters';
    const provider = createEmailProvider('smtp', {
      transporter: { async sendMail(message) { sent.push(message); return { messageId: 'gmail-1' }; } },
      from: 'GreenHome Kitchen <greenhome.demo@gmail.com>',
      otpSecret: secret,
    });

    const result = await provider.send({
      eventType: 'PASSWORD_RESET_OTP_REQUESTED',
      recipient: 'customer@example.com',
      payload: { encryptedOtp: encryptOtp('123456', secret), expiresInMinutes: 10 },
    });

    assert.equal(result.accepted, true);
    assert.equal(sent[0].to, 'customer@example.com');
    assert.match(sent[0].subject, /mã OTP/i);
    assert.match(sent[0].text, /123456/);
    assert.match(sent[0].text, /10 phút/);
  });
});
