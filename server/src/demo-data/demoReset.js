const { DEMO_DELETE_ORDER } = require('./demoSeedSafety');

const MODEL_PATHS = Object.freeze({
  PaymentCallbackEvent: '../models/paymentCallbackEvent.model',
  ReturnItem: '../models/returnItem.model',
  RefundPending: '../models/refundPending.model',
  ReturnRefundRequest: '../models/returnRefundRequest.model',
  ProductReview: '../models/productReview.model',
  ReviewContentHistory: '../models/reviewContentHistory.model',
  ReviewModerationHistory: '../models/reviewModerationHistory.model',
  ReviewPublicationHistory: '../models/reviewPublicationHistory.model',
  ReviewCommand: '../models/reviewCommand.model',
  SupportMessage: '../models/supportMessage.model',
  SupportHistory: '../models/supportHistory.model',
  SupportCommand: '../models/supportCommand.model',
  SupportRequest: '../models/supportRequest.model',
  Notification: '../models/notification.model',
  AuditLog: '../models/auditLog.model',
  Invoice: '../models/invoice.model',
  DomainOutbox: '../models/domainOutbox.model',
  EmailOutbox: '../models/emailOutbox.model',
  InventoryTransaction: '../models/inventoryTransaction.model',
  StockExportRequest: '../models/stockExportRequest.model',
  ShipmentEvent: '../models/shipmentEvent.model',
  ShipmentDestinationVersion: '../models/shipmentDestinationVersion.model',
  Shipment: '../models/shipment.model',
  PackingRecord: '../models/packingRecord.model',
  FulfillmentCycle: '../models/fulfillmentCycle.model',
  PaymentAttempt: '../models/paymentAttempt.model',
  Payment: '../models/payment.model',
  OrderReservation: '../models/orderReservation.model',
  OrderDetail: '../models/orderDetail.model',
  Order: '../models/order.model',
  CartCommand: '../models/cartCommand.model',
  CartItem: '../models/cartItem.model',
  ShoppingCart: '../models/cart.model',
  DamageReport: '../models/damageReport.model',
  ReplenishmentReceipt: '../models/replenishmentReceipt.model',
  ReplenishmentRequest: '../models/replenishmentRequest.model',
  Inventory: '../models/inventory.model',
  ProductMediaAsset: '../models/productMediaAsset.model',
  ProductCommand: '../models/productCommand.model',
  Product: '../models/product.model',
  Category: '../models/category.model',
  UserAddress: '../models/userAddress.model',
  SystemSettingVersion: '../models/systemSettingVersion.model',
  SystemSetting: '../models/systemSetting.model',
  UserSession: '../models/userSession.model',
  LoginAttempt: '../models/loginAttempt.model',
  LoginThrottleBucket: '../models/loginThrottleBucket.model',
  PasswordResetToken: '../models/passwordResetToken.model',
  RegistrationChallenge: '../models/registrationChallenge.model',
  User: '../models/user.model',
});

function loadDemoResetModels() {
  return Object.fromEntries(
    Object.entries(MODEL_PATHS).map(([modelName, modelPath]) => [
      modelName,
      require(modelPath),
    ]),
  );
}

async function resetDemoDatabase({ connection, databaseName, models = loadDemoResetModels() }) {
  if (!connection?.startSession) throw new Error('MongoDB transaction support is required');
  const session = await connection.startSession();
  try {
    let deleted = {};
    await session.withTransaction(async () => {
      for (const modelName of DEMO_DELETE_ORDER) {
        const model = models?.[modelName];
        if (!model?.collection) throw new Error(`Demo reset model ontbreekt: ${modelName}`);
        const result = await model.collection.deleteMany({}, { session });
        deleted[model.collection.name] = result.deletedCount;
      }
    });
    return { databaseName, deleted };
  } finally {
    await session.endSession();
  }
}

module.exports = {
  MODEL_PATHS,
  loadDemoResetModels,
  resetDemoDatabase,
};
