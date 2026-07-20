const ApiError = require('../utils/apiError');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Inventory = require('../models/inventory.model');
const SupportRequest = require('../models/supportRequest.model');
const ProductReview = require('../models/productReview.model');
const ReturnRefundRequest = require('../models/returnRefundRequest.model');

function createModelRepository() {
  return {
    async listOrders() { return Order.find({}).lean(); },
    async listCompletedRefunds() { return ReturnRefundRequest.find({ status: 'Completed' }).lean(); },
    async countProducts() { return Product.countDocuments({}); },
    async listInventory() { return Inventory.find({}).lean(); },
    async listSupportRequests() { return SupportRequest.find({}).lean(); },
    async listReviews() { return ProductReview.find({ status: 'Visible' }).lean(); },
  };
}
function groupCount(items, field) { return items.reduce((result, item) => { const key = item[field] || 'Unknown'; result[key] = (result[key] || 0) + 1; return result; }, {}); }
function parseDateRange(input = {}) {
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new ApiError(400, 'Invalid report date range');
  if (to) to.setHours(23, 59, 59, 999);
  if (from && to && from > to) throw new ApiError(400, 'Invalid report date range');
  return { from, to };
}
function isInRange(value, range) { if (!range.from && !range.to) return true; if (!value) return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && (!range.from || date >= range.from) && (!range.to || date <= range.to); }
function createReportService({ repository = createModelRepository() } = {}) {
  return {
    async getAdminOverview(input = {}) {
      const range = parseDateRange(input);
      const [orders, completedRefunds, productCount, inventory, supportRequests, reviews] = await Promise.all([
        repository.listOrders(), repository.listCompletedRefunds ? repository.listCompletedRefunds() : Promise.resolve([]), repository.countProducts(), repository.listInventory(), repository.listSupportRequests(), repository.listReviews(),
      ]);
      const grossSalesOrders = orders.filter((order) => order.orderStatus === 'Delivered' && order.paymentStatus === 'Paid' && isInRange(order.deliveredAt || order.updatedAt || order.createdAt, range));
      const refundRecords = completedRefunds.filter((refund) => (
        isInRange(refund.completedAt || refund.updatedAt || refund.createdAt, range)
      ));
      const grossSales = grossSalesOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const refunds = refundRecords.reduce((sum, record) => sum + Number(record.refundAmount || record.totalAmount || 0), 0);
      const totalRating = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
      return {
        period: { from: range.from, to: range.to },
        orders: { total: orders.length, delivered: orders.filter((order) => order.orderStatus === 'Delivered').length, returned: orders.filter((order) => order.orderStatus === 'Returned').length, byStatus: groupCount(orders, 'orderStatus') },
        revenue: { grossSales, refunded: refunds, netSales: grossSales - refunds, paid: grossSales },
        products: { total: productCount },
        inventory: { totalRecords: inventory.length, lowStock: inventory.filter((item) => Number(item.stockQuantity || 0) - Number(item.reservedQuantity || 0) <= Number(item.lowStockThreshold || 0)).length },
        support: { total: supportRequests.length, open: supportRequests.filter((request) => ['New', 'Open', 'InProgress'].includes(request.status)).length, resolved: supportRequests.filter((request) => request.status === 'Resolved').length },
        reviews: { total: reviews.length, averageRating: reviews.length ? totalRating / reviews.length : 0 },
      };
    },
  };
}
module.exports = { createReportService, reportService: createReportService() };
