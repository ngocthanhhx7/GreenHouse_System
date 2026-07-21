import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { buildAdminOverviewQuery } from './adminDashboardQuery.js';

describe('buildAdminOverviewQuery', () => {
  it('omits blank dates and encodes supplied reporting dates', () => {
    assert.equal(buildAdminOverviewQuery({ from: '', to: undefined }), '');
    assert.equal(
      buildAdminOverviewQuery({ from: '2026-07-01', to: '2026-07-31' }),
      'from=2026-07-01&to=2026-07-31'
    );
  });

  it('keeps the dashboard shell visible and marks its report area as loading', () => {
    const pageSource = readFileSync(new URL('./AdminDashboardPage.jsx', import.meta.url), 'utf8');

    assert.doesNotMatch(pageSource, /if \(!report && !error\) return/);
    assert.match(pageSource, /aria-busy=\{loading\}/);
    assert.match(pageSource, /role="status"/);
  });
});
