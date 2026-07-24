import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createReviewService } from '../services/reviewService.js';
import { createSupportService } from '../services/supportService.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function clientSource(relativePath) {
  const filename = path.join(dirname, '..', relativePath);
  if (!existsSync(filename)) return '';
  return readFileSync(filename, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function assertImportedAndMounted(parent, component, importPath, requiredProp) {
  assert.match(
    parent,
    new RegExp(`import\\s+${component}\\s+from\\s+['"]${importPath.replaceAll('/', '\\/')}['"]`),
  );
  assert.match(
    parent,
    new RegExp(`<${component}\\b[^>]*\\b${requiredProp}=`),
  );
}

function assertBoundHandler(source, serviceName, methodName, event = 'onClick|onSubmit') {
  const functionPattern = new RegExp(
    `async\\s+function\\s+(\\w+)\\s*\\([^)]*\\)\\s*\\{[\\s\\S]{0,1800}?`
      + `${serviceName}\\.${methodName}\\s*\\(`,
  );
  const arrowPattern = new RegExp(
    `(?:const|let)\\s+(\\w+)\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{`
      + `[\\s\\S]{0,1800}?${serviceName}\\.${methodName}\\s*\\(`,
  );
  const match = source.match(functionPattern) || source.match(arrowPattern);
  assert.ok(match, `expected a handler that invokes ${serviceName}.${methodName}()`);
  assert.match(source, new RegExp(`(?:${event})=\\{${match[1]}\\}`));
  return match[1];
}

function createRequestCapture(factory) {
  const requests = [];
  const service = factory({
    baseUrl: 'http://api.test/api',
    fetcher: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'result-1',
            version: 1,
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
            averageRating: 0,
          },
        }),
      };
    },
  });
  return { service, requests };
}

async function assertCommandRequest({
  factory,
  method,
  args,
  expectedUrl,
  expectedMethod,
  expectedKey,
  expectedBody,
}) {
  const { service, requests } = createRequestCapture(factory);
  assert.equal(typeof service[method], 'function', `client service must expose ${method}()`);
  await service[method](...args);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `http://api.test/api${expectedUrl}`);
  assert.equal(requests[0].options.method, expectedMethod);
  assert.equal(requests[0].options.headers['Idempotency-Key'], expectedKey);
  assert.deepEqual(JSON.parse(requests[0].options.body), expectedBody);
}

describe('SL-008 Review UI integration contract', () => {
  it('AT-150 imports and mounts ProductReviewPanel with an eligible selector and no raw identifier input', () => {
    const detail = clientSource('pages/public/ProductDetailPage.jsx');
    const panel = clientSource('components/review/ProductReviewPanel.jsx');

    assertImportedAndMounted(
      detail,
      'ProductReviewPanel',
      '../../components/review/ProductReviewPanel.jsx',
      'productId',
    );
    assert.match(panel, /eligible(?:Order)?Details|reviewEligibility/);
    assert.match(panel, /<select\b[^>]*(?:orderDetail|eligibility)/i);
    assert.doesNotMatch(
      panel,
      /<input\b[^>]*(?:name|id)=["'][^"']*(?:orderId|orderDetailId|ObjectId)/i,
    );
    assertBoundHandler(panel, 'reviewService', 'createReview', 'onSubmit');
  });

  it('AT-154 binds integer rating controls and optional normalized text to a live 0/1000 counter', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');

    assert.match(panel, /\[1,\s*2,\s*3,\s*4,\s*5\]|min=["']1["'][^>]*max=["']5["']/);
    assert.match(panel, /maxLength=\{?1000\}?/);
    assert.match(panel, /\{[^}]*content\.length[^}]*\}\s*\/\s*1000/);
    assert.doesNotMatch(panel, /<textarea\b[^>]*required/);
  });

  it('AT-156 renders only the public-safe masked/verified Review projection', () => {
    const list = clientSource('components/review/PublicReviewList.jsx');

    assert.match(list, /displayName/);
    assert.match(list, /verifiedPurchase/);
    assert.match(list, /rating/);
    assert.match(list, /content/);
    assert.match(list, /createdAt/);
    assert.match(list, /updatedAt/);
    assert.doesNotMatch(
      list,
      /customerId|orderId|orderDetailId|email|phone|moderationReason|staffId/,
    );
  });

  it('AT-157 binds Customer withdraw/republish separately from Staff moderation', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');

    assertBoundHandler(panel, 'reviewService', 'setPublication');
    assert.match(panel, /Published/);
    assert.match(panel, /Withdrawn/);
    assertBoundHandler(moderation, 'reviewService', 'moderate', 'onSubmit');
    assert.match(moderation, /Allowed/);
    assert.match(moderation, /HiddenByStaff/);
    assert.match(moderation, /reason/);
  });

  it('AT-158 binds Customer edit, exposes no delete, and gives Staff no content-edit handler', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');

    assertBoundHandler(panel, 'reviewService', 'updateReview', 'onSubmit');
    assert.doesNotMatch(panel, /deleteReview|removeReview/);
    assert.doesNotMatch(moderation, /updateReview|deleteReview|setPublication/);
  });

  it('AT-159 renders server aggregate/paging and sends public Review page parameters', async () => {
    const list = clientSource('components/review/PublicReviewList.jsx');
    assert.match(list, /averageRating/);
    assert.match(list, /totalPages/);
    assert.match(list, /pageSize/);
    assert.match(list, /toFixed\(1\)/);

    const { service, requests } = createRequestCapture(createReviewService);
    assert.equal(typeof service.listPublic, 'function');
    await service.listPublic('product-1', { page: 2, pageSize: 20 });
    assert.equal(
      requests[0].url,
      'http://api.test/api/products/product-1/reviews?page=2&pageSize=20',
    );
  });
});

