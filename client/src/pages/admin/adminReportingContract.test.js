import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(currentDirectory, 'AdminDashboardPage.jsx'), 'utf8');

describe('SL-009 Admin reporting UI contract', () => {
  it('separates period events from current snapshots and shows report provenance', () => {
    assert.match(source, /report\.meta\?\.generatedAt/);
    assert.match(source, /report\.meta\?\.dataAsOf/);
    assert.match(source, /report\?\.orders\?\.periodEvents/);
    assert.match(source, /report\?\.orders\?\.currentSnapshot/);
    assert.match(source, /report\?\.inventory\?\.periodMovements/);
    assert.match(source, /report(?:\?\.|\.)inventory\?\.currentSnapshot/);
  });

  it('renders Product, Customer and Staff definitions without score or rank', () => {
    assert.match(source, /report\?\.products\?\.gross/);
    assert.match(source, /report\.customers\?\.period/);
    assert.match(source, /report\?\.staff\?\.items/);
    assert.doesNotMatch(source, /\b(?:score|rank)\b/i);
  });

  it('uses explicit all-time mode and never converts unavailable metrics into demo zeroes', () => {
    assert.match(source, /mode:\s*'allTime'/);
    assert.match(source, /displayMetric/);
    assert.doesNotMatch(source, /DEMO_REPORT/);
  });
});
