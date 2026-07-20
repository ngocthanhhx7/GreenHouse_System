const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const cartRoutes = require('./routes/cart.routes');
const categoryRoutes = require('./routes/category.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const productRoutes = require('./routes/product.routes');
const staffOrderRoutes = require('./routes/staffOrder.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const replenishmentRoutes = require('./routes/replenishment.routes');
const returnRefundRoutes = require('./routes/returnRefund.routes');
const supportRoutes = require('./routes/support.routes');
const reviewRoutes = require('./routes/review.routes');
const reportRoutes = require('./routes/report.routes');
const systemSettingRoutes = require('./routes/systemSetting.routes');
const notificationRoutes = require('./routes/notification.routes');
const auditLogRoutes = require('./routes/auditLog.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const { requestId } = require('./middlewares/requestId.middleware');
const { sendSuccess } = require('./utils/apiResponse');

function createApp() {
  const app = express();

  app.use(requestId);
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    return sendSuccess(res, null, 'GreenHome API is running');
  });
  app.use('/api/auth', authRoutes);
  app.use('/api', cartRoutes);
  app.use('/api', categoryRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', paymentRoutes);
  app.use('/api', productRoutes);
  app.use('/api', staffOrderRoutes);
  app.use('/api', inventoryRoutes);
  app.use('/api', replenishmentRoutes);
  app.use('/api', returnRefundRoutes);
  app.use('/api', supportRoutes);
  app.use('/api', reviewRoutes);
  app.use('/api', reportRoutes);
  app.use('/api', systemSettingRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', auditLogRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
