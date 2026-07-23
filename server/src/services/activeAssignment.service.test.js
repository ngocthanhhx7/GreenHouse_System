const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createActiveAssignmentService } = require('./activeAssignment.service');

describe('active assignment seam', () => {
  it('AT-149 emits one idempotent account-disabled handoff without impersonation', async () => {
    const emitted = [];
    const service = createActiveAssignmentService({
      adapters: [
        { sliceId: 'SL-001', async hasActiveAssignment() { return true; } },
        { sliceId: 'SL-002', async hasActiveAssignment() { return false; } },
      ],
      eventSink: { async emit(event) { emitted.push(event); } },
    });
    const result = await service.handleDisabledAccount({
      userId: 'user-1',
      idempotencyKey: 'disable-1',
      reason: 'Nghỉ việc',
    });
    assert.equal(result.activeAssignments[0].sliceId, 'SL-001');
    assert.equal(emitted.length, 1);
    await service.handleDisabledAccount({ userId: 'user-1', idempotencyKey: 'disable-1', reason: 'Nghỉ việc' });
    assert.equal(emitted.length, 1);
  });
});
