const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const express = require('express');

const orderRoutes = require('./order.routes');
const { errorHandler } = require('../middlewares/error.middleware');

const source = readFileSync(path.join(__dirname, 'order.routes.js'), 'utf8');

async function withServer(actor, callback) {
  const app = express();
  app.use(express.json());
  if (actor) {
    app.use((req, _res, next) => {
      req.user = actor;
      req.authSession = { id: `session-${actor.id}` };
      next();
    });
  }
  app.use('/api', orderRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

describe('customer order route role boundaries', () => {
  it('keeps list, detail, cancellation and delivery confirmation behind Customer authentication', () => {
    assert.match(source, /router\.get\('\/orders\/my', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.get\('\/orders\/:id', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.patch\('\/orders\/:id\/cancel', authenticate, authorizeRoles\('Customer'\)/);
    assert.match(source, /router\.post\('\/orders\/:id\/delivery-confirmation', authenticate, authorizeRoles\('Customer'\)/);
  });

  it('does not accept a frontend role or customer identity in route declarations', () => {
    assert.doesNotMatch(source, /req\.body\.(role|userId|customerId)/);
  });

  it('rejects unauthenticated or Staff delivery-confirmation calls before the command', async () => {
    const request = (baseUrl) => fetch(`${baseUrl}/api/orders/order-owned/delivery-confirmation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': 'receipt-route-key-001',
      },
      body: JSON.stringify({
        outcome: 'RECEIVED',
        expectedDeliveryEventId: 'event-1',
      }),
    });
    await withServer(null, async (baseUrl) => {
      const response = await request(baseUrl);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).errorCode, 'SESSION_MISSING');
    });
    await withServer(
      { id: 'staff-1', role: 'Staff', status: 'Active' },
      async (baseUrl) => {
        const response = await request(baseUrl);
        assert.equal(response.status, 403);
        assert.equal((await response.json()).errorCode, 'ROLE_FORBIDDEN');
      },
    );
  });
});
