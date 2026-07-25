import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('auth context runtime imports', () => {
  it('imports React for JSX runtime compatibility', () => {
    const source = readFileSync(new URL('./AuthContext.jsx', import.meta.url), 'utf8');

    assert.match(source, /^import React,/m);
  });

  it('subscribes and cleans up the shared session-expiration handler', () => {
    const source = readFileSync(new URL('./AuthContext.jsx', import.meta.url), 'utf8');

    assert.match(source, /subscribeToSessionExpiration/);
    assert.match(source, /return subscribeToSessionExpiration\(/);
  });

  it('clears an authenticated identity and redirects with a clear expiry message', () => {
    const source = readFileSync(new URL('./AuthContext.jsx', import.meta.url), 'utf8');

    assert.match(source, /const \[sessionNotice, setSessionNotice\]/);
    assert.match(source, /if \(!user\) return;/);
    assert.match(source, /setSessionNotice\(/);
    assert.match(source, /clearCsrfToken\(\);[\s\S]{0,120}setUser\(null\)/);
    assert.match(source, /navigate\('\/login',[\s\S]{0,200}replace: true/);
    assert.match(source, /from: location\.pathname/);
    assert.match(source, /const message = 'Phiên đăng nhập/);
    assert.match(source, /message,/);
    assert.match(source, /sessionNotice,/);
  });
});
