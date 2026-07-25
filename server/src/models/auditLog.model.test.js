const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const AuditLog = require('./auditLog.model');

const REQUIRED_IMMUTABLE_PATHS = [
  'auditId',
  'actorType',
  'actorId',
  'actorRole',
  'source',
  'action',
  'targetType',
  'targetId',
  'outcome',
  'correlationId',
  'businessEventId',
  'reasonCode',
  'reason',
  'previousState',
  'newState',
  'stateVersion',
  'safeFacts',
  'timestamp',
];

describe('SL-009 AuditLog model contract', () => {
  it('AT-183..185 defines immutable attributed audit evidence without raw snapshots', () => {
    for (const pathName of REQUIRED_IMMUTABLE_PATHS) {
      const path = AuditLog.schema.path(pathName);
      assert.ok(path, `missing ${pathName}`);
      assert.equal(path.options.immutable, true, `${pathName} must be immutable`);
    }

    assert.deepEqual(
      AuditLog.schema.path('actorType').options.enum,
      ['User', 'System', 'payOS', 'Carrier', 'EmailService']
    );
    assert.deepEqual(
      AuditLog.schema.path('outcome').options.enum,
      ['Success', 'Denied', 'Failed']
    );
    assert.equal(AuditLog.schema.path('before'), undefined);
    assert.equal(AuditLog.schema.path('after'), undefined);
  });

  it('AT-185 creates a stable identity and rejects incomplete canonical evidence', async () => {
    const complete = new AuditLog({
      actorType: 'System',
      source: 'OrderPaymentExpiryWorker',
      action: 'ORDER_PAYMENT_EXPIRED',
      targetType: 'Order',
      targetId: 'order-1',
      outcome: 'Success',
      correlationId: 'expiry:order-1',
    });

    await complete.validate();
    assert.match(complete.auditId, /^[0-9a-f-]{36}$/i);
    assert.equal(complete.businessEventId, 'expiry:order-1');

    const invalid = new AuditLog({
      actorType: 'Unknown',
      source: '',
      action: '',
      targetType: '',
      outcome: 'Maybe',
      correlationId: '',
    });
    await assert.rejects(
      () => invalid.validate(),
      (error) => Boolean(error.name === 'ValidationError'
        && error.errors.actorType
        && error.errors.source
        && error.errors.action
        && error.errors.targetType
        && error.errors.outcome)
    );
  });

  it('AT-189 has indexes for stable cursor ordering and supported filters', () => {
    const schemaIndexes = AuditLog.schema.indexes();
    const indexes = schemaIndexes.map(([fields]) => JSON.stringify(fields));
    assert.ok(indexes.includes(JSON.stringify({ timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorType: 1, actorId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorType: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorRole: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ action: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ targetType: 1, targetId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ targetType: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ targetId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ outcome: 1, timestamp: -1, _id: -1 })));
    assert.ok(schemaIndexes.some(([fields, options]) => (
      JSON.stringify(fields) === JSON.stringify({ userId: 1, timestamp: -1, _id: -1 })
      && options.name === 'audit_legacy_user_cursor'
      && JSON.stringify(options.partialFilterExpression) === JSON.stringify({
        userId: { $type: 'objectId' },
      })
    )));
    assert.ok(schemaIndexes.some(([fields, options]) => (
      JSON.stringify(fields) === JSON.stringify({ timestamp: -1, _id: -1 })
      && options.name === 'audit_legacy_user_order_cursor'
      && JSON.stringify(options.partialFilterExpression) === JSON.stringify({
        userId: { $type: 'objectId' },
      })
    )));
    assert.ok(schemaIndexes.some(([fields, options]) => (
      JSON.stringify(fields) === JSON.stringify({
        targetEntity: 1,
        timestamp: -1,
        _id: -1,
      })
      && options.name === 'audit_legacy_target_cursor'
      && options.partialFilterExpression?.targetEntity?.$type === 'string'
      && options.partialFilterExpression?.targetEntity?.$gt === ''
    )));
  });

  it('re-sanitizes nested safe facts after assignment and before validation', async () => {
    const document = new AuditLog({
      actorType: 'System',
      source: 'Worker',
      action: 'SAFE_FACT_MUTATION_TEST',
      targetType: 'Order',
      targetId: 'order-1',
      outcome: 'Success',
      correlationId: 'safe-fact:1',
      safeFacts: { status: 'Active', metadata: { state: 'Ready' } },
    });

    document.safeFacts.status = 'token=secret-after-assignment';
    document.safeFacts.metadata.state = ['Ready', 'OTP=123456'];
    await document.validate();

    assert.deepEqual(document.safeFacts, {
      metadata: {},
    });
    assert.equal(JSON.stringify(document.safeFacts).includes('secret-after-assignment'), false);
    assert.equal(JSON.stringify(document.safeFacts).includes('123456'), false);
  });

  it('persists only dedicated typed replay bindings and no unrestricted after snapshot', async () => {
    const document = new AuditLog({
      userId: '507f1f77bcf86cd799439011',
      action: 'ACCOUNT_STATUS_DISABLED',
      eventId: 'account:disable:1',
      targetEntity: 'User',
      targetId: '507f1f77bcf86cd799439012',
      description: 'Approved',
      before: { invitationId: 'invite-old', status: 'Active' },
      after: {
        status: 'Disabled',
        commandFingerprint: 'a'.repeat(64),
        result: { phoneNumber: '0900000000', token: 'secret' },
      },
    });

    await document.validate();
    const persisted = document.toObject({ virtuals: false });
    const reloaded = new AuditLog(persisted);
    await reloaded.validate();

    assert.deepEqual(reloaded.replayBinding?.toObject?.() || reloaded.replayBinding, {
      commandFingerprint: 'a'.repeat(64),
      priorTargetId: 'invite-old',
    });
    assert.equal(AuditLog.schema.path('replayBinding').options.select, false);
    assert.equal(AuditLog.schema.path('after'), undefined);
    assert.equal(JSON.stringify(persisted).includes('0900000000'), false);
    assert.equal(JSON.stringify(persisted).includes('secret'), false);
  });

  it('normalizes an empty legacy target and unsafe description before model validation', async () => {
    const document = new AuditLog({
      userId: null,
      action: 'AUTH_LOGIN_FAILURE',
      targetEntity: 'User',
      targetId: '',
      description: 'PaSsWoRd abc123',
    });

    await document.validate();
    assert.equal(document.targetId, 'unknown');
    assert.equal(document.reason, '[REDACTED]');
    assert.equal(document.description, '[REDACTED]');
  });

  it('persists a private typed Admin command result without retaining a raw after snapshot', async () => {
    const document = new AuditLog({
      userId: '507f1f77bcf86cd799439011',
      action: 'ACCOUNT_STATUS_DISABLED',
      eventId: 'account:disable:typed-result',
      targetEntity: 'User',
      targetId: '507f1f77bcf86cd799439012',
      description: 'Security policy',
      after: {
        commandFingerprint: 'b'.repeat(64),
        result: {
          user: {
            id: '507f1f77bcf86cd799439012',
            fullName: 'Original Name',
            email: 'original@example.com',
            role: 'Customer',
            status: 'Disabled',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            lastLoginAt: new Date('2026-07-01T00:00:00.000Z'),
            version: 4,
            passwordHash: 'must-not-survive',
          },
          revokedSessions: 2,
          handoff: {
            activeAssignments: [{
              sliceId: 'SL-008_SUPPORT',
              detail: {
                entity: 'SupportRequest',
                activeStatuses: ['InProgress'],
                rawContent: 'must-not-survive',
              },
            }],
            assignmentCheckUnavailable: false,
            recoveries: [{ sliceId: 'SL-008_SUPPORT', recovered: true }],
            reason: 'must-not-survive',
          },
        },
      },
    });

    await document.validate();
    const persisted = document.toObject({ virtuals: false });
    const reloaded = new AuditLog(persisted);
    await reloaded.validate();

    assert.equal(AuditLog.schema.path('commandResult').options.select, false);
    assert.equal(AuditLog.schema.path('commandResult').options.immutable, true);
    assert.deepEqual(
      reloaded.commandResult?.toObject?.() || reloaded.commandResult,
      {
        user: {
          id: '507f1f77bcf86cd799439012',
          fullName: 'Original Name',
          email: 'original@example.com',
          role: 'Customer',
          status: 'Disabled',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          lastLoginAt: new Date('2026-07-01T00:00:00.000Z'),
          version: 4,
        },
        revokedSessions: 2,
        handoff: {
          activeAssignments: [{
            sliceId: 'SL-008_SUPPORT',
            detail: {
              entity: 'SupportRequest',
              activeStatuses: ['InProgress'],
            },
          }],
          assignmentCheckUnavailable: false,
          recoveries: [{ sliceId: 'SL-008_SUPPORT', recovered: true }],
        },
      }
    );
    assert.equal(AuditLog.schema.path('after'), undefined);
    assert.equal(JSON.stringify(persisted).includes('passwordHash'), false);
    assert.equal(JSON.stringify(persisted).includes('must-not-survive'), false);
  });
});
