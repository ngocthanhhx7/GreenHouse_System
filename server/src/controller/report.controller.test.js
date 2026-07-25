const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { createReportController } = require('./report.controller');

function harness() {
  const serviceCalls = [];
  const audits = [];
  const responses = [];
  const reportService = {};
  for (const method of [
    'getAdminOverview',
    'getRevenueReport',
    'getOrderReport',
    'getProductReport',
    'getCustomerReport',
    'getStaffReport',
    'getInventoryReport',
  ]) {
    reportService[method] = async (query) => {
      serviceCalls.push({ method, query });
      return { meta: { mode: query.mode || 'currentMonth' }, section: method };
    };
  }
  return {
    serviceCalls,
    audits,
    responses,
    controller: createReportController({
      reportService,
      auditLogger: {
        async log(entry) {
          audits.push(entry);
        },
      },
      sendSuccessFn(_res, data) {
        responses.push(data);
        return data;
      },
    }),
  };
}

describe('SL-009 report controller', () => {
  for (const [handler, serviceMethod, targetId] of [
    ['getAdminOverview', 'getAdminOverview', 'overview'],
    ['getRevenueReport', 'getRevenueReport', 'revenue'],
    ['getOrderReport', 'getOrderReport', 'orders'],
    ['getProductReport', 'getProductReport', 'products'],
    ['getCustomerReport', 'getCustomerReport', 'customers'],
    ['getStaffReport', 'getStaffReport', 'staff'],
    ['getInventoryReport', 'getInventoryReport', 'inventory'],
  ]) {
    it(`${handler} reads one report and records a safe attributable Admin audit`, async () => {
      const test = harness();
      const req = {
        query: { mode: 'allTime' },
        user: { id: 'admin-1', role: 'Admin' },
        requestId: `request-${targetId}`,
      };
      await test.controller[handler](req, {}, assert.fail);

      assert.deepEqual(test.serviceCalls, [{
        method: serviceMethod,
        query: { mode: 'allTime' },
      }]);
      assert.equal(test.responses.length, 1);
      assert.deepEqual(test.audits, [{
        actorType: 'User',
        actorId: 'admin-1',
        actorRole: 'Admin',
        source: 'Reporting',
        action: 'REPORT_READ',
        targetType: 'Report',
        targetId,
        outcome: 'Success',
        correlationId: `request-${targetId}`,
        businessEventId: `report-read:request-${targetId}`,
        safeFacts: { mode: 'allTime' },
      }]);
      assert.doesNotMatch(JSON.stringify(test.audits), /section|grossSales|email|phone/i);
    });
  }
});
