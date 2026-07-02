import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const appLayout = readFileSync(join(process.cwd(), 'src/components/layout/AppLayout.jsx'), 'utf8');
const customerLayout = readFileSync(join(process.cwd(), 'src/components/layout/CustomerLayout.jsx'), 'utf8');
const publicLayout = readFileSync(join(process.cwd(), 'src/components/layout/PublicLayout.jsx'), 'utf8');
const appRoutes = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');

describe('role layout separation contract', () => {
  it('keeps footer in storefront and customer layouts only', () => {
    assert.match(publicLayout, /<Footer/);
    assert.match(customerLayout, /<Footer/);
    assert.doesNotMatch(appLayout, /<Footer/);
  });

  it('keeps customer commerce pages outside the internal dashboard shell', () => {
    assert.match(appRoutes, /<CustomerLayout/);
    assert.match(customerLayout, /<Header showCart/);
  });

  it('uses internal topbar controls for authenticated dashboards', () => {
    assert.match(appLayout, /InternalTopbar/);
    assert.match(appLayout, /Sidebar/);
    assert.doesNotMatch(appLayout, /<Header/);
    assert.doesNotMatch(appLayout, /showCart/);
  });
});
