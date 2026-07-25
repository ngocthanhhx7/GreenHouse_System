const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  createEmailOutboxService,
  createEmailProvider,
  createModelEmailOutboxRepository,
  sanitizeEmailEventPayload,
} = require('./email.service');
const { encryptOtp } = require('./passwordReset.service');
const { encryptInvitationToken } = require('./internalInvitation.service');

describe('email outbox service', () => {
  it('enqueues idempotently by event key', async () => {
    const events = [];
    const repository = {
      async findByIdempotencyKey(key) {
        return events.find((event) => event.idempotencyKey === key) || null;
      },
      async create(data) {
        events.push({ _id: `event-${events.length + 1}`, ...data });
        return events.at(-1);
      },
    };
    const service = createEmailOutboxService({
      repository,
      provider: createEmailProvider('disabled'),
    });
    const first = await service.enqueue({
      eventType: 'CONTACT_SUBMISSION',
      idempotencyKey: 'contact-1',
      recipient: 'owner@example.com',
      payload: {},
    });
    const second = await service.enqueue({
      eventType: 'CONTACT_SUBMISSION',
      idempotencyKey: 'contact-1',
      recipient: 'owner@example.com',
      payload: {},
    });
    assert.equal(first._id, second._id);
    assert.equal(events.length, 1);
  });

  it('sanitizes allowlisted payloads before persistence while retaining encrypted renderer fields', async () => {
    const created = [];
    const service = createEmailOutboxService({
      repository: {
        async findByIdempotencyKey() { return null; },
        async create(data) { created.push(data); return data; },
      },
      provider: createEmailProvider('disabled'),
    });

    await service.enqueue({
      eventType: 'PASSWORD_RESET_OTP_REQUESTED',
      idempotencyKey: 'reset-1',
      recipient: 'customer@example.com',
      payload: {
        userId: 'user-1',
        encryptedOtp: 'ciphertext',
        expiresInMinutes: 10,
        password: 'must-not-persist',
        accessToken: 'must-not-persist',
      },
    });

    assert.deepEqual(created[0].payload, {
      userId: 'user-1',
      encryptedOtp: 'ciphertext',
      expiresInMinutes: 10,
    });
    assert.throws(
      () => sanitizeEmailEventPayload('UNKNOWN_EMAIL_EVENT', { secret: 'value' }),
      /Unsupported email event/
    );
  });

  it('marks attempts one through four RetryScheduled with bounded safe evidence', async () => {
    const events = [{
      _id: 'event-1',
      status: 'Pending',
      availableAt: new Date(0),
      attemptCount: 1,
      claimId: 'claim-1',
      idempotencyKey: 'contact-1',
    }];
    let failureUpdate;
    const repository = {
      async claimNext() { return events[0]; },
      async markFailed(id, data, claimId) {
        failureUpdate = { id, data, claimId };
        Object.assign(events.find((event) => event._id === id), data);
        return events[0];
      },
      async markSent() {},
    };
    const audits = [];
    const service = createEmailOutboxService({
      repository,
      provider: { async send() { throw new Error('smtp password=super-secret'); } },
      now: () => new Date('2026-07-22T00:00:00Z'),
      auditLogger: async (entry) => audits.push(entry),
    });
    const result = await service.deliverNext();
    assert.equal(result.status, 'RetryScheduled');
    assert.equal(events[0].attemptCount, 1);
    assert.ok(events[0].availableAt > new Date('2026-07-22T00:00:00Z'));
    assert.equal(failureUpdate.claimId, 'claim-1');
    assert.equal(failureUpdate.data.attemptOutcome, 'RetryScheduled');
    assert.equal(failureUpdate.data.errorCode, 'EMAIL_PROVIDER_ERROR');
    assert.equal(failureUpdate.data.errorMessage, 'Email provider request failed');
    assert.doesNotMatch(JSON.stringify(failureUpdate), /super-secret/);
    assert.equal(audits[0].actorType, 'EmailService');
    assert.equal(audits[0].source, 'EmailService');
    assert.equal(audits[0].safeFacts.deliveryStatus, 'RetryScheduled');
    assert.doesNotMatch(JSON.stringify(audits[0]), /smtp|password|recipient/i);
  });

  it('makes the fifth failed attempt terminal and never schedules it again', async () => {
    const entry = {
      _id: 'event-5',
      status: 'Processing',
      attemptCount: 5,
      claimId: 'claim-5',
      idempotencyKey: 'order-5',
    };
    let update;
    const service = createEmailOutboxService({
      repository: {
        async claimNext() { return entry; },
        async markFailed(_id, data) { update = data; return { ...entry, ...data }; },
        async markSent() { throw new Error('unexpected'); },
      },
      provider: { async send() { return { disabled: true }; } },
      now: () => new Date('2026-07-22T00:00:00Z'),
      auditLogger: async () => {},
    });

    const result = await service.deliverNext();

    assert.equal(result.status, 'Failed');
    assert.equal(update.status, 'Failed');
    assert.equal(update.availableAt, null);
    assert.equal(update.errorCode, 'EMAIL_PROVIDER_DISABLED');
  });

  it('times out a provider and schedules retry without exposing the provider error', async () => {
    const entry = {
      _id: 'event-timeout',
      status: 'Processing',
      attemptCount: 2,
      claimId: 'claim-timeout',
      idempotencyKey: 'timeout-1',
    };
    let update;
    const service = createEmailOutboxService({
      repository: {
        async claimNext() { return entry; },
        async markFailed(_id, data) { update = data; return { ...entry, ...data }; },
        async markSent() {},
      },
      provider: { async send() { return new Promise(() => {}); } },
      providerTimeoutMs: 5,
      auditLogger: async () => {},
    });

    const result = await service.deliverNext();

    assert.equal(result.status, 'RetryScheduled');
    assert.equal(update.errorCode, 'EMAIL_PROVIDER_TIMEOUT');
    assert.equal(update.errorMessage, 'Email provider request timed out');
  });

  it('does not let a stale claimant finalize a reclaimed lease', async () => {
    const entry = {
      _id: 'event-race',
      status: 'Processing',
      attemptCount: 2,
      claimId: 'stale-claim',
      idempotencyKey: 'race-1',
    };
    const service = createEmailOutboxService({
      repository: {
        async claimNext() { return entry; },
        async markSent(_id, _data, claimId) {
          assert.equal(claimId, 'stale-claim');
          return null;
        },
        async markFailed() { throw new Error('unexpected'); },
      },
      provider: { async send() { return { accepted: true, messageId: 'provider-1' }; } },
      auditLogger: async () => {},
    });

    const result = await service.deliverNext();

    assert.equal(result.status, 'LostLease');
  });

  it('terminalizes an expired fifth lease without sending or creating a sixth attempt', async () => {
    const expired = {
      _id: 'event-expired-five',
      status: 'Failed',
      attemptCount: 5,
      claimId: '',
      idempotencyKey: 'expired-five',
      recoveredTerminalLease: true,
      attempts: [{ attemptNumber: 5, claimId: 'claim-five', outcome: 'Failed' }],
    };
    let providerCalls = 0;
    const audits = [];
    const service = createEmailOutboxService({
      repository: {
        async finalizeExpiredTerminal() { return expired; },
        async claimNext() { throw new Error('must not create attempt six'); },
      },
      provider: { async send() { providerCalls += 1; } },
      auditLogger: async (entry) => audits.push(entry),
    });

    const result = await service.deliverNext();

    assert.equal(result.status, 'Failed');
    assert.equal(result.errorCode, 'EMAIL_LEASE_EXPIRED');
    assert.equal(providerCalls, 0);
    assert.equal(audits[0].safeFacts.attemptNumber, 5);
  });

  it('audits the expired attempt when reclaiming a stale processing lease', async () => {
    const entry = {
      _id: 'event-reclaimed',
      status: 'Processing',
      attemptCount: 2,
      claimId: 'claim-two',
      idempotencyKey: 'reclaimed-1',
      attempts: [
        { attemptNumber: 1, claimId: 'claim-one', outcome: 'LeaseExpired' },
        { attemptNumber: 2, claimId: 'claim-two', outcome: 'Processing' },
      ],
    };
    const audits = [];
    const service = createEmailOutboxService({
      repository: {
        async finalizeExpiredTerminal() { return null; },
        async claimNext() { return entry; },
        async markSent(_id, data) { return { ...entry, ...data }; },
      },
      provider: { async send() { return { accepted: true }; } },
      auditLogger: async (audit) => audits.push(audit),
    });

    const result = await service.deliverNext();

    assert.equal(result.status, 'Sent');
    assert.equal(audits.length, 2);
    assert.equal(audits[0].action, 'EMAIL_DELIVERY_LEASE_LOST');
    assert.equal(audits[0].safeFacts.attemptNumber, 1);
    assert.equal(audits[1].safeFacts.attemptNumber, 2);
  });

  it('keeps provider success Sent when the delivery audit write fails', async () => {
    const entry = {
      _id: 'event-audit',
      status: 'Processing',
      attemptCount: 1,
      claimId: 'claim-audit',
      idempotencyKey: 'audit-1',
    };
    const errors = [];
    const service = createEmailOutboxService({
      repository: {
        async claimNext() { return entry; },
        async markSent(_id, data) { return { ...entry, ...data }; },
        async markFailed() { throw new Error('provider success must not become retry'); },
      },
      provider: { async send() { return { accepted: true, messageId: 'provider-safe-id' }; } },
      auditLogger: async () => { throw new Error('audit database unavailable'); },
      logger: { error(message, detail) { errors.push({ message, detail }); } },
    });

    const result = await service.deliverNext();

    assert.equal(result.status, 'Sent');
    assert.equal(result.auditStatus, 'Failed');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].detail.code, 'EMAIL_AUDIT_WRITE_FAILED');
    assert.doesNotMatch(JSON.stringify(errors), /database unavailable/);
  });

  it('claims atomically with a new token, appends one numbered attempt, and excludes terminal Failed', async () => {
    let captured;
    const query = {
      lean() { return { _id: 'event-1', attemptCount: 3, claimId: 'claim-fixed' }; },
    };
    const model = {
      findOneAndUpdate(filter, update, options) {
        captured = { filter, update, options };
        return query;
      },
    };
    const repository = createModelEmailOutboxRepository({
      model,
      createClaimId: () => 'claim-fixed',
    });
    const now = new Date('2026-07-22T00:00:00Z');
    const leaseUntil = new Date('2026-07-22T00:01:00Z');

    await repository.claimNext(now, leaseUntil);

    assert.deepEqual(captured.filter.$or[0].status.$in, ['Pending', 'RetryScheduled']);
    assert.equal(captured.filter.$or.some((condition) => condition.status === 'Failed'), false);
    assert.deepEqual(captured.filter.$expr, {
      $lt: [{ $ifNull: ['$attemptCount', 0] }, 5],
    });
    assert.equal(captured.update[0].$set.claimId, 'claim-fixed');
    assert.deepEqual(captured.update[0].$set.attemptCount, { $add: [{ $ifNull: ['$attemptCount', 0] }, 1] });
    assert.equal(captured.update[0].$set.attempts.$concatArrays[1][0].claimId, 'claim-fixed');
    assert.deepEqual(
      captured.update[0].$set.attempts.$concatArrays[1][0].attemptNumber,
      { $add: [{ $ifNull: ['$attemptCount', 0] }, 1] }
    );
    assert.equal(captured.options.sort.availableAt, 1);
  });

  it('sends a Vietnamese OTP email through an injected SMTP transport', async () => {
    const sent = [];
    const secret = 'test-otp-secret-at-least-32-characters';
    const provider = createEmailProvider('smtp', {
      transporter: {
        async sendMail(message) {
          sent.push(message);
          return { messageId: 'gmail-1' };
        },
      },
      from: 'GreenHome Kitchen <greenhome.demo@gmail.com>',
      otpSecret: secret,
    });

    const result = await provider.send({
      eventType: 'PASSWORD_RESET_OTP_REQUESTED',
      recipient: 'customer@example.com',
      payload: {
        encryptedOtp: encryptOtp('123456', secret),
        expiresInMinutes: 10,
      },
    });

    assert.equal(result.accepted, true);
    assert.equal(sent[0].to, 'customer@example.com');
    assert.match(sent[0].subject, /mã OTP/i);
    assert.match(sent[0].text, /123456/);
    assert.match(sent[0].text, /10 phút/);
  });

  it('renders registration OTP and internal invitation delivery events', async () => {
    const sent = [];
    const secret = 'test-otp-secret-at-least-32-characters';
    const provider = createEmailProvider('smtp', {
      transporter: {
        async sendMail(message) {
          sent.push(message);
          return { messageId: `gmail-${sent.length}` };
        },
      },
      from: 'GreenHome Kitchen <greenhome.demo@gmail.com>',
      otpSecret: secret,
      clientUrl: 'https://greenhome.test',
    });

    await provider.send({
      eventType: 'REGISTRATION_OTP_REQUESTED',
      recipient: 'customer@example.com',
      payload: {
        encryptedOtp: encryptOtp('654321', secret),
        expiresInMinutes: 10,
      },
    });
    await provider.send({
      eventType: 'INTERNAL_INVITATION_CREATED',
      recipient: 'staff@example.com',
      payload: {
        encryptedToken: encryptInvitationToken('staff-token', secret),
        roleName: 'Staff',
      },
    });
    await provider.send({
      eventType: 'ACCOUNT_REGISTRATION_COMPLETED',
      recipient: 'customer@example.com',
      payload: { fullName: 'Nguyễn Ngọc Thành' },
    });
    await provider.send({
      eventType: 'INTERNAL_INVITATION_ACCEPTED',
      recipient: 'staff@example.com',
      payload: { fullName: 'Staff User', roleName: 'Staff' },
    });
    await provider.send({
      eventType: 'PASSWORD_RESET_COMPLETED',
      recipient: 'customer@example.com',
      payload: { fullName: 'Customer User' },
    });
    await provider.send({
      eventType: 'PROFILE_PASSWORD_CHANGED',
      recipient: 'customer@example.com',
      payload: { fullName: 'Customer User' },
    });

    assert.match(sent[0].subject, /xác minh đăng ký/i);
    assert.match(sent[0].text, /654321/);
    assert.match(sent[1].subject, /lời mời/i);
    assert.match(sent[1].text, /https:\/\/greenhome\.test\/accept-invitation/);
    assert.match(sent[1].text, /staff-token/);
    assert.doesNotMatch(sent[1].text, /encryptedToken/);
    assert.match(sent[2].subject, /đăng ký thành công/i);
    assert.match(sent[3].subject, /kích hoạt thành công/i);
    assert.match(sent[4].subject, /đặt lại mật khẩu thành công/i);
    assert.match(sent[5].subject, /mật khẩu đã thay đổi/i);
  });
});
