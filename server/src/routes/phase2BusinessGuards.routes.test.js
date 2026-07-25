const assert = require('node:assert/strict');
const http = require('node:http');
const { describe, it } = require('node:test');
const express = require('express');

const orderRoutes = require('./order.routes');
const staffOrderRoutes = require('./staffOrder.routes');
const inventoryRoutes = require('./inventory.routes');
const fulfillmentRoutes = require('./fulfillment.routes');
const { errorHandler } = require('../middlewares/error.middleware');

async function withHttpServer(actor, callback) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = actor;
    req.authSession = { id: `session-${actor.id}` };
    next();
  });
  app.use('/api', orderRoutes);
  app.use('/api', staffOrderRoutes);
  app.use('/api', inventoryRoutes);
  app.use('/api', fulfillmentRoutes);
  app.use(errorHandler);

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

describe('Phase 2 business guard route matrix', () => {
  it('AT-232 rejects wrong-role API calls with a stable 403 response', async () => {
    const deniedCases = [
      ['Customer', '/api/staff/orders/order-1/confirm', 'POST'],
      ['WarehouseManager', '/api/staff/orders/order-1/confirm', 'POST'],
      ['Customer', '/api/warehouse/stock-exports/export-1/process', 'POST'],
      ['Staff', '/api/warehouse/stock-exports/export-1/process', 'POST'],
      ['Admin', '/api/warehouse/stock-exports/export-1/process', 'POST'],
      ['Customer', '/api/staff/shipments/shipment-1/events', 'POST'],
      ['Staff', '/api/orders/order-1/cancel', 'PATCH'],
    ];

    for (const [role, path, method] of deniedCases) {
      await withHttpServer(
        { id: `${role.toLowerCase()}-1`, role, status: 'Active' },
        async (baseUrl) => {
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          assert.equal(response.status, 403, `${method} ${path} should reject ${role}`);
          assert.equal((await response.json()).errorCode, 'ROLE_FORBIDDEN');
        },
      );
    }
  });

  it('requires the confirmation idempotency header after Staff RBAC succeeds', async () => {
    await withHttpServer(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/staff/orders/order-1/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note: 'Reviewed' }),
        });
        const payload = await response.json();

        assert.equal(response.status, 400);
        assert.equal(payload.errorCode, 'STAFF_CONFIRM_IDEMPOTENCY_KEY_REQUIRED');
      },
    );
  });
});
