const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const AuditLog = require('../models/auditLog.model');
const { logAudit } = require('./auditLogger');

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
});
