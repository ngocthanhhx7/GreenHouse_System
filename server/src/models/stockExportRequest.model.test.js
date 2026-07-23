const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const StockExportRequest = require('./stockExportRequest.model');

describe('StockExportRequest persistence contract', () => {
  it('allows only one open export request per order', () => {
    const [key, options] = StockExportRequest.schema.indexes().find(
      ([fields, indexOptions]) => indexOptions.name === 'stock_export_one_open_per_order'
        && fields.orderId === 1
    ) || [];

    assert.deepEqual(key, { orderId: 1 });
    assert.equal(options.unique, true);
    assert.deepEqual(options.partialFilterExpression, {
      status: { $in: ['Pending', 'Approved', 'Processing'] },
    });
  });
});
