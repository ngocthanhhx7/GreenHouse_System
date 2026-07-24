const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const ProductMediaAsset = require('../models/productMediaAsset.model');
const ApiError = require('../utils/apiError');
const { uploadService } = require('./upload.service');

const MANAGED_PRODUCT_IMAGE = /^\/uploads\/products\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

function createProductMediaService({
  productRepository = {
    existsByImageUrl: (url) => Product.exists({ imageUrls: url }),
    async findPublicByIdAndImageUrl(productId, url) {
      const product = await Product.findOne({
        _id: productId,
        status: 'Active',
        imageUrls: url,
      }).populate('categoryId').lean();
      return product?.categoryId?.status === 'Active' ? product : null;
    },
  },
  orderDetailRepository = {
    existsByImageSnapshot: (url) => OrderDetail.exists({ productImageSnapshot: url }),
  },
  assetRepository = {
    async createTemporary(items, ownerId, expiresAt) {
      return ProductMediaAsset.insertMany(items.map((item) => ({
        ...item,
        ownerId,
        status: 'Temporary',
        expiresAt,
      })));
    },
    async findByUrl(url) {
      return ProductMediaAsset.findOne({ url }).lean();
    },
    async deleteTemporary(url, ownerId) {
      return ProductMediaAsset.findOneAndDelete({
        url,
        ownerId,
        status: 'Temporary',
      }).lean();
    },
    async listExpired(now) {
      return ProductMediaAsset.find({
        status: 'Temporary',
        expiresAt: { $lte: now },
      }).sort({ expiresAt: 1, _id: 1 }).lean();
    },
    async deleteExpired(id, now) {
      return ProductMediaAsset.findOneAndDelete({
        _id: id,
        status: 'Temporary',
        expiresAt: { $lte: now },
      }).lean();
    },
  },
  managedUploadService = uploadService,
  clock = () => new Date(),
} = {}) {
  return {
    async registerTemporaryUploads(items, ownerId) {
      if (!ownerId) throw new ApiError(401, 'Authenticated Admin is required');
      const expiresAt = new Date(clock().getTime() + 24 * 60 * 60 * 1000);
      const assets = await assetRepository.createTemporary(items, ownerId, expiresAt);
      return assets.map((asset) => ({
        assetId: String(asset._id),
        url: asset.url,
        originalName: asset.originalName || '',
        mimeType: asset.mimeType,
        size: asset.size,
        status: 'Temporary',
        expiresAt: asset.expiresAt || expiresAt,
      }));
    },

    async deleteUnusedImage(url, ownerId) {
      const normalizedUrl = String(url || '').trim();
      if (!MANAGED_PRODUCT_IMAGE.test(normalizedUrl)) {
        throw new ApiError(400, 'Only system-managed Product media can be deleted');
      }

      const asset = await assetRepository.findByUrl(normalizedUrl);
      if (!asset) throw new ApiError(404, 'Product media not found');
      if (asset.status === 'Temporary' && String(asset.ownerId) !== String(ownerId)) {
        throw new ApiError(403, 'Product media belongs to another Admin');
      }
      const [usedByProduct, usedByOrder] = await Promise.all([
        productRepository.existsByImageUrl(normalizedUrl),
        orderDetailRepository.existsByImageSnapshot(normalizedUrl),
      ]);
      if (usedByProduct || usedByOrder) {
        throw new ApiError(
          409,
          'Product media is still referenced by a Product or immutable Order snapshot',
        );
      }

      const deleted = await managedUploadService.removeManagedFile(normalizedUrl);
      if (asset.status === 'Temporary') {
        await assetRepository.deleteTemporary(normalizedUrl, ownerId);
      }
      return { url: normalizedUrl, deleted };
    },

    async authorizeRead(url, actor = null) {
      const normalizedUrl = String(url || '').trim();
      if (!MANAGED_PRODUCT_IMAGE.test(normalizedUrl)) {
        throw new ApiError(404, 'Product media not found');
      }
      const asset = await assetRepository.findByUrl(normalizedUrl);
      if (!asset) throw new ApiError(404, 'Product media not found');
      if (asset.status === 'Temporary') {
        const ownedByCurrentAdmin = actor?.role === 'Admin'
          && String(asset.ownerId) === String(actor.id)
          && asset.expiresAt
          && new Date(asset.expiresAt) > new Date(clock());
        if (!ownedByCurrentAdmin) throw new ApiError(404, 'Product media not found');
        return asset;
      }
      if (!['Attached', 'Retained'].includes(asset.status)) {
        throw new ApiError(404, 'Product media not found');
      }
      const product = productRepository.findPublicByIdAndImageUrl
        ? await productRepository.findPublicByIdAndImageUrl(asset.productId, normalizedUrl)
        : null;
      if (!product) throw new ApiError(404, 'Product media not found');
      return asset;
    },

    async cleanupExpiredTemporary() {
      const now = new Date(clock());
      const expired = await assetRepository.listExpired(now);
      let deleted = 0;
      for (const asset of expired) {
        const claimed = await assetRepository.deleteExpired(asset._id, now);
        if (!claimed) continue;
        await managedUploadService.removeManagedFile(asset.url);
        deleted += 1;
      }
      return { scanned: expired.length, deleted };
    },
  };
}

module.exports = {
  createProductMediaService,
  productMediaService: createProductMediaService(),
};
