const { createHash } = require('node:crypto');
const { access, readFile } = require('node:fs/promises');
const path = require('node:path');

const PRODUCT_SKUS = [
  'GH-NC-001', 'GH-NC-002', 'GH-NC-003',
  'GH-BA-001', 'GH-BA-002', 'GH-BA-003',
  'GH-SC-001', 'GH-SC-002', 'GH-SC-003',
  'GH-VS-001', 'GH-VS-002', 'GH-VS-003',
  'GH-LT-001', 'GH-LT-002', 'GH-LT-003',
];

const PRODUCT_IMAGE_HASHES = Object.freeze({
  'GH-NC-001': 'b7ce374327c4a05350b24ce9adb45dc2f6cae175e026778916b20f2eeec01be6',
  'GH-NC-002': '619a05157eee4541750568e4f3d96128f9b88d7051b622d8d8535f82585d6236',
  'GH-NC-003': '865864b0e3e9c9a832065497a145cb0bcbff49012025ed921b84d0ade2697ad2',
  'GH-BA-001': '029b99fea4a2aa4eb7af8fc6dccf479beb24619425682b8a6fea5fac8b24cc65',
  'GH-BA-002': '784ace37b2cb3e7567a4da1537c4b22df83e3245cd508a836f985055c8932ae6',
  'GH-BA-003': '657073ce59c89ca094875bfb2b5c8011118dcc96200d2206763c54e76c60fcc3',
  'GH-SC-001': 'b8240f7e98261b213a9da0b6b3f5c6f7da0762ad87dd6ad58616065735d8219c',
  'GH-SC-002': '527cfb75def676719b1b4a66b90ba08a6b655fa61f604588b50c687eac2f5324',
  'GH-SC-003': 'd08f5ba085ba630303f2690c34e8ae60b4624c9a9e93ce05beb7d6df68f71cca',
  'GH-VS-001': '2ff1c98c01533f85157c18e2e2fbfd86237d1754f12c0cad1320bc8b9a806472',
  'GH-VS-002': 'e57ec4d84932340a0449aea0b14b537af5eb04399e9c219b9437c0435ec8529b',
  'GH-VS-003': 'e47520b965fa2d449bdd45a8ad890d7469bb4bf4d2e37d7ef0d71c447617d83c',
  'GH-LT-001': 'f21a8b0663732553e597b275f23d480336531a9735cdd72ad2380d250c7eb909',
  'GH-LT-002': '57bd6d99f818e3581cd195f824e92214b398bc5bdf02f65be0cf1aeb1994f9ab',
  'GH-LT-003': '70cee23f4563ece07dc491fff30cc1848d795b6caebd317390b03066e3a3700c',
});

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
    sha256: PRODUCT_IMAGE_HASHES[sku],
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
  if (manifest.length !== 15) throw new Error(`Manifest ảnh demo phải có đúng 15 ảnh, hiện có ${manifest.length}.`);
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
