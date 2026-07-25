const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const damageReportController = require('./damageReport.controller');
const { damageReportService } = require('../services/damageReport.service');

function createResponseRecorder() {
  const state = { statusCode: null, payload: null };
  return {
    state,
    response: {
      status(statusCode) {
        state.statusCode = statusCode;
        return this;
      },
      json(payload) {
        state.payload = payload;
        return payload;
      },
    },
  };
}

describe('damage report controller', () => {
  it('lists only reports for the authenticated Staff actor', async (t) => {
    const expected = { items: [], total: 0, page: 1, pageSize: 20 };
    t.mock.method(damageReportService, 'listStaffReports', async (staffId, query) => {
      assert.equal(staffId, 'staff-1');
      assert.deepEqual(query, { status: 'PendingReview', page: '1' });
      return expected;
    });
    const { state, response } = createResponseRecorder();
    const nextErrors = [];

    await damageReportController.listStaffReports(
      {
        user: { id: 'staff-1' },
        query: { status: 'PendingReview', page: '1' },
      },
      response,
      (error) => nextErrors.push(error),
    );

    assert.equal(state.statusCode, 200);
    assert.equal(state.payload.data, expected);
    assert.deepEqual(nextErrors, []);
  });

  it('waits for a Warehouse decision before returning success', async (t) => {
    let finishDecision;
    const pendingDecision = new Promise((resolve) => {
      finishDecision = resolve;
    });
    t.mock.method(damageReportService, 'resolveWarehouseReport', () => pendingDecision);
    const { state, response } = createResponseRecorder();
    const nextErrors = [];

    const request = {
      user: { id: 'warehouse-1' },
      params: { id: 'damage-1' },
      body: { confirmedQuantity: 1, decisionReason: 'Verified', decisionEvidence: ['photo-1'] },
    };
    const controllerResult = damageReportController.confirmWarehouseReport(
      request,
      response,
      (error) => nextErrors.push(error),
    );

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.payload, null);

    const decision = { id: 'damage-1', status: 'Confirmed' };
    finishDecision(decision);
    await controllerResult;

    assert.equal(state.statusCode, 200);
    assert.equal(state.payload.data, decision);
    assert.deepEqual(nextErrors, []);
  });

  it('forwards a rejected Warehouse decision without sending success', async (t) => {
    const expectedError = new Error('Decision evidence is required');
    t.mock.method(damageReportService, 'confirmWarehouseReport', async () => {
      throw expectedError;
    });
    const { state, response } = createResponseRecorder();
    const nextErrors = [];

    await damageReportController.confirmWarehouseReport(
      { user: { id: 'warehouse-1' }, params: { id: 'damage-1' }, body: {} },
      response,
      (error) => nextErrors.push(error),
    );

    assert.equal(state.payload, null);
    assert.deepEqual(nextErrors, [expectedError]);
  });
});