describe('SL-008 Review client command HTTP contract', () => {
  it('AT-160 sends createReview Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'createReview',
      args: [
        'product-1',
        {
          orderDetailId: 'eligible-1',
          rating: 5,
          content: '',
          expectedVersion: 0,
        },
        { idempotencyKey: 'review-create-0001' },
      ],
      expectedUrl: '/products/product-1/reviews',
      expectedMethod: 'POST',
      expectedKey: 'review-create-0001',
      expectedBody: {
        orderDetailId: 'eligible-1',
        rating: 5,
        content: '',
        expectedVersion: 0,
      },
    });
  });

  it('AT-160 sends updateReview Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'updateReview',
      args: [
        'review-1',
        { rating: 4, content: 'Edited', expectedVersion: 1 },
        { idempotencyKey: 'review-update-0001' },
      ],
      expectedUrl: '/reviews/review-1',
      expectedMethod: 'PATCH',
      expectedKey: 'review-update-0001',
      expectedBody: { rating: 4, content: 'Edited', expectedVersion: 1 },
    });
  });

  it('AT-160 sends setPublication Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'setPublication',
      args: [
        'review-1',
        { publicationStatus: 'Withdrawn', expectedVersion: 2 },
        { idempotencyKey: 'review-publication-0001' },
      ],
      expectedUrl: '/reviews/review-1/publication',
      expectedMethod: 'PATCH',
      expectedKey: 'review-publication-0001',
      expectedBody: { publicationStatus: 'Withdrawn', expectedVersion: 2 },
    });
  });

  it('AT-160 sends moderate Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'moderate',
      args: [
        'review-1',
        {
          moderationStatus: 'HiddenByStaff',
          reason: 'Contains prohibited promotional content',
          expectedVersion: 3,
        },
        { idempotencyKey: 'review-moderate-0001' },
      ],
      expectedUrl: '/staff/reviews/review-1/moderation',
      expectedMethod: 'PATCH',
      expectedKey: 'review-moderate-0001',
      expectedBody: {
        moderationStatus: 'HiddenByStaff',
        reason: 'Contains prohibited promotional content',
        expectedVersion: 3,
      },
    });
  });
});

describe('SL-008 Customer Support UI integration contract', () => {
  it('AT-161 binds all seven Support types to type-dependent authorized selectors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    for (const type of [
      'Order',
      'Payment',
      'ReturnRefund',
      'Exchange',
      'Product',
      'Account',
      'Other',
    ]) {
      assert.match(page, new RegExp(`['"]${type}['"]`));
    }
    assert.match(page, /type.*(?:orderOptions|ownedOrders)|(?:orderOptions|ownedOrders).*type/s);
    assert.match(page, /type.*(?:productOptions|activeProducts)|(?:productOptions|activeProducts).*type/s);
    assert.doesNotMatch(
      page,
      /<input\b[^>]*(?:name|id)=["'][^"']*(?:orderId|productId|ObjectId)/i,
    );
  });

  it('AT-162/163/164 shows field errors for denied references and does not render foreign identifiers', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(page, /fieldErrors/);
    assert.match(page, /orderId|order/);
    assert.match(page, /productId|product/);
    assert.doesNotMatch(page, /customerId|ObjectId|email|phone/);
  });

  it('AT-165 renders immutable paged messages and binds appendMessage', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(page, /messages/);
    assert.match(page, /totalPages/);
    assert.match(page, /pageSize/);
    assert.doesNotMatch(page, /editMessage|deleteMessage|removeMessage/);
    assertBoundHandler(page, 'supportService', 'appendMessage', 'onSubmit');
  });

  it('AT-166 conditionally lets the owner message only New/InProgress tickets', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(
      page,
      /(?:\[['"]New['"],\s*['"]InProgress['"]\]\.includes\([^)]*status\)|(?:ticket|request)\.status\s*===\s*['"]New['"][\s\S]{0,300}(?:ticket|request)\.status\s*===\s*['"]InProgress['"])/,
    );
    assertBoundHandler(page, 'supportService', 'appendMessage', 'onSubmit');
  });

  it('AT-171 binds create, New-only unassigned withdraw, and final-response display', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assertBoundHandler(page, 'supportService', 'createRequest', 'onSubmit');
    assertBoundHandler(page, 'supportService', 'withdraw');
    assert.match(
      page,
      /status\s*===\s*['"]New['"][\s\S]{0,300}(?:(?:assigneeId|assignedTo)\s*===?\s*(?:null|undefined)|!(?:ticket|request)\.(?:assigneeId|assignedTo))/,
    );
    assert.match(page, /finalMessage|resolutionMessage/);
  });

  it('AT-172 binds reopen/message to the server deadline and disables it after expiry', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assertBoundHandler(page, 'supportService', 'reopen', 'onSubmit|onClick');
    assert.match(page, /reopenDeadline/);
    assert.match(page, /disabled=\{[^}]*(?:reopen|deadline|expired)/i);
  });
});

