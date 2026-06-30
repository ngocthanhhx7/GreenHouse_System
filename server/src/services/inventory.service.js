const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Product = require('../models/product.model');
const StockExportRequest = require('../models/stockExportRequest.model');
const Order = require('../models/order.model');
const OrderDetail = require('../models/orderDetail.model');
const { logAudit } = require('../utils/auditLogger');

function toInventoryResponse(inventory) {
  const stockQuantity = Number(inventory.stockQuantity || 0);
  const lowStockThreshold = Number(inventory.lowStockThreshold || 0);
  return {
    id: String(inventory._id),
    productId: String(inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId),
    productName: inventory.productId && inventory.productId.name ? inventory.productId.name : inventory.productName,
    stockQuantity,
    reservedQuantity: Number(inventory.reservedQuantity || 0),
    damagedQuantity: Number(inventory.damagedQuantity || 0),
    lowStockThreshold,
    isLowStock: stockQuantity <= lowStockThreshold,
    updatedAt: inventory.updatedAt,
  };
}

function toStockExportResponse(request, order, details = []) {
  return {
    id: String(request._id),
    orderId: String(request.orderId && request.orderId._id ? request.orderId._id : request.orderId),
    status: request.status,
    note: request.note || '',
    order: order
      ? {
          id: String(order._id),
          orderCode: order.orderCode,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          shippingAddress: order.shippingAddress,
        }
      : null,
    details,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function createModelRepository() {
  return {
    async listInventories() {
      return Inventory.find({}).populate('productId').sort({ updatedAt: -1 }).lean();
    },
    async findInventoryById(id) {
      return Inventory.findById(id).populate('productId').lean();
    },
    async findInventoryByProductId(productId) {
      return Inventory.findOne({ productId }).populate('productId').lean();
    },
    async updateInventory(id, data) {
      return Inventory.findByIdAndUpdate(id, data, { new: true, runValidators: true }).populate('productId').lean();
    },
    async updateProductStock(productId, stockQuantity) {
      return Product.findByIdAndUpdate(productId, { stockQuantity }, { new: true, runValidators: true }).lean();
    },
    async createTransaction(data) {
      return InventoryTransaction.create(data);
    },
    async listTransactions() {
      return InventoryTransaction.find({}).sort({ createdAt: -1 }).lean();
    },
    async listStockExports() {
      return StockExportRequest.find({}).sort({ createdAt: -1 }).lean();
    },
    async findStockExportById(id) {
      return StockExportRequest.findById(id).lean();
    },
    async updateStockExport(id, data) {
      return StockExportRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async findOrderById(id) {
      return Order.findById(id).lean();
    },
    async updateOrder(id, data) {
      return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async listOrderDetails(orderId) {
      return OrderDetail.find({ orderId }).lean();
    },
    async listProducts() {
      return Product.find({ status: 'Active' }).lean();
    },
    async createInventory(data) {
      return Inventory.create(data);
    },
  };
}

function createInventoryService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function getInventoryOrThrow(id) {
    const inventory = await repository.findInventoryById(id);
    if (!inventory) throw new ApiError(404, 'Inventory record not found');
    return inventory;
  }

  async function createTransaction(performedBy, inventory, input) {
    await repository.createTransaction({
      productId: inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId,
      orderId: input.orderId || null,
      performedBy,
      transactionType: input.transactionType,
      quantity: input.quantity,
      beforeQuantity: input.beforeQuantity,
      afterQuantity: input.afterQuantity,
      reason: input.reason || '',
    });
  }

  async function logWarehouseAction(userId, action, targetId, description) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'Inventory',
      targetId: String(targetId),
      description,
    });
  }

  async function ensureInventoryRecords() {
    const products = await repository.listProducts();
    for (const product of products) {
      const existing = await repository.findInventoryByProductId(product._id);
      if (!existing) {
        await repository.createInventory({
          productId: product._id,
          stockQuantity: Number(product.stockQuantity || 0),
          reservedQuantity: 0,
          damagedQuantity: 0,
          lowStockThreshold: 5,
          lastUpdatedBy: null,
        });
      }
    }
  }

  return {
    async listInventory() {
      await ensureInventoryRecords();
      const inventories = await repository.listInventories();
      return {
        items: inventories.map(toInventoryResponse),
        total: inventories.length,
      };
    },

    async getInventory(id) {
      return toInventoryResponse(await getInventoryOrThrow(id));
    },

    async adjustInventory(userId, id, input = {}) {
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Adjustment reason is required');
      const delta = Number(input.delta);
      if (!Number.isFinite(delta) || delta === 0) throw new ApiError(400, 'Adjustment delta must be a non-zero number');

      const inventory = await getInventoryOrThrow(id);
      const nextStock = Number(inventory.stockQuantity) + delta;
      if (nextStock < 0) throw new ApiError(400, 'Inventory stock cannot be negative');

      const updated = await repository.updateInventory(id, {
        stockQuantity: nextStock,
        lastUpdatedBy: userId,
      });
      await repository.updateProductStock(toInventoryResponse(updated).productId, nextStock);
      await createTransaction(userId, inventory, {
        transactionType: 'ADJUSTMENT',
        quantity: delta,
        beforeQuantity: Number(inventory.stockQuantity),
        afterQuantity: nextStock,
        reason: String(input.reason).trim(),
      });
      await logWarehouseAction(userId, 'INVENTORY_ADJUST', id, `Adjusted stock by ${delta} for ${updated.productId.name}`);

      return {
        inventory: toInventoryResponse(updated),
      };
    },

    async listLowStock() {
      const inventory = await this.listInventory();
      const items = inventory.items.filter((item) => item.isLowStock);
      return { items, total: items.length };
    },

    async listStockExports() {
      const requests = await repository.listStockExports();
      const items = [];
      for (const request of requests) {
        const order = await repository.findOrderById(request.orderId);
        items.push(toStockExportResponse(request, order));
      }
      return { items, total: items.length };
    },

    async getStockExport(id) {
      const request = await repository.findStockExportById(id);
      if (!request) throw new ApiError(404, 'Stock export request not found');
      const order = await repository.findOrderById(request.orderId);
      const details = await repository.listOrderDetails(request.orderId);
      return toStockExportResponse(request, order, details);
    },

    async updateStockExportStatus(userId, id, input = {}) {
      const request = await repository.findStockExportById(id);
      if (!request) throw new ApiError(404, 'Stock export request not found');
      const order = await repository.findOrderById(request.orderId);
      if (!order) throw new ApiError(404, 'Related order not found');
      const nextStatus = input.status;
      if (!['Approved', 'Rejected', 'Exported'].includes(nextStatus)) throw new ApiError(400, 'Invalid stock export status');
      if (request.status === 'Rejected' || request.status === 'Exported') throw new ApiError(409, 'Stock export request is already closed');
      if (nextStatus === 'Exported' && request.status !== 'Approved') throw new ApiError(409, 'Stock export request must be approved before export');

      if (nextStatus === 'Exported') {
        const details = await repository.listOrderDetails(request.orderId);
        for (const detail of details) {
          const inventory = await repository.findInventoryByProductId(detail.productId);
          if (!inventory || Number(inventory.stockQuantity) < Number(detail.quantity)) {
            throw new ApiError(409, 'Insufficient stock for export');
          }
        }
        for (const detail of details) {
          const inventory = await repository.findInventoryByProductId(detail.productId);
          const nextStock = Number(inventory.stockQuantity) - Number(detail.quantity);
          const updatedInventory = await repository.updateInventory(inventory._id, {
            stockQuantity: nextStock,
            lastUpdatedBy: userId,
          });
          await repository.updateProductStock(toInventoryResponse(updatedInventory).productId, nextStock);
          await createTransaction(userId, inventory, {
            transactionType: 'STOCK_EXPORT',
            quantity: -Number(detail.quantity),
            beforeQuantity: Number(inventory.stockQuantity),
            afterQuantity: nextStock,
            reason: `Stock export for order ${order.orderCode}`,
            orderId: order._id,
          });
          await logWarehouseAction(userId, 'INVENTORY_EXPORT', updatedInventory._id, `Exported ${detail.quantity} of ${updatedInventory.productId.name}`);
        }
        await repository.updateOrder(order._id, { orderStatus: 'Packed' });
      }

      const updatedRequest = await repository.updateStockExport(id, {
        status: nextStatus,
        note: input.note !== undefined ? String(input.note || '').trim() : request.note,
      });
      const updatedOrder = await repository.findOrderById(order._id);
      const details = await repository.listOrderDetails(request.orderId);
      return {
        stockExport: toStockExportResponse(updatedRequest, updatedOrder, details),
        order: {
          id: String(updatedOrder._id),
          orderStatus: updatedOrder.orderStatus,
        },
      };
    },
  };
}

module.exports = {
  createInventoryService,
  inventoryService: createInventoryService(),
};
