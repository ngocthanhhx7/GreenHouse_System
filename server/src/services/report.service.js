const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');
const SupportRequest = require('../models/supportRequest.model');
const ProductReview = require('../models/productReview.model');

function createModelRepository() {
  return {
    async listOrders() {
      return Order.find({}).lean();
    },
    async countProducts() {
      return Product.countDocuments({});
    },
    async listInventory() {
      return Inventory.find({}).lean();
    },
    async listSupportRequests() {
      return SupportRequest.find({}).lean();
    },
    async listReviews() {
      return ProductReview.find({ status: 'Visible' }).lean();
    },
  };
}

function groupCount(items, field) {
  return items.reduce((result, item) => {
    const key = item[field] || 'Unknown';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function createReportService({ repository = createModelRepository() } = {}) {
  return {
    async getAdminOverview() {
      const [orders, productCount, inventory, supportRequests, reviews] = await Promise.all([
        repository.listOrders(),
        repository.countProducts(),
        repository.listInventory(),
        repository.listSupportRequests(),
        repository.listReviews(),
      ]);
      const paidOrders = orders.filter((order) => order.paymentStatus === 'Paid');
      const refundedOrders = orders.filter((order) => order.paymentStatus === 'Refunded');
      const totalRating = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);

      return {
        orders: {
          total: orders.length,
          delivered: orders.filter((order) => order.orderStatus === 'Delivered').length,
          returned: orders.filter((order) => order.orderStatus === 'Returned').length,
          byStatus: groupCount(orders, 'orderStatus'),
        },
        revenue: {
          paid: paidOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
          refunded: refundedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
        },
        products: {
          total: productCount,
        },
        inventory: {
          totalRecords: inventory.length,
          lowStock: inventory.filter((item) => Number(item.stockQuantity || 0) <= Number(item.lowStockThreshold || 0)).length,
        },
        support: {
          total: supportRequests.length,
          open: supportRequests.filter((request) => ['New', 'Open', 'InProgress'].includes(request.status)).length,
          resolved: supportRequests.filter((request) => request.status === 'Resolved').length,
        },
        reviews: {
          total: reviews.length,
          averageRating: reviews.length ? totalRating / reviews.length : 0,
        },
      };
    },
  };
}

module.exports = {
  createReportService,
  reportService: createReportService(),
};
