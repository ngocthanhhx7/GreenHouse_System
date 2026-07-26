import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReturnRefundService } from './returnRefundService.js';

describe('client return/refund service', () => {
  it('creates a customer return/refund request for an order', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/orders/order-1/return-refund');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { reason: 'Product arrived damaged' });
        return { ok: true, json: async () => ({ success: true, data: { id: 'refund-1' } }) };
      },
    });

    const result = await service.createCustomerRequest('order-1', { reason: 'Product arrived damaged' });

    assert.equal(result.id, 'refund-1');
  });

  it('preserves the typed active after-sales conflict returned by Return creation', async () => {
    const data = {
      currentCase: { type: 'EXCHANGE', id: 'exchange-1', status: 'Submitted' },
      action: { label: 'Xem yêu cầu đang xử lý', href: '/exchanges/exchange-1' },
    };
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async () => ({
        ok: false,
        json: async () => ({
          success: false,
          message: 'This Order already has an active after-sales case',
          errorCode: 'AFTER_SALES_CASE_ACTIVE',
          data,
        }),
      }),
    });

    await assert.rejects(
      () => service.createCustomerRequest('order-1', { reason: 'Damaged' }),
      (error) => {
        assert.equal(error.errorCode, 'AFTER_SALES_CASE_ACTIVE');
        assert.deepEqual(error.data, data);
        return true;
      },
    );
  });

  it('updates a staff return/refund decision', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/staff/return-refunds/refund-1/status');
        assert.equal(options.method, 'PATCH');
        assert.deepEqual(JSON.parse(options.body), { status: 'Approved', staffNote: 'Approved' });
        return { ok: true, json: async () => ({ success: true, data: { status: 'Approved' } }) };
      },
    });

    const result = await service.decideRequest('refund-1', { status: 'Approved', staffNote: 'Approved' });

    assert.equal(result.status, 'Approved');
  });

  it('lists pending staff requests without dropping other query parameters', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/staff/return-refunds?status=Pending&page=2');
        return { ok: true, json: async () => ({ success: true, data: { items: [] } }) };
      },
    });

    await service.listStaffRequests({ status: 'Pending', page: 2 });
  });

  it('uses warehouse inspection and staff completion endpoints separately', async () => {
    const calls = [];
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, data: { status: 'ReadyForRefund' } }) };
      },
    });

    await service.inspectRequest('refund-1', { items: [] });
    await service.completeRefund('refund-1', { note: 'Da doi soat' });
    await service.recordCodRecoveryReceipt('order-1', { receiptId: 'receipt-1', items: [] });

    assert.equal(calls[0].url, 'http://api.test/api/warehouse/return-refunds/refund-1/inspection');
    assert.equal(calls[1].url, 'http://api.test/api/staff/return-refunds/refund-1/complete-refund');
    assert.equal(calls[2].url, 'http://api.test/api/warehouse/orders/order-1/cod-recovery-receipt');
  });

  it('uses Customer handoff/destination and Staff verification/payout boundaries', async () => {
    const calls = [];
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ success: true, data: {} }) };
      },
    });
    await service.recordHandoffProof('refund-1', { proofReference: 'proof-1' });
    await service.submitDestination('refund-1', {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'NGUYEN VAN A',
      confirmed: true,
      idempotencyKey: 'destination-001',
      bankName: 'must-not-cross-boundary',
      bankBin: '000000',
      pin: 'never-send',
    });
    await service.verifyDestination('refund-1', { destinationId: 'destination-1', status: 'Verified' });
    await service.recordPayoutEvidence('refund-1', {
      idempotencyKey: 'payout-001',
      transferReference: 'BANK-001',
      transferredAt: '2026-07-26T10:00',
      note: 'Đã kiểm tra chứng từ chuyển khoản thủ công.',
      confirmed: true,
    });
    await service.startPayOSPayout('refund-1', { idempotencyKey: 'payos-payout-001' });
    await service.reconcilePayOSPayout('refund-1');
    await service.reconcilePayout('refund-1', {
      idempotencyKey: 'reconcile-001',
      operationKey: 'operation-1',
      outcome: 'Unknown',
      transferReference: 'BANK-001',
      transferredAt: '2026-07-26T10:00',
      note: 'Chưa đủ chứng từ để kết luận giao dịch.',
      confirmed: true,
      providerReference: 'must-not-cross-boundary',
      occurredAt: 'must-not-cross-boundary',
      reconciliationNote: 'must-not-cross-boundary',
    });
    await service.reportPayoutIncident('refund-1', { cause: 'CUSTOMER_CONFIRMED_DESTINATION' });

    assert.deepEqual(calls.map((call) => call.url), [
      'http://api.test/api/return-refunds/refund-1/handoff-proof',
      'http://api.test/api/return-refunds/refund-1/destination',
      'http://api.test/api/staff/return-refunds/refund-1/destination',
      'http://api.test/api/staff/return-refunds/refund-1/payout-evidence',
      'http://api.test/api/staff/return-refunds/refund-1/payos-payout',
      'http://api.test/api/staff/return-refunds/refund-1/payos-reconcile',
      'http://api.test/api/staff/return-refunds/refund-1/payout-reconciliation',
      'http://api.test/api/staff/return-refunds/refund-1/payout-incident',
    ]);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'NGUYEN VAN A',
      confirmed: true,
      idempotencyKey: 'destination-001',
    });
    assert.deepEqual(JSON.parse(calls[6].options.body), {
      idempotencyKey: 'reconcile-001',
      operationKey: 'operation-1',
      outcome: 'Unknown',
      transferReference: 'BANK-001',
      transferredAt: '2026-07-26T10:00',
      note: 'Chưa đủ chứng từ để kết luận giao dịch.',
      confirmed: true,
    });
  });

  it('loads the Customer-safe bank catalog without exposing internal BIN data', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/return-refunds/banks');
        assert.deepEqual(options, {});
        return {
          ok: true,
          json: async () => ({ success: true, data: [{ code: 'MB', name: 'MBBank' }] }),
        };
      },
    });

    assert.deepEqual(await service.listBanks(), [{ code: 'MB', name: 'MBBank' }]);
  });

  it('uploads Customer evidence as multipart data', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/return-refunds/evidence');
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof FormData);
        return { ok: true, json: async () => ({ success: true, data: { items: [{ url: '/api/return-refunds/evidence/proof.jpg' }] } }) };
      },
    });
    const result = await service.uploadEvidence([new Blob(['proof'], { type: 'image/jpeg' })]);
    assert.equal(result.items.length, 1);
  });

  it('loads evidence through the authenticated API instead of a public upload URL', async () => {
    const expectedBlob = new Blob(['proof'], { type: 'image/jpeg' });
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        assert.equal(url, 'http://api.test/api/return-refunds/evidence/11111111-1111-4111-8111-111111111111.jpg');
        assert.equal(options.method, 'GET');
        return { ok: true, blob: async () => expectedBlob };
      },
    });
    const result = await service.fetchEvidence('/uploads/return-evidence/11111111-1111-4111-8111-111111111111.jpg');
    assert.equal(result, expectedBlob);
  });

  it('loads proactive Warehouse COD recovery work separately from customer requests', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/warehouse/cod-recoveries');
        return { ok: true, json: async () => ({ success: true, data: { items: [] } }) };
      },
    });
    await service.listCodRecoveryCandidates();
  });

  it('loads one proactive COD recovery candidate', async () => {
    const service = createReturnRefundService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url) => {
        assert.equal(url, 'http://api.test/api/warehouse/cod-recoveries/order-1');
        return { ok: true, json: async () => ({ success: true, data: { id: 'order-1' } }) };
      },
    });
    const result = await service.getCodRecoveryCandidate('order-1');
    assert.equal(result.id, 'order-1');
  });
});
