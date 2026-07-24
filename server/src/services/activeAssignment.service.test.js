const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  createActiveAssignmentService,
  createCurrentSliceAssignmentAdapters,
  createSupportRecoveryHandler,
} = require('./activeAssignment.service');

describe('active assignment seam', () => {
  it('fails closed when no owning-slice assignment adapter is registered', async () => {
    const service = createActiveAssignmentService({ adapters: [] });

    await assert.rejects(
      () => service.hasActiveAssignments('staff-1'),
      (error) => error.statusCode === 503
        && error.errorCode === 'ACTIVE_ASSIGNMENT_CHECK_UNAVAILABLE',
    );
  });

  it('passes the transaction session through inspection to every adapter', async () => {
    const calls = [];
    const service = createActiveAssignmentService({
      adapters: [
        {
          sliceId: 'SL-003',
          async hasActiveAssignment(userId, session) {
            calls.push({ userId, session });
            return false;
          },
        },
        {
          sliceId: 'SL-005',
          async hasActiveAssignment(userId, session) {
            calls.push({ userId, session });
            return false;
          },
        },
      ],
    });
    const session = { id: 'assignment-tx' };

    await service.hasActiveAssignments('staff-1', session);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { userId: 'staff-1', session });
    assert.deepEqual(calls[1], { userId: 'staff-1', session });
  });

  it('registers concrete current-slice adapters that query non-terminal work in the session', async () => {
    const calls = [];
    function model(name, active = false) {
      return {
        exists(filter) {
          const call = { name, filter, session: null };
          calls.push(call);
          const query = {
            session(session) {
              call.session = session;
              return query;
            },
            then(resolve) {
              resolve(active ? { _id: `${name}-1` } : null);
            },
          };
          return query;
        },
      };
    }
    const adapters = createCurrentSliceAssignmentAdapters({
      StockExportRequestModel: model('stock-export'),
      DamageReportModel: model('damage-report'),
      ReplenishmentRequestModel: model('replenishment', true),
      ReturnRefundRequestModel: model('return-refund'),
      ExchangeCaseModel: model('exchange'),
      ExchangeShipmentModel: model('exchange-shipment'),
      SupportRequestModel: model('support'),
    });
    const service = createActiveAssignmentService({ adapters });
    const session = { id: 'production-tx' };

    const result = await service.hasActiveAssignments('warehouse-1', session);

    assert.equal(adapters.length > 0, true);
    assert.equal(result.active, true);
    assert.equal(result.assignments[0].sliceId, 'SL-005_REPLENISHMENT');
    assert.equal(calls.every((call) => call.session === session), true);
    assert.equal(calls.some((call) => call.name === 'return-refund'), true);
    assert.equal(calls.some((call) => call.name === 'exchange-shipment'), true);
    const replenishmentCall = calls.find((call) => call.name === 'replenishment');
    assert.deepEqual(
      replenishmentCall.filter.status.$in,
      ['PendingApproval', 'Approved', 'Receiving', 'PartiallyReceived', 'ShortClosurePending'],
    );
  });

  it('AT-149 emits one idempotent account-disabled handoff without impersonation', async () => {
    const emitted = new Map();
    const sessions = [];
    const service = createActiveAssignmentService({
      adapters: [
        { sliceId: 'SL-001', async hasActiveAssignment() { return true; } },
        { sliceId: 'SL-002', async hasActiveAssignment() { return false; } },
      ],
      eventSink: {
        async emit(event, session) {
          sessions.push(session);
          if (!emitted.has(event.idempotencyKey)) emitted.set(event.idempotencyKey, event);
        },
      },
    });
    const result = await service.handleDisabledAccount({
      userId: 'user-1',
      idempotencyKey: 'disable-1',
      reason: 'Employment ended',
    }, { id: 'tx-1' });

    assert.equal(result.activeAssignments[0].sliceId, 'SL-001');
    assert.equal(result.assignmentCheckUnavailable, false);
    assert.equal(emitted.size, 1);
    assert.deepEqual(sessions[0], { id: 'tx-1' });
    await service.handleDisabledAccount({
      userId: 'user-1',
      idempotencyKey: 'disable-1',
      reason: 'Employment ended',
    });
    assert.equal(emitted.size, 1);
  });

  it('runs the SL-008 disabled-assignee recovery in the disable transaction before emitting', async () => {
    const sequence = [];
    const session = { id: 'account-disable-tx' };
    const service = createActiveAssignmentService({
      adapters: [
        { sliceId: 'SL-008_SUPPORT', async hasActiveAssignment() { return true; } },
      ],
      recoveryHandlers: [{
        sliceId: 'SL-008_SUPPORT',
        async recoverDisabledAccount(input, activeSession) {
          sequence.push({ kind: 'recover', input, session: activeSession });
          return { id: 'safe-ticket-result' };
        },
      }],
      eventSink: {
        async emit(_event, activeSession) {
          sequence.push({ kind: 'emit', session: activeSession });
        },
      },
    });

    const result = await service.handleDisabledAccount({
      userId: 'staff-1',
      idempotencyKey: 'disable-staff-1',
      reason: 'Employment ended',
    }, session);

    assert.deepEqual(sequence, [
      {
        kind: 'recover',
        input: {
          userId: 'staff-1',
          idempotencyKey: 'disable-staff-1',
          reason: 'Employment ended',
        },
        session,
      },
      { kind: 'emit', session },
    ]);
    assert.deepEqual(result.recoveries, [{ sliceId: 'SL-008_SUPPORT', recovered: true }]);
  });

  it('wires the production SL-008 recovery to the same Mongo session and stable command key', async () => {
    const calls = [];
    const session = { id: 'disable-transaction' };
    const handler = createSupportRecoveryHandler({
      getSupportService: () => ({
        async clearDisabledAssignee(userId, command, options) {
          calls.push({ userId, command, options });
          return { id: 'ticket-1' };
        },
      }),
    });

    const result = await handler.recoverDisabledAccount({
      userId: 'staff-1',
      idempotencyKey: 'disable-1',
      reason: 'Employment ended',
    }, session);

    assert.deepEqual(result, { id: 'ticket-1' });
    assert.deepEqual(calls, [{
      userId: 'staff-1',
      command: {},
      options: {
        idempotencyKey: 'sl007-support-clear-disable-1',
        mongoSession: session,
      },
    }]);
  });

  it('AT-149 keeps disable immediate and marks the durable handoff when assignment adapters are unavailable', async () => {
    const emitted = [];
    const service = createActiveAssignmentService({
      adapters: [],
      eventSink: { async emit(event) { emitted.push(event); } },
    });

    const result = await service.handleDisabledAccount({
      userId: 'user-2',
      idempotencyKey: 'disable-2',
      reason: 'Security lock',
    });

    assert.equal(result.assignmentCheckUnavailable, true);
    assert.equal(emitted[0].eventType, 'ACCOUNT_DISABLED');
    assert.equal(emitted[0].assignmentCheckUnavailable, true);
    assert.equal(emitted[0].impersonationAllowed, false);
  });
});
