const assert = require('node:assert/strict');
const http = require('node:http');
const { afterEach, describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const routeSource = fs.readFileSync(path.join(__dirname, 'auditLog.routes.js'), 'utf8');
const auditLogRoutes = require('./auditLog.routes');
const { auditLogService } = require('../services/auditLog.service');
const originalListAuditLogs = auditLogService.listAuditLogs;

afterEach(() => {
  auditLogService.listAuditLogs = originalListAuditLogs;
});

async function withHttpServer(actor, callback) {
  const app = express();
  if (actor) {
    app.use((req, _res, next) => {
      req.user = actor;
      req.authSession = { id: `session-${actor.id}` };
      return next();
    });
  }
  app.use('/api', auditLogRoutes);
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

describe('SL-009 Admin audit route contract', () => {
  it('AT-189 exposes one Admin-only read route and no mutation API', () => {
    assert.match(
      routeSource,
      /router\.get\('\/admin\/audit-logs',\s*authenticate,\s*authorizeRoles\('Admin'\)/
    );
    assert.doesNotMatch(routeSource, /router\.(post|put|patch|delete)\(/i);
  });

  it('enforces authentication and the exact Admin role at runtime', async () => {
    await withHttpServer(null, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/audit-logs`);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).errorCode, 'SESSION_MISSING');
    });

    await withHttpServer(
      { id: 'customer-1', role: 'Customer', status: 'Active' },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/admin/audit-logs`);
        assert.equal(response.status, 403);
        assert.equal((await response.json()).errorCode, 'ROLE_FORBIDDEN');
      }
    );

    auditLogService.listAuditLogs = async () => ({
      items: [],
      nextCursor: null,
      total: 0,
    });
    await withHttpServer(
      { id: 'admin-1', role: 'Admin', status: 'Active' },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/admin/audit-logs`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).success, true);
      }
    );
  });
});
