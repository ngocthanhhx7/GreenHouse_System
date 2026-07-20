const OrderDetail = require('../models/orderDetail.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/apiError');
const { uploadService } = require('./upload.service');

const MANAGED_PRODUCT_IMAGE = /^\/uploads\/products\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

function createProductMediaService({
  productRepository = { existsByImageUrl: (url) => Product.exists({ imageUrls: url }) },
  orderDetailRepository = { existsByImageSnapshot: (url) => OrderDetail.exists({ productImageSnapshot: url }) },
  managedUploadService = uploadService,
} = {}) {
  return {
    async deleteUnusedImage(url) {
      const normalizedUrl = String(url || '').trim();
      if (!MANAGED_PRODUCT_IMAGE.test(normalizedUrl)) {
        throw new ApiError(400, 'Chỉ có thể xóa ảnh sản phẩm do hệ thống quản lý');
      }

      const [usedByProduct, usedByOrder] = await Promise.all([
        productRepository.existsByImageUrl(normalizedUrl),
        orderDetailRepository.existsByImageSnapshot(normalizedUrl),
      ]);
      if (usedByProduct || usedByOrder) {
        throw new ApiError(409, 'Ảnh vẫn đang được sản phẩm hoặc đơn hàng tham chiếu');
      }

      const deleted = await managedUploadService.removeManagedFile(normalizedUrl);
      return { url: normalizedUrl, deleted };
    },
  };
}

module.exports = {
  createProductMediaService,
  productMediaService: createProductMediaService(),
};
