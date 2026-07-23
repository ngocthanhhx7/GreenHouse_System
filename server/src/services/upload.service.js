const crypto = require('node:crypto');
const path = require('node:path');
const { mkdir, unlink, writeFile } = require('node:fs/promises');

const ApiError = require('../utils/apiError');
const { MAX_RETURN_EVIDENCE_TOTAL_SIZE } = require('../utils/returnEvidenceClaim');

const DEFAULT_UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');
const ALLOWED_COLLECTIONS = new Set(['avatars', 'products', 'return-evidence']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MIME_BY_EXTENSION = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

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

function managedUrl(collection, filename) {
  return collection === 'return-evidence'
    ? `/api/return-refunds/evidence/${filename}`
    : `/uploads/${collection}/${filename}`;
}

function parseManagedUrl(url) {
  const value = String(url || '');
  const publicMatch = /^\/uploads\/(avatars|products|return-evidence)\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(value);
  if (publicMatch) return { collection: publicMatch[1], filename: `${publicMatch[2]}.${publicMatch[3]}`, extension: publicMatch[3] };
  const privateMatch = /^\/api\/return-refunds\/evidence\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(value);
  if (privateMatch) return { collection: 'return-evidence', filename: `${privateMatch[1]}.${privateMatch[2]}`, extension: privateMatch[2] };
  return null;
}

function validateReturnEvidenceBatch(files) {
  const total = (files || []).reduce((sum, file) => (
    sum + Number(Buffer.isBuffer(file?.buffer) ? file.buffer.length : file?.size || 0)
  ), 0);
  if (total > MAX_RETURN_EVIDENCE_TOTAL_SIZE) {
    throw new ApiError(413, 'Return evidence must not exceed 20 MiB per upload');
  }
  return total;
}

function createEvidenceScanner({
  endpoint = process.env.RETURN_EVIDENCE_SCANNER_URL || '',
  apiKey = process.env.RETURN_EVIDENCE_SCANNER_API_KEY || '',
  runtime = process.env.NODE_ENV || 'development',
  fetcher = global.fetch,
} = {}) {
  const scannerUrl = String(endpoint || '').trim();
  return {
    async scan(file) {
      if (!scannerUrl) {
        if (runtime === 'production') {
          throw new ApiError(503, 'A return-evidence malware scanner is required in production');
        }
        // Local/test fallback is deliberately labelled as signature-only. It
        // keeps development usable while production remains fail-closed.
        const eicar = Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE', 'ascii');
        return { clean: !file.buffer.includes(eicar), engine: 'local-signature-only' };
      }

      let parsed;
      try {
        parsed = new URL(scannerUrl);
      } catch (_) {
        throw new ApiError(503, 'Return-evidence malware scanner URL is invalid');
      }
      if (runtime === 'production' && parsed.protocol !== 'https:') {
        throw new ApiError(503, 'Return-evidence malware scanner must use HTTPS in production');
      }
      if (typeof fetcher !== 'function') throw new ApiError(503, 'Return-evidence malware scanner is unavailable');

      let response;
      try {
        response = await fetcher(parsed, {
          method: 'POST',
          headers: {
            'Content-Type': file.mimetype || 'application/octet-stream',
            'X-Original-Filename': cleanOriginalName(file.originalname),
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: file.buffer,
          signal: AbortSignal.timeout(10000),
        });
      } catch (_) {
        throw new ApiError(503, 'Return-evidence malware scanner is unavailable');
      }
      if (!response.ok) throw new ApiError(503, 'Return-evidence malware scanner rejected the scan request');
      let result;
      try {
        result = await response.json();
      } catch (_) {
        throw new ApiError(503, 'Return-evidence malware scanner returned an invalid result');
      }
      if (result?.clean !== true && result?.clean !== false) {
        throw new ApiError(503, 'Return-evidence malware scanner returned no verdict');
      }
      return result;
    },
  };
}

function createUploadService({ uploadsRoot = DEFAULT_UPLOADS_ROOT, evidenceScanner = createEvidenceScanner() } = {}) {
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
      if (collection === 'return-evidence') {
        let verdict;
        try {
          verdict = await evidenceScanner.scan({ ...file, mimetype: detected.mimeType });
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError(503, 'Return-evidence malware scanner is unavailable');
        }
        if (verdict?.clean !== true) throw new ApiError(400, 'Return evidence failed malware scan');
      }

      const directory = resolveCollection(collection);
      await mkdir(directory, { recursive: true });
      const filename = `${crypto.randomUUID()}.${detected.extension}`;
      const targetPath = path.join(directory, filename);
      await writeFile(targetPath, file.buffer, { flag: 'wx' });
      return {
        url: managedUrl(collection, filename),
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

    resolveManagedFile(url, expectedCollection) {
      const parsed = parseManagedUrl(url);
      if (!parsed || (expectedCollection && parsed.collection !== expectedCollection)) {
        throw new ApiError(404, 'Managed file not found');
      }
      const collectionDirectory = resolveCollection(parsed.collection);
      const targetPath = path.resolve(collectionDirectory, parsed.filename);
      if (!targetPath.startsWith(`${path.resolve(collectionDirectory)}${path.sep}`)) {
        throw new ApiError(404, 'Managed file not found');
      }
      return { path: targetPath, mimeType: MIME_BY_EXTENSION[parsed.extension], ...parsed };
    },

    async removeManagedFile(url) {
      let managed;
      try {
        managed = this.resolveManagedFile(url);
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) return false;
        throw error;
      }
      try {
        await unlink(managed.path);
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
  createEvidenceScanner,
  validateReturnEvidenceBatch,
  DEFAULT_UPLOADS_ROOT,
  MAX_IMAGE_SIZE,
  MAX_EVIDENCE_TOTAL_SIZE: MAX_RETURN_EVIDENCE_TOTAL_SIZE,
};
