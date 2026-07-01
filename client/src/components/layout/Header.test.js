import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const header = readFileSync(join(process.cwd(), 'src/components/layout/Header.jsx'), 'utf8');

describe('shared header design contract', () => {
  it('keeps guest commerce actions and authenticated account actions in the shared header', () => {
    assert.match(header, /to="\/cart"/);
    assert.match(header, /to="\/login"/);
    assert.match(header, /to="\/register"/);
    assert.match(header, /to="\/notifications"/);
    assert.match(header, /avatar-menu/);
    assert.match(header, /roleMenuLinks/);
    assert.match(header, /Order History/);
    assert.match(header, /logout/);
  });
});
