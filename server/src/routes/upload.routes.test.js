const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = readFileSync(path.join(__dirname, 'upload.routes.js'), 'utf8');

describe('upload route authorization contract', () => {
  it('protects product uploads with authentication and explicit business roles', () => {
    assert.match(source, /'\/admin\/uploads\/products',[\s\S]*authenticate,[\s\S]*authorizeRoles\('Admin', 'Staff'\)/);
    assert.match(source, /router\.delete\([\s\S]*'\/admin\/uploads\/products',[\s\S]*authenticate,[\s\S]*authorizeRoles\('Admin', 'Staff'\)/);
  });

  it('allows only the authenticated owner to update their avatar', () => {
    assert.match(source, /router\.post\('\/profile\/avatar', authenticate, uploadAvatar/);
    assert.match(source, /router\.delete\('\/profile\/avatar', authenticate/);
  });
});