describe('SL-008 Staff Support UI integration contract', () => {
  it('AT-167 binds the queue claim action to supportService.claim', () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');

    assertBoundHandler(queue, 'supportService', 'claim');
    assert.match(queue, /status\s*===\s*['"]New['"]|recoveryClaim/);
  });

  it('AT-168 conditionally mounts assignee-only messaging/priority/transfer/resolve controls', () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    assert.match(detail, /isCurrentAssignee|currentAssignee/);
    for (const method of ['appendMessage', 'changePriority', 'transfer', 'resolve']) {
      const handler = assertBoundHandler(detail, 'supportService', method, 'onClick|onSubmit');
      assert.match(
        detail,
        new RegExp(
          `\\{(?:isCurrentAssignee|currentAssignee)\\s*&&\\s*\\(`
            + `[\\s\\S]{0,6000}(?:onClick|onSubmit)=\\{${handler}\\}`,
        ),
      );
    }
  });

  it('AT-169 binds priority/transfer reasons and limits targets to Active Staff', () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    assertBoundHandler(detail, 'supportService', 'changePriority', 'onSubmit');
    assertBoundHandler(detail, 'supportService', 'transfer', 'onSubmit');
    assert.match(detail, /Low/);
    assert.match(detail, /Normal/);
    assert.match(detail, /High/);
    assert.match(detail, /Urgent/);
    assert.match(detail, /reason/);
    assert.match(detail, /activeStaff|status\s*===\s*['"]Active['"]/);
  });

  it('AT-170 renders disabled-assignee recovery and a reclaim action without losing priority/history', () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    assert.match(queue, /recovery|assigneeCleared|unassignedInProgress/i);
    assertBoundHandler(queue, 'supportService', 'claim');
    assert.match(detail, /priority/);
    assert.match(detail, /assignmentHistory|messages/);
  });

  it('AT-171 binds the final response to resolve and removes generic status mutation', () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    assertBoundHandler(detail, 'supportService', 'resolve', 'onSubmit');
    assert.match(detail, /finalMessage/);
    assert.match(detail, /maxLength=\{?2000\}?/);
    assert.doesNotMatch(detail, /respondToRequest|setStatus|updateStatus/);
  });

  it('AT-173 sends type/date/status/priority/assignee paging filters and displays field errors', async () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');

    for (const filter of [
      'type',
      'dateFrom',
      'dateTo',
      'status',
      'priority',
      'assigneeId',
      'page',
      'pageSize',
    ]) {
      assert.match(queue, new RegExp(filter));
    }
    assert.match(queue, /fieldErrors/);

    const { service, requests } = createRequestCapture(createSupportService);
    assert.equal(typeof service.listOperational, 'function');
    await service.listOperational({
      type: 'Order',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      status: 'New',
      priority: 'Normal',
      assigneeId: 'unassigned',
      page: 1,
      pageSize: 20,
    });
    assert.equal(
      requests[0].url,
      'http://api.test/api/staff/support-requests'
        + '?type=Order&dateFrom=2026-07-01&dateTo=2026-07-31'
        + '&status=New&priority=Normal&assigneeId=unassigned&page=1&pageSize=20',
    );
  });
});

