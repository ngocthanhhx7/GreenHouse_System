import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

describe('admin dashboard styles', () => {
  it('defines stable metric grid and metric box styles', () => {
    assert.match(styles, /\.metrics-grid\s*\{/);
    assert.match(styles, /\.metric-box\s*\{/);
    assert.match(styles, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
  });
});
