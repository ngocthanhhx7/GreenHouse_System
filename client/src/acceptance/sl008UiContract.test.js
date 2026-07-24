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

function closingBrace(source, openingBrace) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function asyncHandlerBodies(source) {
  const declaration = /async\s+function\s+(\w+)\s*\([^)]*\)\s*\{|(?:const|let)\s+(\w+)\s*=\s*async\s*(?:\([^)]*\)|\w+)\s*=>\s*\{/g;
  const handlers = [];
  for (const match of source.matchAll(declaration)) {
    const openingBrace = match.index + match[0].lastIndexOf('{');
    const end = closingBrace(source, openingBrace);
    assert.notEqual(end, -1, `unbalanced handler ${match[1] || match[2]}`);
    handlers.push({
      name: match[1] || match[2],
      body: source.slice(openingBrace + 1, end),
      start: match.index,
      end,
    });
  }
  return handlers;
}

function boundHandler(source, serviceName, methodName, bodyPattern) {
  const serviceCall = new RegExp(`${serviceName}\\.${methodName}\\s*\\(`);
  const match = asyncHandlerBodies(source).find(
    (handler) => serviceCall.test(handler.body)
      && (!bodyPattern || bodyPattern.test(handler.body)),
  );
  assert.ok(
    match,
    `expected one bounded async handler invoking ${serviceName}.${methodName}()`
      + (bodyPattern ? ' with the required payload' : ''),
  );
  return match;
}

function assertBoundHandler(
  source,
  serviceName,
  methodName,
  event = 'onClick|onSubmit',
  bodyPattern,
) {
  const handler = boundHandler(source, serviceName, methodName, bodyPattern);
  assert.match(source, new RegExp(`(?:${event})\\s*=\\s*\\{${handler.name}\\}`));
  return handler.name;
}

function assertGuardedHandler(source, handlerName, guardPattern, distance = 2400) {
  const event = new RegExp(`(?:onClick|onSubmit)\\s*=\\s*\\{${handlerName}\\}`).exec(source);
  assert.ok(event, `expected a rendered control bound to ${handlerName}`);
  const nearbyControl = source.slice(Math.max(0, event.index - distance), event.index + event[0].length);
  assert.match(nearbyControl, guardPattern);
}

function renderedMap(source, collectionName, distance = 2400) {
  const candidates = Array.isArray(collectionName) ? collectionName : [collectionName];
  const mapCall = candidates
    .map((candidate) => ({
      candidate,
      match: new RegExp(`${candidate}\\.map\\s*\\(`).exec(source),
    }))
    .find((candidate) => candidate.match);
  assert.ok(mapCall, `expected ${candidates.join(' or ')}.map() in rendered JSX`);
  return source.slice(mapCall.match.index, mapCall.match.index + distance);
}

