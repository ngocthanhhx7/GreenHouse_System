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

describe('premium storefront CTA styles', () => {
  it('keeps the Home CTA visually separate from the footer without letting the footer cover it', () => {
    const ctaBlock = styles.match(/\.premium-final-cta\s*\{[^}]+\}/)?.[0] || '';
    const footerBlock = styles.match(/\.site-footer\s*\{[^}]+\}/g)?.at(-1) || '';
    const homeBlock = styles.match(/\.home-premium\s*\{[^}]+\}/)?.[0] || '';

    assert.match(ctaBlock, /background:\s*#0d725c/);
    assert.doesNotMatch(ctaBlock, /background:\s*#064f3c/);
    assert.match(ctaBlock, /margin:\s*34px auto 0/);
    assert.match(ctaBlock, /position:\s*relative/);
    assert.match(ctaBlock, /z-index:\s*2/);
    assert.match(footerBlock, /background:\s*#064f3c/);
    assert.match(footerBlock, /padding-top:\s*64px/);
  });
});
