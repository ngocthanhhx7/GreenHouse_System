import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('auth context runtime imports', () => {
  it('imports React for JSX runtime compatibility', () => {
    const source = readFileSync(new URL('./AuthContext.jsx', import.meta.url), 'utf8');

    assert.match(source, /^import React,/m);
  });
});
