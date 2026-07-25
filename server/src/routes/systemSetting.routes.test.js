const assert = require('node:assert/strict');
const http = require('node:http');
const { afterEach, describe, it } = require('node:test');
const express = require('express');

const systemSettingRoutes = require('./systemSetting.routes');
const { systemSettingService } = require('../services/systemSetting.service');

const originalListSettings = systemSettingService.listSettings;

afterEach(() => { systemSettingService.listSettings = originalListSettings; });

async function withHttpServer(actor, callback) {
  const app = express();
  if (actor) app.use((req, _res, next) => { req.user = actor; req.authSession = { id: `session-${actor.id}` }; next(); });
  app.use('/api', systemSettingRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))); }
}

describe('SL-009 versioned system setting routes', () => {
  it('denies unauthenticated and non-Admin direct reads', async () => {
    await withHttpServer(null, async (baseUrl) => assert.equal((await fetch(`${baseUrl}/api/admin/settings`)).status, 401));
    await withHttpServer({ id: 'warehouse-1', role: 'WarehouseManager', status: 'Active' }, async (baseUrl) => assert.equal((await fetch(`${baseUrl}/api/admin/settings/history`)).status, 403));
  });

  it('allows Admin to read only version metadata and the two configured values', async () => {
    systemSettingService.listSettings = async () => ({
      current: { version: 2, effectiveAt: '2026-07-25T00:00:00.000Z', values: { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 } },
      history: [],
    });
    await withHttpServer({ id: 'admin-1', role: 'Admin', status: 'Active' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/settings`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data.current.values, { PAYMENT_TIMEOUT_MINUTES: 20, LOW_STOCK_DEFAULT_THRESHOLD: 5 });
    });
  });
});
