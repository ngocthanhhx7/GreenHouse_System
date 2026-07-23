const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createAfterSalesLockService } = require('./afterSalesLock.service');

function resolvedQuery(value) {
  return {
    session() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

describe('after-sales order lock service', () => {
  it('reopens only the same completed case for corrective payout recovery', async () => {
    const calls = [];
    const reopened = {
      orderId: 'order-1',
      caseType: 'RETURN_REFUND',
      caseId: 'request-1',
      status: 'Active',
    };
    const model = {
      findOneAndUpdate(filter, update, options) {
        calls.push({ filter, update, options });
        return resolvedQuery(reopened);
      },
    };
    const clock = () => new Date('2026-07-23T10:00:00.000Z');
    const service = createAfterSalesLockService({ model, clock });

    const result = await service.reopenCompleted({
      orderId: 'order-1',
      caseType: 'RETURN_REFUND',
      caseId: 'request-1',
    }, { id: 'session-1' });

    assert.equal(result, reopened);
    assert.deepEqual(calls, [{
      filter: {
        orderId: 'order-1',
        status: 'ClosedPermanently',
        caseType: 'RETURN_REFUND',
        caseId: 'request-1',
        terminalStatus: 'Completed',
      },
      update: {
        $set: {
          status: 'Active',
          acquiredAt: new Date('2026-07-23T10:00:00.000Z'),
          releasedAt: null,
          terminalStatus: '',
        },
      },
      options: { new: true, runValidators: true },
    }]);
  });
});
