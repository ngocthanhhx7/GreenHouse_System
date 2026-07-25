const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(join(__dirname, 'notification.routes.js'), 'utf8');

describe('SL-009 Notification route contract', () => {
  it('AT-179 allows only authenticated account roles to operate on their own inbox and exposes no delete API', () => {
    assert.match(source, /authorizeRoles\('Customer',\s*'Staff',\s*'WarehouseManager',\s*'Admin'\)/);
    assert.match(source, /router\.patch\('\/notifications\/:id\/archive'/);
    assert.doesNotMatch(source, /router\.delete\(/);
  });

  it('AT-180 exposes the server-authorized target resolver route', () => {
    assert.match(source, /router\.get\('\/notifications\/:id\/target'/);
  });
});
