const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.join(__dirname, 'auditLog.routes.js'), 'utf8');

describe('SL-009 Admin audit route contract', () => {
  it('AT-189 exposes one Admin-only read route and no mutation API', () => {
    assert.match(
      routeSource,
      /router\.get\('\/admin\/audit-logs',\s*authenticate,\s*authorizeRoles\('Admin'\)/
    );
    assert.doesNotMatch(routeSource, /router\.(post|put|patch|delete)\(/i);
  });
});
