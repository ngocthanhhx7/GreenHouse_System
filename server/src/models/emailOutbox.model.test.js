const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const EmailOutbox = require('./emailOutbox.model');

describe('EmailOutbox model', () => {
  it('supports retry scheduling and append-only attempt evidence', () => {
    const status = EmailOutbox.schema.path('status');
    const attempts = EmailOutbox.schema.path('attempts');

    assert.ok(status.enumValues.includes('RetryScheduled'));
    assert.ok(attempts);
    assert.ok(attempts.schema.path('attemptNumber'));
    assert.ok(attempts.schema.path('claimedAt'));
    assert.ok(attempts.schema.path('completedAt'));
    assert.ok(attempts.schema.path('outcome'));
    assert.ok(attempts.schema.path('errorCode'));
    assert.ok(attempts.schema.path('errorMessage'));
    assert.ok(attempts.schema.path('providerMessageId'));
    assert.ok(attempts.schema.path('claimId'));
  });

  it('declares claim and idempotency indexes', () => {
    const indexes = EmailOutbox.schema.indexes();
    const hasAvailableClaimIndex = indexes.some(([fields]) => (
      Object.keys(fields).join(',') === 'status,availableAt,createdAt'
      &&
      fields.status === 1
      && fields.availableAt === 1
      && fields.createdAt === 1
    ));
    const hasStaleLeaseIndex = indexes.some(([fields]) => (
      Object.keys(fields).join(',') === 'status,leaseUntil,createdAt'
      &&
      fields.status === 1
      && fields.leaseUntil === 1
      && fields.createdAt === 1
    ));
    const hasIdempotencyIndex = indexes.some(([fields, options]) => (
      fields.idempotencyKey === 1 && options.unique === true
    ));

    assert.equal(hasAvailableClaimIndex, true);
    assert.equal(hasStaleLeaseIndex, true);
    assert.equal(hasIdempotencyIndex, true);
  });

  it('sanitizes payloads at the model boundary for transactional producers', async () => {
    const outbox = new EmailOutbox({
      eventType: 'INTERNAL_INVITATION_CREATED',
      idempotencyKey: 'invite-1',
      recipient: 'staff@example.com',
      payload: {
        invitationId: 'invitation-1',
        roleName: 'Staff',
        encryptedToken: 'encrypted-token',
        rawToken: 'must-not-persist',
        password: 'must-not-persist',
      },
    });

    await outbox.validate();
    assert.deepEqual(outbox.payload, {
      invitationId: 'invitation-1',
      roleName: 'Staff',
      encryptedToken: 'encrypted-token',
    });
  });
});
