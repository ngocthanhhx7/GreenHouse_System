const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { auditLogService } = require('../services/auditLog.service');
const controller = require('./auditLog.controller');

function response() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('SL-009 audit log controller', () => {
  it('AT-189 forwards the validated query contract and returns the safe page envelope', async () => {
    const original = auditLogService.listAuditLogs;
    const page = { items: [], nextCursor: 'next-page', total: 0 };
    let received;
    auditLogService.listAuditLogs = async (query) => {
      received = query;
      return page;
    };
    const res = response();
    let forwarded;
    try {
      await controller.listAuditLogs(
        { query: { actorType: 'System', outcome: 'Failed', limit: '25' } },
        res,
        (error) => { forwarded = error; }
      );
    } finally {
      auditLogService.listAuditLogs = original;
    }

    assert.equal(forwarded, undefined);
    assert.deepEqual(received, { actorType: 'System', outcome: 'Failed', limit: '25' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data, page);
  });

  it('passes typed filter errors to the existing error middleware', async () => {
    const original = auditLogService.listAuditLogs;
    const expected = new Error('Bộ lọc nhật ký kiểm toán không hợp lệ.');
    auditLogService.listAuditLogs = async () => { throw expected; };
    let forwarded;
    try {
      await controller.listAuditLogs(
        { query: { cursor: 'invalid' } },
        response(),
        (error) => { forwarded = error; }
      );
    } finally {
      auditLogService.listAuditLogs = original;
    }

    assert.equal(forwarded, expected);
  });
});
