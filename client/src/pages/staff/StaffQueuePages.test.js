import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const queueFiles = [
  'StaffOrderQueuePage.jsx',
  'ReturnRefundQueuePage.jsx',
  'ExchangeQueuePage.jsx',
];

describe('Staff queue page interaction contract', () => {
  for (const fileName of queueFiles) {
    const source = readFileSync(join(process.cwd(), 'src/pages/staff', fileName), 'utf8');

    it(`${fileName} supports bounded search, loading, retry and pagination`, () => {
      assert.match(source, /createStaffQueueParams/);
      assert.match(source, /normalizeStaffQueuePage/);
      assert.match(source, /Đang tải/);
      assert.match(source, /Thử lại/);
      assert.match(source, /Trang trước/);
      assert.match(source, /Trang sau/);
      assert.match(source, /type="search"/);
    });
  }
});
