const crypto = require('node:crypto');
const path = require('node:path');
const { mkdir, unlink, writeFile } = require('node:fs/promises');

const ApiError = require('../utils/apiError');

const DEFAULT_UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');
const ALLOWED_COLLECTIONS = new Set(['avatars', 'products']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' };
  }
  return null;
}

function cleanOriginalName(value) {
  return path.basename(String(value || 'image')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'image';
}

function createUploadService({ uploadsRoot = DEFAULT_UPLOADS_ROOT } = {}) {
  const resolvedRoot = path.resolve(uploadsRoot);

  function resolveCollection(collection) {
    if (!ALLOWED_COLLECTIONS.has(collection)) {
      throw new ApiError(400, 'Unsupported upload collection');
    }
    return path.join(resolvedRoot, collection);
  }

  return {
    async storeImage(file, collection) {
      if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
        throw new ApiError(400, 'Image file is required');
      }
      if (file.buffer.length > MAX_IMAGE_SIZE || Number(file.size || file.buffer.length) > MAX_IMAGE_SIZE) {
        throw new ApiError(413, 'Image must not exceed 5 MB');
      }
      const detected = detectImageType(file.buffer);
      if (!detected) {
        throw new ApiError(400, 'File must be a valid JPEG, PNG, or WebP image');
      }
      const suppliedMime = String(file.mimetype || '').toLowerCase();
      const normalizedMime = suppliedMime === 'image/jpg' ? 'image/jpeg' : suppliedMime;
      if (normalizedMime && normalizedMime !== detected.mimeType) {
        throw new ApiError(400, 'Image content does not match its MIME type');
      }

      const directory = resolveCollection(collection);
      await mkdir(directory, { recursive: true });
      const filename = `${crypto.randomUUID()}.${detected.extension}`;
      const targetPath = path.join(directory, filename);
      await writeFile(targetPath, file.buffer, { flag: 'wx' });
      return {
        url: `/uploads/${collection}/${filename}`,
        originalName: cleanOriginalName(file.originalname),
        mimeType: detected.mimeType,
        size: file.buffer.length,
      };
    },

    async storeImages(files, collection) {
      const uploaded = [];
      try {
        for (const file of files || []) uploaded.push(await this.storeImage(file, collection));
        return uploaded;
      } catch (error) {
        await Promise.all(uploaded.map((item) => this.removeManagedFile(item.url)));
        throw error;
      }
    },

    async removeManagedFile(url) {
      const match = /^\/uploads\/(avatars|products)\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(String(url || ''));
      if (!match) return false;
      const collectionDirectory = resolveCollection(match[1]);
      const targetPath = path.resolve(collectionDirectory, `${match[2]}.${match[3]}`);
      if (!targetPath.startsWith(`${path.resolve(collectionDirectory)}${path.sep}`)) return false;
      try {
        await unlink(targetPath);
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    },
  };
}

module.exports = {
  createUploadService,
  uploadService: createUploadService(),
  detectImageType,
  DEFAULT_UPLOADS_ROOT,
  MAX_IMAGE_SIZE,
};
