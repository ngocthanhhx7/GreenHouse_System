const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const {
  createEvidenceScanner,
  createUploadService,
  detectImageType,
  validateReturnEvidenceBatch,
} = require('./upload.service');

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

  it('stores Customer return evidence in its isolated managed collection', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await service.storeImage({ buffer, originalname: 'proof.jpg', mimetype: 'image/jpeg', size: buffer.length }, 'return-evidence');
    assert.match(result.url, /^\/api\/return-refunds\/evidence\/[0-9a-f-]{36}\.jpg$/);
    const managed = service.resolveManagedFile(result.url, 'return-evidence');
    assert.equal(managed.mimeType, 'image/jpeg');
    assert.equal(path.dirname(managed.path), path.join(uploadsRoot, 'return-evidence'));
    assert.equal(await service.removeManagedFile(result.url), true);
  });

  it('stores internal operational evidence behind the protected API path', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await service.storeImage({ buffer, originalname: 'warehouse-proof.jpg', mimetype: 'image/jpeg', size: buffer.length }, 'operational-evidence');
    assert.match(result.url, /^\/api\/operational-evidence\/[0-9a-f-]{36}\.jpg$/);
    const managed = service.resolveManagedFile(result.url, 'operational-evidence');
    assert.equal(managed.mimeType, 'image/jpeg');
    assert.equal(path.dirname(managed.path), path.join(uploadsRoot, 'operational-evidence'));
  });

  it('scans all protected evidence before storage and rejects a malware result', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const calls = [];
    const cleanService = createUploadService({
      uploadsRoot,
      evidenceScanner: { async scan(file) { calls.push(file.originalname); return { clean: true }; } },
    });
    await cleanService.storeImage({ buffer, originalname: 'clean.jpg', mimetype: 'image/jpeg', size: buffer.length }, 'return-evidence');
    await cleanService.storeImage({ buffer, originalname: 'operation.jpg', mimetype: 'image/jpeg', size: buffer.length }, 'operational-evidence');
    assert.deepEqual(calls, ['clean.jpg', 'operation.jpg']);

    const rejectedService = createUploadService({
      uploadsRoot,
      evidenceScanner: { async scan() { return { clean: false }; } },
    });
    await assert.rejects(
      () => rejectedService.storeImage({ buffer, originalname: 'infected.jpg', mimetype: 'image/jpeg', size: buffer.length }, 'return-evidence'),
      /malware scan/i,
    );
  });

  it('enforces the 20 MiB aggregate evidence limit independently of the 5 MiB file limit', () => {
    assert.doesNotThrow(() => validateReturnEvidenceBatch([
      { size: 5 * 1024 * 1024 }, { size: 5 * 1024 * 1024 },
      { size: 5 * 1024 * 1024 }, { size: 5 * 1024 * 1024 },
    ]));
    assert.throws(
      () => validateReturnEvidenceBatch(Array.from({ length: 5 }, () => ({ size: 5 * 1024 * 1024 }))),
      /20 MiB/i,
    );
  });

  it('fails closed in production when no malware scanner is configured', async () => {
    const scanner = createEvidenceScanner({ endpoint: '', runtime: 'production' });
    await assert.rejects(
      () => scanner.scan({ buffer: Buffer.from([0xff, 0xd8, 0xff]), originalname: 'proof.jpg', mimetype: 'image/jpeg' }),
      (error) => error.statusCode === 503 && /scanner.*required/i.test(error.message),
    );
  });

  it('sends raw evidence to the configured scanner and requires an explicit verdict', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const calls = [];
    const scanner = createEvidenceScanner({
      endpoint: 'https://scanner.example.test/scan',
      apiKey: 'scanner-secret',
      runtime: 'production',
      fetcher: async (url, options) => {
        calls.push({ url: String(url), options });
        return { ok: true, json: async () => ({ clean: true, engine: 'test-scanner' }) };
      },
    });
    const result = await scanner.scan({ buffer, originalname: '../../proof.jpg', mimetype: 'image/jpeg' });
    assert.equal(result.clean, true);
    assert.equal(calls[0].url, 'https://scanner.example.test/scan');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer scanner-secret');
    assert.equal(calls[0].options.headers['X-Original-Filename'], 'proof.jpg');
    assert.equal(calls[0].options.body, buffer);
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
