const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { createReviewService } = require('../services/review.service');
const { createSupportService } = require('../services/support.service');

const root = path.join(__dirname, '..');
const source = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const hasAll = (object, names) => names.every((name) => typeof object[name] === 'function');

describe('SL-008 Review and Support acceptance contract', () => {
  it('AT-150/151/152/153 gives Review its one durable Customer+Product identity and deterministic delivered OrderDetail selection', () => {
    const review = createReviewService({ repository: {}, auditLogger: { log: async () => {} } });
    const model = source('models/productReview.model.js');

    assert.equal(hasAll(review, ['createReview', 'updateReview', 'setPublication', 'moderate', 'listPublic']), true);
    assert.match(model, /orderDetailId/);
    assert.match(model, /customerId:\s*1,\s*productId:\s*1[\s\S]{0,100}unique:\s*true/);
    assert.match(source('services/review.service.js'), /deliveredAt:\s*-1[\s\S]{0,120}orderDetailId:\s*-1/);
  });

  it('AT-154/155 normalizes optional Review text, validates integer ratings, and keeps publication separate from staff moderation', () => {
    const model = source('models/productReview.model.js');
    const service = source('services/review.service.js');

    assert.match(model, /publicationStatus[\s\S]{0,100}Published[\s\S]{0,100}Withdrawn/);
    assert.match(model, /moderationStatus[\s\S]{0,100}Allowed[\s\S]{0,100}HiddenByStaff/);
    assert.match(service, /0\s*[,<=>]+\s*1000|1000/);
    assert.match(service, /Number\.isInteger\(rating\)[\s\S]{0,100}rating\s*[<>]=?\s*[15]/);
  });

  it('AT-156/157/158 exposes only the authorized public Review projection and stable aggregate pagination', () => {
    const service = source('services/review.service.js');
    const routes = source('routes/review.routes.js');

    assert.match(service, /Published[\s\S]{0,160}Allowed[\s\S]{0,160}Active/);
    assert.match(service, /displayName/);
    assert.match(service, /verified/i);
    assert.doesNotMatch(service, /customerId[\s\S]{0,400}public.*DTO/i);
    assert.match(service, /createdAt:\s*-1[\s\S]{0,100}_id:\s*-1/);
    assert.match(service, /averageRating[\s\S]{0,120}toFixed\(1\)|oneDecimalMean/);
    assert.match(routes, /pageSize/);
  });

  it('AT-159/160 makes Review content/state histories and Review commands atomic, replay-safe, versioned, audited, and outboxed', () => {
    const service = source('services/review.service.js');
    const controller = source('controller/review.controller.js');

    assert.match(service, /Review(Content|State|Publication|Moderation)History/);
    assert.match(service, /Idempotency-Key|idempotencyKey/);
    assert.match(service, /expectedVersion/);
    assert.match(service, /DomainOutbox/);
    assert.match(service, /REVIEW_CREATED[\s\S]{0,240}REVIEW_UPDATED[\s\S]{0,240}REVIEW_PUBLICATION_CHANGED[\s\S]{0,240}REVIEW_MODERATION_CHANGED/);
    assert.match(controller, /req\.get\('Idempotency-Key'\)/);
  });

  it('AT-161/162/163/164 enforces the Support type/reference matrix without leaking foreign identities', () => {
    const support = createSupportService({ repository: {}, auditLogger: { log: async () => {} }, transactionManager: { withTransaction: (work) => work(null) } });
    const model = source('models/supportRequest.model.js');
    const service = source('services/support.service.js');

    assert.equal(hasAll(support, ['createRequest', 'claim', 'appendMessage', 'changePriority', 'transfer', 'withdraw', 'resolve', 'reopen']), true);
    assert.match(model, /\['Order',\s*'Payment',\s*'ReturnRefund',\s*'Exchange',\s*'Product',\s*'Account',\s*'Other'\]/);
    assert.match(model, /ticketCode[\s\S]{0,120}unique:\s*true/);
    assert.match(service, /subject[\s\S]{0,80}5[\s\S]{0,80}120/);
    assert.match(service, /initialMessage|message[\s\S]{0,100}10[\s\S]{0,100}2000/);
    assert.match(service, /OrderDetail/);
    assert.match(service, /Product[\s\S]{0,160}Active/);
  });

  it('AT-165/166 preserves append-only Support messages and atomically chooses the first Staff claim', () => {
    const service = source('services/support.service.js');
    const model = source('models/supportRequest.model.js');

    assert.match(model, /SupportMessage/);
    assert.match(service, /appendMessage/);
    assert.match(service, /New[\s\S]{0,160}InProgress/);
    assert.match(service, /findOneAndUpdate[\s\S]{0,200}assignedTo|assigneeId/);
    assert.doesNotMatch(service, /findByIdAndUpdate\([^\n]+response/);
  });

  it('AT-167/168/169/170 allows only the current Active assignee to operate Support, with immutable priority and transfer history', () => {
    const service = source('services/support.service.js');

    assert.match(service, /Active[\s\S]{0,200}assignee/);
    assert.match(service, /Low[\s\S]{0,100}Normal[\s\S]{0,100}High[\s\S]{0,100}Urgent/);
    assert.match(service, /priorityReason[\s\S]{0,100}5[\s\S]{0,100}500/);
    assert.match(service, /transferReason[\s\S]{0,100}5[\s\S]{0,100}500/);
    assert.match(service, /Support(Assignment|Priority|Resolution)History/);
    assert.match(service, /ASSIGNEE_CLEARED/);
  });

  it('AT-171/172 permits only approved Support transitions, final resolution, disabled-assignee recovery, and the exact 72-hour reopen boundary', () => {
    const service = source('services/support.service.js');

    assert.match(service, /withdraw[\s\S]{0,180}New[\s\S]{0,180}unassigned/);
    assert.match(service, /resolve[\s\S]{0,240}appendMessage/);
    assert.match(service, /resolvedAt[\s\S]{0,160}72\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.match(service, /InProgress[\s\S]{0,160}(disable|Disabled)[\s\S]{0,160}(clear|null)/i);
    assert.match(service, /SUPPORT_CREATED[\s\S]{0,180}SUPPORT_CLAIMED[\s\S]{0,180}SUPPORT_MESSAGE_APPENDED[\s\S]{0,180}SUPPORT_PRIORITY_CHANGED[\s\S]{0,180}SUPPORT_TRANSFERRED[\s\S]{0,180}SUPPORT_WITHDRAWN[\s\S]{0,180}SUPPORT_RESOLVED[\s\S]{0,180}SUPPORT_REOPENED/);
  });

  it('AT-173/174 enforces SL-008 RBAC, bounded paging, idempotency/version commands, atomic audit/outbox, and foreign-domain isolation', () => {
    const reviewRoutes = source('routes/review.routes.js');
    const supportRoutes = source('routes/support.routes.js');
    const reviewController = source('controller/review.controller.js');
    const supportController = source('controller/support.controller.js');
    const supportService = source('services/support.service.js');

    assert.match(reviewRoutes, /authorizeRoles\('Customer'\)/);
    assert.match(reviewRoutes, /authorizeRoles\('Staff'\)/);
    assert.match(supportRoutes, /authorizeRoles\('Customer'\)/);
    assert.match(supportRoutes, /authorizeRoles\('Staff'\)/);
    assert.doesNotMatch(`${reviewRoutes}\n${supportRoutes}`, /authorizeRoles\('Admin'|'WarehouseManager'/);
    assert.match(`${reviewController}\n${supportController}`, /Idempotency-Key/);
    assert.match(`${reviewController}\n${supportController}`, /expectedVersion/);
    assert.match(supportService, /DomainOutbox/);
    assert.doesNotMatch(supportService, /\b(Order|Payment|Return|Exchange|Shipment|Inventory)\.(findByIdAndUpdate|updateOne|save)\b/);
    assert.match(supportService, /pageSize[\s\S]{0,100}50/);
  });
});
