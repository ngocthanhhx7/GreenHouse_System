const { createHash } = require('node:crypto');
const { access, readFile } = require('node:fs/promises');
const path = require('node:path');

const PRODUCT_SKUS = [
  'GH-NC-001', 'GH-NC-002', 'GH-NC-003', 'GH-NC-004',
  'GH-BA-001', 'GH-BA-002', 'GH-BA-003', 'GH-BA-004',
  'GH-SC-001', 'GH-SC-002', 'GH-SC-003', 'GH-SC-004',
  'GH-VS-001', 'GH-VS-002', 'GH-VS-003', 'GH-VS-004',
  'GH-LT-001', 'GH-LT-002', 'GH-LT-003', 'GH-LT-004',
];

function toUuid(index) {
  const tail = String(index).padStart(12, '0');
  return `00000000-0000-4000-8000-${tail}`;
}

const DEMO_IMAGE_MANIFEST = Object.freeze(PRODUCT_SKUS.map((sku, index) => {
  const slug = sku.toLowerCase();
  return Object.freeze({
    sku,
    source: `server/src/assets/demo-products/${slug}-hero.webp`,
    destination: `/uploads/products/${toUuid(index + 1)}.webp`,
    // Locked placeholder hash: image generation replaces this value only after visual approval.
    // Until then, asset preflight deliberately blocks every write/reset operation.
    sha256: createHash('sha256').update(`greenhome-demo-image:${sku}:pending-v1`).digest('hex'),
    width: 1600,
    height: 1200,
    maxBytes: 350 * 1024,
    prompt: 'Ảnh sản phẩm GreenHome cao cấp trong bếp Việt hiện đại, nền kem và gỗ sồi, ánh sáng cửa sổ dịu, sản phẩm chiếm 70% khung hình, chân thực, không người, không chữ, không logo, không watermark.',
  });
}));

function inspectDemoWebp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Ảnh demo phải là WebP hợp lệ theo magic bytes RIFF/WEBP.');
  }
  const chunk = buffer.toString('ascii', 12, 16);
  let width;
  let height;
  if (chunk === 'VP8X' && buffer.length >= 30) {
    width = buffer.readUIntLE(24, 3) + 1;
    height = buffer.readUIntLE(27, 3) + 1;
  } else if (chunk === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    width = buffer.readUInt16LE(26) & 0x3fff;
    height = buffer.readUInt16LE(28) & 0x3fff;
  } else if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    width = 1 + buffer[21] + ((buffer[22] & 0x3f) << 8);
    height = 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10);
  } else {
    throw new Error(`Ảnh demo có WebP chunk không hỗ trợ hoặc bị hỏng: ${chunk || 'unknown'}.`);
  }
  if (width !== 1600 || height !== 1200) throw new Error(`Ảnh demo phải có kích thước chính xác 1600x1200, nhận được ${width}x${height}.`);
  return { format: 'webp', width, height };
}

async function preflightDemoImages({ workspaceRoot, manifest = DEMO_IMAGE_MANIFEST } = {}) {
  if (manifest.length !== 20) throw new Error(`Manifest ảnh demo phải có đúng 20 ảnh, hiện có ${manifest.length}.`);
  const missing = [];
  const invalid = [];

  for (const entry of manifest) {
    const sourcePath = path.resolve(workspaceRoot || process.cwd(), entry.source);
    try {
      await access(sourcePath);
      const file = await readFile(sourcePath);
      inspectDemoWebp(file);
      const hash = createHash('sha256').update(file).digest('hex');
      if (hash !== entry.sha256 || file.length > entry.maxBytes) invalid.push(entry.sku);
    } catch (error) {
      if (error.code === 'ENOENT') missing.push(entry.sku);
      else throw error;
    }
  }

  if (missing.length) throw new Error(`Tiền kiểm thất bại: thiếu ${missing.length} ảnh sản phẩm demo (${missing.join(', ')}).`);
  if (invalid.length) throw new Error(`Tiền kiểm thất bại: ảnh sai checksum hoặc vượt dung lượng (${invalid.join(', ')}).`);
  return { count: manifest.length, valid: true };
}

module.exports = { DEMO_IMAGE_MANIFEST, inspectDemoWebp, preflightDemoImages };
