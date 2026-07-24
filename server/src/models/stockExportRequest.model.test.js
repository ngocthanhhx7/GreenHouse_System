const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const StockExportRequest = require('./stockExportRequest.model');

describe('StockExportRequest persistence contract', () => {
  it('allows only one initial export request per order', () => {
    const [key, options] = StockExportRequest.schema.indexes().find(
      ([fields, indexOptions]) => indexOptions.name === 'stock_export_one_initial_per_order'
        && fields.orderId === 1 && fields.requestKind === 1
    ) || [];

    assert.deepEqual(key, { orderId: 1, requestKind: 1 });
    assert.equal(options.unique, true);
    assert.deepEqual(options.partialFilterExpression, { requestKind: 'Initial' });
  });

  it('stores only the exact processing lifecycle and one request per cycle', () => {
    assert.deepEqual(
      StockExportRequest.schema.path('status').enumValues,
      ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
    );
    const [key, options] = StockExportRequest.schema.indexes().find(
      ([fields, indexOptions]) => indexOptions.name === 'stock_export_one_request_per_cycle'
        && fields.cycleId === 1
    ) || [];
    assert.deepEqual(key, { cycleId: 1 });
    assert.equal(options.unique, true);
  });
});
