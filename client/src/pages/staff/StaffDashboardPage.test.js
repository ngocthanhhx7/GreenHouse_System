import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dashboard = readFileSync(join(process.cwd(), 'src/pages/staff/StaffDashboardPage.jsx'), 'utf8');

describe('Staff dashboard support query contract', () => {
  it('does not send the unsupported legacy Open support status', () => {
    assert.doesNotMatch(dashboard, /status:\s*'Open'/);
    assert.match(dashboard, /status:\s*'New'/);
    assert.match(dashboard, /status:\s*'InProgress'/);
  });
});
