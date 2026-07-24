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
    const indexes = AuditLog.schema.indexes().map(([fields]) => JSON.stringify(fields));
    assert.ok(indexes.includes(JSON.stringify({ timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorType: 1, actorId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ actorRole: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ action: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ targetType: 1, targetId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ targetId: 1, timestamp: -1, _id: -1 })));
    assert.ok(indexes.includes(JSON.stringify({ outcome: 1, timestamp: -1, _id: -1 })));
  });
});
