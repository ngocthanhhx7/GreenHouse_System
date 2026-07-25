import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const dashboard = readFileSync(join(process.cwd(), 'src/pages/staff/StaffDashboardPage.jsx'), 'utf8');

describe('Staff dashboard support query contract', () => {
  it('counts only supported open-work statuses without a hardcoded placeholder', () => {
    assert.doesNotMatch(dashboard, /status:\s*'Open'/);
    assert.match(dashboard, /status:\s*'New'/);
    assert.match(dashboard, /status:\s*'InProgress'/);
    assert.doesNotMatch(dashboard, /openSupport:\s*\{\s*total:\s*0\s*\}/);
  });

  it('offers an explicit retry action after a dashboard load failure', () => {
    assert.match(dashboard, /Thử tải lại/);
  });
});
