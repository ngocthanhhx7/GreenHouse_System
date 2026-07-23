const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReturnEvidenceAccessService } = require('./returnEvidence.service');

const filename = '11111111-1111-4111-8111-111111111111.jpg';

function createService(request) {
  return createReturnEvidenceAccessService({
    findLinkedRequest: async (candidateUrls) => {
      assert.deepEqual(candidateUrls, [
        `/api/return-refunds/evidence/${filename}`,
        `/api/exchanges/evidence/${filename}`,
        `/uploads/return-evidence/${filename}`,
      ]);
      return request;
    },
  });
}

describe('return evidence access service', () => {
  it('allows the owning Customer and Staff to read linked evidence', async () => {
    const service = createService({ customerId: 'customer-1', status: 'New' });
    assert.equal((await service.authorize('customer-1', 'Customer', filename)).filename, filename);
    assert.equal((await service.authorize('staff-1', 'Staff', filename)).filename, filename);
  });

  it('hides linked evidence from a different Customer', async () => {
    const service = createService({ customerId: 'customer-1', status: 'New' });
    await assert.rejects(
      () => service.authorize('customer-2', 'Customer', filename),
      (error) => error.statusCode === 404,
    );
  });

  it('allows Warehouse only after Staff approval puts the case in warehouse scope', async () => {
    await assert.rejects(
      () => createService({ customerId: 'customer-1', status: 'New' }).authorize('warehouse-1', 'WarehouseManager', filename),
      (error) => error.statusCode === 404,
    );
    assert.equal(
      (await createService({ customerId: 'customer-1', status: 'Approved' }).authorize('warehouse-1', 'WarehouseManager', filename)).filename,
      filename,
    );
  });

  it('rejects unlinked files and unsafe filenames without revealing file existence', async () => {
    await assert.rejects(
      () => createService(null).authorize('staff-1', 'Staff', filename),
      (error) => error.statusCode === 404,
    );
    await assert.rejects(
      () => createService(null).authorize('staff-1', 'Staff', '../../secret.jpg'),
      (error) => error.statusCode === 404,
    );
  });
});
