import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageSource = await readFile(new URL('./ProductManagementPage.jsx', import.meta.url), 'utf8');
const mediaSource = await readFile(new URL('../../components/product/ProductMediaManager.jsx', import.meta.url), 'utf8');

describe('admin product media management contract', () => {
  it('supports create and edit with a reusable media manager', () => {
    assert.match(pageSource, /editingProductId/);
    assert.match(pageSource, /ProductMediaManager/);
    assert.match(pageSource, /updateProduct/);
    assert.match(pageSource, /imageUrls/);
  });

  it('uploads local images and supports featured ordering and removal', () => {
    assert.match(mediaSource, /uploadImages/);
    assert.match(mediaSource, /onDrop/);
    assert.match(mediaSource, /Đặt làm ảnh chính/);
    assert.match(mediaSource, /Xóa ảnh/);
  });
});
