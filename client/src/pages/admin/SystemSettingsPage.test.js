import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('./SystemSettingsPage.jsx', import.meta.url), 'utf8');

describe('SL-009 System Settings UI contract', () => {
  it('keeps one command key across response-loss retry and resets it only after success or changed facts', () => {
    assert.match(source, /useRef/);
    assert.match(source, /commandKeyRef\.current\s*\|\|=\s*newIdempotencyKey\(\)/);
    assert.match(source, /adminService\.updateSettings\([\s\S]*commandKeyRef\.current/);
    assert.match(source, /function resetCommandKey/);
    assert.match(source, /resetCommandKey\(\)[\s\S]*setValues|setValues[\s\S]*resetCommandKey\(\)/);
    assert.match(source, /resetCommandKey\(\)[\s\S]*setReason|setReason[\s\S]*resetCommandKey\(\)/);
    assert.match(source, /setMessage\([\s\S]*resetCommandKey\(\)/);
  });

  it('explains the default/future-only timeout and global threshold override/reevaluation effects', () => {
    assert.match(source, /Mặc định 15 phút/);
    assert.match(source, /chỉ áp dụng cho đơn ONLINE tạo sau/);
    assert.match(source, /ngưỡng toàn cục/);
    assert.match(source, /ghi đè/);
    assert.match(source, /đánh giá lại/);
  });

  it('renders both canonical values for every retained history version', () => {
    assert.match(source, /item\.values\.PAYMENT_TIMEOUT_MINUTES/);
    assert.match(source, /item\.values\.LOW_STOCK_DEFAULT_THRESHOLD/);
    assert.match(source, /Lịch sử giữ tối đa 20 phiên bản/);
  });
});
