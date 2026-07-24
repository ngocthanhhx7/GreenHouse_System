const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const SupportCommand = require('./supportCommand.model');
const SupportRequest = require('./supportRequest.model');

describe('SL-008 Support persistence models', () => {
  it('scopes command idempotency by actor, aggregate, operation, and key', () => {
    const uniqueIndexes = SupportCommand.schema.indexes()
      .filter(([, options]) => options.unique)
      .map(([fields]) => fields);

    assert.ok(uniqueIndexes.some((fields) => (
      fields.actorId === 1
      && fields.aggregateId === 1
      && fields.operation === 1
      && fields.idempotencyKey === 1
      && Object.keys(fields).length === 4
    )));
  });

  it('keeps mutable conversation text out of the SupportRequest aggregate', () => {
    assert.equal(SupportRequest.schema.path('content'), undefined);
    assert.equal(SupportRequest.schema.path('response'), undefined);
    assert.equal(SupportRequest.schema.path('respondedAt'), undefined);
  });

  it('keeps every durable command result field immutable', () => {
    for (const field of ['currentResultId', 'currentResultVersion', 'result']) {
      assert.equal(SupportCommand.schema.path(field).options.immutable, true, field);
    }
  });
});
