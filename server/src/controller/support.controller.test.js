const assert = require('node:assert/strict');
const { afterEach, describe, it } = require('node:test');

const supportController = require('./support.controller');
const { supportService } = require('../services/support.service');

const originals = Object.fromEntries(
  Object.entries(supportService).map(([name, value]) => [name, value]),
);

afterEach(() => {
  for (const key of Object.keys(supportService)) {
    if (!Object.hasOwn(originals, key)) delete supportService[key];
  }
  Object.assign(supportService, originals);
});

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function request(overrides = {}) {
  return {
    params: { id: 'ticket-1' },
    query: {},
    body: {},
    headers: { 'idempotency-key': 'support-command-key-001' },
    user: { id: 'customer-1', role: 'Customer', status: 'Active' },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
    ...overrides,
  };
}

async function invoke(handler, req) {
  const res = responseRecorder();
  let forwarded;
  await handler(req, res, (error) => {
    forwarded = error;
  });
  assert.equal(forwarded, undefined);
  return res;
}

describe('SL-008 Support HTTP controller', () => {
  it('whitelists every remaining Customer and Staff command body', async () => {
    const actor = { id: 'staff-a', role: 'Staff', status: 'Active' };
    const forged = {
      idempotencyKey: 'forged-body-key',
      customerId: 'foreign-owner',
      status: 'Resolved',
      handledBy: 'staff-b',
    };
    const cases = [
      {
        handler: 'createCustomerRequest',
        method: 'createRequest',
        body: {
          type: 'Product', subject: 'Product support request',
          initialMessage: 'Please check this delivered product.',
          orderId: 'order-1', productId: 'product-1', expectedVersion: 0,
        },
        args: (command) => [actor, command, { idempotencyKey: 'support-command-key-001' }],
      },
      {
        handler: 'appendCustomerMessage',
        method: 'appendMessage',
        body: { message: 'A follow-up message.', expectedVersion: 2 },
        args: (command) => [actor, 'ticket-1', command, { idempotencyKey: 'support-command-key-001' }],
      },
      {
        handler: 'withdrawCustomerRequest',
        method: 'withdraw',
        body: { expectedVersion: 1 },
        args: (command) => [actor, 'ticket-1', command, { idempotencyKey: 'support-command-key-001' }],
      },
      {
        handler: 'changePriority',
        method: 'changePriority',
        body: { priority: 'High', reason: 'Customer impact', expectedVersion: 3 },
        args: (command) => [actor, 'ticket-1', command, { idempotencyKey: 'support-command-key-001' }],
      },
      {
        handler: 'transferRequest',
        method: 'transfer',
        body: { assigneeId: 'staff-b', reason: 'Specialist required', expectedVersion: 4 },
        args: (command) => [actor, 'ticket-1', command, { idempotencyKey: 'support-command-key-001' }],
      },
    ];

    for (const row of cases) {
      const calls = [];
      supportService[row.method] = async (...args) => {
        calls.push(args);
        return { id: 'ticket-1' };
      };
      const body = { ...row.body, ...forged };
      await invoke(supportController[row.handler], request({ user: actor, body }));
      assert.deepEqual(calls, [row.args(row.body)], `${row.handler} must pass only approved facts`);
    }
  });

  it('maps Customer reopen to message/version facts and header-only command identity', async () => {
    const calls = [];
    supportService.reopen = async (...args) => {
      calls.push(args);
      return { id: 'ticket-1', status: 'InProgress', version: 4 };
    };
    const actor = { id: 'customer-1', role: 'Customer', status: 'Active' };

    const res = await invoke(supportController.reopenCustomerRequest, request({
      user: actor,
      body: {
        message: 'The same issue returned.',
        expectedVersion: 3,
        idempotencyKey: 'forged-body-key',
        customerId: 'foreign-owner',
        status: 'InProgress',
      },
    }));

    assert.deepEqual(calls, [[
      actor,
      'ticket-1',
      { message: 'The same issue returned.', expectedVersion: 3 },
      { idempotencyKey: 'support-command-key-001' },
    ]]);
    assert.equal(res.statusCode, 200);
  });

  it('maps Staff claim to expectedVersion and header-only command identity', async () => {
    const calls = [];
    supportService.claim = async (...args) => {
      calls.push(args);
      return { id: 'ticket-1', status: 'InProgress', version: 2 };
    };
    const actor = { id: 'staff-a', role: 'Staff', status: 'Active' };

    await invoke(supportController.claimRequest, request({
      user: actor,
      body: {
        expectedVersion: 1,
        idempotencyKey: 'forged-body-key',
        assigneeId: 'staff-b',
        status: 'Resolved',
      },
    }));

    assert.deepEqual(calls, [[
      actor,
      'ticket-1',
      { expectedVersion: 1 },
      { idempotencyKey: 'support-command-key-001' },
    ]]);
  });

  it('maps Staff resolve to finalMessage/version facts and header-only command identity', async () => {
    const calls = [];
    supportService.resolve = async (...args) => {
      calls.push(args);
      return { id: 'ticket-1', status: 'Resolved', version: 3 };
    };
    const actor = { id: 'staff-a', role: 'Staff', status: 'Active' };

    await invoke(supportController.resolveRequest, request({
      user: actor,
      body: {
        finalMessage: 'The replacement has been arranged.',
        expectedVersion: 2,
        idempotencyKey: 'forged-body-key',
        assigneeId: 'staff-b',
        status: 'Resolved',
      },
    }));

    assert.deepEqual(calls, [[
      actor,
      'ticket-1',
      { finalMessage: 'The replacement has been arranged.', expectedVersion: 2 },
      { idempotencyKey: 'support-command-key-001' },
    ]]);
  });
});
