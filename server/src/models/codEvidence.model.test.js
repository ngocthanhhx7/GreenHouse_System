const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const CodEvidence = require('./codEvidence.model');

describe('COD evidence model', () => {
  it('separates collection and settlement facts and enforces event identity', () => {
    assert.ok(CodEvidence.schema.path('orderId'));
    assert.ok(CodEvidence.schema.path('eventId'));
    assert.ok(CodEvidence.schema.path('eventType').enumValues.includes('COLLECTION'));
    assert.ok(CodEvidence.schema.path('eventType').enumValues.includes('SETTLEMENT'));
    assert.ok(CodEvidence.schema.path('customerCollectedAmount'));
    assert.ok(CodEvidence.schema.path('carrierSettlementAmount'));
    const uniqueEventIndex = CodEvidence.schema.indexes().find(([fields, options]) => fields.eventId === 1 && options.unique === true);
    assert.ok(uniqueEventIndex);
    const uniqueCollectionIndex = CodEvidence.schema.indexes().find(([fields, options]) => fields.orderId === 1 && options.unique === true && options.partialFilterExpression?.eventType === 'COLLECTION');
    assert.ok(uniqueCollectionIndex, 'an order can have only one collection evidence');
  });
});
