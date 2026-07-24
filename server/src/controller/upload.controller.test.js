const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { getProductImage } = require('./upload.controller');

describe('Product media read controller', () => {
  it('delegates Product image access to the media authorization boundary before serving a file', async () => {
    const filename = '11111111-1111-4111-8111-111111111111.png';
    const calls = [];
    const response = {
      set(headers) { calls.push({ type: 'headers', headers }); },
      sendFile(filePath, callback) { calls.push({ type: 'file', filePath }); callback(); },
    };

    await getProductImage({
      params: { filename },
      user: { id: 'admin-1', role: 'Admin' },
      productMediaService: {
        async authorizeRead(url, actor) {
          calls.push({ type: 'authorize', url, actor });
          return { status: 'Temporary' };
        },
      },
      uploadService: {
        resolveManagedFile(url, collection) {
          calls.push({ type: 'resolve', url, collection });
          return { path: 'C:/managed/image.png', mimeType: 'image/png' };
        },
      },
    }, response, (error) => { throw error; });

    assert.deepEqual(calls.map((call) => call.type), ['authorize', 'resolve', 'headers', 'file']);
    assert.equal(calls[0].url, `/uploads/products/${filename}`);
    assert.match(calls[2].headers['Cache-Control'], /private/);
  });
});
