const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const AuditLog = require('../models/auditLog.model');
const {
  logAudit,
  serializeAuditFacts,
  normalizeAuditEntry,
  normalizeAuditReason,
} = require('./auditLogger');

describe('audit logger transaction contract', () => {
  it('stores a unique non-empty business event identity', () => {
    assert.ok(AuditLog.schema.path('eventId'));
    assert.equal(AuditLog.schema.path('eventId').options.immutable, true);
    assert.ok(AuditLog.schema.indexes().some(([fields, options]) => (
      fields.eventId === 1
      && options.unique === true
      && options.name === 'audit_event_id_unique'
      && options.partialFilterExpression?.eventId?.$gt === ''
    )));
  });

  it('creates the audit record in the caller Mongo session', async () => {
    const originalCreate = AuditLog.create;
    const session = { id: 'exchange-session' };
    let receivedDocuments;
    let receivedOptions;
    AuditLog.create = async (documents, options) => {
      receivedDocuments = documents;
      receivedOptions = options;
      return documents;
    };

    try {
      await logAudit({
        userId: '507f1f77bcf86cd799439011',
        action: 'EXCHANGE_REJECTED',
        eventId: 'EXCHANGE_REJECTED:exchange-1',
        targetEntity: 'ExchangeCase',
        targetId: 'exchange-1',
        description: 'Rejected with evidence',
      }, session);
    } finally {
      AuditLog.create = originalCreate;
    }

    assert.equal(Array.isArray(receivedDocuments), true);
    assert.equal(receivedDocuments[0].action, 'EXCHANGE_REJECTED');
    assert.equal(receivedDocuments[0].eventId, 'EXCHANGE_REJECTED:exchange-1');
    assert.equal(receivedOptions.session, session);
  });

  it('AT-184 preserves real non-User attribution without inventing a user', () => {
    const normalized = normalizeAuditEntry({
      actorType: 'payOS',
      source: 'payOSWebhook',
      action: 'PAYMENT_CALLBACK_ACCEPTED',
      targetType: 'Payment',
      targetId: 'payment-1',
      outcome: 'Success',
      correlationId: 'payos:webhook-1',
    });

    assert.equal(normalized.actorType, 'payOS');
    assert.equal(normalized.actorId, null);
    assert.equal(normalized.source, 'payOSWebhook');
    assert.equal(normalized.targetType, 'Payment');
  });

  it('AT-183 adapts legacy audit calls into the canonical safe record', () => {
    const normalized = normalizeAuditEntry({
      userId: '507f1f77bcf86cd799439011',
      action: 'PRODUCT_UPDATE',
      eventId: 'product:1:v2',
      targetEntity: 'Product',
      targetId: 'product-1',
      description: 'Approved price change',
      before: { status: 'Inactive', price: 10000 },
      after: { status: 'Active', price: 12000, password: 'must-not-survive' },
    });

    assert.equal(normalized.actorType, 'User');
    assert.equal(normalized.actorId, '507f1f77bcf86cd799439011');
    assert.equal(normalized.businessEventId, 'product:1:v2');
    assert.equal(normalized.correlationId, 'product:1:v2');
    assert.equal(normalized.targetType, 'Product');
    assert.equal(normalized.reason, 'Approved price change');
    assert.deepEqual(normalized.safeFacts, {
      previous: { status: 'Inactive', price: 10000 },
      next: { status: 'Active', price: 12000 },
    });
  });

  it('gives legacy calls without an event id a non-empty correlation identity', () => {
    const normalized = normalizeAuditEntry({
      userId: '507f1f77bcf86cd799439011',
      action: 'CATEGORY_CREATE',
      targetEntity: 'Category',
      targetId: 'category-1',
    });

    assert.match(normalized.correlationId, /^legacy:[0-9a-f-]{36}$/i);
    assert.equal(normalized.businessEventId, normalized.correlationId);
    assert.equal(normalized.eventId, normalized.correlationId);
  });

  it('AT-188 recursively excludes secrets, private destinations, raw callbacks and full user content', () => {
    const serialized = serializeAuditFacts({
      status: 'Refunded',
      version: 4,
      evidenceReference: 'evidence-file-id-1',
      passwordHash: 'hash-secret',
      accessToken: 'token-secret',
      otp: '123456',
      sessionCookie: 'cookie-secret',
      fullAddress: 'private address',
      phoneNumber: '0900000000',
      refundDestination: { accountNumber: '123456789' },
      rawCallback: { payload: 'gateway-private' },
      review: { content: 'full review body' },
      supportMessage: 'full support body',
      evidence: { content: 'full evidence body' },
      metadata: {
        state: 'Completed',
        correlationId: 'safe-reference',
        password: 'nested-secret',
      },
    });

    assert.deepEqual(serialized, {
      status: 'Refunded',
      version: 4,
      evidenceReference: 'evidence-file-id-1',
      metadata: {
        state: 'Completed',
        correlationId: 'safe-reference',
      },
    });
    const text = JSON.stringify(serialized);
    for (const secret of [
      'hash-secret',
      'token-secret',
      '123456',
      'cookie-secret',
      'private address',
      '0900000000',
      '123456789',
      'gateway-private',
      'full review body',
      'full support body',
      'full evidence body',
    ]) {
      assert.equal(text.includes(secret), false, `leaked ${secret}`);
    }
  });

  it('rejects arrays and bounds typed strings before they become safe facts', () => {
    const serialized = serializeAuditFacts({
      status: 'x'.repeat(10_000),
      providerReference: 'secret-token',
      metadata: {
        state: 'Completed',
        status: ['Safe', 'token=secret-token'],
        evidenceReference: ['evidence-1', 'full evidence body'],
      },
    });

    assert.equal(serialized.status.length <= 120, true);
    assert.deepEqual(serialized.metadata, { state: 'Completed' });
    assert.equal(JSON.stringify(serialized).includes('secret-token'), false);
    assert.equal(JSON.stringify(serialized).includes('full evidence body'), false);
  });

  it('normalizes, bounds and redacts unsafe audit reasons', () => {
    assert.equal(normalizeAuditReason('  Approved   by policy  '), 'Approved by policy');
    assert.equal(normalizeAuditReason('OTP=123456 raw callback body'), '[REDACTED]');
    assert.equal(normalizeAuditReason('x'.repeat(5_000)).length, 500);

    const normalized = normalizeAuditEntry({
      action: 'AUTH_LOGIN_FAILURE',
      targetEntity: 'User',
      targetId: '',
      description: 'session token=do-not-store',
    });
    assert.equal(normalized.reason, '[REDACTED]');
    assert.equal(normalized.description, '[REDACTED]');
    assert.equal(normalized.targetId, 'unknown');
  });

  it('redacts mixed-case whitespace, delimiter, Bearer and nested credential forms', () => {
    for (const unsafeReason of [
      'oTp 123456',
      'PASSWORD abc123',
      'passcode:246810',
      'token=opaque-value',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
      'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
      'Bearer <token>',
      'Nested failure { password abc123 }',
    ]) {
      assert.equal(normalizeAuditReason(unsafeReason), '[REDACTED]', unsafeReason);
    }

    assert.equal(
      normalizeAuditReason('  Đã   phê duyệt theo chính sách bảo mật  '),
      'Đã phê duyệt theo chính sách bảo mật'
    );
    const normalized = normalizeAuditEntry({
      action: 'LEGACY_FAILURE',
      targetEntity: 'User',
      description: 'Authorization Bearer secret-value',
    });
    assert.equal(normalized.reason, '[REDACTED]');
    assert.equal(normalized.description, '[REDACTED]');
  });

  it('redacts unlabelled email and Vietnamese or international phone contact details', () => {
    for (const unsafeReason of [
      'Contact customer@example.com / 0901234567',
      'Liên hệ +84 901 234 567 để xác nhận',
      'Escalate via +1-415-555-2671',
    ]) {
      assert.equal(normalizeAuditReason(unsafeReason), '[REDACTED]', unsafeReason);
    }
    assert.equal(
      normalizeAuditReason('Đã phê duyệt theo chính sách vận hành'),
      'Đã phê duyệt theo chính sách vận hành'
    );
  });
});