function fieldElement(source, fieldName) {
  const element = new RegExp(
    `<(?:input|textarea|select)\\b(?=[^>]*(?:name|id)=["']${fieldName}["'])[^>]*>`,
  ).exec(source);
  assert.ok(element, `expected rendered ${fieldName} control`);
  return element[0];
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
    assert.match(panel, /reviewService\.(?:listEligibility|listEligibleOrderDetails)\s*\(/);
    assert.match(
      panel,
      /<select\b[^>]*(?:name|id)=["']orderDetailId["'][\s\S]{0,1200}(?:eligibleOrderDetails|reviewEligibility)\.map\s*\(/i,
    );
    assert.doesNotMatch(
      panel,
      /<input\b[^>]*(?:name|id)=["'][^"']*(?:orderId|orderDetailId|ObjectId)/i,
    );
    assertBoundHandler(
      panel,
      'reviewService',
      'createReview',
      'onSubmit',
      /orderDetailId[\s\S]{0,500}rating[\s\S]{0,500}content[\s\S]{0,500}expectedVersion/,
    );
  });

  it('AT-154 binds integer rating controls and optional normalized text to a live 0/1000 counter', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');

    assert.match(panel, /\[1,\s*2,\s*3,\s*4,\s*5\]|min=["']1["'][^>]*max=["']5["']/);
    assert.match(panel, /maxLength=\{?1000\}?/);
    assert.match(
      panel,
      /<textarea\b[^>]*(?:name|id)=["']content["'][^>]*maxLength=\{?1000\}?[\s\S]{0,500}\{[^}]*content\.length[^}]*\}\s*\/\s*1000/,
    );
    assert.doesNotMatch(panel, /<textarea\b[^>]*required/);
  });

  it('AT-156 renders only the public-safe masked/verified Review projection', () => {
    const list = clientSource('components/review/PublicReviewList.jsx');
    const itemRender = renderedMap(list, 'reviews');

    for (const field of [
      'displayName',
      'verifiedPurchase',
      'rating',
      'content',
      'createdAt',
      'updatedAt',
    ]) {
      assert.match(itemRender, new RegExp(`review\\.${field}\\b`));
    }
    assert.doesNotMatch(
      list,
      /customerId|orderId|orderDetailId|email|phone|moderationReason|staffId/,
    );
  });

  it('AT-157 binds Customer withdraw/republish separately from Staff moderation', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');

    const withdraw = assertBoundHandler(
      panel,
      'reviewService',
      'setPublication',
      'onClick|onSubmit',
      /publicationStatus\s*:\s*['"]Withdrawn['"][\s\S]{0,500}expectedVersion/,
    );
    const republish = assertBoundHandler(
      panel,
      'reviewService',
      'setPublication',
      'onClick|onSubmit',
      /publicationStatus\s*:\s*['"]Published['"][\s\S]{0,500}expectedVersion/,
    );
    assert.notEqual(withdraw, republish);
    const moderationHandler = assertBoundHandler(
      moderation,
      'reviewService',
      'moderate',
      'onSubmit',
      /moderationStatus[\s\S]{0,500}reason[\s\S]{0,500}expectedVersion/,
    );
    assertGuardedHandler(
      moderation,
      moderationHandler,
      /moderationStatus|HiddenByStaff|Allowed/,
    );
  });

  it('AT-158 binds Customer edit, exposes no delete, and gives Staff no content-edit handler', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');

    assertBoundHandler(
      panel,
      'reviewService',
      'updateReview',
      'onSubmit',
      /rating[\s\S]{0,500}content[\s\S]{0,500}expectedVersion/,
    );
    assert.doesNotMatch(panel, /deleteReview|removeReview/);
    assert.doesNotMatch(moderation, /updateReview|deleteReview|setPublication/);
  });

  it('AT-159 renders server aggregate/paging and sends public Review page parameters', async () => {
    const list = clientSource('components/review/PublicReviewList.jsx');
    assert.match(list, /averageRating\.toFixed\(1\)/);
    assert.match(
      list,
      /(?:page|currentPage)[\s\S]{0,1200}totalPages[\s\S]{0,1200}(?:onClick|onChange)/,
    );
    assert.match(list, /pageSize/);

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

    assert.match(
      page,
      /(?:SUPPORT_TYPES|supportTypes)\s*=\s*\[[^\]]*['"]Order['"][^\]]*['"]Payment['"][^\]]*['"]ReturnRefund['"][^\]]*['"]Exchange['"][^\]]*['"]Product['"][^\]]*['"]Account['"][^\]]*['"]Other['"][^\]]*\]/,
    );
    assert.match(
      page,
      /<select\b[^>]*(?:name|id)=["']type["'][\s\S]{0,1000}(?:SUPPORT_TYPES|supportTypes)\.map\s*\(/,
    );
    assert.match(page, /supportService\.(?:listEligibleOrders|listOwnedOrders)\s*\(/);
    assert.match(page, /supportService\.(?:listActiveProducts|listProductsForSupport)\s*\(/);
    assert.match(
      page,
      /<select\b[^>]*(?:name|id)=["']orderId["'][\s\S]{0,1200}(?:eligibleOrders|ownedOrders|orderOptions)\.map\s*\(/,
    );
    assert.match(
      page,
      /<select\b[^>]*(?:name|id)=["']productId["'][\s\S]{0,1200}(?:activeProducts|productOptions)\.map\s*\(/,
    );
    assert.match(
      page,
      /(?:requiresOrder|ORDER_REQUIRED_TYPES\.includes\([^)]*type\))[\s\S]{0,1600}<select\b[^>]*(?:name|id)=["']orderId["'][^>]*required/,
    );
    assert.match(
      page,
      /(?:requiresProduct|(?:form|draft)\.type\s*===\s*['"]Product['"])[\s\S]{0,1600}<select\b[^>]*(?:name|id)=["']productId["'][^>]*required/,
    );
    assert.doesNotMatch(
      page,
      /<input\b[^>]*(?:name|id)=["'][^"']*(?:orderId|productId|ObjectId)/i,
    );
    const create = boundHandler(page, 'supportService', 'createRequest');
    assert.match(page, new RegExp(`onSubmit\\s*=\\s*\\{${create.name}\\}`));
    for (const field of [
      'type',
      'subject',
      'initialMessage',
      'orderId',
      'productId',
      'expectedVersion',
    ]) {
      assert.match(create.body, new RegExp(`\\b${field}\\b`));
    }
    assert.match(
      page,
      /(?:name|id)=["']subject["'][^>]*maxLength=\{?120\}?[\s\S]{0,500}\{[^}]*subject\.length[^}]*\}\s*\/\s*120/,
    );
    assert.match(
      page,
      /(?:name|id)=["']initialMessage["'][^>]*maxLength=\{?2000\}?[\s\S]{0,500}\{[^}]*initialMessage\.length[^}]*\}\s*\/\s*2000/,
    );
    assert.match(page, /privacy|do not include|sensitive|personal information/i);
    assert.doesNotMatch(
      page,
      /(?:name|id)=["'][^"']*(?:priority|attachment)[^"']*["']|<input\b[^>]*type=["']file["']/i,
    );
  });

  it('AT-162 requires an authorized Order selector and renders private Order field errors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(page, /fieldErrors\.orderId|fieldErrors\[['"]orderId['"]\]/);
    assert.match(
      page,
      /(?:Order|Payment|ReturnRefund|Exchange)[\s\S]{0,1800}(?:requiresOrder|ORDER_REQUIRED_TYPES)/,
    );
    assert.doesNotMatch(page, /customerId|ObjectId|email|phone/);
  });

  it('AT-163 requires an Active Product selector and renders private Product field errors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(page, /fieldErrors\.productId|fieldErrors\[['"]productId['"]\]/);
    assert.match(
      page,
      /(?:requiresProduct|(?:form|draft)\.type\s*===\s*['"]Product['"])[\s\S]{0,1800}(?:activeProducts|productOptions)/,
    );
    assert.match(page, /productId[\s\S]{0,1200}orderId|orderId[\s\S]{0,1200}productId/);
    assert.doesNotMatch(page, /customerId|ObjectId|email|phone/);
  });

  it('AT-164 keeps Account/Other Order/Product refs optional while using the same authorized selectors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(
      page,
      /(?:OPTIONAL_REFERENCE_TYPES|optionalReferenceTypes)\s*=\s*\[[^\]]*['"]Account['"][^\]]*['"]Other['"][^\]]*\]/,
    );
    assert.match(
      page,
      /(?:allowsOrder|OPTIONAL_REFERENCE_TYPES[\s\S]{0,200}\.includes\([^)]*type\))[\s\S]{0,1600}(?:name|id)=["']orderId["']/,
    );
    assert.match(
      page,
      /(?:allowsProduct|OPTIONAL_REFERENCE_TYPES[\s\S]{0,200}\.includes\([^)]*type\))[\s\S]{0,1600}(?:name|id)=["']productId["']/,
    );
    assert.doesNotMatch(
      page,
      /(?:Account|Other)[\s\S]{0,500}(?:name|id)=["'](?:orderId|productId)["'][^>]*required/,
    );
  });

  it('AT-165 renders immutable paged messages and binds appendMessage', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');
    const timeline = renderedMap(page, 'messages');

    assert.match(timeline, /message\.content/);
    assert.match(timeline, /message\.(?:actorRole|role)/);
    assert.match(timeline, /message\.createdAt/);
    assert.match(
      page,
      /(?:messagePage|page)[\s\S]{0,1200}messages?\.totalPages[\s\S]{0,1200}(?:onClick|onChange)/,
    );
    assert.match(page, /messagePageSize|messages?\.pageSize/);
    assert.doesNotMatch(page, /editMessage|deleteMessage|removeMessage/);
    assertBoundHandler(
      page,
      'supportService',
      'appendMessage',
      'onSubmit',
      /message[\s\S]{0,500}expectedVersion/,
    );
  });

  it('AT-166 conditionally lets the owner message only New/InProgress tickets', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');
    const handler = assertBoundHandler(page, 'supportService', 'appendMessage', 'onSubmit');
    assertGuardedHandler(
      page,
      handler,
      /(?:\[['"]New['"],\s*['"]InProgress['"]\]\.includes\([^)]*status\)|(?:canCustomerMessage|canOwnerMessage))/,
    );
  });

  it('AT-171 binds create, New-only unassigned withdraw, and final-response display', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assertBoundHandler(page, 'supportService', 'createRequest', 'onSubmit');
    const withdrawHandler = assertBoundHandler(page, 'supportService', 'withdraw');
    assertGuardedHandler(
      page,
      withdrawHandler,
      /status\s*===\s*['"]New['"][\s\S]{0,500}(?:(?:assigneeId|assignedTo)\s*===?\s*(?:null|undefined)|!(?:ticket|request)\.(?:assigneeId|assignedTo)|(?:canWithdraw))/,
    );
    const timeline = renderedMap(page, 'messages');
    assert.match(timeline, /finalMessage|resolutionMessage|message\.content/);
  });

  it('AT-172 binds reopen/message to the server deadline and disables it after expiry', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    const reopenHandler = assertBoundHandler(
      page,
      'supportService',
      'reopen',
      'onSubmit|onClick',
      /message[\s\S]{0,500}expectedVersion/,
    );
    assertGuardedHandler(
      page,
      reopenHandler,
      /status\s*===\s*['"]Resolved['"]|canReopen/,
    );
    assert.match(
      page,
      /reopenDeadline[\s\S]{0,1200}disabled=\{[^}]*(?:canReopen|deadline|expired)/i,
    );
  });
});

describe('SL-008 Staff Support UI integration contract', () => {
  it('AT-167 binds the queue claim action to supportService.claim', () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');

    const claim = assertBoundHandler(queue, 'supportService', 'claim');
    assertGuardedHandler(
      queue,
      claim,
      /status\s*===\s*['"]New['"]|(?:status\s*===\s*['"]InProgress['"][\s\S]{0,500}(?:!.*assignee|assigneeId\s*===\s*null))|canClaim/,
    );
  });

  it('AT-168 conditionally mounts assignee-only messaging/priority/transfer/resolve controls', () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    for (const method of ['appendMessage', 'changePriority', 'transfer', 'resolve']) {
      const handler = assertBoundHandler(detail, 'supportService', method, 'onClick|onSubmit');
      assertGuardedHandler(
        detail,
        handler,
        /isCurrentActiveAssignee|canAssigneeOperate/,
        6000,
      );
    }
  });

  it('AT-169 binds priority/transfer reasons and limits targets to Active Staff', () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    const priorityHandler = assertBoundHandler(
      detail,
      'supportService',
      'changePriority',
      'onSubmit',
      /priority[\s\S]{0,500}reason[\s\S]{0,500}expectedVersion/,
    );
    const transferHandler = assertBoundHandler(
      detail,
      'supportService',
      'transfer',
      'onSubmit',
      /assigneeId[\s\S]{0,500}reason[\s\S]{0,500}expectedVersion/,
    );
    assertGuardedHandler(detail, priorityHandler, /isCurrentActiveAssignee|canAssigneeOperate/);
    assertGuardedHandler(detail, transferHandler, /isCurrentActiveAssignee|canAssigneeOperate/);
    assert.match(
      detail,
      /<select\b[^>]*(?:name|id)=["']priority["'][\s\S]{0,1200}['"]Low['"][\s\S]{0,1200}['"]Normal['"][\s\S]{0,1200}['"]High['"][\s\S]{0,1200}['"]Urgent['"]/,
    );
    assert.match(
      detail,
      /<select\b[^>]*(?:name|id)=["']assigneeId["'][\s\S]{0,1200}(?:activeStaff|staffOptions)\.map\s*\(/,
    );
    assert.match(detail, /supportService\.(?:listActiveStaff|listTransferTargets)\s*\(/);
    for (const field of ['priorityReason', 'transferReason']) {
      const reasonInput = fieldElement(detail, field);
      assert.match(reasonInput, /\brequired\b/);
      assert.match(reasonInput, /minLength=\{?5\}?/);
      assert.match(reasonInput, /maxLength=\{?500\}?/);
    }
    const assignmentTimeline = renderedMap(detail, 'assignmentHistory');
    const priorityTimeline = renderedMap(detail, 'priorityHistory');
    assert.match(assignmentTimeline, /reason[\s\S]{0,1000}(?:actor|createdAt)/);
    assert.match(priorityTimeline, /reason[\s\S]{0,1000}(?:actor|createdAt)/);
  });

  it('AT-170 renders disabled-assignee recovery and a reclaim action without losing priority/history', () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    const reclaim = assertBoundHandler(queue, 'supportService', 'claim');
    assertGuardedHandler(
      queue,
      reclaim,
      /status\s*===\s*['"]InProgress['"][\s\S]{0,500}(?:!.*assignee|assigneeId\s*===\s*null)|recoveryClaim/,
    );
    assert.match(queue, /recovery|assigneeCleared|unassignedInProgress/i);
    assert.match(detail, /ticket\.priority|request\.priority/);
    const assignmentTimeline = renderedMap(detail, 'assignmentHistory');
    const messageTimeline = renderedMap(detail, 'messages');
    assert.match(assignmentTimeline, /beforeAssigneeId|afterAssigneeId|reason/);
    assert.match(messageTimeline, /message\.content[\s\S]{0,1000}message\.(?:actorRole|role)/);
  });

  it('AT-171 binds the final response to resolve and removes generic status mutation', () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    const resolve = assertBoundHandler(
      detail,
      'supportService',
      'resolve',
      'onSubmit',
      /finalMessage[\s\S]{0,500}expectedVersion/,
    );
    assertGuardedHandler(detail, resolve, /isCurrentActiveAssignee|canAssigneeOperate/);
    assert.match(
      detail,
      /(?:name|id)=["']finalMessage["'][^>]*maxLength=\{?2000\}?/,
    );
    assert.doesNotMatch(detail, /respondToRequest|setStatus|updateStatus/);
  });

  it('AT-173 sends type/date/status/priority/assignee paging filters and displays field errors', async () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');

    const loadQueue = boundHandler(queue, 'supportService', 'listOperational');
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
      assert.match(loadQueue.body, new RegExp(`\\b${filter}\\b`));
    }
    assert.match(queue, /fieldErrors\.(?:type|dateFrom|dateTo|status|priority|assigneeId)|fieldErrors\[/);

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
    assert.match(
      app,
      /path="staff\/support-requests\/:ticketId"[\s\S]{0,400}allowedRoles=\{\[['"]Staff['"]\]\}/,
    );
    assert.match(
      app,
      /path="support\/:ticketId"[\s\S]{0,400}allowedRoles=\{\[['"]Customer['"]\]\}/,
    );
    assert.doesNotMatch(app, /path="admin\/(?:reviews|support(?:-requests)?)"/);
    assert.doesNotMatch(app, /path="warehouse\/(?:reviews|support(?:-requests)?)"/);
  });

  it('AT-173 ties safe Review/Support projections to protected reads and exact paged HTTP routes', async () => {
    const customer = clientSource('pages/customer/SupportPage.jsx');
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');
    const customerTickets = renderedMap(customer, ['tickets', 'requests']);
    const staffTickets = renderedMap(queue, ['tickets', 'requests']);
    const staffReviews = renderedMap(moderation, ['reviews', 'items']);
    const staffMessages = renderedMap(detail, 'messages');
    const rendered = [
      customerTickets,
      staffTickets,
      staffReviews,
      staffMessages,
    ].join('\n');

    assert.doesNotMatch(
      rendered,
      /\{[^}]*\.(?:customerId|orderId|productId|email|phone|ObjectId)[^}]*\}/,
    );
    assert.match(customerTickets, /ticketCode|subject|type|status/);
    assert.match(staffTickets, /ticketCode|type|status|priority|assignee/);
    assert.match(staffReviews, /rating|content|publicationStatus|moderationStatus/);
    assert.match(staffMessages, /message\.content[\s\S]{0,1000}message\.(?:actorRole|role)/);
    assert.match(queue, /fieldErrors/);
    assert.match(queue, /SUPPORT_FILTER_INVALID|invalid.*filter/i);

    const reviewCapture = createRequestCapture(createReviewService);
    assert.equal(typeof reviewCapture.service.listModeration, 'function');
    await reviewCapture.service.listModeration({
      page: 1,
      pageSize: 20,
      productId: 'product-1',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
    });
    assert.equal(
      reviewCapture.requests[0].url,
      'http://api.test/api/staff/reviews'
        + '?page=1&pageSize=20&productId=product-1'
        + '&publicationStatus=Published&moderationStatus=Allowed',
    );

    const ownCapture = createRequestCapture(createSupportService);
    assert.equal(typeof ownCapture.service.listOwn, 'function');
    await ownCapture.service.listOwn({ page: 2, pageSize: 20 });
    assert.equal(
      ownCapture.requests[0].url,
      'http://api.test/api/support-requests/my?page=2&pageSize=20',
    );

    const detailCapture = createRequestCapture(createSupportService);
    assert.equal(typeof detailCapture.service.getDetail, 'function');
    await detailCapture.service.getDetail(
      'ticket-1',
      { page: 3, pageSize: 20 },
      { scope: 'staff' },
    );
    assert.equal(
      detailCapture.requests[0].url,
      'http://api.test/api/staff/support-requests/ticket-1?page=3&pageSize=20',
    );
  });
});
