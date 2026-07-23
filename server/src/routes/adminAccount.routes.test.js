const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const routeSource = require('node:fs').readFileSync(require('node:path').join(__dirname, 'adminAccount.routes.js'), 'utf8');

describe('Admin account route contract', () => {
  it('AT-134 exposes only account governance commands and no credential/impersonation routes', () => {
    assert.match(routeSource, /\/admin\/accounts/);
    assert.match(routeSource, /internal-invitations/);
    assert.doesNotMatch(routeSource, /password|impersonat|hard-delete|convert/);
  });
});
