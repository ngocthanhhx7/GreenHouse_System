import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const home = readFileSync(join(process.cwd(), 'src/pages/public/HomePage.jsx'), 'utf8');

describe('home page premium commerce design contract', () => {
  it('uses GSAP scoped animations and the planned A+B content sections', () => {
    assert.match(home, /useGSAP/);
    assert.match(home, /ScrollTrigger/);
    assert.match(home, /prefers-reduced-motion/);
    assert.match(home, /\/assets\/banner\/banner\.png/);
    assert.match(home, /Category Showcase|Kitchen Collections/);
    assert.match(home, /Browse -> Cart -> Checkout -> Staff Processing -> Warehouse -> Delivery/);
    assert.match(home, /Final CTA|Start shopping/);
  });
});
