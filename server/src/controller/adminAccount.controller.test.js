const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { adminAccountService } = require('../services/adminAccount.service');
const controller = require('./adminAccount.controller');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

describe('Admin invitation controller attribution', () => {
  for (const [method, handler, params] of [
    ['createInvitation', controller.createInvitation, {}],
    ['resendInvitation', controller.resendInvitation, { id: 'invite-1' }],
    ['revokeInvitation', controller.revokeInvitation, { id: 'invite-1' }],
  ]) {
    it(`${method} forwards actor and canonical Idempotency-Key`, async () => {
      const original = adminAccountService[method];
      let received;
      adminAccountService[method] = async (input) => {
        received = input;
        return { ok: true };
      };
      const req = {
        user: { id: 'admin-1' },
        body: {},
        params,
        get(name) { return name === 'Idempotency-Key' ? 'header-key' : ''; },
      };
      const res = response();
      let forwarded;
      try {
        await handler(req, res, (error) => { forwarded = error; });
      } finally {
        adminAccountService[method] = original;
      }

      assert.equal(forwarded, undefined);
      assert.equal(received.actorUserId, 'admin-1');
      assert.equal(received.idempotencyKey, 'header-key');
      if (params.id) assert.equal(received.invitationId, params.id);
    });
  }
});

describe('Admin account controller identity boundaries', () => {
  for (const [method, handler] of [
    ['changeStatus', controller.changeStatus],
    ['transferRole', controller.transferRole],
  ]) {
    it(`${method} does not let JSON overwrite the authenticated actor or path target`, async () => {
      const original = adminAccountService[method];
      let received;
      adminAccountService[method] = async (input) => {
        received = input;
        return { ok: true };
      };
      const req = {
        user: { id: 'authenticated-admin' },
        params: { id: 'path-target' },
        body: {
          actorUserId: 'spoofed-admin',
          targetUserId: 'spoofed-target',
          idempotencyKey: 'body-key',
        },
        get() { return ''; },
      };
      try {
        await handler(req, response(), () => {});
      } finally {
        adminAccountService[method] = original;
      }

      assert.equal(received.actorUserId, 'authenticated-admin');
      assert.equal(received.targetUserId, 'path-target');
      assert.equal(received.idempotencyKey, 'body-key');
    });
  }

  it('listAccounts does not let query parameters overwrite the authenticated actor', async () => {
    const original = adminAccountService.listAccounts;
    let received;
    adminAccountService.listAccounts = async (input) => {
      received = input;
      return { items: [], total: 0 };
    };
    const req = {
      user: { id: 'authenticated-admin' },
      query: { actorUserId: 'spoofed-admin', status: 'Active' },
    };
    try {
      await controller.listAccounts(req, response(), () => {});
    } finally {
      adminAccountService.listAccounts = original;
    }

    assert.equal(received.actorUserId, 'authenticated-admin');
    assert.equal(received.status, 'Active');
  });
});
