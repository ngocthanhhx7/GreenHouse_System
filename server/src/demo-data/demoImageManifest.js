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

async function preflightDemoImages({ workspaceRoot, manifest = DEMO_IMAGE_MANIFEST } = {}) {
  if (manifest.length !== 20) throw new Error(`Manifest ảnh demo phải có đúng 20 ảnh, hiện có ${manifest.length}.`);
  const missing = [];
  const invalid = [];

  for (const entry of manifest) {
    const sourcePath = path.resolve(workspaceRoot || process.cwd(), entry.source);
    try {
      await access(sourcePath);
      const file = await readFile(sourcePath);
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

module.exports = { DEMO_IMAGE_MANIFEST, preflightDemoImages };
