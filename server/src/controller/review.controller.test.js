const assert = require('node:assert/strict');
const { afterEach, describe, it } = require('node:test');

const reviewController = require('./review.controller');
const { reviewService } = require('../services/review.service');

const originals = Object.fromEntries(
  Object.entries(reviewService).map(([name, value]) => [name, value]),
);

afterEach(() => {
  for (const key of Object.keys(reviewService)) {
    if (!Object.hasOwn(originals, key)) delete reviewService[key];
  }
  Object.assign(reviewService, originals);
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
  const headers = { 'idempotency-key': 'review-command-key-001' };
  return {
    params: {},
    query: {},
    body: {},
    headers,
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

describe('SL-008 Review HTTP controller', () => {
  it('maps the public product page to listPublic with the route productId and query', async () => {
    const calls = [];
    reviewService.listPublic = async (...args) => {
      calls.push(args);
      return { items: [], total: 0 };
    };

    const query = { page: '2', pageSize: '10' };
    const res = await invoke(
      reviewController.listPublic,
      request({ params: { productId: 'product-1' }, query }),
    );

    assert.deepEqual(calls, [['product-1', query]]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      success: true,
      message: 'OK',
      data: { items: [], total: 0 },
      errors: [],
    });
  });

  it('maps the protected Customer page to listOwn with the complete actor', async () => {
    const calls = [];
    reviewService.listOwn = async (...args) => {
      calls.push(args);
      return { items: [{ id: 'review-1' }] };
    };
    const actor = { id: 'customer-1', role: 'Customer', status: 'Active' };
    const query = { page: '1', pageSize: '20' };

    const res = await invoke(
      reviewController.listOwn,
      request({ user: actor, query }),
    );

    assert.deepEqual(calls, [[actor, query]]);
    assert.equal(res.statusCode, 200);
  });

  it('creates with a whitelisted JSON command and header-only idempotency metadata', async () => {
    const calls = [];
    reviewService.createReview = async (...args) => {
      calls.push(args);
      return { id: 'review-1', version: 1 };
    };
    const actor = { id: 'customer-1', role: 'Customer', status: 'Active' };
    const body = {
      orderDetailId: 'detail-1',
      rating: 5,
      content: 'Useful',
      expectedVersion: 0,
      idempotencyKey: 'body-key-must-not-pass',
      customerId: 'foreign-owner',
      publicationStatus: 'Withdrawn',
      moderationStatus: 'HiddenByStaff',
      version: 99,
    };

    const res = await invoke(
      reviewController.createReview,
      request({ user: actor, params: { productId: 'product-1' }, body }),
    );

    assert.deepEqual(calls, [[
      actor,
      'product-1',
      {
        orderDetailId: 'detail-1',
        rating: 5,
        content: 'Useful',
        expectedVersion: 0,
      },
      { idempotencyKey: 'review-command-key-001' },
    ]]);
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.success, true);
    assert.deepEqual(res.payload.data, { id: 'review-1', version: 1 });
    assert.deepEqual(res.payload.errors, []);
  });

  it('updates only rating, content, and expectedVersion for the owning actor', async () => {
    const calls = [];
    reviewService.updateReview = async (...args) => {
      calls.push(args);
      return { id: 'review-1', version: 2 };
    };
    const actor = { id: 'customer-1', role: 'Customer', status: 'Active' };

    const res = await invoke(reviewController.updateReview, request({
      user: actor,
      params: { reviewId: 'review-1' },
      body: {
        rating: 4,
        content: 'Updated',
        expectedVersion: 1,
        idempotencyKey: 'body-key',
        customerId: 'foreign-owner',
        publicationStatus: 'Withdrawn',
      },
    }));

    assert.deepEqual(calls, [[
      actor,
      'review-1',
      { rating: 4, content: 'Updated', expectedVersion: 1 },
      { idempotencyKey: 'review-command-key-001' },
    ]]);
    assert.equal(res.statusCode, 200);
  });

  it('changes only publicationStatus and expectedVersion for the owning actor', async () => {
    const calls = [];
    reviewService.setPublication = async (...args) => {
      calls.push(args);
      return { id: 'review-1', publicationStatus: 'Withdrawn', version: 2 };
    };
    const actor = { id: 'customer-1', role: 'Customer', status: 'Active' };

    const res = await invoke(reviewController.setPublication, request({
      user: actor,
      params: { reviewId: 'review-1' },
      body: {
        publicationStatus: 'Withdrawn',
        expectedVersion: 1,
        idempotencyKey: 'body-key',
        rating: 1,
        moderationStatus: 'HiddenByStaff',
      },
    }));

    assert.deepEqual(calls, [[
      actor,
      'review-1',
      { publicationStatus: 'Withdrawn', expectedVersion: 1 },
      { idempotencyKey: 'review-command-key-001' },
    ]]);
    assert.equal(res.statusCode, 200);
  });

  it('maps the Staff page to listModeration with the complete actor and query', async () => {
    const calls = [];
    reviewService.listModeration = async (...args) => {
      calls.push(args);
      return { items: [] };
    };
    const actor = { id: 'staff-1', role: 'Staff', status: 'Active' };
    const query = {
      page: '1',
      productId: 'product-1',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
    };

    const res = await invoke(
      reviewController.listModeration,
      request({ user: actor, query }),
    );

    assert.deepEqual(calls, [[actor, query]]);
    assert.equal(res.statusCode, 200);
  });

  it('moderates only moderationStatus, reason, and expectedVersion for the Staff actor', async () => {
    const calls = [];
    reviewService.moderate = async (...args) => {
      calls.push(args);
      return { id: 'review-1', moderationStatus: 'HiddenByStaff', version: 2 };
    };
    const actor = { id: 'staff-1', role: 'Staff', status: 'Active' };

    const res = await invoke(reviewController.moderate, request({
      user: actor,
      params: { reviewId: 'review-1' },
      body: {
        moderationStatus: 'HiddenByStaff',
        reason: 'Violates publication policy',
        expectedVersion: 1,
        idempotencyKey: 'body-key',
        rating: 1,
        publicationStatus: 'Withdrawn',
        actorId: 'forged-staff',
      },
    }));

    assert.deepEqual(calls, [[
      actor,
      'review-1',
      {
        moderationStatus: 'HiddenByStaff',
        reason: 'Violates publication policy',
        expectedVersion: 1,
      },
      { idempotencyKey: 'review-command-key-001' },
    ]]);
    assert.equal(res.statusCode, 200);
  });

  it('forwards service failures through next(error) for every handler', async () => {
    const error = new Error('service failed');
    const rows = [
      ['listPublic', 'listPublic'],
      ['listOwn', 'listOwn'],
      ['createReview', 'createReview'],
      ['updateReview', 'updateReview'],
      ['setPublication', 'setPublication'],
      ['listModeration', 'listModeration'],
      ['moderate', 'moderate'],
    ];

    for (const [handlerName, serviceName] of rows) {
      reviewService[serviceName] = async () => { throw error; };
      const res = responseRecorder();
      let forwarded;
      await reviewController[handlerName](request(), res, (nextError) => {
        forwarded = nextError;
      });
      assert.equal(forwarded, error, handlerName);
      assert.equal(res.payload, undefined, handlerName);
    }
  });
});
