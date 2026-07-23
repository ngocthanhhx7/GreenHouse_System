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
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
function parseVietnamBusinessDate(value, endOfDay) {
  const match = typeof value === 'string' && value.match(DATE_ONLY_PATTERN);
  if (!match) throw new ApiError(400, 'Invalid report date range');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const normalized = new Date(utcMidnight);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    throw new ApiError(400, 'Invalid report date range');
  }
  const start = utcMidnight - VIETNAM_OFFSET_MS;
  return new Date(endOfDay ? start + DAY_MS - 1 : start);
}
function parseDateRange(input = {}) {
  const from = input.from ? parseVietnamBusinessDate(input.from, false) : null;
  const to = input.to ? parseVietnamBusinessDate(input.to, true) : null;
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
      const grossSalesOrders = orders.filter((order) => order.orderStatus === 'Delivered' && order.paymentStatus === 'Paid' && isInRange(order.deliveredAt, range));
      const periodOrders = orders.filter((order) => isInRange(order.createdAt, range));
      const refundRecords = completedRefunds.filter((refund) => (
        isInRange(refund.completedAt, range)
      ));
      const periodSupportRequests = supportRequests.filter((request) => isInRange(request.createdAt, range));
      const periodReviews = reviews.filter((review) => isInRange(review.createdAt, range));
      const grossSales = grossSalesOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const refunds = refundRecords.reduce((sum, record) => sum + Number(record.refundAmount || record.totalAmount || 0), 0);
      const totalRating = periodReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
      return {
        period: { from: range.from, to: range.to },
        orders: { total: periodOrders.length, delivered: periodOrders.filter((order) => order.orderStatus === 'Delivered').length, returned: periodOrders.filter((order) => order.orderStatus === 'Returned').length, byStatus: groupCount(periodOrders, 'orderStatus') },
        revenue: { grossSales, refunded: refunds, netSales: grossSales - refunds, paid: grossSales },
        products: { total: productCount },
        inventory: {
          totalRecords: inventory.length,
          lowStock: inventory.filter((item) => (
            item.inventoryHealth === 'ReconciliationRequired'
              ? true
              : Number(item.sellableQuantity ?? item.stockQuantity ?? 0) - Number(item.reservedQuantity || 0)
                <= Number(item.lowStockThreshold || 0)
          )).length,
        },
        support: { total: periodSupportRequests.length, open: periodSupportRequests.filter((request) => ['New', 'Open', 'InProgress'].includes(request.status)).length, resolved: periodSupportRequests.filter((request) => request.status === 'Resolved').length },
        reviews: { total: periodReviews.length, averageRating: periodReviews.length ? totalRating / periodReviews.length : 0 },
      };
    },
  };
}
module.exports = { createReportService, reportService: createReportService() };
