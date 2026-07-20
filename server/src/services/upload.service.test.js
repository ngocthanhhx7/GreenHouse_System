const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { createUploadService, detectImageType } = require('./upload.service');

describe('upload service', () => {
  let uploadsRoot;
  let service;

  beforeEach(async () => {
    uploadsRoot = await mkdtemp(path.join(os.tmpdir(), 'greenhome-upload-'));
    service = createUploadService({ uploadsRoot });
  });

  afterEach(async () => {
    await rm(uploadsRoot, { recursive: true, force: true });
  });

  it('detects supported image content from magic bytes', () => {
    assert.deepEqual(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { extension: 'png', mimeType: 'image/png' });
    assert.deepEqual(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), { extension: 'jpg', mimeType: 'image/jpeg' });
    assert.equal(detectImageType(Buffer.from('MZ executable')), null);
  });

  it('stores an image under a generated name instead of the client filename', async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    const result = await service.storeImage({
      buffer,
      originalname: '../../avatar.png',
      mimetype: 'image/png',
      size: buffer.length,
    }, 'avatars');

    assert.match(result.url, /^\/uploads\/avatars\/[0-9a-f-]{36}\.png$/);
    assert.equal(result.originalName, 'avatar.png');
    assert.deepEqual(await readFile(path.join(uploadsRoot, 'avatars', path.basename(result.url))), buffer);
  });

  it('rejects executable content even when the MIME header claims it is an image', async () => {
    await assert.rejects(
      () => service.storeImage({ buffer: Buffer.from('MZ executable'), originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 13 }, 'products'),
      /valid JPEG, PNG, or WebP image/
    );
  });

  it('removes only managed upload URLs', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const stored = await service.storeImage({ buffer, originalname: 'avatar.jpg', mimetype: 'image/jpeg', size: buffer.length }, 'avatars');

    assert.equal(await service.removeManagedFile(stored.url), true);
    assert.equal(await service.removeManagedFile('/uploads/../../server.js'), false);
    assert.equal(await service.removeManagedFile('https://example.com/image.jpg'), false);
  });
});
