import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('vite react runtime config', () => {
  it('uses the React plugin so JSX files do not need global React imports', () => {
    const source = readFileSync(new URL('./vite.config.js', import.meta.url), 'utf8');

    assert.match(source, /@vitejs\/plugin-react/);
    assert.match(source, /react\(\)/);
  });
});
