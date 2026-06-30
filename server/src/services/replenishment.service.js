const ApiError = require('../utils/apiError');
const Inventory = require('../models/inventory.model');
const InventoryTransaction = require('../models/inventoryTransaction.model');
const Product = require('../models/product.model');
const ReplenishmentRequest = require('../models/replenishmentRequest.model');
const { logAudit } = require('../utils/auditLogger');

function getProductId(inventory) {
  return inventory.productId && inventory.productId._id ? inventory.productId._id : inventory.productId;
}

function getProductName(inventory) {
  return inventory.productId && inventory.productId.name ? inventory.productId.name : inventory.productName;
}

function toResponse(request, inventory) {
  return {
    id: String(request._id),
    productId: String(request.productId),
    inventoryId: String(request.inventoryId),
    productName: inventory ? getProductName(inventory) : request.productName,
    requestedBy: String(request.requestedBy),
    approvedBy: request.approvedBy ? String(request.approvedBy) : null,
    quantity: request.quantity,
    receivedQuantity: request.receivedQuantity || 0,
    status: request.status,
    reason: request.reason,
    adminNote: request.adminNote || '',
    receivedAt: request.receivedAt,
    createdAt: request.createdAt,
  };
}

function createModelRepository() {
  return {
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
    async createRequest(data) {
      return ReplenishmentRequest.create(data);
    },
    async listRequests(query = {}) {
      const filter = {};
      if (query.status) filter.status = query.status;
      return ReplenishmentRequest.find(filter).sort({ createdAt: -1 }).lean();
    },
    async findRequestById(id) {
      return ReplenishmentRequest.findById(id).lean();
    },
    async updateRequest(id, data) {
      return ReplenishmentRequest.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
    },
    async createTransaction(data) {
      return InventoryTransaction.create(data);
    },
  };
}

function createReplenishmentService({
  repository = createModelRepository(),
  auditLogger = { log: logAudit },
} = {}) {
  async function getRequestWithInventory(id) {
    const request = await repository.findRequestById(id);
    if (!request) throw new ApiError(404, 'Replenishment request not found');
    const inventory = await repository.findInventoryById(request.inventoryId);
    return { request, inventory };
  }

  async function writeAudit(userId, action, targetId, description) {
    await auditLogger.log({
      userId,
      action,
      targetEntity: 'ReplenishmentRequest',
      targetId: String(targetId),
      description,
    });
  }

  return {
    async createRequest(userId, input = {}) {
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'Replenishment quantity must be greater than 0');
      if (!String(input.reason || '').trim()) throw new ApiError(400, 'Replenishment reason is required');
      const inventory = await repository.findInventoryById(input.inventoryId);
      if (!inventory) throw new ApiError(404, 'Inventory record not found');

      const request = await repository.createRequest({
        productId: getProductId(inventory),
        inventoryId: inventory._id,
        requestedBy: userId,
        quantity,
        status: 'Pending',
        reason: String(input.reason).trim(),
      });
      await writeAudit(userId, 'REPLENISHMENT_CREATE', request._id, `Requested replenishment for ${getProductName(inventory)}`);
      return toResponse(request, inventory);
    },

    async listWarehouseRequests(query = {}) {
      const requests = await repository.listRequests(query);
      const items = [];
      for (const request of requests) {
        const inventory = await repository.findInventoryById(request.inventoryId);
        items.push(toResponse(request, inventory));
      }
      return { items, total: items.length };
    },

    async listAdminRequests(query = {}) {
      return this.listWarehouseRequests(query);
    },

    async updateRequestStatus(adminId, id, input = {}) {
      const { request, inventory } = await getRequestWithInventory(id);
      if (request.status !== 'Pending') throw new ApiError(409, 'Only Pending replenishment requests can be decided');
      if (!['Approved', 'Rejected'].includes(input.status)) throw new ApiError(400, 'Invalid replenishment decision');
      const updated = await repository.updateRequest(id, {
        status: input.status,
        approvedBy: adminId,
        adminNote: String(input.note || '').trim(),
      });
      await writeAudit(adminId, `REPLENISHMENT_${input.status.toUpperCase()}`, id, `${input.status} replenishment request`);
      return toResponse(updated, inventory);
    },

    async receiveRequest(userId, id, input = {}) {
      const { request, inventory } = await getRequestWithInventory(id);
      if (request.status !== 'Approved') throw new ApiError(409, 'Only Approved replenishment requests can be received');
      const receivedQuantity = Number(input.receivedQuantity);
      if (!Number.isInteger(receivedQuantity) || receivedQuantity <= 0) throw new ApiError(400, 'Received quantity must be a positive integer');
      if (receivedQuantity > Number(request.quantity)) throw new ApiError(400, 'Received quantity cannot exceed requested quantity');
      const nextStock = Number(inventory.stockQuantity || 0) + receivedQuantity;
      const updatedInventory = await repository.updateInventory(inventory._id, {
        stockQuantity: nextStock,
        lastUpdatedBy: userId,
      });
      await repository.updateProductStock(getProductId(updatedInventory), nextStock);
      await repository.createTransaction({
        productId: getProductId(inventory),
        orderId: null,
        performedBy: userId,
        transactionType: 'REPLENISHMENT_RECEIVE',
        quantity: receivedQuantity,
        beforeQuantity: Number(inventory.stockQuantity || 0),
        afterQuantity: nextStock,
        reason: `Received replenishment request ${request._id}`,
      });
      const updated = await repository.updateRequest(id, {
        status: 'Received',
        receivedQuantity,
        receivedAt: new Date(),
      });
      await writeAudit(userId, 'REPLENISHMENT_RECEIVE', id, `Received ${receivedQuantity} for ${getProductName(updatedInventory)}`);
      return toResponse(updated, updatedInventory);
    },
  };
}

module.exports = {
  createReplenishmentService,
  replenishmentService: createReplenishmentService(),
};