describe('SL-008 Support client command HTTP contract', () => {
  it('AT-174 sends createRequest Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      type: 'Other',
      subject: 'Need account help',
      initialMessage: 'Please help with account access.',
      expectedVersion: 0,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'createRequest',
      args: [body, { idempotencyKey: 'support-create-0001' }],
      expectedUrl: '/support-requests',
      expectedMethod: 'POST',
      expectedKey: 'support-create-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends claim Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'claim',
      args: [
        'ticket-1',
        { expectedVersion: 1 },
        { idempotencyKey: 'support-claim-0001' },
      ],
      expectedUrl: '/staff/support-requests/ticket-1/claim',
      expectedMethod: 'POST',
      expectedKey: 'support-claim-0001',
      expectedBody: { expectedVersion: 1 },
    });
  });

  it('AT-174 sends Customer appendMessage Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'appendMessage',
      args: [
        'ticket-1',
        { message: 'A customer follow-up.', expectedVersion: 2 },
        { idempotencyKey: 'support-message-customer-0001', scope: 'customer' },
      ],
      expectedUrl: '/support-requests/ticket-1/messages',
      expectedMethod: 'POST',
      expectedKey: 'support-message-customer-0001',
      expectedBody: { message: 'A customer follow-up.', expectedVersion: 2 },
    });
  });

  it('AT-174 sends Staff appendMessage Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'appendMessage',
      args: [
        'ticket-1',
        { message: 'A Staff follow-up.', expectedVersion: 3 },
        { idempotencyKey: 'support-message-staff-0001', scope: 'staff' },
      ],
      expectedUrl: '/staff/support-requests/ticket-1/messages',
      expectedMethod: 'POST',
      expectedKey: 'support-message-staff-0001',
      expectedBody: { message: 'A Staff follow-up.', expectedVersion: 3 },
    });
  });

  it('AT-174 sends changePriority Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      priority: 'High',
      reason: 'Customer impact requires faster handling',
      expectedVersion: 4,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'changePriority',
      args: ['ticket-1', body, { idempotencyKey: 'support-priority-0001' }],
      expectedUrl: '/staff/support-requests/ticket-1/priority',
      expectedMethod: 'PATCH',
      expectedKey: 'support-priority-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends transfer Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      assigneeId: 'staff-b',
      reason: 'Specialist ownership transfer',
      expectedVersion: 5,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'transfer',
      args: ['ticket-1', body, { idempotencyKey: 'support-transfer-0001' }],
      expectedUrl: '/staff/support-requests/ticket-1/transfer',
      expectedMethod: 'PATCH',
      expectedKey: 'support-transfer-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends withdraw Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'withdraw',
      args: [
        'ticket-1',
        { expectedVersion: 1 },
        { idempotencyKey: 'support-withdraw-0001' },
      ],
      expectedUrl: '/support-requests/ticket-1/withdraw',
      expectedMethod: 'PATCH',
      expectedKey: 'support-withdraw-0001',
      expectedBody: { expectedVersion: 1 },
    });
  });

  it('AT-174 sends resolve Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      finalMessage: 'The issue is resolved with a replacement.',
      expectedVersion: 6,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'resolve',
      args: ['ticket-1', body, { idempotencyKey: 'support-resolve-0001' }],
      expectedUrl: '/staff/support-requests/ticket-1/resolve',
      expectedMethod: 'POST',
      expectedKey: 'support-resolve-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends reopen Idempotency-Key and JSON expectedVersion', async () => {
    const body = { message: 'The same issue returned.', expectedVersion: 7 };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'reopen',
      args: ['ticket-1', body, { idempotencyKey: 'support-reopen-0001' }],
      expectedUrl: '/support-requests/ticket-1/reopen',
      expectedMethod: 'POST',
      expectedKey: 'support-reopen-0001',
      expectedBody: body,
    });
  });
});

describe('SL-008 direct-navigation RBAC and privacy contract', () => {
  it('AT-173 guards Customer and Staff routes and gives Admin/Warehouse no SL-008 route', () => {
    const app = clientSource('App.jsx');

    assert.match(
      app,
      /path="support"[\s\S]{0,400}allowedRoles=\{\[['"]Customer['"]\]\}/,
    );
    assert.match(
      app,
      /path="staff\/support-requests"[\s\S]{0,400}allowedRoles=\{\[['"]Staff['"]\]\}/,
    );
    assert.match(
      app,
      /path="staff\/reviews"[\s\S]{0,400}allowedRoles=\{\[['"]Staff['"]\]\}/,
    );
    assert.doesNotMatch(app, /path="admin\/(?:reviews|support(?:-requests)?)"/);
    assert.doesNotMatch(app, /path="warehouse\/(?:reviews|support(?:-requests)?)"/);
  });

  it('AT-173 keeps Support UI projections free of raw IDs/contact data and renders invalid-filter errors', () => {
    const customer = clientSource('pages/customer/SupportPage.jsx');
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');
    const rendered = `${customer}\n${queue}\n${detail}`;

    assert.doesNotMatch(
      rendered,
      /\{[^}]*\.(?:customerId|orderId|productId|email|phone|ObjectId)[^}]*\}/,
    );
    assert.match(queue, /fieldErrors/);
    assert.match(queue, /SUPPORT_FILTER_INVALID|invalid.*filter/i);
  });
});
