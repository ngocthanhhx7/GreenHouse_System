const assert = require('node:assert/strict');
const http = require('node:http');
const { afterEach, describe, it } = require('node:test');
const express = require('express');

const reviewRoutes = require('./review.routes');
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

function declaredRoutes() {
  return reviewRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      method: Object.keys(layer.route.methods).find((method) => layer.route.methods[method]),
      path: layer.route.path,
      handlers: layer.route.stack.length,
    }));
}

async function withHttpServer(actor, callback) {
  const app = express();
  app.use(express.json());
  if (actor) {
    app.use((req, _res, next) => {
      req.user = actor;
      req.authSession = { id: `session-${actor.id}` };
      return next();
    });
  }
  app.use('/api', reviewRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({
    success: false,
    errorCode: error.errorCode || 'INTERNAL_ERROR',
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

async function request(baseUrl, row) {
  return fetch(`${baseUrl}${row.path}`, {
    method: row.method,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'review-route-key-001',
    },
    ...(row.method === 'GET' ? {} : { body: JSON.stringify({ expectedVersion: 1 }) }),
  });
}

const customerRoutes = [
  { method: 'GET', path: '/api/customer/reviews' },
  { method: 'POST', path: '/api/products/product-1/reviews' },
  { method: 'PATCH', path: '/api/reviews/review-1' },
  { method: 'PATCH', path: '/api/reviews/review-1/publication' },
];

const staffRoutes = [
  { method: 'GET', path: '/api/staff/reviews' },
  { method: 'PATCH', path: '/api/staff/reviews/507f1f77bcf86cd799439011/moderation' },
];

describe('SL-008 Review routes', () => {
  it('declares only the exact seven approved HTTP routes', () => {
    assert.deepEqual(declaredRoutes(), [
      { method: 'get', path: '/products/:productId/reviews', handlers: 1 },
      { method: 'get', path: '/customer/reviews', handlers: 3 },
      { method: 'post', path: '/products/:productId/reviews', handlers: 3 },
      { method: 'patch', path: '/reviews/:reviewId', handlers: 3 },
      { method: 'patch', path: '/reviews/:reviewId/publication', handlers: 3 },
      { method: 'get', path: '/staff/reviews', handlers: 3 },
      { method: 'patch', path: '/staff/reviews/:reviewId/moderation', handlers: 4 },
    ]);
  });

  it('keeps the public Review page anonymous', async () => {
    reviewService.listPublic = async () => ({ items: [], total: 0 });
    await withHttpServer(null, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products/product-1/reviews`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).success, true);
    });
  });

  it('authenticates every protected Customer and Staff route', async () => {
    await withHttpServer(null, async (baseUrl) => {
      for (const row of [...customerRoutes, ...staffRoutes]) {
        const response = await request(baseUrl, row);
        assert.equal(response.status, 401, `${row.method} ${row.path}`);
        assert.equal((await response.json()).errorCode, 'SESSION_MISSING');
      }
    });
  });

  it('authorizes Customer routes only for the exact Customer role', async () => {
    for (const role of ['Staff', 'Admin', 'WarehouseManager']) {
      await withHttpServer(
        { id: `${role}-1`, role, status: 'Active' },
        async (baseUrl) => {
          for (const row of customerRoutes) {
            const response = await request(baseUrl, row);
            assert.equal(response.status, 403, `${role}: ${row.method} ${row.path}`);
            assert.equal((await response.json()).errorCode, 'ROLE_FORBIDDEN');
          }
        },
      );
    }

    reviewService.listOwn = async () => ({ items: [] });
    reviewService.createReview = async () => ({ id: 'review-1' });
    reviewService.updateReview = async () => ({ id: 'review-1' });
    reviewService.setPublication = async () => ({ id: 'review-1' });
    await withHttpServer(
      { id: 'customer-1', role: 'Customer', status: 'Active' },
      async (baseUrl) => {
        for (const row of customerRoutes) {
          const response = await request(baseUrl, row);
          assert.equal(
            response.status,
            row.method === 'POST' ? 201 : 200,
            `${row.method} ${row.path}`,
          );
        }
      },
    );
  });

  it('authorizes Staff routes only for the exact Staff role', async () => {
    for (const role of ['Customer', 'Admin', 'WarehouseManager']) {
      await withHttpServer(
        { id: `${role}-1`, role, status: 'Active' },
        async (baseUrl) => {
          for (const row of staffRoutes) {
            const response = await request(baseUrl, row);
            assert.equal(response.status, 403, `${role}: ${row.method} ${row.path}`);
            assert.equal((await response.json()).errorCode, 'ROLE_FORBIDDEN');
          }
        },
      );
    }

    reviewService.listModeration = async () => ({ items: [] });
    reviewService.moderate = async () => ({ id: 'review-1' });
    await withHttpServer(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      async (baseUrl) => {
        for (const row of staffRoutes) {
          const response = await request(baseUrl, row);
          assert.equal(response.status, 200, `${row.method} ${row.path}`);
        }
      },
    );
  });
});
